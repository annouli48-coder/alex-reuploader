# ALEX Decompiler Connect: installs Start Menu and Desktop shortcuts.
# It opens the hosted Roblox-OAuth website in the default browser.
param([Parameter(Mandatory=$true)][string] $SiteUrl)
$ErrorActionPreference='Stop'
if ($SiteUrl -notmatch '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9_./-]*)?$') {
  throw 'Use a real HTTPS site, for example: .\install-windows.ps1 -SiteUrl https://your-site.example'
}
$startDir=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$desktop=[Environment]::GetFolderPath('Desktop')
foreach ($dir in @($startDir,$desktop)) {
  $path=Join-Path $dir 'ALEX Decompiler Connect.url'
  @("[InternetShortcut]","URL=$SiteUrl") | Set-Content -LiteralPath $path -Encoding ASCII
  Write-Host "Created shortcut: $path"
}
Write-Host 'ALEX Decompiler Connect opens in your default browser and requires Roblox sign-in.'
Start-Process $SiteUrl
