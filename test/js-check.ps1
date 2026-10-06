# Syntax-check the browser JS with Windows' built-in JScript engine.
# A runtime "is undefined" error means the file PARSED fine; only SyntaxError/Expected = broken.
$log = "$env:TEMP\lh-jscheck.log"
$root = Split-Path $PSScriptRoot -Parent
'=== runtimes ===' | Set-Content $log
$py = & py -V 2>&1
"py => [$py] err=$LASTEXITCODE" | Add-Content $log
$python = & python --version 2>&1
"python => [$python] err=$LASTEXITCODE" | Add-Content $log
'=== JScript parse checks (expect runtime "undefined" errors = syntax OK) ===' | Add-Content $log
foreach ($f in @('link.js', 'morse.js', 'scene.js', 'phone.js')) {
  $out = & cscript //nologo //E:JScript (Join-Path $root $f) 2>&1
  "$f => [$($out -join ' / ')]" | Add-Content $log
}
'=== end ===' | Add-Content $log
