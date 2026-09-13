#!/bin/bash

# FITCV Backend Testing Script
# Tests all endpoints exhaustively to detect bugs

API_URL="http://localhost:3000"
EMAIL="testuser@$(date +%s).com"
PASSWORD="TestPass123!"

echo "🧪 FITCV Backend Testing Suite"
echo "================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

test_count=0
pass_count=0
fail_count=0

# Helper function to test endpoints
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4

    ((test_count++))
    echo -ne "${BLUE}Test $test_count:${NC} $method $endpoint ... "

    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $TOKEN" \
            -d "$data" 2>/dev/null)
    fi

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" == "$expected_status" ]; then
        echo -e "${GREEN}PASS${NC} (HTTP $http_code)"
        ((pass_count++))
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}FAIL${NC} (Expected $expected_status, got $http_code)"
        ((fail_count++))
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
    echo ""
}

# 1. Test Health Check
echo -e "${YELLOW}1. Health Check${NC}"
test_endpoint "GET" "/health" "" "200"

# 2. Test Root Endpoint
echo -e "${YELLOW}2. Root Endpoint${NC}"
test_endpoint "GET" "/" "" "200"

# 3. Test Register
echo -e "${YELLOW}3. Authentication - Register${NC}"
register_data="{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
response=$(curl -s -X POST "$API_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "$register_data" 2>/dev/null)
http_code=$(echo "$response" | jq -r '.status // "error"' 2>/dev/null)

if echo "$response" | jq -e '.accessToken' >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Register PASS${NC}"
    ((pass_count++))
    TOKEN=$(echo "$response" | jq -r '.accessToken')
    REFRESH_TOKEN=$(echo "$response" | jq -r '.refreshToken')
    USER_ID=$(echo "$response" | jq -r '.user.id')
    ((test_count++))
    echo "  Token: $TOKEN"
    echo "  User ID: $USER_ID"
else
    echo -e "${RED}✗ Register FAIL${NC}"
    ((fail_count++))
    ((test_count++))
    echo "$response" | jq '.'
fi
echo ""

# 4. Test Login
echo -e "${YELLOW}4. Authentication - Login${NC}"
login_data="{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
test_endpoint "POST" "/api/auth/login" "$login_data" "200"

# 5. Test CV Upload
echo -e "${YELLOW}5. CV Management - Upload${NC}"
cv_data='{
  "cvText": "John Doe\nEmail: john@example.com\nPhone: +56912345678\n\nSUMMARY:\nSenior Software Engineer with 8 years of experience\n\nEXPERIENCE:\nSenior Software Engineer at TechCorp (2020-2024)\n- Led team of 5 engineers\n- Improved system latency by 60%\n- Tech stack: Python, JavaScript, AWS, Kubernetes\n\nMid-level Engineer at StartupXYZ (2018-2020)\n- Built microservices architecture\n- Mentored 2 junior engineers\n\nEDUCATION:\nBS Computer Science, University of Chile (2018)\nCertifications: AWS Solutions Architect, Kubernetes CKA\n\nSKILLS:\nPython, JavaScript, TypeScript, React, Node.js, AWS, Kubernetes, Docker, PostgreSQL, MongoDB"
}'
test_endpoint "POST" "/api/cv/upload" "$cv_data" "200"

# 6. Test Get CV Profile
echo -e "${YELLOW}6. CV Management - Get Profile${NC}"
test_endpoint "GET" "/api/cv/profile" "" "200"

# 7. Test Get CV Stats
echo -e "${YELLOW}7. CV Management - Get Stats${NC}"
test_endpoint "GET" "/api/cv/stats" "" "200"

# 8. Test Get All Offers
echo -e "${YELLOW}8. Offers - Get All${NC}"
test_endpoint "GET" "/api/offers" "" "200"

# 9. Test Get Ranked Offers
echo -e "${YELLOW}9. Offers - Get Ranked (Agent)${NC}"
test_endpoint "GET" "/api/offers/ranked" "" "200"

# 10. Test Create Postulation
echo -e "${YELLOW}10. Postulations - Create${NC}"
postulation_data='{"offerId":"offer-001"}'
response=$(curl -s -X POST "$API_URL/api/postulations" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$postulation_data" 2>/dev/null)

if echo "$response" | jq -e '.id' >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Create Postulation PASS${NC}"
    ((pass_count++))
    POSTULATION_ID=$(echo "$response" | jq -r '.id')
    ((test_count++))
    echo "  Postulation ID: $POSTULATION_ID"
else
    echo -e "${RED}✗ Create Postulation FAIL${NC}"
    ((fail_count++))
    ((test_count++))
    echo "$response" | jq '.'
fi
echo ""

# 11. Test Get All Postulations
echo -e "${YELLOW}11. Postulations - Get All${NC}"
test_endpoint "GET" "/api/postulations" "" "200"

# 12. Test Match Postulation
echo -e "${YELLOW}12. Postulations - Match (Agent)${NC}"
match_data='{"offerId":"offer-001"}'
test_endpoint "POST" "/api/postulations/match" "$match_data" "200"

# 13. Test Generate Adapted CV
if [ ! -z "$POSTULATION_ID" ]; then
    echo -e "${YELLOW}13. Postulations - Generate Adapted CV (Agent)${NC}"
    test_endpoint "POST" "/api/postulations/$POSTULATION_ID/generate-cv" "" "200"
fi

# 14. Test Report Outcome
if [ ! -z "$POSTULATION_ID" ]; then
    echo -e "${YELLOW}14. Learning - Report Outcome${NC}"
    outcome_data='{"postulationId":"'$POSTULATION_ID'","outcome":"interview","feedback":"Interviewer was impressed"}'
    test_endpoint "POST" "/api/learning/outcome" "$outcome_data" "200"
fi

# 15. Test Get Memory Summary
echo -e "${YELLOW}15. Learning - Get Summary${NC}"
test_endpoint "GET" "/api/learning/summary" "" "200"

# Summary
echo ""
echo "================================"
echo -e "Test Results:"
echo -e "${GREEN}✓ Passed: $pass_count${NC}"
echo -e "${RED}✗ Failed: $fail_count${NC}"
echo "Total:  $test_count"
echo "================================"

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    exit 1
fi
