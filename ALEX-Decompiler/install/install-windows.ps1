# Download and run the native ALEX Decompiler Windows installer.
$ErrorActionPreference = 'Stop'
$tag = 'alex-decompiler-native-v1.0.0'
$base = "https://github.com/annouli48-coder/alex-reuploader/releases/download/$tag"
$asset = 'ALEX-Decompiler-Setup-x64.exe'
$temp = Join-Path $env:TEMP "ALEX-Decompiler-$(Get-Random)"
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $installer = Join-Path $temp $asset
  $checksum = "$installer.sha256"
  Invoke-WebRequest "$base/$asset" -OutFile $installer
  Invoke-WebRequest "$base/$asset.sha256" -OutFile $checksum
  $expected = ((Get-Content $checksum -Raw).Trim() -split '\s+')[0]
  $actual = (Get-FileHash $installer -Algorithm SHA256).Hash
  if ($actual -ne $expected) { throw 'ALEX installer checksum mismatch' }
  Write-Host '[ALEX] Checksum verified. Opening native Windows installer.'
  Start-Process -FilePath $installer -Wait
} finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
