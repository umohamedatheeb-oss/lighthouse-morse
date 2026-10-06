# Lighthouse Morse — broker loopback test (pure PowerShell, no Node needed)
# Simulates: phone publishes dot/dash/space -> public MQTT broker -> laptop
# receives and acks -> phone measures round-trip.  Exits 0 on PASS, 1 on FAIL.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Brokers   = @('wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt')
$Room      = 'TRIN-PS' + (Get-Random -Minimum 100 -Maximum 1000)
$Topic     = "lighthouse/$Room"
$Utf8      = [Text.Encoding]::UTF8
$Durations = @{ dot = 180; dash = 540; space = 0; send = 0; reset = 0 }

function Get-RemainingLength([int]$n) {
  $list = New-Object 'System.Collections.Generic.List[byte]'
  do {
    $b = $n % 128
    $n = [math]::Floor($n / 128)
    if ($n -gt 0) { $b = $b -bor 128 }
    $list.Add([byte]$b)
  } while ($n -gt 0)
  return ,$list.ToArray()
}

function New-MqttSocket([string]$url) {
  $ws = New-Object 'System.Net.WebSockets.ClientWebSocket'
  $ws.Options.AddSubProtocol('mqtt')
  $cts = [Threading.CancellationTokenSource]::new()
  $cts.CancelAfter(8000)
  $null = $ws.ConnectAsync([Uri]$url, $cts.Token).GetAwaiter().GetResult()  # $null swallows VoidTaskResult leak
  return $ws
}

function Send-MqttPacket($ws, [byte]$header, [byte[]]$body) {
  $rl = Get-RemainingLength $body.Length
  $packet = [byte[]](@($header) + $rl + $body)
  $seg = [ArraySegment[byte]]::new($packet)
  $cts = [Threading.CancellationTokenSource]::new()
  $cts.CancelAfter(5000)
  $null = $ws.SendAsync($seg, [Net.WebSockets.WebSocketMessageType]::Binary, $true, $cts.Token).GetAwaiter().GetResult()
}

