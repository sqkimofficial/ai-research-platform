// MongoDB Setup Script
// Run this with: mongosh "mongodb+srv://sqkim_db_user:2YldbggyDVNlDYcU@ai-research-platform.x47ioq7.mongodb.net/?appName=ai-research-platform" < setup_mongodb.js

// Switch to database
use research_platform

// Create users collection
db.createCollection("users")
db.users.createIndex({ "username": 1 }, { unique: true })
db.users.createIndex({ "user_id": 1 }, { unique: true })

// Create chat_sessions collection
db.createCollection("chat_sessions")
db.chat_sessions.createIndex({ "user_id": 1, "session_id": 1 })
db.chat_sessions.createIndex({ "session_id": 1 }, { unique: true })
db.chat_sessions.createIndex({ "updated_at": -1 })

// Create documents collection
db.createCollection("documents")
db.documents.createIndex({ "user_id": 1, "session_id": 1 })
db.documents.createIndex({ "document_id": 1 }, { unique: true })
db.documents.createIndex({ "updated_at": -1 })

// Create document_embeddings collection
db.createCollection("document_embeddings")
db.document_embeddings.createIndex({ "document_id": 1, "chunk_index": 1 })
db.document_embeddings.createIndex({ "document_id": 1 })

// Create research_milestones collection
db.createCollection("research_milestones")
db.research_milestones.createIndex({ "session_id": 1 })
db.research_milestones.createIndex({ "milestone_id": 1 }, { unique: true })
db.research_milestones.createIndex({ "timestamp": 1 })

// Create document_types collection (global types for all sessions)
db.createCollection("document_types")
db.document_types.createIndex({ "type_name": 1 }, { unique: true })
db.document_types.createIndex({ "usage_count": -1 })
db.document_types.createIndex({ "is_system": 1 })

// Verify setup
print("Collections created:")
show collections

print("\nUsers indexes:")
db.users.getIndexes()

print("\nSetup complete!")


