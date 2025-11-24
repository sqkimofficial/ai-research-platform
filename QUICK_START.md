# Quick Start Guide

## Step 1: Install Backend Dependencies

Open a terminal in your IDE and run:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

## Step 2: Install Frontend Dependencies

Open a NEW terminal in your IDE and run:

```powershell
cd frontend
npm install
```

## Step 3: Start Backend Server

In the backend terminal (with venv activated):

```powershell
python app.py
```

The backend should start on http://localhost:5000

## Step 4: Start Frontend Server

In the frontend terminal:

```powershell
npm start
```

The frontend should start on http://localhost:3000

## Step 5: Test Phase 1

Once both servers are running, I'll use browser automation to test:
1. User registration
2. User login  
3. Chat session creation
4. Sending messages
5. Session persistence


