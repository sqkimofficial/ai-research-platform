@echo off
cd backend
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)
echo Installing dependencies...
call venv\Scripts\python.exe -m pip install -r requirements.txt
echo Backend dependencies installed!
cd ..


