# Claude Code Telegram Bridge - Start Script
# Usage: .\start.ps1
#
# Before running, set your bot token:
#   $env:TELEGRAM_BOT_TOKEN = "your-bot-token-here"

Write-Host ""
Write-Host "Claude Code Telegram Bridge" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""

# Check if TELEGRAM_BOT_TOKEN is set (env var or .env file)
$envFile = Join-Path $PSScriptRoot ".env"
$hasEnvFile = Test-Path $envFile

if (-not $env:TELEGRAM_BOT_TOKEN -and -not $hasEnvFile) {
    Write-Host "[ERROR] TELEGRAM_BOT_TOKEN not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Either create a .env file with:" -ForegroundColor Yellow
    Write-Host '  TELEGRAM_BOT_TOKEN=your-bot-token-here'
    Write-Host ""
    Write-Host "Or set the environment variable:" -ForegroundColor Yellow
    Write-Host '  $env:TELEGRAM_BOT_TOKEN = "your-bot-token-here"'
    Write-Host ""
    Write-Host "Get your token from @BotFather on Telegram" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

if ($hasEnvFile) {
    Write-Host "[OK] Found .env file" -ForegroundColor Green
} elseif ($env:TELEGRAM_BOT_TOKEN) {
    Write-Host "[OK] TELEGRAM_BOT_TOKEN is set" -ForegroundColor Green
}

# Check if WezTerm CLI is available
$weztermCheck = Get-Command wezterm -ErrorAction SilentlyContinue
if (-not $weztermCheck) {
    Write-Host "[WARNING] WezTerm CLI not found in PATH" -ForegroundColor Yellow
    Write-Host "The bridge requires WezTerm to communicate with Claude Code." -ForegroundColor Yellow
    Write-Host "Make sure WezTerm is installed and added to PATH." -ForegroundColor Yellow
    Write-Host ""
} else {
    # Check if WezTerm has active panes
    try {
        $panes = wezterm cli list 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[WARNING] WezTerm mux server may not be running" -ForegroundColor Yellow
            Write-Host "Add 'config.enable_mux_server = true' to your wezterm.lua" -ForegroundColor Yellow
            Write-Host ""
        } else {
            Write-Host "[OK] WezTerm CLI is working" -ForegroundColor Green
        }
    } catch {
        Write-Host "[WARNING] Could not check WezTerm status" -ForegroundColor Yellow
    }
}

# Reminder about Claude Code
Write-Host ""
Write-Host "REMINDER: Make sure Claude Code is running in WezTerm!" -ForegroundColor Magenta
Write-Host "  claude --dangerously-skip-permissions" -ForegroundColor Gray
Write-Host ""

# Start the bridge
Write-Host "Starting server on port 3007..." -ForegroundColor Green
Write-Host ""
node src/bridge.js
