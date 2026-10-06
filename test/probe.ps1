# Probe: find which PowerShell statement leaks an unexpected object into the pipeline
$out = @()
try {
  $ws2 = [Net.WebSockets.ClientWebSocket]::new()
  $x = $ws2.Options.AddSubProtocol('mqtt')
  $out += "AddSubProtocol assigns -> $(if ($null -eq $x) { 'NULL' } else { $x.GetType().FullName })"

  $c = [Threading.CancellationTokenSource]::new()
  $y = $c.CancelAfter(5000)
  $out += "CancelAfter assigns -> $(if ($null -eq $y) { 'NULL' } else { $y.GetType().FullName })"

  $t = $ws2.ConnectAsync([Uri]'wss://broker.hivemq.com:8884/mqtt', $c.Token)
  $out += "ConnectAsync type -> $($t.GetType().FullName)"
  $z = $t.GetAwaiter().GetResult()
  $out += "GetResult assigns -> $(if ($null -eq $z) { 'NULL' } else { $z.GetType().FullName })"
  $out += "state -> $($ws2.State)"
  $ws2.Dispose()
} catch { $out += "stage A error: $($_.Exception.Message)" }

# Now the statement form used inside my functions (no assignment)
function Test-StatementForm {
  $ws3 = [Net.WebSockets.ClientWebSocket]::new()
  $ws3.Options.AddSubProtocol('mqtt')
  $c3 = [Threading.CancellationTokenSource]::new()
  $c3.CancelAfter(5000)
  $ws3.ConnectAsync([Uri]'wss://broker.emqx.io:8084/mqtt', $c3.Token).GetAwaiter().GetResult()
  return $ws3
}
try {
  $r = @(Test-StatementForm)
  $i = 0
  foreach ($o in $r) {
    $type = if ($null -eq $o) { 'NULL' } else { $o.GetType().FullName }
    $extra = ''
    if ($o -is [Net.WebSockets.ClientWebSocket]) { $extra = " state=$($o.State)" }
    $out += "Test-StatementForm output[$i] -> $type$extra"
    $i++
  }
} catch { $out += "stage B error: $($_.Exception.Message)" }

$out | Set-Content "$env:TEMP\lh-probe.log"
$out
