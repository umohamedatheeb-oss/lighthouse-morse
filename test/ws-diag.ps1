# Diagnostic: why do WebSocket connections to the public brokers fail?
$ErrorActionPreference = 'Continue'
$log = "$env:TEMP\lh-ws-diag.log"
$out = New-Object Collections.Generic.List[string]

$out.Add('--- stage 0: plain HTTPS from .NET ---')
try {
  $req = [Net.HttpWebRequest]::Create('https://example.com/')
  $req.Timeout = 8000
  $resp = $req.GetResponse()
  $out.Add("HTTPS OK: $([int]$resp.StatusCode)")
  $resp.Close()
} catch { $out.Add("HTTPS FAIL: $($_.Exception.Message)") }

$out.Add('--- proxy settings ---')
try { $out.Add("winhttp: $((netsh winhttp show proxy) -join ' | ')") } catch { $out.Add("netsh fail: $_") }
$out.Add("HTTP_PROXY=$env:HTTP_PROXY HTTPS_PROXY=$env:HTTPS_PROXY")
try {
  $p = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings').ProxyEnable
  $ps = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings').ProxyServer
  $out.Add("WinINET proxy enable=$p server=$ps")
} catch { $out.Add("WinINET read fail") }

$out.Add('--- stage 1: raw TLS to broker.hivemq.com:8884 (trust-all callback) ---')
try {
  $tcp = [Net.Sockets.TcpClient]::new()
  $tcp.Connect('broker.hivemq.com', 8884)
  $ssl = [Net.Security.SslStream]::new($tcp.GetStream(), $false, { param($s, $c, $ch, $e) $true })
  $ssl.AuthenticateAsClient('broker.hivemq.com')
  $out.Add("TLS OK: $($ssl.SslProtocol) cipher=$($ssl.CipherAlgorithm)-$($ssl.CipherStrength) cert=$($ssl.RemoteCertificate.Subject)")
  $ssl.Dispose(); $tcp.Close()
} catch { $out.Add("TLS FAIL: $($_.Exception.Message) :: $($_.Exception.InnerException.Message)") }

$out.Add('--- stage 1b: raw TLS with REAL certificate validation ---')
try {
  $tcp = [Net.Sockets.TcpClient]::new()
  $tcp.Connect('broker.hivemq.com', 8884)
  $policyErrors = [Net.Security.SslPolicyErrors]::None
  $ssl = [Net.Security.SslStream]::new($tcp.GetStream(), $false, { param($s, $c, $ch, $e) $script:policyErrors = $e; return $true })
  $ssl.AuthenticateAsClient('broker.hivemq.com')
  $out.Add("TLS validation policyErrors=$policyErrors")
  $ssl.Dispose(); $tcp.Close()
} catch { $out.Add("TLS2 FAIL: $($_.Exception.Message)") }

$out.Add('--- stage 2: plain ws:// (no TLS) HiveMQ:8000/mqtt ---')
try {
  $ws = [Net.WebSockets.ClientWebSocket]::new()
  $ws.Options.AddSubProtocol('mqtt')
  $cts = [Threading.CancellationTokenSource]::new(); $cts.CancelAfter(6000)
  $ws.ConnectAsync([Uri]'ws://broker.hivemq.com:8000/mqtt', $cts.Token).Wait()
  $out.Add("WS OK state=$($ws.State)")
  $ws.Dispose()
} catch {
  $e = $_.Exception
  while ($e) { $out.Add("WS FAIL [$($e.GetType().Name)]: $($e.Message)"); $e = $e.InnerException }
}

$out.Add('--- stage 3: wss:// HiveMQ:8884/mqtt with full exception chain ---')
try {
  $ws = [Net.WebSockets.ClientWebSocket]::new()
  $ws.Options.AddSubProtocol('mqtt')
  $cts = [Threading.CancellationTokenSource]::new(); $cts.CancelAfter(6000)
  $ws.ConnectAsync([Uri]'wss://broker.hivemq.com:8884/mqtt', $cts.Token).Wait()
  $out.Add("WSS OK state=$($ws.State)")
  $ws.Dispose()
} catch {
  $e = $_.Exception
  while ($e) { $out.Add("WSS FAIL [$($e.GetType().Name)]: $($e.Message)"); $e = $e.InnerException }
}

$out | Set-Content $log
$out
