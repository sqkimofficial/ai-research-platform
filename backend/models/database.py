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
from utils.logger import get_logger, log_error

logger = get_logger(__name__)

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
                logger.info("Successfully connected to MongoDB")
            except ConnectionFailure as e:
                log_error(logger, e, "Failed to connect to MongoDB")
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
    def create_user(username, password_hash, first_name=None, last_name=None):
        """Create a new user (legacy - kept for compatibility)"""
        db = Database.get_db()
        user_id = str(uuid.uuid4())
        user = {
            'username': username,
            'password_hash': password_hash,
            'user_id': user_id,
            'first_name': first_name,
            'last_name': last_name,
            'auth_provider': 'email',  # Legacy email/password
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
    
    @staticmethod
    def get_user_by_auth0_id(auth0_id):
        """Get user by Auth0 ID (sub claim)"""
        db = Database.get_db()
        return db.users.find_one({'auth0_id': auth0_id})
    
    @staticmethod
    def get_user_by_email(email):
        """Get user by email address"""
        db = Database.get_db()
        # Check both 'email' field and 'username' field (email used as username)
        user = db.users.find_one({'email': email})
        if not user:
            user = db.users.find_one({'username': email})
        return user
    
    @staticmethod
    def create_or_update_auth0_user(auth0_id, email, first_name=None, last_name=None, 
                                     picture=None, email_verified=False, auth_provider='auth0'):
        """
        Create or update a user from Auth0 authentication.
        
        If a user with this auth0_id exists, update their info.
        If not, check if a user with this email exists and link the auth0_id.
        If neither, create a new user.
        
        Args:
            auth0_id: The Auth0 user ID (sub claim, e.g., 'auth0|123' or 'google-oauth2|456')
            email: User's email address
            first_name: User's first name
            last_name: User's last name
            picture: URL to profile picture
            email_verified: Whether email is verified
            auth_provider: The auth provider (e.g., 'auth0', 'google-oauth2', 'apple')
        
        Returns:
            dict: The user document (with user_id)
        """
        db = Database.get_db()
        
        # First, check if user exists by auth0_id
        existing_user = db.users.find_one({'auth0_id': auth0_id})
        
        if existing_user:
            # Update existing user's info
            update_data = {
                'updated_at': datetime.utcnow()
            }
            if first_name:
                update_data['first_name'] = first_name
            if last_name:
                update_data['last_name'] = last_name
            if picture:
                update_data['picture'] = picture
            if email:
                update_data['email'] = email
            update_data['email_verified'] = email_verified
            
            db.users.update_one(
                {'auth0_id': auth0_id},
                {'$set': update_data}
            )
            
            # Return updated user
            return db.users.find_one({'auth0_id': auth0_id})
        
        # Check if user exists by email (link accounts)
        if email:
            existing_by_email = UserModel.get_user_by_email(email)
            if existing_by_email:
                # Link Auth0 account to existing user
                db.users.update_one(
                    {'user_id': existing_by_email['user_id']},
                    {'$set': {
                        'auth0_id': auth0_id,
                        'auth_provider': auth_provider,
                        'email': email,
                        'email_verified': email_verified,
                        'picture': picture,
                        'first_name': first_name or existing_by_email.get('first_name'),
                        'last_name': last_name or existing_by_email.get('last_name'),
                        'updated_at': datetime.utcnow()
                    }}
                )
                return db.users.find_one({'user_id': existing_by_email['user_id']})
        
        # Create new user
        user_id = str(uuid.uuid4())
        new_user = {
            'user_id': user_id,
            'auth0_id': auth0_id,
            'auth_provider': auth_provider,
            'email': email,
            'username': email,  # Use email as username for Auth0 users
            'email_verified': email_verified,
            'first_name': first_name,
            'last_name': last_name,
            'picture': picture,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        db.users.insert_one(new_user)
        return new_user
    
    @staticmethod
    def update_user_auth0_info(user_id, auth0_id=None, picture=None, email_verified=None):
        """Update Auth0-specific user information"""
        db = Database.get_db()
        update_data = {'updated_at': datetime.utcnow()}
        
        if auth0_id:
            update_data['auth0_id'] = auth0_id
        if picture:
            update_data['picture'] = picture
        if email_verified is not None:
            update_data['email_verified'] = email_verified
        
        result = db.users.update_one(
            {'user_id': user_id},
            {'$set': update_data}
        )
        return result.modified_count > 0

class ProjectModel:
    @staticmethod
    def create_project(user_id, project_name, description=None):
        """Create a new project"""
        db = Database.get_db()
        project_id = str(uuid.uuid4())
        project = {
            'user_id': user_id,
            'project_id': project_id,
            'project_name': project_name,
            'description': description,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        db.projects.insert_one(project)
        return project_id
    
    @staticmethod
    def get_project(project_id):
        """Get project by project_id"""
        db = Database.get_db()
        return db.projects.find_one({'project_id': project_id})
    
    @staticmethod
    def get_all_projects(user_id):
        """Get all projects for a user, sorted by updated_at descending"""
        db = Database.get_db()
        projects = list(db.projects.find(
            {'user_id': user_id}
        ).sort('updated_at', -1))
        return projects
    
    @staticmethod
    def update_project(project_id, project_name=None, description=None):
        """Update project"""
        db = Database.get_db()
        update_data = {'updated_at': datetime.utcnow()}
        
        if project_name is not None:
            update_data['project_name'] = project_name
        if description is not None:
            update_data['description'] = description
        
        result = db.projects.update_one(
            {'project_id': project_id},
            {'$set': update_data}
        )
        return result.modified_count > 0
    
    @staticmethod
    def delete_project(project_id):
        """Delete project"""
        db = Database.get_db()
        result = db.projects.delete_one({'project_id': project_id})
        return result.deleted_count > 0

class ChatSessionModel:
    @staticmethod
    def create_session(user_id, project_id):
        """Create a new chat session"""
        db = Database.get_db()
        session_id = str(uuid.uuid4())
        session = {
            'user_id': user_id,
            'project_id': project_id,
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
    def add_message(session_id, role, content, sources=None, document_content=None, document_structure=None, placement=None, status=None, pending_content_id=None, agent_steps=None):
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
            if status is not None:
                message['status'] = status  # "pending_approval", "approved", "rejected"
            if pending_content_id is not None:
                message['pending_content_id'] = pending_content_id
            # Always store agent_steps if provided (even if empty list)
            # This ensures steps are part of chat history and persist
            if agent_steps is not None:
                message['agent_steps'] = agent_steps if isinstance(agent_steps, list) else []
            # For assistant messages, always initialize agent_steps as empty list if not provided
            # This ensures the field exists in the database for consistency
            elif role == 'assistant' and 'agent_steps' not in message:
                message['agent_steps'] = []
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
    def get_all_sessions(user_id, project_id=None, limit=None, skip=0):
        """Get all sessions for a user, optionally filtered by project_id, sorted by updated_at descending"""
        db = Database.get_db()
        query = {'user_id': user_id}
        if project_id:
            query['project_id'] = project_id
        cursor = db.chat_sessions.find(query).sort('updated_at', -1).skip(skip)
        if limit:
            cursor = cursor.limit(limit)
        sessions = list(cursor)
        return sessions
    
    @staticmethod
    def update_pending_content(session_id, content_data):
        """Update or set pending content for a session"""
        db = Database.get_db()
        pending_content_id = str(uuid.uuid4())
        update_data = {
            'pending_content': content_data,
            'pending_content_id': pending_content_id,
            'updated_at': datetime.utcnow()
        }
        db.chat_sessions.update_one(
            {'session_id': session_id},
            {'$set': update_data}
        )
        return pending_content_id
    
    @staticmethod
    def get_pending_content(session_id):
        """Get pending content for a session"""
        session = ChatSessionModel.get_session(session_id)
        if session:
            pending_content = session.get('pending_content')
            pending_content_id = session.get('pending_content_id')
            if pending_content and pending_content_id:
                return {
                    'pending_content': pending_content,
                    'pending_content_id': pending_content_id
                }
        return None
    
    @staticmethod
    def clear_pending_content(session_id):
        """Clear pending content for a session"""
        db = Database.get_db()
        db.chat_sessions.update_one(
            {'session_id': session_id},
            {
                '$unset': {
                    'pending_content': '',
                    'pending_content_id': ''
                },
                '$set': {'updated_at': datetime.utcnow()}
            }
        )
    
    @staticmethod
    def update_message_status(session_id, pending_content_id, status):
        """Update the status of a message by pending_content_id"""
        db = Database.get_db()
        result = db.chat_sessions.update_one(
            {
                'session_id': session_id,
                'messages.pending_content_id': pending_content_id
            },
            {
                '$set': {
                    'messages.$.status': status,
                    'updated_at': datetime.utcnow()
                }
            }
        )
        return result.modified_count > 0
    
    @staticmethod
    def initialize_memory_compression(session_id):
        """
        Initialize memory_compression field for a session with default structure.
        
        Args:
            session_id: The session ID
            
        Returns:
            bool: True if initialized successfully, False if session not found
        """
        db = Database.get_db()
        
        # Check if session exists
        session = ChatSessionModel.get_session(session_id)
        if not session:
            logger.warning(f"Session {session_id} not found when initializing memory compression")
            return False
        
        # Check if memory_compression already exists
        if session.get('memory_compression'):
            logger.debug(f"Memory compression already initialized for session {session_id}")
            return True
        
        # Initialize with default structure
        memory_compression = {
            'important_data': {
                'user_preferences': {},
                'key_decisions': [],
                'important_facts': [],
                'source_urls': [],
                'document_structure': {},
                'entities': [],
                'custom_fields': {}
            },
            'conversation_summary': '',
            'summary_version': 0,
            'last_summarized_at': None,
            'messages_summarized_count': 0,
            'last_keep_window_index': 0
        }
        
        result = db.chat_sessions.update_one(
            {'session_id': session_id},
            {
                '$set': {
                    'memory_compression': memory_compression,
                    'updated_at': datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0:
            logger.debug(f"Initialized memory compression for session {session_id}")
            return True
        else:
            logger.warning(f"Failed to initialize memory compression for session {session_id}")
            return False
    
    @staticmethod
    def get_memory_compression(session_id):
        """
        Get memory compression data for a session.
        
        Args:
            session_id: The session ID
            
        Returns:
            dict: Memory compression data, or None if session not found or no memory compression exists
        """
        session = ChatSessionModel.get_session(session_id)
        if not session:
            return None
        
        return session.get('memory_compression')
    
    @staticmethod
    def update_memory_compression(session_id, memory_compression_data):
        """
        Update memory compression data for a session.
        
        This completely replaces the existing memory_compression field with the new data.
        Use this when you have complete updated memory compression data.
        
        Args:
            session_id: The session ID
            memory_compression_data: Complete memory compression dict with all fields:
                - important_data: dict
                - conversation_summary: str
                - summary_version: int
                - last_summarized_at: str (ISO format) or None
                - messages_summarized_count: int
                - last_keep_window_index: int
                
        Returns:
            bool: True if updated successfully, False if session not found
        """
        db = Database.get_db()
        
        # Validate memory_compression_data structure
        if not isinstance(memory_compression_data, dict):
            logger.error(f"Invalid memory_compression_data type: {type(memory_compression_data)}")
            return False
        
        # Ensure all required fields are present with defaults
        validated_data = {
            'important_data': memory_compression_data.get('important_data', {
                'user_preferences': {},
                'key_decisions': [],
                'important_facts': [],
                'source_urls': [],
                'document_structure': {},
                'entities': [],
                'custom_fields': {}
            }),
            'conversation_summary': memory_compression_data.get('conversation_summary', ''),
            'summary_version': memory_compression_data.get('summary_version', 0),
            'last_summarized_at': memory_compression_data.get('last_summarized_at'),
            'messages_summarized_count': memory_compression_data.get('messages_summarized_count', 0),
            'last_keep_window_index': memory_compression_data.get('last_keep_window_index', 0)
        }
        
        # Validate important_data structure
        if not isinstance(validated_data['important_data'], dict):
            logger.error("Invalid important_data type, must be dict")
            return False
        
        # Ensure important_data has all required fields
        required_important_data_fields = [
            'user_preferences', 'key_decisions', 'important_facts',
            'source_urls', 'document_structure', 'entities', 'custom_fields'
        ]
        for field in required_important_data_fields:
            if field not in validated_data['important_data']:
                validated_data['important_data'][field] = [] if 's' in field or field in ['key_decisions', 'important_facts', 'source_urls', 'entities'] else {}
        
        result = db.chat_sessions.update_one(
            {'session_id': session_id},
            {
                '$set': {
                    'memory_compression': validated_data,
                    'updated_at': datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0:
            logger.debug(f"Updated memory compression for session {session_id}, version: {validated_data['summary_version']}")
            return True
        elif result.matched_count > 0:
            # Session found but no changes (data was identical)
            logger.debug(f"Memory compression for session {session_id} unchanged")
            return True
        else:
            logger.warning(f"Session {session_id} not found when updating memory compression")
            return False
    
    @staticmethod
    def clear_memory_compression(session_id):
        """
        Clear memory compression data for a session (for testing purposes).
        
        Args:
            session_id: The session ID
            
        Returns:
            bool: True if cleared successfully, False if session not found
        """
        db = Database.get_db()
        
        result = db.chat_sessions.update_one(
            {'session_id': session_id},
            {
                '$unset': {'memory_compression': ''},
                '$set': {'updated_at': datetime.utcnow()}
            }
        )
        
        if result.modified_count > 0:
            logger.debug(f"Cleared memory compression for session {session_id}")
            return True
        elif result.matched_count > 0:
            # Session found but memory_compression didn't exist (already cleared)
            logger.debug(f"Memory compression already cleared for session {session_id}")
            return True
        else:
            logger.warning(f"Session {session_id} not found when clearing memory compression")
            return False

class ResearchDocumentModel:
    """Model for managing research documents (separate from sessions)"""
    
    @staticmethod
    def create_document(user_id, project_id, title=None):
        """Create a new research document"""
        db = Database.get_db()
        document_id = str(uuid.uuid4())
        document = {
            'user_id': user_id,
            'project_id': project_id,
            'document_id': document_id,
            'title': title or f'Research Document {datetime.utcnow().strftime("%Y-%m-%d %H:%M")}',
            'content': '',  # HTML content
            'version': 0,  # Version for delta sync
            'snapshot': None,  # Base64 encoded image snapshot
            'archived': False,  # Archive flag (only true when user manually archives)
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        db.research_documents.insert_one(document)
        return document_id
    
    @staticmethod
    def get_document(document_id):
        """Get document by document_id"""
        db = Database.get_db()
        return db.research_documents.find_one({'document_id': document_id})
    
    @staticmethod
    def get_all_documents(user_id, project_id=None):
        """Get all research documents for a user, optionally filtered by project_id (excludes archived)"""
        db = Database.get_db()
        query = {'user_id': user_id}
        if project_id:
            query['project_id'] = project_id
        # Exclude archived items: archived is not True (includes False, None, or missing field)
        query['archived'] = {'$ne': True}
        documents = list(db.research_documents.find(query).sort('updated_at', -1))
        return documents
    
    @staticmethod
    def update_document(document_id, content=None, title=None, snapshot=None, archived=None):
        """Update document content, title, snapshot, and/or archived status"""
        db = Database.get_db()
        update_data = {'updated_at': datetime.utcnow()}
        
        if content is not None:
            update_data['content'] = content
        if title is not None:
            update_data['title'] = title
        if snapshot is not None:
            update_data['snapshot'] = snapshot
        if archived is not None:
            update_data['archived'] = archived
        
        db.research_documents.update_one(
            {'document_id': document_id},
            {'$set': update_data}
        )
    
    @staticmethod
    def apply_delta(document_id, patches_text, expected_version):
        """
        Apply delta patches to document content using diff-match-patch.
        
        Args:
            document_id: The document ID
            patches_text: Patch text from diff-match-patch (frontend)
            expected_version: The version the client expects (for optimistic locking)
        
        Returns:
            dict with 'success', 'new_version', 'new_content_length', 'error'
        """
        from diff_match_patch import diff_match_patch
        
        db = Database.get_db()
        doc = db.research_documents.find_one({'document_id': document_id})
        
        if not doc:
            return {'success': False, 'error': 'Document not found'}
        
        current_version = doc.get('version', 0)
        current_content = doc.get('content', '') or doc.get('markdown_content', '')  # Fallback for old schema
        
        # Version check (optimistic locking)
        if current_version != expected_version:
            return {
                'success': False, 
                'error': 'Version mismatch',
                'current_version': current_version
            }
        
        # Apply patches
        dmp = diff_match_patch()
        try:
            patches = dmp.patch_fromText(patches_text)
            new_content, results = dmp.patch_apply(patches, current_content)
            
            # Check if all patches applied successfully
            if not all(results):
                logger.warning(f"Some patches failed to apply: {results}")
            
            new_version = current_version + 1
            
            # Update document with new content and incremented version
            db.research_documents.update_one(
                {'document_id': document_id},
                {
                    '$set': {
                        'content': new_content,
                        'version': new_version,
                        'updated_at': datetime.utcnow()
                    }
                }
            )
            
            return {
                'success': True,
                'new_version': new_version,
                'new_content_length': len(new_content),
                'patches_applied': results
            }
            
        except Exception as e:
            log_error(logger, e, "Error applying patches")
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def delete_document(document_id):
        """Delete a research document"""
        db = Database.get_db()
        result = db.research_documents.delete_one({'document_id': document_id})
        return result.deleted_count > 0
    
    @staticmethod
    def archive_document(document_id):
        """Archive a research document"""
        db = Database.get_db()
        result = db.research_documents.update_one(
            {'document_id': document_id},
            {'$set': {'archived': True, 'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    @staticmethod
    def unarchive_document(document_id):
        """Unarchive a research document"""
        db = Database.get_db()
        result = db.research_documents.update_one(
            {'document_id': document_id},
            {'$set': {'archived': False, 'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    @staticmethod
    def rename_document(document_id, new_title):
        """Rename a research document"""
        db = Database.get_db()
        result = db.research_documents.update_one(
            {'document_id': document_id},
            {'$set': {'title': new_title, 'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0

class DocumentEmbeddingModel:
    @staticmethod
    def create_embedding(document_id, chunk_index, chunk_text, embedding, metadata, 
                       source_type=None, source_id=None, project_id=None, user_id=None):
        """
        Create a new document embedding with multi-source support.
        
        Args:
            document_id: Document ID (can be session_id for research documents, or source_id for other sources)
            chunk_index: Index of the chunk within the document
            chunk_text: Text content of the chunk
            embedding: Vector embedding of the chunk
            metadata: Additional metadata dict
            source_type: Type of source ('research_document', 'highlight', 'pdf', 'image_ocr')
            source_id: ID of the source (highlight_id, pdf_id, image_id, document_id)
            project_id: Project ID for filtering
            user_id: User ID for user isolation
        """
        db = Database.get_db()
        embedding_doc = {
            'document_id': document_id,
            'chunk_index': chunk_index,
            'chunk_text': chunk_text,
            'embedding': embedding,
            'metadata': metadata,
            'created_at': datetime.utcnow()
        }
        
        # Add multi-source fields if provided
        if source_type:
            embedding_doc['source_type'] = source_type
        if source_id:
            embedding_doc['source_id'] = source_id
        if project_id:
            embedding_doc['project_id'] = project_id
        if user_id:
            embedding_doc['user_id'] = user_id
        
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
    def get_embeddings_by_source(source_type, source_id, user_id=None, project_id=None):
        """
        Get all embeddings for a specific source.
        
        Args:
            source_type: Type of source ('research_document', 'highlight', 'pdf', 'image_ocr')
            source_id: ID of the source
            user_id: Optional user ID for filtering
            project_id: Optional project ID for filtering
        
        Returns:
            List of embedding documents
        """
        db = Database.get_db()
        query = {
            'source_type': source_type,
            'source_id': source_id
        }
        if user_id:
            query['user_id'] = user_id
        if project_id:
            query['project_id'] = project_id
        
        embeddings = list(db.document_embeddings.find(query).sort('chunk_index', 1))
        # Convert BSON arrays to Python lists
        for emb in embeddings:
            if 'embedding' in emb and isinstance(emb['embedding'], list):
                emb['embedding'] = list(emb['embedding'])
        return embeddings
    
    @staticmethod
    def get_embeddings_by_filters(user_id, project_id=None, source_types=None):
        """
        Get embeddings filtered by user, project, and source types.
        
        Args:
            user_id: User ID (required)
            project_id: Optional project ID
            source_types: Optional list of source types to filter by
        
        Returns:
            List of embedding documents
        """
        db = Database.get_db()
        query = {'user_id': user_id}
        if project_id:
            query['project_id'] = project_id
        if source_types:
            query['source_type'] = {'$in': source_types}
        
        embeddings = list(db.document_embeddings.find(query).sort('chunk_index', 1))
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
    
    @staticmethod
    def delete_embeddings_by_source(source_type, source_id, user_id=None):
        """
        Delete all embeddings for a specific source.
        
        Args:
            source_type: Type of source ('research_document', 'highlight', 'pdf', 'image_ocr')
            source_id: ID of the source
            user_id: Optional user ID for safety (ensures we only delete user's own embeddings)
        
        Returns:
            Number of embeddings deleted
        """
        db = Database.get_db()
        query = {
            'source_type': source_type,
            'source_id': source_id
        }
        if user_id:
            query['user_id'] = user_id
        
        result = db.document_embeddings.delete_many(query)
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

class HighlightModel:
    """Model for managing web highlights from Chrome extension"""
    
    @staticmethod
    def save_highlight(user_id, project_id, source_url, page_title, highlight_text, note=None, tags=None, preview_image_url=None, highlight_id=None, page_number=None, color_tag=None, timestamp=None):
        """
        Save a highlight. If document for this URL already exists, append to highlights array.
        Otherwise create new document.
        
        Args:
            user_id: User ID
            project_id: Project ID
            source_url: URL of the page (web URL or S3 URL for PDFs)
            page_title: Title of the page
            highlight_text: The highlighted text
            note: Optional note
            tags: Optional list of tags
            preview_image_url: Optional S3 URL for the preview image (new highlights use this)
            highlight_id: Optional pre-generated highlight ID (used when uploading to S3 first)
            page_number: Optional page number (for PDF highlights)
            color_tag: Optional color tag (for PDF highlights)
            timestamp: Optional datetime object (from browser's local time), will use UTC server time if not provided
        
        Returns: highlight_id
        """
        db = Database.get_db()
        
        # Use provided highlight_id or generate a new one
        if not highlight_id:
            highlight_id = str(uuid.uuid4())
        
        # Use provided timestamp (from browser) or fall back to server UTC time
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        highlight_obj = {
            'highlight_id': highlight_id,
            'text': highlight_text,
            'timestamp': timestamp,
            'note': note,
            'tags': tags or [],
            'preview_image_url': preview_image_url  # S3 URL for the preview image
        }
        
        # Add PDF-specific fields if provided
        if page_number is not None:
            highlight_obj['page_number'] = page_number
        if color_tag is not None:
            highlight_obj['color_tag'] = color_tag
        
        # Check if document exists for this user+project+url combination
        existing = db.highlights.find_one({
            'user_id': user_id,
            'project_id': project_id,
            'source_url': source_url
        })
        
        # Use provided timestamp for updated_at if available, otherwise use server time
        update_timestamp = timestamp if timestamp is not None else datetime.utcnow()
        
        if existing:
            # Append to existing highlights array
            db.highlights.update_one(
                {
                    'user_id': user_id,
                    'project_id': project_id,
                    'source_url': source_url
                },
                {
                    '$push': {'highlights': highlight_obj},
                    '$set': {'updated_at': update_timestamp}
                }
            )
        else:
            # Create new document
            highlight_doc = {
                'user_id': user_id,
                'project_id': project_id,
                'source_url': source_url,
                'page_title': page_title,
                'highlights': [highlight_obj],
                'archived': False,  # Archive flag (only true when user manually archives)
                'created_at': update_timestamp,  # Use browser timestamp if available
                'updated_at': update_timestamp  # Use browser timestamp if available
            }
            db.highlights.insert_one(highlight_doc)
        
        return highlight_id
    
    @staticmethod
    def get_highlights_by_project(user_id, project_id, limit=None):
        """Get all highlights for a project (excludes archived)"""
        db = Database.get_db()
        query = db.highlights.find({
            'user_id': user_id,
            'project_id': project_id,
            'archived': {'$ne': True}  # Excludes archived=True, includes False, None, or missing
        }).sort('updated_at', -1)
        
        if limit:
            query = query.limit(limit)
        
        return list(query)
    
    @staticmethod
    def get_highlights_by_url(user_id, project_id, source_url):
        """Get highlights for a specific URL"""
        db = Database.get_db()
        return db.highlights.find_one({
            'user_id': user_id,
            'project_id': project_id,
            'source_url': source_url
        })
    
    @staticmethod
    def get_highlights_by_page_title(user_id, project_id, page_title):
        """Get highlights for a specific page title (case-insensitive)"""
        db = Database.get_db()
        # Use case-insensitive regex for page_title match
        import re
        return db.highlights.find_one({
            'user_id': user_id,
            'project_id': project_id,
            'page_title': {'$regex': f'^{re.escape(page_title)}$', '$options': 'i'}
        })
    
    @staticmethod
    def search_highlights(user_id, project_id, query, limit=10):
        """
        Search highlights across all sources (web URLs and PDF S3 URLs) for a project.
        Searches in highlight text, notes, source URLs, and page titles.
        
        Returns list of highlight documents with only matching highlights included.
        """
        import re
        db = Database.get_db()
        
        # Create case-insensitive regex pattern
        query_pattern = re.compile(re.escape(query), re.IGNORECASE)
        
        # Find all highlight documents for the project
        all_docs = list(db.highlights.find({
            'user_id': user_id,
            'project_id': project_id,
            'archived': {'$ne': True}
        }))
        
        results = []
        for doc in all_docs:
            # Check if source matches (page_title or source_url)
            source_matches = (
                (doc.get('page_title') and query_pattern.search(doc.get('page_title', ''))) or
                (doc.get('source_url') and query_pattern.search(doc.get('source_url', '')))
            )
            
            # Filter highlights that match
            matching_highlights = []
            for highlight in doc.get('highlights', []):
                highlight_matches = (
                    (highlight.get('text') and query_pattern.search(highlight.get('text', ''))) or
                    (highlight.get('note') and query_pattern.search(highlight.get('note', '')))
                )
                if highlight_matches or source_matches:
                    matching_highlights.append(highlight)
            
            # Only include document if it has matching highlights or source matches
            if matching_highlights or source_matches:
                result_doc = {
                    'type': 'web',
                    'source_url': doc.get('source_url'),
                    'page_title': doc.get('page_title'),
                    'highlights': matching_highlights if matching_highlights else doc.get('highlights', []),
                    '_id': doc.get('_id'),
                    'updated_at': doc.get('updated_at')
                }
                results.append(result_doc)
        
        # Sort by updated_at descending and limit
        results.sort(key=lambda x: x.get('updated_at') or datetime.min, reverse=True)
        return results[:limit]
    
    @staticmethod
    def delete_highlight(user_id, project_id, source_url, highlight_id):
        """Delete a specific highlight from the highlights array"""
        db = Database.get_db()
        result = db.highlights.update_one(
            {
                'user_id': user_id,
                'project_id': project_id,
                'source_url': source_url
            },
            {
                '$pull': {'highlights': {'highlight_id': highlight_id}},
                '$set': {'updated_at': datetime.utcnow()}
            }
        )
        return result.modified_count > 0
    
    @staticmethod
    def archive_highlight(user_id, project_id, source_url):
        """Archive a web highlight document"""
        db = Database.get_db()
        result = db.highlights.update_one(
            {
                'user_id': user_id,
                'project_id': project_id,
                'source_url': source_url
            },
            {'$set': {'archived': True, 'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    @staticmethod
    def unarchive_highlight(user_id, project_id, source_url):
        """Unarchive a web highlight document"""
        db = Database.get_db()
        result = db.highlights.update_one(
            {
                'user_id': user_id,
                'project_id': project_id,
                'source_url': source_url
            },
            {'$set': {'archived': False, 'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    @staticmethod
    def delete_source(user_id, project_id, source_url):
        """Delete an entire source document and all its highlights from the database"""
        db = Database.get_db()
        result = db.highlights.delete_one(
            {
                'user_id': user_id,
                'project_id': project_id,
                'source_url': source_url
            }
        )
        return result.deleted_count > 0


class PDFDocumentModel:
    """Model for managing PDF documents and images with extracted highlights"""
    
    # Standard colors for normalization (matching the AI prompt)
    STANDARD_COLORS = ['yellow', 'orange', 'pink', 'red', 'green', 'blue', 'purple']
    
    @staticmethod
    def normalize_color(color_string):
        """
        Normalize a color string to one of the standard colors.
        Handles variations like 'light yellow', 'dark blue', 'bright red', etc.
        """
        if not color_string:
            return 'yellow'  # Default color
        
        color_lower = color_string.lower().strip()
        
        # Direct mapping for common variations
        color_mappings = {
            # Yellow variations
            'yellow': 'yellow', 'light yellow': 'yellow', 'dark yellow': 'yellow',
            'bright yellow': 'yellow', 'pale yellow': 'yellow', 'golden': 'yellow',
            'gold': 'yellow', 'amber': 'yellow', 'mustard': 'yellow', 'lemon': 'yellow',
            # Red variations
            'red': 'red', 'light red': 'red', 'dark red': 'red', 'bright red': 'red',
            'crimson': 'red', 'scarlet': 'red', 'maroon': 'red', 'burgundy': 'red',
            'cherry': 'red', 'ruby': 'red', 'rose': 'pink',
            # Green variations
            'green': 'green', 'light green': 'green', 'dark green': 'green',
            'bright green': 'green', 'lime': 'green', 'olive': 'green',
            'forest': 'green', 'emerald': 'green', 'mint': 'green', 'teal': 'cyan',
            # Blue variations
            'blue': 'blue', 'light blue': 'blue', 'dark blue': 'blue',
            'bright blue': 'blue', 'navy': 'blue', 'royal blue': 'blue',
            'sky blue': 'blue', 'azure': 'blue', 'cobalt': 'blue', 'indigo': 'purple',
            'cyan': 'blue', 'aqua': 'blue', 'turquoise': 'blue', 'teal': 'blue',
            # Orange variations
            'orange': 'orange', 'light orange': 'orange', 'dark orange': 'orange',
            'bright orange': 'orange', 'peach': 'orange', 'coral': 'orange',
            'tangerine': 'orange', 'apricot': 'orange',
            # Pink variations
            'pink': 'pink', 'light pink': 'pink', 'dark pink': 'pink',
            'bright pink': 'pink', 'hot pink': 'pink', 'magenta': 'pink',
            'fuchsia': 'pink', 'salmon': 'pink',
            # Purple variations
            'purple': 'purple', 'light purple': 'purple', 'dark purple': 'purple',
            'bright purple': 'purple', 'violet': 'purple', 'lavender': 'purple',
            'plum': 'purple', 'mauve': 'purple', 'lilac': 'purple',
        }
        
        # Check direct mapping first
        if color_lower in color_mappings:
            return color_mappings[color_lower]
        
        # Check if any standard color is contained in the string
        for standard_color in PDFDocumentModel.STANDARD_COLORS:
            if standard_color in color_lower:
                return standard_color
        
        # Default to yellow if no match
        return 'yellow'
    
    @staticmethod
    def create_pdf_document(user_id, project_id, filename, file_url=None, file_data=None, content_type='application/pdf', pdf_id=None):
        """
        Create a new PDF document entry.
        
        Args:
            user_id: User ID
            project_id: Project ID
            filename: Original filename
            file_url: S3 URL for the file (preferred for new uploads)
            file_data: Binary PDF data (base64 encoded string) - legacy support only
            content_type: MIME type
            pdf_id: Optional pre-generated PDF ID (used when uploading to S3 first)
        
        Returns:
            pdf_document_id
        """
        db = Database.get_db()
        if not pdf_id:
            pdf_id = str(uuid.uuid4())
        
        pdf_doc = {
            'pdf_id': pdf_id,
            'user_id': user_id,
            'project_id': project_id,
            'filename': filename,
            'file_url': file_url,  # S3 URL for the file (new uploads)
            'file_data': file_data,  # Base64 encoded PDF data (legacy - only for backward compatibility)
            'content_type': content_type,
            # Highlights are now stored in highlights collection, not here
            'extraction_status': 'pending',  # pending, processing, completed, failed
            'archived': False,  # Archive flag (only true when user manually archives)
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        db.pdf_documents.insert_one(pdf_doc)
        return pdf_id
    
    @staticmethod
    def get_pdf_document(pdf_id):
        """Get a PDF document by ID"""
        db = Database.get_db()
        return db.pdf_documents.find_one({'pdf_id': pdf_id})
    
    @staticmethod
    def get_pdf_documents_by_project(user_id, project_id):
        """Get all PDF documents for a project (without file data for performance, excludes archived)"""
        db = Database.get_db()
        # Exclude file_data for listing to improve performance
        return list(db.pdf_documents.find(
            {
                'user_id': user_id,
                'project_id': project_id,
                'archived': {'$ne': True}  # Excludes archived=True, includes False, None, or missing
            },
            {'file_data': 0}
        ).sort('updated_at', -1))
    
    @staticmethod
    def get_all_pdf_documents(user_id):
        """Get all PDF documents for a user (without file data, excludes archived)"""
        db = Database.get_db()
        return list(db.pdf_documents.find(
            {
                'user_id': user_id,
                'archived': {'$ne': True}  # Excludes archived=True, includes False, None, or missing
            },
            {'file_data': 0}
        ).sort('updated_at', -1))
    
    @staticmethod
    def get_pdf_file_data(pdf_id):
        """Get file data/URL for a PDF document"""
        db = Database.get_db()
        doc = db.pdf_documents.find_one(
            {'pdf_id': pdf_id},
            {'file_url': 1, 'file_data': 1, 'content_type': 1, 'filename': 1}
        )
        return doc
    
    @staticmethod
    def update_highlights(pdf_id, highlights):
        """
        Update the highlights for a PDF document by saving them to the highlights collection.
        Each highlight should have: text, color_tag, page_number (optional), position (optional)
        """
        db = Database.get_db()
        
        # Get PDF document to retrieve metadata
        pdf_doc = PDFDocumentModel.get_pdf_document(pdf_id)
        if not pdf_doc:
            logger.error(f"[DB] PDF {pdf_id} does not exist in database")
            return False
        
        user_id = pdf_doc.get('user_id')
        project_id = pdf_doc.get('project_id')
        file_url = pdf_doc.get('file_url')
        filename = pdf_doc.get('filename', 'Untitled Document')
        
        if not file_url:
            logger.error(f"[DB] PDF {pdf_id} has no file_url (S3 URL)")
            return False
        
        # Normalize colors and save each highlight to highlights collection
        saved_count = 0
        for h in highlights:
            normalized_h = h.copy()
            normalized_h['color_tag'] = PDFDocumentModel.normalize_color(h.get('color', h.get('color_tag', 'yellow')))
            
            # Preserve highlight_id if it exists (from extraction service), otherwise generate new one
            highlight_id = normalized_h.get('highlight_id')
            if not highlight_id:
                highlight_id = str(uuid.uuid4())
                normalized_h['highlight_id'] = highlight_id
            
            # Save to highlights collection using HighlightModel
            HighlightModel.save_highlight(
                user_id=user_id,
                project_id=project_id,
                source_url=file_url,  # Use S3 URL as source_url
                page_title=filename,
                highlight_text=normalized_h.get('text', ''),
                note=normalized_h.get('note'),
                tags=normalized_h.get('tags', []),
                preview_image_url=normalized_h.get('preview_image_url'),
                highlight_id=highlight_id,
                page_number=normalized_h.get('page_number'),
                color_tag=normalized_h.get('color_tag')
            )
            saved_count += 1
        
        # Update extraction_status in pdf_documents (but not highlights array)
        result = db.pdf_documents.update_one(
            {'pdf_id': pdf_id},
            {
                '$set': {
                    'extraction_status': 'completed',
                    'updated_at': datetime.utcnow()
                }
            }
        )
        
        # Log the update result for debugging
        if result.modified_count > 0:
            logger.info(f"[DB] Successfully saved {saved_count} highlights to highlights collection for PDF {pdf_id}, status: completed")
        else:
            logger.warning(f"[DB] Failed to update extraction_status for PDF {pdf_id}")
        
        return saved_count > 0
    
    @staticmethod
    def update_extraction_status(pdf_id, status, error_message=None):
        """Update the extraction status of a PDF document"""
        db = Database.get_db()
        update_data = {
            'extraction_status': status,
            'updated_at': datetime.utcnow()
        }
        if error_message:
            update_data['extraction_error'] = error_message
        
        db.pdf_documents.update_one(
            {'pdf_id': pdf_id},
            {'$set': update_data}
        )
    
    @staticmethod
    def add_highlight(pdf_id, highlight_text, color, page_number=None, note=None):
        """Add a single highlight to a PDF document (saves to highlights collection)"""
        # Get PDF document to retrieve metadata
        pdf_doc = PDFDocumentModel.get_pdf_document(pdf_id)
        if not pdf_doc:
            raise ValueError(f"PDF {pdf_id} not found")
        
        user_id = pdf_doc.get('user_id')
        project_id = pdf_doc.get('project_id')
        file_url = pdf_doc.get('file_url')
        filename = pdf_doc.get('filename', 'Untitled Document')
        
        if not file_url:
            raise ValueError(f"PDF {pdf_id} has no file_url (S3 URL)")
        
        # Save to highlights collection using HighlightModel
        highlight_id = HighlightModel.save_highlight(
            user_id=user_id,
            project_id=project_id,
            source_url=file_url,  # Use S3 URL as source_url
            page_title=filename,
            highlight_text=highlight_text,
            note=note,
            tags=[],
            preview_image_url=None,
            highlight_id=None,  # Let it generate a new one
            page_number=page_number,
            color_tag=PDFDocumentModel.normalize_color(color)
        )
        
        # Update updated_at in pdf_documents
        db = Database.get_db()
        db.pdf_documents.update_one(
            {'pdf_id': pdf_id},
            {'$set': {'updated_at': datetime.utcnow()}}
        )
        
        return highlight_id
    
    @staticmethod
    def delete_highlight(pdf_id, highlight_id):
        """Delete a specific highlight from a PDF document (deletes from highlights collection)"""
        # Get PDF document to retrieve file_url
        pdf_doc = PDFDocumentModel.get_pdf_document(pdf_id)
        if not pdf_doc:
            return False
        
        user_id = pdf_doc.get('user_id')
        project_id = pdf_doc.get('project_id')
        file_url = pdf_doc.get('file_url')
        
        if not file_url:
            return False
        
        # Delete from highlights collection using HighlightModel
        deleted = HighlightModel.delete_highlight(user_id, project_id, file_url, highlight_id)
        
        # Update updated_at in pdf_documents
        if deleted:
            db = Database.get_db()
            db.pdf_documents.update_one(
                {'pdf_id': pdf_id},
                {'$set': {'updated_at': datetime.utcnow()}}
            )
        
        return deleted
    
    @staticmethod
    def search_highlights(user_id, project_id, query, limit=10):
        """
        Search highlights across all PDF documents for a project.
        Searches in highlight text, notes, and PDF filenames.
        Reads highlights from highlights collection.
        
        Returns list of PDF documents with only matching highlights included.
        """
        import re
        db = Database.get_db()
        
        # Create case-insensitive regex pattern
        query_pattern = re.compile(re.escape(query), re.IGNORECASE)
        
        # Find all PDF documents for the project
        all_docs = list(db.pdf_documents.find({
            'user_id': user_id,
            'project_id': project_id,
            'archived': {'$ne': True}
        }, {'file_data': 0}))  # Exclude file_data for performance
        
        results = []
        for doc in all_docs:
            # Check if filename matches
            filename_matches = (
                doc.get('filename') and query_pattern.search(doc.get('filename', ''))
            )
            
            # Get highlights from highlights collection
            file_url = doc.get('file_url')
            highlights = []
            if file_url:
                highlight_doc = HighlightModel.get_highlights_by_url(user_id, project_id, file_url)
                if highlight_doc:
                    highlights = highlight_doc.get('highlights', [])
            
            # Filter highlights that match
            matching_highlights = []
            for highlight in highlights:
                highlight_matches = (
                    (highlight.get('text') and query_pattern.search(highlight.get('text', ''))) or
                    (highlight.get('note') and query_pattern.search(highlight.get('note', '')))
                )
                if highlight_matches or filename_matches:
                    matching_highlights.append(highlight)
            
            # Only include document if it has matching highlights or filename matches
            if matching_highlights or filename_matches:
                result_doc = {
                    'type': 'pdf',
                    'pdf_id': doc.get('pdf_id'),
                    'filename': doc.get('filename'),
                    'highlights': matching_highlights if matching_highlights else highlights,
                    '_id': doc.get('_id'),
                    'updated_at': doc.get('updated_at')
                }
                results.append(result_doc)
        
        # Sort by updated_at descending and limit
        results.sort(key=lambda x: x.get('updated_at') or datetime.min, reverse=True)
        return results[:limit]
    
    @staticmethod
    def update_highlight_note(pdf_id, highlight_id, note):
        """Update the note for a specific highlight (updates in highlights collection)"""
        # Get PDF document to retrieve file_url
        pdf_doc = PDFDocumentModel.get_pdf_document(pdf_id)
        if not pdf_doc:
            return False
        
        user_id = pdf_doc.get('user_id')
        project_id = pdf_doc.get('project_id')
        file_url = pdf_doc.get('file_url')
        
        if not file_url:
            return False
        
        # Update note in highlights collection
        db = Database.get_db()
        result = db.highlights.update_one(
            {
                'user_id': user_id,
                'project_id': project_id,
                'source_url': file_url,
                'highlights.highlight_id': highlight_id
            },
            {
                '$set': {
                    'highlights.$.note': note,
                    'updated_at': datetime.utcnow()
                }
            }
        )
        
        # Update updated_at in pdf_documents
        if result.modified_count > 0:
            db.pdf_documents.update_one(
                {'pdf_id': pdf_id},
                {'$set': {'updated_at': datetime.utcnow()}}
            )
        
        return result.modified_count > 0
    
    @staticmethod
    def archive_pdf_document(pdf_id):
        """Archive a PDF document"""
        db = Database.get_db()
        result = db.pdf_documents.update_one(
            {'pdf_id': pdf_id},
            {'$set': {'archived': True, 'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    @staticmethod
    def unarchive_pdf_document(pdf_id):
        """Unarchive a PDF document"""
        db = Database.get_db()
        result = db.pdf_documents.update_one(
            {'pdf_id': pdf_id},
            {'$set': {'archived': False, 'updated_at': datetime.utcnow()}}
        )
        return result.modified_count > 0
    
    @staticmethod
    def delete_pdf_document(pdf_id, user_id):
        """Delete a PDF document"""
        db = Database.get_db()
        result = db.pdf_documents.delete_one({'pdf_id': pdf_id, 'user_id': user_id})
        return result.deleted_count > 0



