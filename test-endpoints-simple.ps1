# FITCV Backend Testing Script (Simplified PowerShell)

$API_URL = "http://localhost:3000"
$EMAIL = "testuser@$(Get-Date -Format 'yyyyMMddHHmmss').com"
$PASSWORD = "TestPass123!"
$TOKEN = $null
$POSTULATION_ID = $null

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "FITCV Backend Testing Suite" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$passCount = 0
$failCount = 0
$testNum = 0

# Test 1: Health Check
Write-Host "[Test 1] Health Check" -ForegroundColor Yellow
$testNum++
try {
    $response = Invoke-WebRequest -Method GET "$API_URL/health" -SkipHttpErrorCheck
    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: Health check successful" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Expected 200, got $($response.StatusCode)" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 2: Root Endpoint
Write-Host "[Test 2] Root Endpoint" -ForegroundColor Yellow
$testNum++
try {
    $response = Invoke-WebRequest -Method GET "$API_URL/" -SkipHttpErrorCheck
    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: Root endpoint successful" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Expected 200, got $($response.StatusCode)" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 3: Register User
Write-Host "[Test 3] Register User" -ForegroundColor Yellow
$testNum++
try {
    $regData = @{
        email = $EMAIL
        password = $PASSWORD
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Method POST "$API_URL/api/auth/register" `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $regData `
        -SkipHttpErrorCheck

    $body = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -eq 201 -and $body.accessToken) {
        Write-Host "PASS: Registration successful" -ForegroundColor Green
        $TOKEN = $body.accessToken
        $USER_ID = $body.user.id
        Write-Host "  Email: $EMAIL" -ForegroundColor Gray
        Write-Host "  User ID: $USER_ID" -ForegroundColor Gray
        $passCount++
    } else {
        Write-Host "FAIL: Registration failed (Status: $($response.StatusCode))" -ForegroundColor Red
        Write-Host "Response: $($response.Content)" -ForegroundColor Gray
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 4: Login
Write-Host "[Test 4] Login" -ForegroundColor Yellow
$testNum++
try {
    $loginData = @{
        email = $EMAIL
        password = $PASSWORD
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Method POST "$API_URL/api/auth/login" `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $loginData `
        -SkipHttpErrorCheck

    $body = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -eq 200 -and $body.accessToken) {
        Write-Host "PASS: Login successful" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Login failed (Status: $($response.StatusCode))" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 5: CV Upload
Write-Host "[Test 5] CV Upload" -ForegroundColor Yellow
$testNum++
try {
    $cvData = @{
        cvText = "John Doe`nEmail: john@example.com`nSUMMARY: Senior Software Engineer`nEXPERIENCE: 8 years`nSKILLS: Python, JavaScript, TypeScript, React, Node.js"
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Method POST "$API_URL/api/cv/upload" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -Body $cvData `
        -SkipHttpErrorCheck

    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: CV uploaded successfully" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: CV upload failed (Status: $($response.StatusCode))" -ForegroundColor Red
        Write-Host "Response: $($response.Content)" -ForegroundColor Gray
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 6: Get CV Profile
Write-Host "[Test 6] Get CV Profile" -ForegroundColor Yellow
$testNum++
try {
    $response = Invoke-WebRequest -Method GET "$API_URL/api/cv/profile" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -SkipHttpErrorCheck

    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: CV profile retrieved" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Get profile failed (Status: $($response.StatusCode))" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 7: Get CV Stats
Write-Host "[Test 7] Get CV Stats" -ForegroundColor Yellow
$testNum++
try {
    $response = Invoke-WebRequest -Method GET "$API_URL/api/cv/stats" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -SkipHttpErrorCheck

    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: CV stats retrieved" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Get stats failed (Status: $($response.StatusCode))" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 8: Get All Offers
Write-Host "[Test 8] Get All Offers" -ForegroundColor Yellow
$testNum++
try {
    $response = Invoke-WebRequest -Method GET "$API_URL/api/offers" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -SkipHttpErrorCheck

    $body = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -eq 200 -and $body.offers -and $body.offers.Count -gt 0) {
        Write-Host "PASS: Offers retrieved ($($body.offers.Count) offers)" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Get offers failed (Status: $($response.StatusCode))" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 9: Get Ranked Offers
Write-Host "[Test 9] Get Ranked Offers (Agent Call)" -ForegroundColor Yellow
$testNum++
try {
    $response = Invoke-WebRequest -Method GET "$API_URL/api/offers/ranked" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -SkipHttpErrorCheck

    $body = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: Ranked offers retrieved (Agent cost: $($body.agentCost) tokens)" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Get ranked offers failed (Status: $($response.StatusCode))" -ForegroundColor Red
        Write-Host "Response: $($response.Content)" -ForegroundColor Gray
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 10: Create Postulation
Write-Host "[Test 10] Create Postulation" -ForegroundColor Yellow
$testNum++
try {
    $postData = @{
        offerId = "offer-001"
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Method POST "$API_URL/api/postulations" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -Body $postData `
        -SkipHttpErrorCheck

    $body = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -eq 201 -and $body.id) {
        Write-Host "PASS: Postulation created" -ForegroundColor Green
        $POSTULATION_ID = $body.id
        Write-Host "  ID: $POSTULATION_ID" -ForegroundColor Gray
        $passCount++
    } else {
        Write-Host "FAIL: Create postulation failed (Status: $($response.StatusCode))" -ForegroundColor Red
        Write-Host "Response: $($response.Content)" -ForegroundColor Gray
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 11: Get All Postulations
Write-Host "[Test 11] Get All Postulations" -ForegroundColor Yellow
$testNum++
try {
    $response = Invoke-WebRequest -Method GET "$API_URL/api/postulations" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -SkipHttpErrorCheck

    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: Postulations retrieved" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Get postulations failed (Status: $($response.StatusCode))" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 12: Match Postulation
Write-Host "[Test 12] Match Postulation (Agent Call)" -ForegroundColor Yellow
$testNum++
try {
    $matchData = @{
        offerId = "offer-001"
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Method POST "$API_URL/api/postulations/match" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -Body $matchData `
        -SkipHttpErrorCheck

    $body = $response.Content | ConvertFrom-Json

    if ($response.StatusCode -eq 200 -and $body.matchAnalysis) {
        Write-Host "PASS: Postulation matched (Score: $($body.matchAnalysis.overallMatch))" -ForegroundColor Green
        Write-Host "  Agent cost: $($body.agentCost) tokens" -ForegroundColor Gray
        $passCount++
    } else {
        Write-Host "FAIL: Match postulation failed (Status: $($response.StatusCode))" -ForegroundColor Red
        Write-Host "Response: $($response.Content)" -ForegroundColor Gray
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 13: Generate Adapted CV
if ($POSTULATION_ID) {
    Write-Host "[Test 13] Generate Adapted CV (Agent Call)" -ForegroundColor Yellow
    $testNum++
    try {
        $response = Invoke-WebRequest -Method POST "$API_URL/api/postulations/$POSTULATION_ID/generate-cv" `
            -Headers @{
                "Content-Type" = "application/json"
                "Authorization" = "Bearer $TOKEN"
            } `
            -SkipHttpErrorCheck

        $body = $response.Content | ConvertFrom-Json

        if ($response.StatusCode -eq 201 -and $body.atsScore) {
            Write-Host "PASS: Adapted CV generated (ATS Score: $($body.atsScore))" -ForegroundColor Green
            Write-Host "  Agent cost: $($body.agentCost) tokens" -ForegroundColor Gray
            $passCount++
        } else {
            Write-Host "FAIL: Generate CV failed (Status: $($response.StatusCode))" -ForegroundColor Red
            Write-Host "Response: $($response.Content)" -ForegroundColor Gray
            $failCount++
        }
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        $failCount++
    }
    Write-Host ""
}

# Test 14: Report Outcome
if ($POSTULATION_ID) {
    Write-Host "[Test 14] Report Postulation Outcome" -ForegroundColor Yellow
    $testNum++
    try {
        $outcomeData = @{
            postulationId = $POSTULATION_ID
            outcome = "interview"
            feedback = "Great conversation"
        } | ConvertTo-Json

        $response = Invoke-WebRequest -Method POST "$API_URL/api/learning/outcome" `
            -Headers @{
                "Content-Type" = "application/json"
                "Authorization" = "Bearer $TOKEN"
            } `
            -Body $outcomeData `
            -SkipHttpErrorCheck

        if ($response.StatusCode -eq 200) {
            Write-Host "PASS: Outcome reported" -ForegroundColor Green
            $passCount++
        } else {
            Write-Host "FAIL: Report outcome failed (Status: $($response.StatusCode))" -ForegroundColor Red
            $failCount++
        }
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        $failCount++
    }
    Write-Host ""
}

# Test 15: Get Memory Summary
Write-Host "[Test 15] Get Memory Summary" -ForegroundColor Yellow
$testNum++
try {
    $response = Invoke-WebRequest -Method GET "$API_URL/api/learning/summary" `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $TOKEN"
        } `
        -SkipHttpErrorCheck

    if ($response.StatusCode -eq 200) {
        Write-Host "PASS: Memory summary retrieved" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: Get summary failed (Status: $($response.StatusCode))" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Summary
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "PASSED: $passCount" -ForegroundColor Green
Write-Host "FAILED: $failCount" -ForegroundColor Red
Write-Host "TOTAL:  $testNum"
Write-Host "==========================================" -ForegroundColor Cyan

if ($failCount -eq 0) {
    Write-Host "SUCCESS: All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "FAILURE: Some tests failed" -ForegroundColor Red
    exit 1
}
