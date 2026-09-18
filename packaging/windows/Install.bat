@echo off
title Pomodoro Timing - Install
cd /d "%~dp0"

echo ============================================
echo    Pomodoro Timing - Install (offline)
echo ============================================
echo.

if not exist "runtime\Pomodoro Timing.exe" (
  echo [X] The "runtime" folder is missing.
  echo     Extract the WHOLE folder from the zip and try again.
  echo.
  pause
  exit /b 1
)

echo Creating Desktop + Startup shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_mkshortcuts.ps1"

echo.
echo Starting the app in the background...
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0runtime\Pomodoro Timing.exe'"

echo.
echo ============================================
echo    DONE!
echo    - The app now runs in the BACKGROUND (tray).
echo    - You can safely CLOSE this window; the app keeps running.
echo    - The tomato tray icon may be hidden under the small
echo      up-arrow at the bottom-right. Drag it out to keep it visible.
echo    - It also starts automatically with Windows.
echo    Show the panel anytime: move the mouse to the TOP-CENTER
echo    of the screen, or press  Ctrl + Alt + P.
echo    (To run it later without this window, use the Desktop shortcut.)
echo ============================================
echo.
pause
