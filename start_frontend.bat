@echo off
cd /d "%~dp0frontend"
if not exist "package.json" (
    echo ERROR: Frontend directory not found
    pause
    exit /b 1
)
call npm start

