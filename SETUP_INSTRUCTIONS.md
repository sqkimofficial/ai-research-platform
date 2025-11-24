# Setup Instructions

## Important: Create .env File

The `.env` file was not created automatically due to security restrictions. Please create it manually:

1. Navigate to the `backend` directory
2. Create a file named `.env` (no extension)
3. Add the following content:

```
OPENAI_API_KEY=your-openai-api-key-here
MONGODB_URI=your-mongodb-connection-string-here
JWT_SECRET=your-secret-jwt-key-change-in-production-min-32-chars
FLASK_ENV=development
```

## MongoDB Setup

1. Connect to MongoDB Atlas using mongosh:
```bash
mongosh "your-mongodb-connection-string-here"
```

2. Run the setup script:
```bash
mongosh "your-mongodb-connection-string-here" < backend/setup_mongodb.js
```

Or manually run the commands from `backend/setup_mongodb.js` in mongosh.

## Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the Flask server:
```bash
python app.py
```

The backend will run on `http://localhost:5000`

## Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## Testing Phase 1

Once both servers are running:

1. Open `http://localhost:3000` in your browser
2. Register a new user account
3. Login with your credentials
4. Start a chat session
5. Send messages and verify AI responses
6. Refresh the page and verify session persistence

## Phase 1 Status

✅ Project structure created
✅ Backend Flask app with CORS configured
✅ MongoDB models and database utilities
✅ Authentication endpoints (register/login) with JWT
✅ Chat session management endpoints
✅ OpenAI integration (gpt-4o-mini)
✅ Frontend React app with authentication
✅ Chat window component with message display
✅ Session persistence using localStorage

## Next Steps

After testing Phase 1, proceed to Phase 2: Document Write & Preview


