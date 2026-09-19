param(
  [string]$Token = $env:SCALEOS_COMPUTER_WORKER_TOKEN,
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

if (-not $Token) {
  throw "Set SCALEOS_COMPUTER_WORKER_TOKEN to a long random value before starting the worker."
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $RepoRoot ".venv-computer"
$Python = Join-Path $Venv "Scripts\python.exe"

if (-not (Test-Path $Python)) {
  Write-Host "Creating ScaleOS computer-worker virtual environment..."
  py -m venv $Venv
}

& $Python -m pip install --disable-pip-version-check -r (Join-Path $RepoRoot "computer_worker\requirements.txt")

$env:SCALEOS_COMPUTER_WORKER_TOKEN = $Token
$env:SCALEOS_COMPUTER_WORKER_MODE = "real"

Write-Host "Starting ScaleOS Computer Worker on http://127.0.0.1:$Port"
Write-Host "PyAutoGUI fail-safe is enabled: move the pointer to a screen corner to abort desktop input."
Set-Location $RepoRoot
& $Python -m uvicorn computer_worker.main:app --host 127.0.0.1 --port $Port
