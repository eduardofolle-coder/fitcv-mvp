#!/usr/bin/env pwsh

<#
.SYNOPSIS
Test FITCV Learning Endpoints - Complete Learning Loop
.DESCRIPTION
Tests all learning endpoints: record adaptations, outcomes, and retrieve patterns
#>

$BASE_URL = "http://localhost:3000"
$RANDOM_ID = Get-Random -Minimum 100000 -Maximum 999999
$TEST_EMAIL = "learningtest$RANDOM_ID@example.com"
$TEST_PASSWORD = "SecurePassword123!"

Write-Host "`n==========================================`n" -ForegroundColor Yellow
Write-Host "  FITCV Learning Endpoints Test Suite`n" -ForegroundColor Yellow
Write-Host "==========================================`n" -ForegroundColor Yellow

# Color functions
function Write-Pass { Write-Host "[PASS] $args" -ForegroundColor Green }
function Write-Fail { Write-Host "[FAIL] $args" -ForegroundColor Red }
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Blue }

# Test counter
$testsPassed = 0
$testsFailed = 0

# Step 1: Register
Write-Info "Step 1: Register new user"
try {
  $registerResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/register" `
    -Method POST `
    -ContentType "application/json" `
    -Body (@{
      email = $TEST_EMAIL
      password = $TEST_PASSWORD
    } | ConvertTo-Json)

  Write-Pass "Registration successful"
  $testsPassed++
} catch {
  Write-Fail "Registration: $_"
  $testsFailed++
  exit 1
}

# Step 2: Login
Write-Info "Step 2: Login and get tokens"
try {
  $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body (@{
      email = $TEST_EMAIL
      password = $TEST_PASSWORD
    } | ConvertTo-Json)

  $accessToken = $loginResponse.data.accessToken
  Write-Pass "Login successful, token acquired"
  $testsPassed++
} catch {
  Write-Fail "Login: $_"
  $testsFailed++
  exit 1
}

# Setup headers with auth token
$headers = @{
  "Authorization" = "Bearer $accessToken"
  "Content-Type" = "application/json"
}

# Step 3: Record first adaptation
Write-Info "Step 3: Record first successful CV adaptation"
try {
  $adaptation1 = Invoke-RestMethod -Uri "$BASE_URL/api/learning/record-adaptation" `
    -Method POST `
    -Headers $headers `
    -Body (@{
      jobTitle = "Senior Software Engineer"
      company = "Google"
      atsScore = 92
      keywords = @("Python", "System Design", "AWS", "Leadership")
      cvChanges = @("Reorganized projects by impact", "Added AWS certification")
    } | ConvertTo-Json)

  $adaptationId1 = $adaptation1.data.adaptationId
  Write-Pass "Adaptation recorded (ID: $adaptationId1, Score: 92)"
  $testsPassed++
} catch {
  Write-Fail "Record adaptation 1: $_"
  $testsFailed++
}

# Step 4: Record outcome for first adaptation
Write-Info "Step 4: Record outcome (interview got!)"
try {
  $outcome1 = Invoke-RestMethod -Uri "$BASE_URL/api/learning/record-outcome" `
    -Method POST `
    -Headers $headers `
    -Body (@{
      adaptationId = $adaptationId1
      outcome = "interview"
      feedback = "Strong technical background"
    } | ConvertTo-Json)

  Write-Pass "Outcome recorded: interview"
  $testsPassed++
} catch {
  Write-Fail "Record outcome 1: $_"
  $testsFailed++
}

# Step 5: Record second adaptation
Write-Info "Step 5: Record second adaptation (Amazon)"
try {
  $adaptation2 = Invoke-RestMethod -Uri "$BASE_URL/api/learning/record-adaptation" `
    -Method POST `
    -Headers $headers `
    -Body (@{
      jobTitle = "Tech Lead"
      company = "Amazon"
      atsScore = 88
      keywords = @("Python", "AWS", "Leadership", "Team Management")
      cvChanges = @("Added leadership experience", "Highlighted team mentoring")
    } | ConvertTo-Json)

  $adaptationId2 = $adaptation2.data.adaptationId
  Write-Pass "Adaptation 2 recorded (Score: 88)"
  $testsPassed++
} catch {
  Write-Fail "Record adaptation 2: $_"
  $testsFailed++
}

# Step 6: Record outcome for second adaptation
Write-Info "Step 6: Record second outcome (offer!)"
try {
  $outcome2 = Invoke-RestMethod -Uri "$BASE_URL/api/learning/record-outcome" `
    -Method POST `
    -Headers $headers `
    -Body (@{
      adaptationId = $adaptationId2
      outcome = "offer"
      feedback = "Great culture fit"
    } | ConvertTo-Json)

  Write-Pass "Outcome recorded: offer"
  $testsPassed++
} catch {
  Write-Fail "Record outcome 2: $_"
  $testsFailed++
}

