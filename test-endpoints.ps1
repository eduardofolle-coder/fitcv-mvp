# FITCV Backend Testing Script (PowerShell)
# Tests all endpoints exhaustively to detect bugs

$API_URL = "http://localhost:3000"
$EMAIL = "testuser@$(Get-Date -Format 'yyyyMMddHHmmss').com"
$PASSWORD = "TestPass123!"
$TOKEN = $null

Write-Host "🧪 FITCV Backend Testing Suite" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

$testCount = 0
$passCount = 0
$failCount = 0

# Helper function to test endpoints
function Test-Endpoint {
    param(
        [string]$method,
        [string]$endpoint,
        [string]$data,
        [int]$expectedStatus,
        [string]$token
    )

    $script:testCount++
    Write-Host "Test $($script:testCount): $method $endpoint ... " -NoNewline -ForegroundColor Blue

    try {
        $params = @{
            Method  = $method
            Uri     = "$API_URL$endpoint"
            Headers = @{ "Content-Type" = "application/json" }
        }

        if ($token) {
            $params.Headers["Authorization"] = "Bearer $token"
        }

        if ($data) {
            $params.Body = $data
        }

        $response = Invoke-WebRequest @params -SkipHttpErrorCheck

        if ($response.StatusCode -eq $expectedStatus) {
            Write-Host "PASS" -ForegroundColor Green
            Write-Host " (HTTP $($response.StatusCode))"
            $script:passCount++

            try {
                $response.Content | ConvertFrom-Json | ConvertTo-Json | Write-Host
            } catch {
                Write-Host $response.Content
            }
        } else {
            Write-Host "FAIL" -ForegroundColor Red
            Write-Host " (Expected $expectedStatus, got $($response.StatusCode))"
            $script:failCount++

            try {
                $response.Content | ConvertFrom-Json | ConvertTo-Json | Write-Host
            } catch {
                Write-Host $response.Content
            }
        }
    } catch {
        Write-Host "ERROR" -ForegroundColor Red
        Write-Host " ($_)"
        $script:failCount++
    }

    Write-Host ""
}

# 1. Test Health Check
Write-Host "1. Health Check" -ForegroundColor Yellow
Test-Endpoint "GET" "/health" "" 200

# 2. Test Root Endpoint
Write-Host "2. Root Endpoint" -ForegroundColor Yellow
Test-Endpoint "GET" "/" "" 200

# 3. Test Register
Write-Host "3. Authentication - Register" -ForegroundColor Yellow
$registerData = @{
    email    = $EMAIL
    password = $PASSWORD
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Method POST "$API_URL/api/auth/register" `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $registerData `
        -SkipHttpErrorCheck

    $body = $response.Content | ConvertFrom-Json

    if ($body.accessToken) {
        Write-Host "✓ Register PASS" -ForegroundColor Green
        $script:passCount++
        $script:testCount++
        $TOKEN = $body.accessToken
        $USER_ID = $body.user.id
        Write-Host "  Token: $TOKEN"
        Write-Host "  User ID: $USER_ID"
    } else {
        Write-Host "✗ Register FAIL" -ForegroundColor Red
        $script:failCount++
        $script:testCount++
        Write-Host $body
    }
} catch {
    Write-Host "✗ Register ERROR: $_" -ForegroundColor Red
    $script:failCount++
    $script:testCount++
}
Write-Host ""

# 4. Test Login
Write-Host "4. Authentication - Login" -ForegroundColor Yellow
$loginData = @{
    email    = $EMAIL
    password = $PASSWORD
} | ConvertTo-Json

Test-Endpoint "POST" "/api/auth/login" $loginData 200

# 5. Test CV Upload
Write-Host "5. CV Management - Upload" -ForegroundColor Yellow
$cvText = "John Doe`nEmail: john@example.com`nPhone: +56912345678`n`nSUMMARY:`nSenior Software Engineer with 8 years of experience`n`nEXPERIENCE:`nSenior Software Engineer at TechCorp (2020-2024)`n  * Led team of 5 engineers`n  * Improved system latency by 60%`n  * Tech stack: Python, JavaScript, AWS, Kubernetes`n`nMid-level Engineer at StartupXYZ (2018-2020)`n  * Built microservices architecture`n  * Mentored 2 junior engineers`n`nEDUCATION:`nBS Computer Science, University of Chile (2018)`nCertifications: AWS Solutions Architect, Kubernetes CKA`n`nSKILLS:`nPython, JavaScript, TypeScript, React, Node.js, AWS, Kubernetes, Docker, PostgreSQL, MongoDB"
$cvData = @{
    cvText = $cvText
} | ConvertTo-Json

