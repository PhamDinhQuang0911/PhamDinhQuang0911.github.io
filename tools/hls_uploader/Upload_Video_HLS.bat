@echo off
chcp 65001 >nul
title QMath HLS Video Uploader (Free 100%%)

echo =====================================================================
echo       QMATH VIDEO HLS PRE-PROCESSOR ^& TELEGRAM BOT UPLOADER
echo =====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "NODE_SCRIPT=%SCRIPT_DIR%upload_hls.cjs"

if not exist "%NODE_SCRIPT%" (
    echo [LỖI] Không tìm thấy file script "%NODE_SCRIPT%"!
    pause
    exit /b 1
)

:: Kiểm tra Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LỖI] Chưa cài đặt Node.js trên máy tính! Vui lòng cài đặt Node.js từ https://nodejs.org
    pause
    exit /b 1
)

:: Chạy script (chấp nhận kéo thả file vào file .bat này)
if "%~1"=="" (
    node "%NODE_SCRIPT%"
) else (
    node "%NODE_SCRIPT%" "%~1"
)

echo.
pause
