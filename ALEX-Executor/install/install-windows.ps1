# ALEX Executor Windows x64 installer. Requires published GitHub Release.
$ErrorActionPreference = 'Stop'
$repo = if ($env:ALEX_EXECUTOR_REPO) { $env:ALEX_EXECUTOR_REPO } else { 'annouli48-coder/alex-reuploader' }
$tag = if ($env:ALEX_EXECUTOR_RELEASE_TAG) { $env:ALEX_EXECUTOR_RELEASE_TAG } else { 'alex-executor-v0.1.0' }
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64') {
  throw 'Windows x64 required.'
}
$asset = 'ALEX-Executor-Setup-x64.exe'
$base = "https://github.com/$repo/releases/download/$tag"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('ALEX-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $exe = Join-Path $tmp $asset
  $hashFile = Join-Path $tmp "$asset.sha256"
  Invoke-WebRequest "$base/$asset" -OutFile $exe
  Invoke-WebRequest "$base/$asset.sha256" -OutFile $hashFile
  $expected = ((Get-Content $hashFile -Raw).Trim() -split '\s+')[0].ToUpperInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 $exe).Hash.ToUpperInvariant()
  if ($expected -ne $actual) { throw 'Checksum mismatch: aborted.' }
  $process = Start-Process -FilePath $exe -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw "Installer exit code: $($process.ExitCode)" }
  Write-Host 'ALEX Executor installation completed.'
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
