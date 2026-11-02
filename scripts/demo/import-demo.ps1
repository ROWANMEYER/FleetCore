# Import ONLY into a newly created isolated FleetCor DEMO Convex deployment.
# -Deployment must be the exact reference, e.g. dev/my-user/fleetcor-client-demo
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Deployment,
  [Parameter(Mandatory=$true)][string]$DataDir
)
$ErrorActionPreference = 'Stop'
$target = $Deployment.Trim()
if ($target -notmatch '(?i)demo' -or $target -match '(?i)^(prod|production|dev|local|staging)$|quixotic-gopher-969|precise-chickadee-602') {
  throw 'Refusing unsafe target: select an explicit, NEW demo-only Convex deployment reference.'
}
if (-not (Test-Path -LiteralPath $DataDir -PathType Container)) {
  throw "Data directory not found: $DataDir"
}
$tables = @(
  @{ Name='trucks'; Count=10 },
  @{ Name='trailers'; Count=12 },
  @{ Name='drivers'; Count=12 },
  @{ Name='customers'; Count=11 },
  @{ Name='dailyRoutes'; Count=468 }
)
foreach ($entry in $tables) {
  $file = Join-Path $DataDir ($entry.Name + '.jsonl')
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing file: $file" }
  $count = @(Get-Content -LiteralPath $file | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count
  if ($count -ne $entry.Count) { throw "Unexpected count in $file. Found $count, expected $($entry.Count)." }
}
Write-Host "Destination: $target" -ForegroundColor Cyan
Write-Host 'No existing tables will be replaced or appended. A fresh demo deployment is required.'
$approval = Read-Host 'Type IMPORT DEMO (exactly) to confirm it is NOT your live FleetCor backend'
if ($approval -cne 'IMPORT DEMO') { throw 'Import cancelled without changes.' }
foreach ($entry in $tables) {
  $file = Join-Path $DataDir ($entry.Name + '.jsonl')
  Write-Host "Importing $($entry.Name)..."
  & npx convex import --deployment $target --table $entry.Name --format jsonLines $file
  if ($LASTEXITCODE -ne 0) { throw "Import failed at $($entry.Name). Check target; do not retry blindly." }
}
Write-Host 'Done: 10 trucks, 12 trailers, 12 drivers, 11 customers and 468 demo routes.' -ForegroundColor Green
