param([ValidateSet('Run', 'Restart', 'Quit')][string]$Action = 'Run')
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'runtime\Pomodoro Timing.exe'
if (-not (Test-Path $exe)) { throw 'Extract the entire application ZIP before running it.' }
$launch = @{ FilePath = $exe; WorkingDirectory = (Split-Path $exe -Parent) }
if ($Action -eq 'Restart') { $launch.ArgumentList = '--restart' }
if ($Action -eq 'Quit') { $launch.ArgumentList = '--quit' }
Start-Process @launch
