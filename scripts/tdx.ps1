param([Parameter(Position=0)][ValidateSet("check","backup","deploy","status","help")][string]$Action="help")
$ErrorActionPreference = "Stop"
$Project = "C:\Users\Now You See Me\OneDrive\Desktop\TheDivineX_AI"
$BackupRoot = "C:\Users\Now You See Me\OneDrive\Desktop\TheDivineX_Backups"
function Fail([string]$Message) { Write-Host "`nERROR: $Message" -ForegroundColor Red; exit 1 }
if (-not (Test-Path -LiteralPath $Project -PathType Container)) { Fail "Project folder not found: $Project" }
Set-Location -LiteralPath $Project
function Check-All {
  Write-Host "`n=== JavaScript syntax ===" -ForegroundColor Cyan
  & node --check ".\app.js"; if ($LASTEXITCODE -ne 0) { Fail "JavaScript syntax check failed." }
  Write-Host "`n=== Production CSS build ===" -ForegroundColor Cyan
  & npm run build; if ($LASTEXITCODE -ne 0) { Fail "npm run build failed." }
  Write-Host "`n=== Git diff check ===" -ForegroundColor Cyan
  & git diff --check; if ($LASTEXITCODE -ne 0) { Fail "git diff --check failed." }
  Write-Host "`nCHECKS: PASS" -ForegroundColor Green
}
function Backup-All {
  New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $stage = Join-Path $BackupRoot "TheDivineX_AI_stage_$stamp"
  $verify = Join-Path $BackupRoot "TheDivineX_AI_verify_$stamp"
  $zip = Join-Path $BackupRoot "TheDivineX_AI_AUTO_$stamp.zip"
  try {
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    $excludedDirs = @("node_modules",".git",".vercel")
    $excludedFiles = @("*.bak","*.backup","*.log","*.before-*","*.pre-*","*.sidebar-backup","*.foundation-backup","*.smart-picker-before-*","models.tmp.js","models.js.live-capability-backup")
    $roboArgs = @($Project,$stage,"/E","/XD") + $excludedDirs + @("/XF") + $excludedFiles
    & robocopy @roboArgs
    if ($LASTEXITCODE -ge 8) { Fail "robocopy failed with exit code $LASTEXITCODE." }
    $shots = Join-Path $stage ".puter\screenshots"
    if (Test-Path -LiteralPath $shots) { Remove-Item -LiteralPath $shots -Recurse -Force }
    Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal
    if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { Fail "ZIP was not created." }
    Expand-Archive -LiteralPath $zip -DestinationPath $verify -Force
    foreach ($f in @("app.js","app.html","app.css","package.json")) {
      if (-not (Test-Path -LiteralPath (Join-Path $verify $f) -PathType Leaf)) { Fail "ZIP verification failed; missing $f." }
    }
    $item = Get-Item -LiteralPath $zip
    if ($item.Length -le 0) { Fail "ZIP is empty." }
    Write-Host "`nBACKUP: PASS" -ForegroundColor Green
    Write-Host "ZIP: $($item.FullName)"
    Write-Host "Bytes: $($item.Length)"
  } finally {
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    if (Test-Path -LiteralPath $verify) { Remove-Item -LiteralPath $verify -Recurse -Force }
  }
}
switch ($Action) {
  "check" { Check-All }
  "backup" { Backup-All }
  "status" {
    Write-Host "`n=== Git status ===" -ForegroundColor Cyan
    & git status --short --branch
    Write-Host "`n=== Latest commit ===" -ForegroundColor Cyan
    & git log -1 --oneline
    Write-Host "`n=== Vercel CLI ===" -ForegroundColor Cyan
    if (Get-Command vercel -ErrorAction SilentlyContinue) { & vercel --version } else { Write-Host "Vercel CLI not found." -ForegroundColor Yellow }
  }
  "deploy" {
    Check-All
    if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) { Fail "Vercel CLI not found." }
    Write-Host "`nCurrent Git status:" -ForegroundColor Cyan
    & git status --short
    $answer = Read-Host "`nDeploy current working tree to Vercel production? Type DEPLOY to continue"
    if ($answer -cne "DEPLOY") { Write-Host "Cancelled; no deployment started." -ForegroundColor Yellow; exit 0 }
    & vercel --prod
    if ($LASTEXITCODE -ne 0) { Fail "Vercel deployment command failed. Review the output." }
    Write-Host "`nCLI finished. Confirm Vercel says Ready, then manually test the live app." -ForegroundColor Green
  }
  default {
    Write-Host @"
TheDivineX AI workflow commands:
  npm run tdx:check   - syntax + Tailwind build + git diff check
  npm run tdx:backup  - verified timestamped ZIP backup
  npm run tdx:status  - Git status, latest commit, Vercel CLI version
  npm run tdx:deploy  - checks, explicit confirmation, then vercel --prod
"@
  }
}
