@echo off
title Overtone + Folia Viewer
cd /d "%~dp0"

echo [1/2] Starting Folia Viewer on port 9090 (new window)...
cd slice\folia-viewer || goto :err
if not exist node_modules (
  echo First run: installing viewer dependencies, please wait...
  call npm install || goto :err
)
start "Folia Viewer 9090" cmd /k npm run dev
cd ..\..

echo [2/2] Starting Overtone (dev mode)...
echo When the app opens: open the Folia visual window, play a song with word-by-word lyrics.
call npm run dev
goto :end

:err
echo.
echo Something failed. Screenshot this window and send it to Muse.
pause
exit /b 1

:end
pause
