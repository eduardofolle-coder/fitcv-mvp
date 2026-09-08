# FITCV API Automated Testing
# ==========================

param(
    [string]$BaseURL = "http://localhost:3000/api",
    [string]$Email = "test@example.com",
    [string]$Password = "TestPass123!"
)

Write-Host "`n🧪 FITCV API Testing Suite" -ForegroundColor Cyan
Write-Host "============================`n" -ForegroundColor Cyan

$results = @()
$token = ""
$userId = ""
$offerId = ""
$postulationId = ""

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Headers,
        [object]$Body,
        [scriptblock]$OnSuccess
    )

    try {
        $url = "$BaseURL$Endpoint"
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $Headers
            ContentType = "application/json"
        }

        if ($Body) {
            $params["Body"] = $Body | ConvertTo-Json
        }

        $response = Invoke-RestMethod @params

        Write-Host "✅ $Name" -ForegroundColor Green
        $results += @{Name = $Name; Status = "✅"; Message = "Success" }

        if ($OnSuccess) {
            & $OnSuccess $response
        }

        return $response
    }
    catch {
        Write-Host "❌ $Name" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
        $results += @{Name = $Name; Status = "❌"; Message = $_.Exception.Message }
        return $null
    }
}

# ============================================
# 1. AUTHENTICATION
# ============================================
Write-Host "📋 AUTHENTICATION TESTS" -ForegroundColor Yellow

$registerResp = Test-Endpoint "Register User" "POST" "/auth/register" @{} @{
    email = $Email
    password = $Password
} {
    param($resp)
    global:$token = $resp.accessToken
    global:$userId = $resp.user.id
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
}

Start-Sleep -Milliseconds 500

$loginResp = Test-Endpoint "Login User" "POST" "/auth/login" @{} @{
    email = $Email
    password = $Password
} {
    param($resp)
    global:$token = $resp.accessToken
}

# ============================================
# 2. CV OPERATIONS
# ============================================
Write-Host "`n📋 CV OPERATIONS TESTS" -ForegroundColor Yellow

$cvContent = "Juan Pérez`n8 years experience as Data Analyst`n`nEducation:`n- BS Computer Science`n`nSkills:`n- Python, SQL, AWS, Tableau`n`nExperience:`n- Senior Data Analyst at Amazon (2020-2025)`n- Data Analyst at Google (2018-2020)`n- Junior Data Analyst at Microsoft (2017-2018)"

$uploadResp = Test-Endpoint "Upload CV" "POST" "/cv/upload" @{
    Authorization = "Bearer $token"
} @{
    cvContent = $cvContent
    fullName = "Juan Pérez"
}

Start-Sleep -Milliseconds 500

Test-Endpoint "Get Profile" "GET" "/cv/profile" @{
    Authorization = "Bearer $token"
}

Start-Sleep -Milliseconds 500

Write-Host "⏳ Generating role suggestions (calls Claude API, ~10s)..." -ForegroundColor Yellow
$rolesResp = Test-Endpoint "Suggest Roles" "POST" "/cv/suggest-roles" @{
    Authorization = "Bearer $token"
} @{} {
    param($resp)
    if ($resp.data -and $resp.data.Count -gt 0) {
        global:$roleId = $resp.data[0].id
        Write-Host "   Found $($resp.data.Count) role suggestions" -ForegroundColor Gray
    }
}

Start-Sleep -Milliseconds 500

Test-Endpoint "List Roles" "GET" "/cv/roles" @{
    Authorization = "Bearer $token"
}

# ============================================
# 3. JOB OFFERS
# ============================================
Write-Host "`n📋 JOB OFFERS TESTS" -ForegroundColor Yellow

$offersResp = Test-Endpoint "List Offers" "GET" "/offers?limit=5" @{
    Authorization = "Bearer $token"
} {
    param($resp)
    if ($resp.data -and $resp.data.Count -gt 0) {
        global:$offerId = $resp.data[0].id
        Write-Host "   Found $($resp.data.Count) job offers" -ForegroundColor Gray
        Write-Host "   Top: $($resp.data[0].title) at $($resp.data[0].company)" -ForegroundColor Gray
    }
}