# Step 7: Record third adaptation (rejection to test learning)
Write-Info "Step 7: Record third adaptation (lower score)"
try {
  $adaptation3 = Invoke-RestMethod -Uri "$BASE_URL/api/learning/record-adaptation" `
    -Method POST `
    -Headers $headers `
    -Body (@{
      jobTitle = "Backend Engineer"
      company = "Microsoft"
      atsScore = 72
      keywords = @("C#", ".NET", "Azure")
      cvChanges = @("Emphasized .NET experience")
    } | ConvertTo-Json)

  $adaptationId3 = $adaptation3.data.adaptationId
  Write-Pass "Adaptation 3 recorded (Score: 72)"
  $testsPassed++
} catch {
  Write-Fail "Record adaptation 3: $_"
  $testsFailed++
}

# Step 8: Record rejection outcome
Write-Info "Step 8: Record rejection outcome"
try {
  $outcome3 = Invoke-RestMethod -Uri "$BASE_URL/api/learning/record-outcome" `
    -Method POST `
    -Headers $headers `
    -Body (@{
      adaptationId = $adaptationId3
      outcome = "rejection"
      feedback = "Experience with .NET is limited"
    } | ConvertTo-Json)

  Write-Pass "Outcome recorded: rejection"
  $testsPassed++
} catch {
  Write-Fail "Record outcome 3: $_"
  $testsFailed++
}

Write-Info "`nNow testing retrieval endpoints...`n"

# Step 9: Get top keywords
Write-Info "Step 9: Get top keywords (should show Python, AWS, Leadership)"
try {
  $topKeywords = Invoke-RestMethod -Uri "$BASE_URL/api/learning/top-keywords" `
    -Method GET `
    -Headers $headers

  $keywords = $topKeywords.data.keywords
  Write-Pass "Top keywords retrieved: $($keywords -join ', ')"
  $testsPassed++
} catch {
  Write-Fail "Get top keywords: $_"
  $testsFailed++
}

# Step 10: Get successful patterns
Write-Info "Step 10: Get successful patterns (Google & Amazon should dominate)"
try {
  $patterns = Invoke-RestMethod -Uri "$BASE_URL/api/learning/patterns" `
    -Method GET `
    -Headers $headers

  $companies = $patterns.data.topCompanies -join ", "
  $roles = $patterns.data.topJobTitles -join ", "
  $avgScore = $patterns.data.averageScore
  $totalAdapts = $patterns.data.totalAdaptations

  Write-Pass "Patterns retrieved:"
  Write-Host "  Companies: $companies"
  Write-Host "  Roles: $roles"
  Write-Host "  Avg Score: $avgScore (for ATS ≥ 80)"
  Write-Host "  Total Adaptations: $totalAdapts"
  $testsPassed++
} catch {
  Write-Fail "Get patterns: $_"
  $testsFailed++
}

# Step 11: Get skill growth
Write-Info "Step 11: Get skill growth (detect trajectory)"
try {
  $skillGrowth = Invoke-RestMethod -Uri "$BASE_URL/api/learning/skill-growth" `
    -Method GET `
    -Headers $headers

  $newSkills = $skillGrowth.data.newSkills -join ", "
  $strengthened = $skillGrowth.data.strengthenedSkills -join ", "
  $obsolete = $skillGrowth.data.obsoleteSkills -join ", "

  Write-Pass "Skill growth detected:"
  Write-Host "  New Skills (last 3mo): $newSkills"
  Write-Host "  Strengthened: $strengthened"
  Write-Host "  Obsolete (6+ mo): $obsolete"
  $testsPassed++
} catch {
  Write-Fail "Get skill growth: $_"
  $testsFailed++
}

# Step 12: Get personalized recommendations
Write-Info "Step 12: Get personalized recommendations (based on patterns + market)"
try {
  $recommendations = Invoke-RestMethod -Uri "$BASE_URL/api/learning/recommendations" `
    -Method GET `
    -Headers $headers

  $recKeywords = $recommendations.data.recommendedKeywords -join ", "
  $recRoles = $recommendations.data.recommendedRoles -join ", "
  $recCompanies = $recommendations.data.recommendedCompanies -join ", "
  $marketOps = $recommendations.data.marketOpportunities -join ", "

  Write-Pass "Personalized recommendations:"
  Write-Host "  Recommended Keywords: $recKeywords"
  Write-Host "  Recommended Roles: $recRoles"
  Write-Host "  Recommended Companies: $recCompanies"
  Write-Host "  Market Opportunities: $marketOps"
  $testsPassed++
} catch {
  Write-Fail "Get recommendations: $_"
  $testsFailed++
}

# Step 13: Get market trends
Write-Info "Step 13: Get market trends (what's hot across all users)"
try {
  $trends = Invoke-RestMethod -Uri "$BASE_URL/api/learning/market-trends" `
    -Method GET `
    -Headers $headers

  $hotSkills = $trends.data.hotSkills -join ", "
  $hotRoles = $trends.data.hotRoles -join ", "
  $hotCompanies = $trends.data.hotCompanies -join ", "

  Write-Pass "Market trends retrieved:"
  Write-Host "  Hot Skills: $hotSkills"
  Write-Host "  Hot Roles: $hotRoles"
  Write-Host "  Hot Companies: $hotCompanies"
  $testsPassed++
} catch {
  Write-Fail "Get market trends: $_"
  $testsFailed++
}

# Summary
Write-Host "`n==========================================`n" -ForegroundColor Yellow
Write-Host "  Test Summary" -ForegroundColor Yellow
Write-Host "==========================================`n" -ForegroundColor Yellow

Write-Host "PASSED: $testsPassed" -ForegroundColor Green
Write-Host "FAILED: $testsFailed" -ForegroundColor $(if ($testsFailed -gt 0) { "Red" } else { "Green" })

if ($testsFailed -eq 0) {
  Write-Host "`n[SUCCESS] All learning endpoint tests passed!" -ForegroundColor Green
  Write-Host "`n[SUCCESS] Learning System is fully operational!`n" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`n[ERROR] Some tests failed. Check errors above.`n" -ForegroundColor Red
  exit 1
}
