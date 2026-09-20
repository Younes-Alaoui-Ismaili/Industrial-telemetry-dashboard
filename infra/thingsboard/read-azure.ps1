$ErrorActionPreference = 'Stop'
$env:AZURE_CONFIG_DIR = 'C:\Users\client\Documents\LinkedIn\tmp\evolution-depots\azure-operator-auth'
$az = 'C:\Users\client\Documents\LinkedIn\tmp\evolution-depots\runtime\azure-cli-2.90.0\bin\az.cmd'
$token = & $az account get-access-token --resource api://40b0c07d-1c71-4fe0-83f8-5c69eae1d1f9 --query accessToken -o tsv
if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Azure authentication unavailable' }
$headers = @{Authorization = "Bearer $token"}
$base = 'https://telemetry-proof-yai-20260909-us.azurewebsites.net/api/v1'
$devices = (Invoke-RestMethod "$base/devices" -Headers $headers -TimeoutSec 60).devices
$streams = @{}
foreach ($device in $devices) {
  $end = [long]$device.timestamp
  $start = [Math]::Max([long]0, [long]($end - 86400000))
  $streams[$device.id] = (Invoke-RestMethod "$base/telemetry?device_id=$($device.id)&start=$start&end=$end" -Headers $headers -TimeoutSec 60).readings
}
$alarms = (Invoke-RestMethod "$base/alarms" -Headers $headers -TimeoutSec 60).alarms
$snapshot = @{checkedAt = [DateTime]::UtcNow.ToString('o'); source = $base; devices = @($devices); streams = $streams; alarms = @($alarms)}
$path = Join-Path $PSScriptRoot 'azure-source.local.json'
[IO.File]::WriteAllText($path, ($snapshot | ConvertTo-Json -Depth 15))
Write-Output "Azure read-only snapshot saved: $($devices.Count) devices, $($alarms.Count) alarms"
