@echo off
chcp 65001 >nul
title QMath HLS Video Studio - 1-Click Uploader

echo =====================================================================
echo       QMATH HLS VIDEO STUDIO - LƯU VÀO KHO THEO BÀI HỌC (1-CLICK)
echo =====================================================================
echo.
echo Đang khởi chạy giao diện Web Studio...
echo.

set "SCRIPT_DIR=%~dp0"
set "NODE_SCRIPT=%SCRIPT_DIR%server_gui.cjs"

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

node "%NODE_SCRIPT%"

pause
