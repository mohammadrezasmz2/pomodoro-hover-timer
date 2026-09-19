param(
  [string]$Architecture = "x64"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$PackageJson = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
$ElectronVersion = [string]$PackageJson.devDependencies.electron
if ($ElectronVersion -notmatch '^\d+\.\d+\.\d+$') { throw "Pin an exact stable Electron version in package.json." }
$AppVersion = [string]$PackageJson.version
$ProductName = "Pomodoro Timing"
$Slug = "Pomodoro-Timing-$AppVersion-Windows-$Architecture"
$Dist = Join-Path $RepoRoot "dist"
$Work = Join-Path $Dist "_work"
$Bundle = Join-Path $Work $Slug
$Runtime = Join-Path $Bundle "runtime"
$AppDest = Join-Path $Runtime "resources\app"
$ElectronZip = Join-Path $Work "electron.zip"
$ReleaseZip = Join-Path $Dist "$Slug.zip"
$ChecksumFile = "$ReleaseZip.sha256"

if ($Architecture -ne "x64") {
  throw "This packaging script currently supports x64 only."
}

if (Test-Path $Work) { Remove-Item $Work -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Work, $Bundle, $Runtime, $AppDest | Out-Null

$ElectronUrl = "https://github.com/electron/electron/releases/download/v$ElectronVersion/electron-v$ElectronVersion-win32-$Architecture.zip"
Write-Host "Downloading Electron $ElectronVersion ($Architecture)..."
Invoke-WebRequest -Uri $ElectronUrl -OutFile $ElectronZip
$ShasumsFile = Join-Path $Work "SHASUMS256.txt"
Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v$ElectronVersion/SHASUMS256.txt" -OutFile $ShasumsFile
$RuntimeName = "electron-v$ElectronVersion-win32-$Architecture.zip"
$ChecksumLines = @(Get-Content $ShasumsFile | Where-Object { $_ -match ("^[0-9a-fA-F]{64}\s+\*?" + [regex]::Escape($RuntimeName) + "$") })
if ($ChecksumLines.Count -ne 1) { throw "Expected one checksum for $RuntimeName." }
$ExpectedHash = ($ChecksumLines[0] -split '\s+')[0].ToLowerInvariant()
if ((Get-FileHash -Algorithm SHA256 $ElectronZip).Hash.ToLowerInvariant() -ne $ExpectedHash) { throw "Electron runtime checksum mismatch." }

Write-Host "Extracting Electron runtime..."
Expand-Archive -Path $ElectronZip -DestinationPath $Runtime -Force

$ElectronExe = Join-Path $Runtime "electron.exe"
$ProductExe = Join-Path $Runtime "$ProductName.exe"
if (-not (Test-Path $ElectronExe)) { throw "electron.exe was not found after extraction." }
Move-Item $ElectronExe $ProductExe -Force

# The app directory takes precedence; remove Electron's stock default app package.
$DefaultApp = Join-Path $Runtime "resources\default_app.asar"
if (Test-Path $DefaultApp) { Remove-Item $DefaultApp -Force }

Write-Host "Copying application source..."
$AppFiles = @("main.js", "preload.js", "_startwatch.ps1", "package.json")
foreach ($File in $AppFiles) {
  Copy-Item (Join-Path $RepoRoot $File) (Join-Path $AppDest $File) -Force
}
Copy-Item (Join-Path $RepoRoot "renderer") (Join-Path $AppDest "renderer") -Recurse -Force
Copy-Item (Join-Path $RepoRoot "lib") (Join-Path $AppDest "lib") -Recurse -Force
Copy-Item (Join-Path $RepoRoot "build") (Join-Path $AppDest "build") -Recurse -Force
Copy-Item (Join-Path $RepoRoot "LICENSE") (Join-Path $AppDest "LICENSE.app.txt") -Force
Copy-Item (Join-Path $RepoRoot "THIRD_PARTY_NOTICES.md") (Join-Path $AppDest "THIRD_PARTY_NOTICES.md") -Force

Write-Host "Adding Windows launch/install helpers..."
Copy-Item (Join-Path $RepoRoot "packaging\windows\*") $Bundle -Force
Copy-Item (Join-Path $RepoRoot "build\icon.ico") (Join-Path $Bundle "icon.ico") -Force
Copy-Item (Join-Path $RepoRoot "README.fa.md") (Join-Path $Bundle "README.fa.md") -Force
@{ appVersion = $AppVersion; electronVersion = $ElectronVersion; architecture = $Architecture; electronArchiveSHA256 = $ExpectedHash } | ConvertTo-Json | Set-Content (Join-Path $Bundle "BUILD-INFO.json") -Encoding utf8

$RuntimeLicense = Join-Path $Runtime "LICENSE"
$ChromiumLicenses = Join-Path $Runtime "LICENSES.chromium.html"
if (-not (Test-Path $RuntimeLicense)) { throw "Electron LICENSE file is missing from runtime." }
if (-not (Test-Path $ChromiumLicenses)) { throw "Chromium license bundle is missing from runtime." }

if (Test-Path $ReleaseZip) { Remove-Item $ReleaseZip -Force }
Write-Host "Creating $ReleaseZip ..."
Compress-Archive -Path (Join-Path $Bundle "*") -DestinationPath $ReleaseZip -CompressionLevel Optimal

$Hash = (Get-FileHash -Algorithm SHA256 $ReleaseZip).Hash.ToLowerInvariant()
"$Hash  $([IO.Path]::GetFileName($ReleaseZip))" | Set-Content -Path $ChecksumFile -Encoding ascii

Write-Host ""
Write-Host "Build complete:"
Write-Host "  $ReleaseZip"
Write-Host "  $ChecksumFile"
