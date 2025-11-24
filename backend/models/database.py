from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, DuplicateKeyError
from datetime import datetime
import uuid
import os
import sys
# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
from config import Config

class Database:
    _client = None
    _db = None
    
    @classmethod
    def connect(cls):
        """Initialize MongoDB connection"""
        if cls._client is None:
            try:
                cls._client = MongoClient(Config.MONGODB_URI)
                cls._db = cls._client['research_platform']
                # Test connection
                cls._client.admin.command('ping')
                print("Successfully connected to MongoDB")
            except ConnectionFailure as e:
                print(f"Failed to connect to MongoDB: {e}")
                raise
        return cls._db
    
    @classmethod
    def get_db(cls):
        """Get database instance"""
        if cls._db is None:
            cls.connect()
        return cls._db
    
    @classmethod
    def close(cls):
        """Close MongoDB connection"""
        if cls._client:
            cls._client.close()
            cls._client = None
            cls._db = None

class UserModel:
    @staticmethod
    def create_user(username, password_hash):
        """Create a new user"""
        db = Database.get_db()
        user_id = str(uuid.uuid4())
        user = {
            'username': username,
            'password_hash': password_hash,
            'user_id': user_id,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        try:
            result = db.users.insert_one(user)
            return user_id
        except DuplicateKeyError:
            return None
    
    @staticmethod
    def get_user_by_username(username):
        """Get user by username"""
        db = Database.get_db()
        return db.users.find_one({'username': username})
    
    @staticmethod
    def get_user_by_id(user_id):
        """Get user by user_id"""
        db = Database.get_db()
        return db.users.find_one({'user_id': user_id})

class ChatSessionModel:
    @staticmethod
    def create_session(user_id):
        """Create a new chat session"""
        db = Database.get_db()
        session_id = str(uuid.uuid4())
        session = {
            'user_id': user_id,
            'session_id': session_id,
            'messages': [],
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        db.chat_sessions.insert_one(session)
        return session_id
    
    @staticmethod
    def get_session(session_id):
        """Get session by session_id"""
        db = Database.get_db()
        return db.chat_sessions.find_one({'session_id': session_id})
    
    @staticmethod
    def add_message(session_id, role, content, sources=None, document_content=None, document_structure=None, placement=None):
        """Add a message to the session"""
        db = Database.get_db()
        message = {
            'role': role,
            'content': content,
            'timestamp': datetime.utcnow()
        }
        # Add sources if provided (for assistant messages)
        if sources is not None:
            message['sources'] = sources if isinstance(sources, list) else []
        # Add document_content and structure for debugging (assistant messages only)
        if role == 'assistant':
            if document_content is not None:
                message['document_content'] = document_content
            if document_structure is not None:
                message['document_structure'] = document_structure
            if placement is not None:
                message['placement'] = placement
        db.chat_sessions.update_one(
            {'session_id': session_id},
            {
                '$push': {'messages': message},
                '$set': {'updated_at': datetime.utcnow()}
            }
        )
        return message
    
    @staticmethod
    def get_messages(session_id):
        """Get all messages for a session"""
        session = ChatSessionModel.get_session(session_id)
        if session:
            return session.get('messages', [])
        return []
    
    @staticmethod
    def get_all_sessions(user_id):
        """Get all sessions for a user, sorted by updated_at descending"""
        db = Database.get_db()
        sessions = list(db.chat_sessions.find(
            {'user_id': user_id}
        ).sort('updated_at', -1))
        return sessions

class DocumentModel:
    @staticmethod
    def create_document(user_id, session_id):
        """Create a new document"""
        db = Database.get_db()
        document_id = str(uuid.uuid4())
        document = {
            'user_id': user_id,
            'session_id': session_id,
            'document_id': document_id,
            'markdown_content': '',
            'structure': [],  # Document structure tree (flat list)
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        db.documents.insert_one(document)
        return document_id
    
    @staticmethod
    def get_document(document_id):
        """Get document by document_id"""
        db = Database.get_db()
        return db.documents.find_one({'document_id': document_id})
    
    @staticmethod
    def get_document_by_session(session_id):
        """Get document by session_id (using session_id as document_id for now)"""
        db = Database.get_db()
        # For now, use session_id as document identifier
        # In the future, we might want a separate mapping
        return db.documents.find_one({'session_id': session_id})
    
    @staticmethod
    def update_document(document_id, markdown_content, structure=None):
        """Update document content and structure"""
        db = Database.get_db()
        update_data = {
            'markdown_content': markdown_content,
            'updated_at': datetime.utcnow()
        }
        if structure is not None:
            update_data['structure'] = structure
        
        db.documents.update_one(
            {'document_id': document_id},
            {'$set': update_data}
        )
    
    @staticmethod
    def update_document_structure(session_id, structure, user_id=None):
        """Update document structure for a session. Creates document if it doesn't exist."""
        db = Database.get_db()
        doc = DocumentModel.get_document_by_session(session_id)
        
        if doc:
            # Update existing document
            db.documents.update_one(
                {'session_id': session_id},
                {
                    '$set': {
                        'structure': structure,
                        'updated_at': datetime.utcnow()
                    }
                }
            )
        else:
            # Create new document entry if user_id is provided
            if user_id:
                document_id = str(uuid.uuid4())
                document = {
                    'user_id': user_id,
                    'session_id': session_id,
                    'document_id': document_id,
                    'markdown_content': '',
                    'structure': structure,
                    'created_at': datetime.utcnow(),
                    'updated_at': datetime.utcnow()
                }
                db.documents.insert_one(document)
            else:
                # Can't create without user_id - this should be handled in the route
                print(f"Warning: Cannot create document for session {session_id} without user_id")
    
    @staticmethod
    def get_document_structure(session_id):
        """Get document structure for a session"""
        doc = DocumentModel.get_document_by_session(session_id)
        if doc:
            return doc.get('structure', [])
        return []

class DocumentEmbeddingModel:
    @staticmethod
    def create_embedding(document_id, chunk_index, chunk_text, embedding, metadata):
        """Create a new document embedding"""
        db = Database.get_db()
        embedding_doc = {
            'document_id': document_id,
            'chunk_index': chunk_index,
            'chunk_text': chunk_text,
            'embedding': embedding,
            'metadata': metadata,
            'created_at': datetime.utcnow()
        }
        db.document_embeddings.insert_one(embedding_doc)
    
    @staticmethod
    def get_embeddings_by_document(document_id):
        """Get all embeddings for a document"""
        db = Database.get_db()
        embeddings = list(db.document_embeddings.find({'document_id': document_id}).sort('chunk_index', 1))
        # Convert BSON arrays to Python lists
        for emb in embeddings:
            if 'embedding' in emb and isinstance(emb['embedding'], list):
                emb['embedding'] = list(emb['embedding'])
        return embeddings
    
    @staticmethod
    def delete_embeddings_by_document(document_id):
        """Delete all embeddings for a document"""
        db = Database.get_db()
        result = db.document_embeddings.delete_many({'document_id': document_id})
        return result.deleted_count

class ResearchMilestoneModel:
    @staticmethod
    def create_milestone(session_id, milestone_type, title, description, timestamp, connections=None, metadata=None):
        """Create a new research milestone"""
        db = Database.get_db()
        milestone_id = str(uuid.uuid4())
        milestone = {
            'session_id': session_id,
            'milestone_id': milestone_id,
            'type': milestone_type,
            'title': title,
            'description': description,
            'timestamp': timestamp,
            'connections': connections or [],
            'metadata': metadata or {},
            'created_at': datetime.utcnow()
        }
        db.research_milestones.insert_one(milestone)
        return milestone_id
    
    @staticmethod
    def get_milestones_by_session(session_id):
        """Get all milestones for a session"""
        db = Database.get_db()
        return list(db.research_milestones.find({'session_id': session_id}).sort('timestamp', 1))

class DocumentTypeModel:
    """Model for managing document element types globally across all sessions"""
    
    @staticmethod
    def create_type(type_name, description, metadata_schema=None, is_system=False):
        """
        Create a new document type.
        
        Args:
            type_name: Unique name for the type (e.g., 'section', 'code_block', 'custom_type')
            description: Human-readable description of what this type represents
            metadata_schema: Optional JSON schema defining expected metadata fields
            is_system: Whether this is a system type (cannot be deleted)
        
        Returns:
            type_id if created, None if type already exists
        """
        db = Database.get_db()
        type_id = str(uuid.uuid4())
        
        # Check if type already exists
        existing = db.document_types.find_one({'type_name': type_name})
        if existing:
            return None
        
        type_doc = {
            'type_id': type_id,
            'type_name': type_name,
            'description': description,
            'metadata_schema': metadata_schema or {},
            'is_system': is_system,
            'usage_count': 0,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        try:
            db.document_types.insert_one(type_doc)
            return type_id
        except DuplicateKeyError:
            return None
    
    @staticmethod
    def get_type(type_name):
        """Get a document type by name"""
        db = Database.get_db()
        return db.document_types.find_one({'type_name': type_name})
    
    @staticmethod
    def get_all_types():
        """Get all document types, sorted by usage count descending"""
        db = Database.get_db()
        return list(db.document_types.find().sort('usage_count', -1))
    
    @staticmethod
    def get_available_types():
        """Get all available types as a simple list of names"""
        types = DocumentTypeModel.get_all_types()
        return [t['type_name'] for t in types]
    
    @staticmethod
    def increment_usage(type_name):
        """Increment usage count for a type"""
        db = Database.get_db()
        db.document_types.update_one(
            {'type_name': type_name},
            {
                '$inc': {'usage_count': 1},
                '$set': {'updated_at': datetime.utcnow()}
            }
        )
    
    @staticmethod
    def update_type(type_name, description=None, metadata_schema=None):
        """Update an existing type (cannot update system types)"""
        db = Database.get_db()
        update_data = {'updated_at': datetime.utcnow()}
        
        if description is not None:
            update_data['description'] = description
        if metadata_schema is not None:
            update_data['metadata_schema'] = metadata_schema
        
        result = db.document_types.update_one(
            {'type_name': type_name, 'is_system': False},
            {'$set': update_data}
        )
        return result.modified_count > 0
    
    @staticmethod
    def delete_type(type_name):
        """Delete a type (cannot delete system types)"""
        db = Database.get_db()
        result = db.document_types.delete_one({'type_name': type_name, 'is_system': False})
        return result.deleted_count > 0
    
    @staticmethod
    def initialize_default_types():
        """Initialize default system types if they don't exist"""
        default_types = [
            {
                'type_name': 'section',
                'description': 'Main section heading (##)',
                'metadata_schema': {'title': 'string', 'level': 'integer'},
                'is_system': True
            },
            {
                'type_name': 'subsection',
                'description': 'Subsection heading (###)',
                'metadata_schema': {'title': 'string', 'level': 'integer'},
                'is_system': True
            },
            {
                'type_name': 'paragraph',
                'description': 'Regular paragraph text',
                'metadata_schema': {},
                'is_system': True
            },
            {
                'type_name': 'table',
                'description': 'Markdown table',
                'metadata_schema': {'caption': 'string'},
                'is_system': True
            },
            {
                'type_name': 'code_block',
                'description': 'Code snippet with syntax highlighting',
                'metadata_schema': {'language': 'string'},
                'is_system': True
            },
            {
                'type_name': 'image',
                'description': 'Image with optional caption',
                'metadata_schema': {'alt': 'string', 'url': 'string', 'caption': 'string'},
                'is_system': True
            },
            {
                'type_name': 'list',
                'description': 'Ordered or unordered list',
                'metadata_schema': {'ordered': 'boolean'},
                'is_system': True
            },
            {
                'type_name': 'blockquote',
                'description': 'Blockquote for citations or emphasis',
                'metadata_schema': {'source': 'string'},
                'is_system': True
            },
            {
                'type_name': 'heading',
                'description': 'Generic heading (can be any level)',
                'metadata_schema': {'title': 'string', 'level': 'integer'},
                'is_system': True
            }
        ]
        
        db = Database.get_db()
        initialized_count = 0
        
        for type_def in default_types:
            existing = db.document_types.find_one({'type_name': type_def['type_name']})
            if not existing:
                DocumentTypeModel.create_type(
                    type_name=type_def['type_name'],
                    description=type_def['description'],
                    metadata_schema=type_def['metadata_schema'],
                    is_system=type_def['is_system']
                )
                initialized_count += 1
        
        return initialized_count

