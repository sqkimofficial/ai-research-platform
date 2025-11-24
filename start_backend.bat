@echo off
cd /d "%~dp0backend"
if not exist "venv\Scripts\python.exe" (
    echo ERROR: Virtual environment not found
    pause
    exit /b 1
)
venv\Scripts\python.exe app.py
pause

