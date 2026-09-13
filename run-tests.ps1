# FITCV Backend Testing - PowerShell 5.1 Compatible

$API_URL = "http://localhost:3000"
$RANDOM_ID = Get-Random -Minimum 100000 -Maximum 999999
$RANDOM_ID2 = Get-Random -Minimum 1000 -Maximum 9999
$EMAIL = "testuser$RANDOM_ID$RANDOM_ID2@example.com"
$PASSWORD = "TestPass123!"
$TOKEN = $null
$POSTULATION_ID = $null

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "FITCV Backend Testing Suite" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$passCount = 0
$failCount = 0

# Test 1: Health Check
Write-Host "[Test 1] Health Check" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Method GET "$API_URL/health" -ErrorAction Continue
    Write-Host "PASS: Health check successful" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 2: Root Endpoint
Write-Host "[Test 2] Root Endpoint" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Method GET "$API_URL/" -ErrorAction Continue
    Write-Host "PASS: Root endpoint successful" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 3: Register User
Write-Host "[Test 3] Register User" -ForegroundColor Yellow
try {
    $regData = @{
        email = $EMAIL
        password = $PASSWORD
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Method POST "$API_URL/api/auth/register" `
        -ContentType "application/json" `
        -Body $regData `
        -ErrorAction Continue

    if ($response.accessToken) {
        Write-Host "PASS: Registration successful" -ForegroundColor Green
        $TOKEN = $response.accessToken
        Write-Host "  Email: $EMAIL" -ForegroundColor Gray
        $passCount++
    } else {
        Write-Host "FAIL: No access token in response" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 4: Login
Write-Host "[Test 4] Login" -ForegroundColor Yellow
try {
    $loginData = @{
        email = $EMAIL
        password = $PASSWORD
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Method POST "$API_URL/api/auth/login" `
        -ContentType "application/json" `
        -Body $loginData `
        -ErrorAction Continue

    if ($response.accessToken) {
        Write-Host "PASS: Login successful" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: No access token in response" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 5: CV Upload
Write-Host "[Test 5] CV Upload" -ForegroundColor Yellow
try {
    $cvData = @{
        cvText = "John Doe`nSenior Software Engineer`nExperience: 8 years`nSkills: Python, JavaScript, React"
    } | ConvertTo-Json

    $headers = @{
        "Authorization" = "Bearer $TOKEN"
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Method POST "$API_URL/api/cv/upload" `
        -ContentType "application/json" `
        -Headers $headers `
        -Body $cvData `
        -ErrorAction Continue

    Write-Host "PASS: CV uploaded successfully" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 6: Get CV Profile
Write-Host "[Test 6] Get CV Profile" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }

    $response = Invoke-RestMethod -Method GET "$API_URL/api/cv/profile" `
        -Headers $headers `
        -ErrorAction Continue

    Write-Host "PASS: CV profile retrieved" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 7: Get CV Stats
Write-Host "[Test 7] Get CV Stats" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }

    $response = Invoke-RestMethod -Method GET "$API_URL/api/cv/stats" `
        -Headers $headers `
        -ErrorAction Continue

    Write-Host "PASS: CV stats retrieved" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 8: Get All Offers
Write-Host "[Test 8] Get All Offers" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }

    $response = Invoke-RestMethod -Method GET "$API_URL/api/offers" `
        -Headers $headers `
        -ErrorAction Continue

    if ($response.offers -and $response.offers.Count -gt 0) {
        Write-Host "PASS: Offers retrieved ($($response.offers.Count) offers)" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: No offers found" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 9: Get Ranked Offers (Agent Call)
Write-Host "[Test 9] Get Ranked Offers (Agent)" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }

    $response = Invoke-RestMethod -Method GET "$API_URL/api/offers/ranked" `
        -Headers $headers `
        -ErrorAction Continue

    if ($response.rankings) {
        Write-Host "PASS: Ranked offers retrieved (Agent cost: $($response.agentCost) tokens)" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "FAIL: No rankings in response" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 10: Create Postulation
Write-Host "[Test 10] Create Postulation" -ForegroundColor Yellow
try {
    $postData = @{
        offerId = "offer-001"
    } | ConvertTo-Json

    $headers = @{
        "Authorization" = "Bearer $TOKEN"
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Method POST "$API_URL/api/postulations" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $postData `
        -ErrorAction Continue

    if ($response.id) {
        Write-Host "PASS: Postulation created" -ForegroundColor Green
        $POSTULATION_ID = $response.id
        Write-Host "  ID: $POSTULATION_ID" -ForegroundColor Gray
        $passCount++
    } else {
        Write-Host "FAIL: No ID in response" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 11: Get All Postulations
Write-Host "[Test 11] Get All Postulations" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }

    $response = Invoke-RestMethod -Method GET "$API_URL/api/postulations" `
        -Headers $headers `
        -ErrorAction Continue

    Write-Host "PASS: Postulations retrieved" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 12: Match Postulation (Agent Call)
Write-Host "[Test 12] Match Postulation (Agent)" -ForegroundColor Yellow
try {
    $matchData = @{
        offerId = "offer-001"
    } | ConvertTo-Json

    $headers = @{
        "Authorization" = "Bearer $TOKEN"
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Method POST "$API_URL/api/postulations/match" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $matchData `
        -ErrorAction Continue

    if ($response.matchAnalysis) {
        Write-Host "PASS: Postulation matched (Score: $($response.matchAnalysis.overallMatch))" -ForegroundColor Green
        Write-Host "  Agent cost: $($response.agentCost) tokens" -ForegroundColor Gray
        $passCount++
    } else {
        Write-Host "FAIL: No match analysis in response" -ForegroundColor Red
        $failCount++
    }
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Test 13: Generate Adapted CV (Agent Call)
if ($POSTULATION_ID) {
    Write-Host "[Test 13] Generate Adapted CV (Agent)" -ForegroundColor Yellow
    try {
        $headers = @{
            "Authorization" = "Bearer $TOKEN"
            "Content-Type" = "application/json"
        }

        $response = Invoke-RestMethod -Method POST "$API_URL/api/postulations/$POSTULATION_ID/generate-cv" `
            -Headers $headers `
            -ContentType "application/json" `
            -ErrorAction Continue

        if ($response.atsScore) {
            Write-Host "PASS: Adapted CV generated (ATS Score: $($response.atsScore))" -ForegroundColor Green
            Write-Host "  Agent cost: $($response.agentCost) tokens" -ForegroundColor Gray
            $passCount++
        } else {
            Write-Host "FAIL: No ATS score in response" -ForegroundColor Red
            $failCount++
        }
    } catch {
        Write-Host "FAIL: $_" -ForegroundColor Red
        $failCount++
    }
    Write-Host ""
}

# Test 14: Report Outcome
if ($POSTULATION_ID) {
    Write-Host "[Test 14] Report Postulation Outcome" -ForegroundColor Yellow
    try {
        $outcomeData = @{
            postulationId = $POSTULATION_ID
            outcome = "interview"
            feedback = "Great conversation"
        } | ConvertTo-Json

        $headers = @{
            "Authorization" = "Bearer $TOKEN"
            "Content-Type" = "application/json"
        }

        $response = Invoke-RestMethod -Method POST "$API_URL/api/learning/outcome" `
            -Headers $headers `
            -ContentType "application/json" `
            -Body $outcomeData `
            -ErrorAction Continue

        Write-Host "PASS: Outcome reported" -ForegroundColor Green
        $passCount++
    } catch {
        Write-Host "FAIL: $_" -ForegroundColor Red
        $failCount++
    }
    Write-Host ""
}

# Test 15: Get Memory Summary
Write-Host "[Test 15] Get Memory Summary" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }

    $response = Invoke-RestMethod -Method GET "$API_URL/api/learning/summary" `
        -Headers $headers `
        -ErrorAction Continue

    Write-Host "PASS: Memory summary retrieved" -ForegroundColor Green
    $passCount++
} catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    $failCount++
}
Write-Host ""

# Summary
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "PASSED: $passCount" -ForegroundColor Green
Write-Host "FAILED: $failCount" -ForegroundColor Red
Write-Host "==========================================" -ForegroundColor Cyan

if ($failCount -eq 0) {
    Write-Host "SUCCESS: All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "FAILURE: Some tests failed" -ForegroundColor Red
    exit 1
}