function Read-MqttPacket($ws) {
  $buffer = [byte[]]::new(65536)
  $ms = [IO.MemoryStream]::new()
  while ($true) {
    $seg = [ArraySegment[byte]]::new($buffer)
    $cts = [Threading.CancellationTokenSource]::new()
    $cts.CancelAfter(15000)
    $res = $ws.ReceiveAsync($seg, $cts.Token).GetAwaiter().GetResult()
    if ($res.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { throw 'websocket closed by broker' }
    $ms.Write($buffer, 0, $res.Count)
    $data = $ms.ToArray()
    if ($data.Length -ge 2) {
      $mul = 1; $rl = 0; $i = 1; $hdrDone = $false
      while ($i -lt $data.Length) {
        $digit = [int]$data[$i]
        $rl += ($digit -band 127) * $mul
        $mul *= 128
        $i++
        if (($digit -band 128) -eq 0) { $hdrDone = $true; break }
      }
      if ($hdrDone -and $data.Length -ge ($i + $rl)) {
        $body = [byte[]]::new($rl)
        if ($rl -gt 0) { [Array]::Copy($data, $i, $body, 0, $rl) }
        return [pscustomobject]@{ Type = [int]($data[0] -shr 4); Body = $body }
      }
    }
  }
}

function Connect-Mqtt([string]$url) {
  $ws = $null
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try { $ws = New-MqttSocket $url; break } catch {
      if ($attempt -eq 3) { throw }
      Start-Sleep -Milliseconds 600
    }
  }
  $id = $Utf8.GetBytes('lhps-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $body = [byte[]]([byte[]](0,4) + $Utf8.GetBytes('MQTT') + [byte[]](4,2,0,60) + [byte[]](0, $id.Length) + $id)
  Send-MqttPacket $ws 0x10 $body
  $ack = Read-MqttPacket $ws
  if ($ack.Type -ne 2 -or $ack.Body.Length -lt 2 -or $ack.Body[1] -ne 0) {
    throw "CONNACK not accepted by $url"
  }
  return $ws
}

function Subscribe-Mqtt($ws, [string]$topic) {
  $t = $Utf8.GetBytes($topic)
  $body = [byte[]]([byte[]](0,1) + [byte[]](($t.Length -shr 8), ($t.Length -band 255)) + $t + [byte[]](0))
  Send-MqttPacket $ws 0x82 $body
}

function Publish-Mqtt($ws, [string]$topic, [string]$payload) {
  $t = $Utf8.GetBytes($topic)
  $p = $Utf8.GetBytes($payload)
  $body = [byte[]]([byte[]](($t.Length -shr 8), ($t.Length -band 255)) + $t + $p)
  Send-MqttPacket $ws 0x30 $body
}

function Get-MqttPayload([byte[]]$body) {
  if ($body.Length -lt 2) { return '' }
  $tlen = ([int]$body[0] -shl 8) -bor [int]$body[1]
  $start = 2 + $tlen
  if ($body.Length -le $start) { return '' }
  return $Utf8.GetString($body, $start, $body.Length - $start)
}

function Invoke-Loopback([string]$url) {
  $laptop = Connect-Mqtt $url
  $phone  = Connect-Mqtt $url
  $types  = @('dot', 'dot', 'dot', 'dash', 'space')
  $oneWays = @()
  $rtts = @()

  try {
    Subscribe-Mqtt $laptop $Topic
    $subAck = Read-MqttPacket $laptop
    if ($subAck.Type -ne 9) { throw "expected laptop SUBACK, got type $($subAck.Type)" }
    Subscribe-Mqtt $phone $Topic
    $subAck2 = Read-MqttPacket $phone
    if ($subAck2.Type -ne 9) { throw "expected phone SUBACK, got type $($subAck2.Type)" }

    for ($n = 1; $n -le $types.Count; $n++) {
      $type = $types[$n - 1]
      $sendAt = [long][DateTime]::UtcNow.Ticks
      Publish-Mqtt $phone $Topic "${type}:$n`:$(($sendAt -join ''))"

      $pkt = Read-MqttPacket $laptop            # the dot/dash arrives at the laptop
      $payload = Get-MqttPayload $pkt.Body
      $parts = $payload -split ':'
      $recvAt = [long][DateTime]::UtcNow.Ticks
      Write-Host "  debug: payload=[$payload] parts=$($parts.Count) p2=[$($parts[2])] sendAt=$sendAt recvAt=$recvAt"
      if ($parts.Count -lt 3) { throw "unexpected payload: [$payload]" }
      $oneWay = [math]::Round(($recvAt - [long]$parts[2]) / 10000)
      $oneWays += $oneWay
      $ms = $Durations[$parts[0]]
      Write-Host ("  laptop: flash {0,-6} ({1} ms)  #{2}   one-way {3} ms" -f $parts[0], $ms, $n, $oneWay)

      Publish-Mqtt $laptop $Topic "ACK:$($parts[1])"
      Read-MqttPacket $laptop | Out-Null        # discard our own ack echo (we are subscribed too)

      # phone waits for the ack (it also hears its own publishes — skip those)
      do { $p2 = Read-MqttPacket $phone } while (-not (Get-MqttPayload $p2.Body).StartsWith('ACK:'))
      $rtt = [math]::Round(([long][DateTime]::UtcNow.Ticks - $sendAt) / 10000)
      $rtts += $rtt
      Write-Host ("  phone : ack round-trip {0} ms" -f $rtt)
    }
  } finally {
    try { $laptop.Dispose() } catch {}
    try { $phone.Dispose() } catch {}
  }

  $avg = [math]::Round(($rtts | Measure-Object -Average).Average)
  return [pscustomobject]@{ Received = $types.Count; AvgRtt = $avg; AvgOneWay = [math]::Round(($oneWays | Measure-Object -Average).Average) }
}

Write-Host 'Lighthouse Morse - PowerShell broker loopback test'
Write-Host "  room: $Room"
foreach ($url in $Brokers) {
  try {
    $r = Invoke-Loopback $url
    $pass = $r.Received -eq 5 -and $r.AvgRtt -lt 1000
    Write-Host ("  broker: {0}  received {1}/5, avg one-way {2} ms, avg round-trip {3} ms" -f $url, $r.Received, $r.AvgOneWay, $r.AvgRtt)
    Write-Host $(if ($pass) { '  PASS - link works, well under 1 second' } else { '  FAIL' })
    if ($pass) { exit 0 } else { exit 1 }
  } catch {
    Write-Host "  $url failed: $($_.Exception.Message)"
  }
}
Write-Host 'FAIL - no public broker reachable'
exit 1
