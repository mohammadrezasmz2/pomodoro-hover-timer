@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0runtime\Pomodoro Timing.exe'"
