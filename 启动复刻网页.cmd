@echo off
cd /d "%~dp0"
echo.
echo   Moon Fingers - local replica
echo   Open http://127.0.0.1:4192 in Chrome or Edge.
echo   Keep this window open while playing. Press Ctrl+C to stop.
echo.
node serve.mjs
pause
