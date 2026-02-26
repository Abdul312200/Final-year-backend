# FinTechIQ - Ollama Free LLM Setup Script (Windows PowerShell)
# Usage:  .\install_ollama.ps1
# Install a specific model:  .\install_ollama.ps1 -Model mistral

param(
    [string]$Model = "llama3.2"
)

$OllamaWindowsUrl = "https://ollama.ai/download/windows"
$OllamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  FinTechIQ - Ollama Free LLM Setup"             -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if Ollama is already installed
function Test-OllamaInstalled {
    try {
        $null = Get-Command "ollama" -ErrorAction Stop
        return $true
    }
    catch {
        if (Test-Path $OllamaExe) { return $true }
        return $false
    }
}

if (Test-OllamaInstalled) {
    Write-Host "[OK] Ollama is already installed." -ForegroundColor Green
}
else {
    Write-Host "[..] Ollama not found. Opening download page..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Download and install Ollama from:" -ForegroundColor White
    Write-Host "  $OllamaWindowsUrl"               -ForegroundColor Blue
    Write-Host ""
    try { Start-Process $OllamaWindowsUrl } catch {}
    Read-Host "Press ENTER after installing Ollama to continue"
}

# Step 2: Start Ollama service in background
Write-Host ""
Write-Host "[..] Starting Ollama service..." -ForegroundColor Yellow
$running = Get-Process "ollama" -ErrorAction SilentlyContinue
if (-not $running) {
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Minimized
    Start-Sleep -Seconds 3
    Write-Host "[OK] Ollama service started in background." -ForegroundColor Green
}
else {
    Write-Host "[OK] Ollama is already running." -ForegroundColor Green
}

# Step 3: Pull recommended model
Write-Host ""
Write-Host "[..] Pulling model: $Model" -ForegroundColor Yellow
Write-Host "     (First run may take a few minutes - downloaded once and cached)" -ForegroundColor Gray
Write-Host ""

try {
    & ollama pull $Model
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[OK] Model '$Model' is ready!" -ForegroundColor Green
    }
    else {
        Write-Host "[!!] Pull may have failed. Run manually: ollama pull $Model" -ForegroundColor Red
    }
}
catch {
    Write-Host "[!!] Error: $_" -ForegroundColor Red
    Write-Host "     Run manually: ollama pull $Model" -ForegroundColor Yellow
}

# Step 4: Test Ollama API
Write-Host ""
Write-Host "[..] Testing Ollama API at http://127.0.0.1:11434 ..." -ForegroundColor Yellow
try {
    $response   = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
    $modelCount = $response.models.Count
    Write-Host "[OK] Ollama API is responding - $modelCount model(s) available." -ForegroundColor Green
    $response.models | ForEach-Object { Write-Host "     - $($_.name)" -ForegroundColor Gray }
}
catch {
    Write-Host "[!!] Ollama API not responding. Make sure 'ollama serve' is running." -ForegroundColor Red
}

# Step 5: Optional - pull mistral as a backup model
Write-Host ""
$pullMistral = Read-Host "Also pull 'mistral' as a smaller backup model? [y/N]"
if ($pullMistral -eq 'y' -or $pullMistral -eq 'Y') {
    Write-Host "[..] Pulling mistral..." -ForegroundColor Yellow
    & ollama pull mistral
    Write-Host "[OK] Mistral ready!" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!"                                 -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ollama is configured as the FREE LLM fallback for FinTechIQ." -ForegroundColor White
Write-Host ""
Write-Host "Primary LLM  : Google Gemini 1.5 Flash (set GEMINI_API_KEY in .env)" -ForegroundColor White
Write-Host "Fallback LLM : Ollama ($Model) - running locally, 100% free"         -ForegroundColor White
Write-Host ""
Write-Host "Start Ollama manually anytime:" -ForegroundColor Gray
Write-Host "  ollama serve"                 -ForegroundColor Yellow
Write-Host ""
Write-Host "Other free models you can pull:" -ForegroundColor Gray
Write-Host "  ollama pull llama3.2   (recommended, ~2 GB)" -ForegroundColor Yellow
Write-Host "  ollama pull mistral    (fast, ~4 GB)"        -ForegroundColor Yellow
Write-Host "  ollama pull gemma2     (quality, ~5 GB)"     -ForegroundColor Yellow
Write-Host "  ollama pull phi3       (small, ~2 GB)"       -ForegroundColor Yellow
Write-Host ""
Write-Host "Start the FinTechIQ backend: npm start" -ForegroundColor Cyan
Write-Host ""
