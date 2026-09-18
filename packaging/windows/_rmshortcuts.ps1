$s1 = Join-Path ([Environment]::GetFolderPath('Startup')) 'Pomodoro Timing.lnk'
$s2 = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Pomodoro Timing.lnk'
Remove-Item -Force -ErrorAction SilentlyContinue $s1
Remove-Item -Force -ErrorAction SilentlyContinue $s2
Write-Host 'Shortcuts removed.'