Start-Sleep -Milliseconds 500

Test-Endpoint "Get Offer Details" "GET" "/offers/$offerId" @{
    Authorization = "Bearer $token"
}

Start-Sleep -Milliseconds 500

Test-Endpoint "Dashboard Stats" "GET" "/offers/stats/summary" @{
    Authorization = "Bearer $token"
}

# ============================================
# 4. POSTULATIONS
# ============================================
Write-Host "`n📋 POSTULATIONS TESTS" -ForegroundColor Yellow

$postResp = Test-Endpoint "Create Postulation" "POST" "/postulations" @{
    Authorization = "Bearer $token"
} @{
    offerId = $offerId
    estado = "Por revisar"
    prioridad = "Alta"
    notes = "Great fit"
} {
    param($resp)
    global:$postulationId = $resp.data.postulationId
    Write-Host "   Weight: $($resp.data.postulationWeight)pt (based on level)" -ForegroundColor Gray
}

Start-Sleep -Milliseconds 500

Test-Endpoint "List Postulations" "GET" "/postulations" @{
    Authorization = "Bearer $token"
}

Start-Sleep -Milliseconds 500

Test-Endpoint "Get Postulation Details" "GET" "/postulations/$postulationId" @{
    Authorization = "Bearer $token"
}

Start-Sleep -Milliseconds 500

Write-Host "⏳ Generating adapted CV (calls Claude API, ~10s)..." -ForegroundColor Yellow
$cvResp = Test-Endpoint "Generate Adapted CV" "POST" "/postulations/$postulationId/generate-cv" @{
    Authorization = "Bearer $token"
} @{} {
    param($resp)
    Write-Host "   ATS Score: $($resp.data.atsScore)" -ForegroundColor Gray
    Write-Host "   Changes: $($resp.data.changes.Count)" -ForegroundColor Gray
    Write-Host "   Keywords: $($resp.data.keywords -join ', ')" -ForegroundColor Gray
}

Start-Sleep -Milliseconds 500

Test-Endpoint "Download CV" "GET" "/postulations/$postulationId/cv" @{
    Authorization = "Bearer $token"
}

Start-Sleep -Milliseconds 500

Test-Endpoint "Update Postulation" "PUT" "/postulations/$postulationId" @{
    Authorization = "Bearer $token"
} @{
    estado = "Aplicado"
    prioridad = "Media"
    notes = "Updated status"
}

# ============================================
# 5. ERROR HANDLING
# ============================================
Write-Host "`n📋 ERROR HANDLING TESTS" -ForegroundColor Yellow

Test-Endpoint "Missing Token (401)" "GET" "/cv/profile" @{}

Test-Endpoint "Invalid Data (400)" "POST" "/postulations" @{
    Authorization = "Bearer $token"
} @{
    offerId = "invalid"
}

Test-Endpoint "Not Found (404)" "GET" "/offers/nonexistent" @{
    Authorization = "Bearer $token"
}

# ============================================
# SUMMARY
# ============================================
Write-Host "`n📊 TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

$passed = ($results | Where-Object { $_.Status -eq "✅" }).Count
$failed = ($results | Where-Object { $_.Status -eq "❌" }).Count
$total = $results.Count

Write-Host "`n✅ Passed: $passed" -ForegroundColor Green
Write-Host "❌ Failed: $failed" -ForegroundColor Red
Write-Host "📊 Total:  $total`n" -ForegroundColor White

if ($failed -eq 0) {
    Write-Host "🎉 ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some tests failed. Check errors above." -ForegroundColor Yellow
}

Write-Host "`n📝 Test Details:" -ForegroundColor Yellow
$results | ForEach-Object {
    $color = if ($_.Status -eq "✅") { "Green" } else { "Red" }
    Write-Host "$($_.Status) $($_.Name)" -ForegroundColor $color
}

Write-Host "`n"
