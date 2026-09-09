@echo off
REM FITCV API Testing Suite - Simple Batch Script
REM =============================================

setlocal enabledelayedexpansion

set API_URL=http://localhost:3000/api
set /a PASSED=0
set /a FAILED=0

echo.
echo FITCV API Testing Suite
echo ============================
echo.

REM 1. REGISTER USER
echo AUTHENTICATION TESTS
echo.
echo Testing: Register User...

for /f "tokens=*" %%A in ('curl -s -X POST %API_URL%/auth/register -H "Content-Type: application/json" -d "{\"email\":\"test-!RANDOM!@example.com\",\"password\":\"TestPass123!\"}"') do (
    set REGISTER_RESPONSE=%%A
)

echo %REGISTER_RESPONSE% | findstr /C:"accessToken" >nul
if !ERRORLEVEL! equ 0 (
    echo [OK] Register User
    set /a PASSED+=1
    for /f "tokens=2 delims=: " %%A in ('echo %REGISTER_RESPONSE% ^| findstr /C:"accessToken"') do (
        set TOKEN=%%A
        set TOKEN=!TOKEN:"=!
        set TOKEN=!TOKEN:,=!
    )
) else (
    echo [FAIL] Register User
    set /a FAILED+=1
    echo Response: %REGISTER_RESPONSE%
)

echo.
echo Total Passed: !PASSED!
echo Total Failed: !FAILED!
echo.

if !FAILED! equ 0 (
    echo ALL TESTS PASSED!
) else (
    echo Some tests failed.
)

endlocal
