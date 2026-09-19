@echo off
title Pomodoro Timing - Restart
cd /d "%~dp0"
echo Saving changes and restarting the app...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_launch.ps1" -Action Restart
echo.
echo Done. You can close this window.
timeout /t 3 >nul