Test-Endpoint "POST" "/api/cv/upload" $cvData 200 $TOKEN

# 6. Test Get CV Profile
Write-Host "6. CV Management - Get Profile" -ForegroundColor Yellow
Test-Endpoint "GET" "/api/cv/profile" "" 200 $TOKEN

# 7. Test Get CV Stats
Write-Host "7. CV Management - Get Stats" -ForegroundColor Yellow
Test-Endpoint "GET" "/api/cv/stats" "" 200 $TOKEN

# 8. Test Get All Offers
Write-Host "8. Offers - Get All" -ForegroundColor Yellow
Test-Endpoint "GET" "/api/offers" "" 200 $TOKEN

# 9. Test Get Ranked Offers
Write-Host "9. Offers - Get Ranked (Agent)" -ForegroundColor Yellow
Test-Endpoint "GET" "/api/offers/ranked" "" 200 $TOKEN

# 10. Test Create Postulation
Write-Host "10. Postulations - Create" -ForegroundColor Yellow
$postulationData = @{
    offerId = "offer-001"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Method POST "$API_URL/api/postulations" `
        -Headers @{
            "Content-Type"  = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -Body $postulationData `
        -SkipHttpErrorCheck

    $body = $response.Content | ConvertFrom-Json

    if ($body.id) {
        Write-Host "✓ Create Postulation PASS" -ForegroundColor Green
        $script:passCount++
        $POSTULATION_ID = $body.id
        $script:testCount++
        Write-Host "  Postulation ID: $POSTULATION_ID"
    } else {
        Write-Host "✗ Create Postulation FAIL" -ForegroundColor Red
        $script:failCount++
        $script:testCount++
        Write-Host $body
    }
} catch {
    Write-Host "✗ Create Postulation ERROR: $_" -ForegroundColor Red
    $script:failCount++
    $script:testCount++
}
Write-Host ""

# 11. Test Get All Postulations
Write-Host "11. Postulations - Get All" -ForegroundColor Yellow
Test-Endpoint "GET" "/api/postulations" "" 200 $TOKEN

# 12. Test Match Postulation
Write-Host "12. Postulations - Match (Agent)" -ForegroundColor Yellow
$matchData = @{
    offerId = "offer-001"
} | ConvertTo-Json

Test-Endpoint "POST" "/api/postulations/match" $matchData 200 $TOKEN

# 13. Test Generate Adapted CV
if ($POSTULATION_ID) {
    Write-Host "13. Postulations - Generate Adapted CV (Agent)" -ForegroundColor Yellow
    Test-Endpoint "POST" "/api/postulations/$POSTULATION_ID/generate-cv" "" 200 $TOKEN
}

# 14. Test Report Outcome
if ($POSTULATION_ID) {
    Write-Host "14. Learning - Report Outcome" -ForegroundColor Yellow
    $outcomeData = @{
        postulationId = $POSTULATION_ID
        outcome       = "interview"
        feedback      = "Interviewer was impressed"
    } | ConvertTo-Json

    Test-Endpoint "POST" "/api/learning/outcome" $outcomeData 200 $TOKEN
}

# 15. Test Get Memory Summary
Write-Host "15. Learning - Get Summary" -ForegroundColor Yellow
Test-Endpoint "GET" "/api/learning/summary" "" 200 $TOKEN

# Summary
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Test Results:" -ForegroundColor Cyan
Write-Host "✓ Passed: $passCount" -ForegroundColor Green
Write-Host "✗ Failed: $failCount" -ForegroundColor Red
Write-Host "Total:  $testCount"
Write-Host "================================" -ForegroundColor Cyan

if ($failCount -eq 0) {
    Write-Host "✓ ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "✗ SOME TESTS FAILED" -ForegroundColor Red
}
