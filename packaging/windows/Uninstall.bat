@echo off
title Pomodoro Timing - Uninstall
cd /d "%~dp0"

echo Closing the app if running...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_launch.ps1" -Action Quit

echo Removing Desktop + Startup shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_rmshortcuts.ps1"

echo.
echo Removed from startup and desktop.
echo To fully delete the app, just delete this whole folder.
echo.
pause
