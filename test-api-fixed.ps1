#!/usr/bin/env pwsh

# FITCV API Testing Suite
# ========================

$API_URL = "http://localhost:3000/api"
$global:TOKEN = ""
$global:USER_ID = ""
$global:OFFER_ID = ""
$global:POSTULATION_ID = ""
$global:PASSED = 0
$global:FAILED = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [scriptblock]$OnSuccess = $null
    )

    try {
        $url = "$API_URL$Endpoint"
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $Headers
            ContentType = "application/json"
        }

        if ($Body) {
            $params.Body = $Body | ConvertTo-Json -Depth 10
        }

        $response = Invoke-WebRequest @params -UseBasicParsing -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json

        Write-Host "[OK] $Name" -ForegroundColor Green

        if ($OnSuccess) {
            & $OnSuccess -Response $data
        }

        $global:PASSED++

    } catch {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
        $global:FAILED++
    }

    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "FITCV API Testing Suite" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# 1. AUTHENTICATION
# ============================================
Write-Host "AUTHENTICATION TESTS" -ForegroundColor Yellow
Write-Host ""

$testEmail = "test-$(Get-Random)@example.com"

Test-Endpoint "Register User" "POST" "/auth/register" @{} @{
    email = $testEmail
    password = "TestPass123!"
} {
    param($Response)
    $global:TOKEN = $Response.accessToken
    $global:USER_ID = $Response.user.id
    Write-Host "   Token: $($global:TOKEN.Substring(0, 20))..." -ForegroundColor Gray
}

Test-Endpoint "Login User" "POST" "/auth/login" @{} @{
    email = $testEmail
    password = "TestPass123!"
} {
    param($Response)
    $global:TOKEN = $Response.accessToken
}

Write-Host ""

# ============================================
# 2. CV OPERATIONS
# ============================================
Write-Host "CV OPERATIONS TESTS" -ForegroundColor Yellow
Write-Host ""

$cvContent = @"
Senior Data Analyst with 6 years experience in AWS, Python, and SQL.
Expertise in building dashboards and analyzing large datasets.
Leadership experience mentoring 5+ junior analysts.
Strong SQL and Python skills. Experience with large datasets and cloud analytics.
"@

Test-Endpoint "Upload CV" "POST" "/cv/upload" @{Authorization = "Bearer $global:TOKEN"} @{
    cvContent = $cvContent
    fullName = "Test User"
}

Test-Endpoint "Get Profile" "GET" "/cv/profile" @{Authorization = "Bearer $global:TOKEN"}

Write-Host "Generating role suggestions (calls Claude API, ~10s)..."
Start-Sleep -Seconds 2

Test-Endpoint "Suggest Roles" "POST" "/cv/suggest-roles" @{Authorization = "Bearer $global:TOKEN"} @{}

Test-Endpoint "List Roles" "GET" "/cv/roles" @{Authorization = "Bearer $global:TOKEN"}

Write-Host ""

# ============================================
# 3. JOB OFFERS
# ============================================
Write-Host "JOB OFFERS TESTS" -ForegroundColor Yellow
Write-Host ""

Test-Endpoint "List Offers" "GET" "/offers?limit=5" @{Authorization = "Bearer $global:TOKEN"} {
    param($Response)
    if ($Response.data -and $Response.data.Count -gt 0) {
        $global:OFFER_ID = $Response.data[0].id
        Write-Host "   Found $($Response.data.Count) job offers" -ForegroundColor Gray
        Write-Host "   Top: $($Response.data[0].title) at $($Response.data[0].company)" -ForegroundColor Gray
    }
}

Test-Endpoint "Get Offer Details" "GET" "/offers/$global:OFFER_ID" @{Authorization = "Bearer $global:TOKEN"}

Test-Endpoint "Dashboard Stats" "GET" "/offers/stats/summary" @{Authorization = "Bearer $global:TOKEN"}

Write-Host ""

# ============================================
# 4. POSTULATIONS
# ============================================
Write-Host "POSTULATIONS TESTS" -ForegroundColor Yellow
Write-Host ""

Test-Endpoint "Create Postulation" "POST" "/postulations" @{Authorization = "Bearer $global:TOKEN"} @{
    offerId = $global:OFFER_ID
    priority = "HIGH"
    notes = "Strong match for this position"
} {
    param($Response)
    $global:POSTULATION_ID = $Response.data.id
}

Test-Endpoint "List Postulations" "GET" "/postulations" @{Authorization = "Bearer $global:TOKEN"}

Test-Endpoint "Get Postulation Details" "GET" "/postulations/$global:POSTULATION_ID" @{Authorization = "Bearer $global:TOKEN"}

Write-Host "Generating adapted CV (calls Claude API, ~10s)..."
Start-Sleep -Seconds 2

Test-Endpoint "Generate Adapted CV" "POST" "/postulations/$global:POSTULATION_ID/generate-cv" @{Authorization = "Bearer $global:TOKEN"} {
    param($Response)
    Write-Host "   ATS Score: $($Response.data.atsScore)" -ForegroundColor Gray
}

Test-Endpoint "Download CV" "GET" "/postulations/$global:POSTULATION_ID/cv" @{Authorization = "Bearer $global:TOKEN"}

Test-Endpoint "Update Postulation" "PATCH" "/postulations/$global:POSTULATION_ID" @{Authorization = "Bearer $global:TOKEN"} @{
    status = "APPLIED"
}

Write-Host ""

# ============================================
# 5. ERROR HANDLING
# ============================================
Write-Host "ERROR HANDLING TESTS" -ForegroundColor Yellow
Write-Host ""

Test-Endpoint "Missing Token (401)" "GET" "/cv/profile" @{}

Test-Endpoint "Invalid Data (400)" "POST" "/postulations" @{Authorization = "Bearer $global:TOKEN"} @{
    offerId = "invalid"
}

Test-Endpoint "Not Found (404)" "GET" "/offers/nonexistent" @{Authorization = "Bearer $global:TOKEN"}

Write-Host ""

# ============================================
# SUMMARY
# ============================================
Write-Host "TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Passed: $global:PASSED" -ForegroundColor Green
Write-Host "Failed: $global:FAILED" -ForegroundColor Red
Write-Host "Total:  $($global:PASSED + $global:FAILED)" -ForegroundColor White
Write-Host ""

if ($global:FAILED -eq 0 -and $global:PASSED -gt 0) {
    Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "Some tests failed. Check errors above." -ForegroundColor Yellow
}

Write-Host ""
