# AI Research Platform MVP

A full-stack AI research paper platform with Flask backend, React frontend, MongoDB database, OpenAI integration, and React Flow visualization.

## Features

- **Phase 1**: Chat session management with MongoDB and OpenAI integration
- **Phase 2**: Document write & preview (coming soon)
- **Phase 3**: Document read & vector semantic search (coming soon)
- **Phase 4**: Frontend Chat UI/UX (coming soon)
- **Phase 5**: Visual Map with React Flow (coming soon)

## Setup

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file in backend directory:
```
OPENAI_API_KEY=your-api-key
MONGODB_URI=your-mongodb-uri
JWT_SECRET=your-secret-key
FLASK_ENV=development
```

5. Run the Flask server:
```bash
python app.py
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file in frontend directory (optional):
```
REACT_APP_API_URL=http://localhost:5000
```

4. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## MongoDB Setup

Connect to MongoDB Atlas and run the following commands:

```javascript
use research_platform

db.createCollection("users")
db.users.createIndex({ "username": 1 }, { unique: true })
db.users.createIndex({ "user_id": 1 }, { unique: true })

db.createCollection("chat_sessions")
db.chat_sessions.createIndex({ "user_id": 1, "session_id": 1 })
db.chat_sessions.createIndex({ "session_id": 1 }, { unique: true })
db.chat_sessions.createIndex({ "updated_at": -1 })

db.createCollection("documents")
db.documents.createIndex({ "user_id": 1, "session_id": 1 })
db.documents.createIndex({ "document_id": 1 }, { unique: true })
db.documents.createIndex({ "updated_at": -1 })

db.createCollection("document_embeddings")
db.document_embeddings.createIndex({ "document_id": 1, "chunk_index": 1 })
db.document_embeddings.createIndex({ "document_id": 1 })

db.createCollection("research_milestones")
db.research_milestones.createIndex({ "session_id": 1 })
db.research_milestones.createIndex({ "milestone_id": 1 }, { unique: true })
db.research_milestones.createIndex({ "timestamp": 1 })
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Chat
- `POST /api/chat/session` - Create a new chat session
- `GET /api/chat/session?session_id=xxx` - Get session history
- `POST /api/chat/message` - Send a message and get AI response

## Tech Stack

- **Backend**: Python Flask
- **Database**: MongoDB
- **Frontend**: React
- **LLM**: OpenAI API (GPT-4o-mini)
- **Authentication**: JWT tokens

## License

MIT


