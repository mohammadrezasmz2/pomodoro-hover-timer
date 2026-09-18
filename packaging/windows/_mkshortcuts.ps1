$root = $PSScriptRoot
$sh   = New-Object -ComObject WScript.Shell
$exe  = Join-Path $root 'runtime\Pomodoro Timing.exe'
$ico  = Join-Path $root 'icon.ico'
function New-Lnk($path){
  $l = $sh.CreateShortcut($path)
  $l.TargetPath       = $exe
  $l.WorkingDirectory = (Join-Path $root 'runtime')
  if (Test-Path $ico) { $l.IconLocation = $ico }
  $l.Save()
}
New-Lnk (Join-Path ([Environment]::GetFolderPath('Startup')) 'Pomodoro Timing.lnk')
New-Lnk (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Pomodoro Timing.lnk')
Write-Host 'Shortcuts created: Desktop + Startup.'
