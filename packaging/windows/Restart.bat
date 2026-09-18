@echo off
title Pomodoro Timing - Restart
cd /d "%~dp0"
echo Closing the app...
taskkill /IM "Pomodoro Timing.exe" /F >nul 2>nul
ping -n 2 127.0.0.1 >nul
echo Starting again...
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0runtime\Pomodoro Timing.exe'"
echo.
echo Done. You can close this window.
timeout /t 3 >nul
