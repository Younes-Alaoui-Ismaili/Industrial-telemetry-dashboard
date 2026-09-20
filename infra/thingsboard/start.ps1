param([switch]$Sync)
$ErrorActionPreference = 'Stop'
$linuxPath = '/mnt/c/Users/client/Documents/Industrial-telemetry-dashboard/infra/thingsboard'
$keepAlive = Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object { $_.CommandLine -like '*telemetry-thingsboard-keepalive*' }
if (-not $keepAlive) {
  $process = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', 'Ubuntu', '--', 'bash', '-c', '"exec -a telemetry-thingsboard-keepalive sleep infinity"') -WindowStyle Hidden -PassThru
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'keepalive.local.json'), "{`"pid`":$($process.Id)}")
}
wsl -d Ubuntu -- docker compose --project-directory $linuxPath up -d
if ($LASTEXITCODE -ne 0) { throw 'ThingsBoard startup failed' }
$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  try {
    $response = Invoke-WebRequest 'http://127.0.0.1:18080/login' -TimeoutSec 5
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Seconds 3 }
}
if (-not $ready) { throw 'ThingsBoard did not become ready' }
if ($Sync) {
  & (Join-Path $PSScriptRoot 'read-azure.ps1')
  if (-not $?) { throw 'Azure refresh failed' }
  node (Join-Path $PSScriptRoot 'provision.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'ThingsBoard sync failed' }
}
Write-Output 'ThingsBoard is available at http://127.0.0.1:18080'
