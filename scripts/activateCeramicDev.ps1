# FleetCore — Ceramic Tiles development activation
# Usage from the FleetCore repository root:
#   powershell -ExecutionPolicy Bypass -File scripts/activateCeramicDev.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/activateCeramicDev.ps1 -DeployToDevelopment
#
# Without -DeployToDevelopment this script runs checks ONLY.
# It NEVER runs `convex deploy` and does not touch production settings.

[CmdletBinding()]
param(
  [switch]$DeployToDevelopment,
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ExpectedBranch = "feature/ceramic-tiles-stage1-foundation"
$ExpectedDeployment = "dev:quixotic-gopher-969"
$ExpectedUrl = "https://quixotic-gopher-969.convex.cloud"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EnvPath = Join-Path $Root ".env.local"

function Get-EnvSetting([string]$Key) {
  if (-not (Test-Path -LiteralPath $EnvPath)) {
    throw "Missing .env.local. This script will not create or select a Convex deployment automatically."
  }
  foreach ($line in (Get-Content -LiteralPath $EnvPath)) {
    if ($line -match '^\s*([^#\s=]+)\s*=\s*(.*)$' -and $Matches[1] -eq $Key) {
      $raw = $Matches[2].Trim()
      if ($raw -match '^"([^"]*)"\s*(?:#.*)?$') {
        return $Matches[1]
      }
      if ($raw -match "^'([^']*)'\s*(?:#.*)?$") {
        return $Matches[1]
      }
      return (($raw -split '\s+#', 2)[0]).Trim()
    }
  }
  return $null
}

function Invoke-Checked([string]$Label, [string]$Executable, [string[]]$CommandArguments) {
  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Executable @CommandArguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit code $LASTEXITCODE). Stopping without further actions."
  }
}

Push-Location $Root
try {
  $Branch = (& git branch --show-current)
  if ($LASTEXITCODE -ne 0 -or $Branch.Trim() -ne $ExpectedBranch) {
    throw "Wrong Git branch. Switch to $ExpectedBranch first; nothing was deployed."
  }

  $Deployment = Get-EnvSetting "CONVEX_DEPLOYMENT"
  $Url = Get-EnvSetting "NEXT_PUBLIC_CONVEX_URL"
  # A deploy key inside the dotenv file can silently override deployment
  # selection even if the public URL looks correct. Never allow it here.
  if ((Get-EnvSetting "CONVEX_DEPLOY_KEY") -or (Get-EnvSetting "CONVEX_SELF_HOSTED_URL")) {
    throw "Remove any deployment-key or self-hosted Convex override from .env.local before using the development activation script."
  }
  if ($env:CONVEX_SELF_HOSTED_URL) {
    throw "Terminal CONVEX_SELF_HOSTED_URL is set. This script permits only the verified Convex development cloud deployment."
  }
  if ($Deployment -cne $ExpectedDeployment -or $Url -cne $ExpectedUrl) {
    throw "Local Convex settings do not BOTH match the verified development target. Expected CONVEX_DEPLOYMENT=$ExpectedDeployment and NEXT_PUBLIC_CONVEX_URL=$ExpectedUrl. Inspect .env.local privately. Nothing was deployed."
  }
  if ($env:CONVEX_DEPLOY_KEY) {
    throw "CONVEX_DEPLOY_KEY is set in this terminal. Unset it before development activation to avoid deploying with a production key."
  }
  if ($env:CONVEX_DEPLOYMENT -and $env:CONVEX_DEPLOYMENT -cne $ExpectedDeployment) {
    throw "Terminal CONVEX_DEPLOYMENT overrides the expected development target. Aborting."
  }
  if ($env:NEXT_PUBLIC_CONVEX_URL -and $env:NEXT_PUBLIC_CONVEX_URL -cne $ExpectedUrl) {
    throw "Terminal NEXT_PUBLIC_CONVEX_URL overrides the expected development target. Aborting."
  }

  # No uncommitted source changes may be included in a backend push.
  $Dirty = @(& git status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw "Could not verify Git working-tree state." }
  if ($Dirty.Count -gt 0) {
    throw "The working tree has uncommitted changes. Review/commit or stash them before activation."
  }

  Write-Host "Verified feature branch and isolated Convex development target." -ForegroundColor Green
  Write-Host "No production Convex URL, deploy key or command is permitted here."

  if (-not $SkipNpmInstall) {
    Invoke-Checked "Install locked dependencies" "npm" @("ci")
  }

  Invoke-Checked "Ceramic Tiles unit tests" "npm" @("run", "test:ceramic")
  Invoke-Checked "TypeScript checks" "npx" @("tsc", "--noEmit")
  Invoke-Checked "Ceramic Tiles ESLint" "npx" @(
    "eslint",
    "convex/ceramicTiles.ts",
    "convex/ceramicTilesFields.ts",
    "src/lib/ceramic-tiles/parser.ts",
    "src/lib/ceramic-tiles/parser.test.ts",
    "src/lib/ceramic-tiles/pdfReader.ts",
    "src/lib/ceramic-tiles/pdfReader.test.ts",
    "src/lib/ceramic-tiles/driverInstructions.ts",
    "src/lib/ceramic-tiles/driverInstructions.test.ts",
    "src/app/operations/ceramic-tiles/page.tsx",
    "src/components/ceramic-tiles/DriverInstructionsPanel.tsx"
  )
  Invoke-Checked "Next.js production compilation (local only)" "npm" @("run", "build")

  if (-not $DeployToDevelopment) {
    Write-Host ""
    Write-Host "CHECK-ONLY PASS. No Convex backend change has been made." -ForegroundColor Green
    Write-Host "To activate in the VERIFIED DEV deployment, rerun with -DeployToDevelopment."
    return
  }

  Write-Host ""
  Write-Host "Deploying Convex functions and schema to VERIFIED DEVELOPMENT ONLY." -ForegroundColor Yellow
  Invoke-Checked "Convex development sync" "npx" @("convex", "dev", "--once", "--env-file", ".env.local")

  # Regenerate frontend references from the newly synced development schema.
  Invoke-Checked "Regenerate Convex TypeScript references" "npx" @("convex", "codegen")
  Invoke-Checked "Post-sync TypeScript verification" "npx" @("tsc", "--noEmit")

  Write-Host ""
  Write-Host "Development Convex activation completed. Production was not targeted." -ForegroundColor Green
  Write-Host "NEXT: Test upload, versioning, assignment and WhatsApp draft in the dev preview."
} finally {
  Pop-Location
}
