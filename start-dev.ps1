# FITCV MVP v0.2 - Start Development Server
# ==================================================

Write-Host "`n🚀 FITCV MVP v0.2 - Development Server" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Verify Node.js
Write-Host "`n✓ Checking prerequisites..." -ForegroundColor Yellow
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "✗ Node.js not found. Please install Node.js v18+" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Node.js $(node --version)" -ForegroundColor Green
Write-Host "✓ npm $(npm --version)" -ForegroundColor Green

# Compile TypeScript
Write-Host "`n✓ Compiling TypeScript..." -ForegroundColor Yellow
npx tsc
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ TypeScript compilation failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ TypeScript compiled successfully" -ForegroundColor Green

# Start server
Write-Host "`n✓ Starting server..." -ForegroundColor Yellow
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Server running on: http://localhost:3000" -ForegroundColor Green
Write-Host "Health check: http://localhost:3000/health" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "API Documentation:" -ForegroundColor Yellow
Write-Host "- API.md - Complete endpoint reference" -ForegroundColor Gray
Write-Host "- TESTING.md - Step-by-step testing guide" -ForegroundColor Gray

Write-Host "`nTesting the API:" -ForegroundColor Yellow
Write-Host "1. Open TESTING.md for detailed instructions" -ForegroundColor Gray
Write-Host "2. Use curl commands from TESTING.md" -ForegroundColor Gray
Write-Host "3. Or import fitcv.postman_collection.json to Postman" -ForegroundColor Gray

Write-Host "`nTest flow:" -ForegroundColor Yellow
Write-Host "Register -> Login -> Upload CV -> Get Offers -> Create Postulation -> Generate CV" -ForegroundColor Gray

Write-Host "`nPress Ctrl+C to stop server`n" -ForegroundColor Yellow

# Start dev server
npm run dev
