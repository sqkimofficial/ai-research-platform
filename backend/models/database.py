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
    def add_message(session_id, role, content, sources=None, document_content=None, document_structure=None, placement=None, status=None, pending_content_id=None):
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
    def get_all_sessions(user_id, project_id=None):
        """Get all sessions for a user, optionally filtered by project_id, sorted by updated_at descending"""
        db = Database.get_db()
        query = {'user_id': user_id}
        if project_id:
            query['project_id'] = project_id
        sessions = list(db.chat_sessions.find(query).sort('updated_at', -1))
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
            print(f"[DELTA SAVE] Version mismatch: expected {expected_version}, got {current_version}")
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
            
            print(f"[DELTA SAVE] Document: {document_id}")
            print(f"[DELTA SAVE] Received patch: {len(patches_text)} bytes")
            print(f"[DELTA SAVE] Current content: {len(current_content)} bytes")
            print(f"[DELTA SAVE] New content: {len(new_content)} bytes")
            print(f"[DELTA SAVE] All patches applied successfully: {results}")
            
            # Check if all patches applied successfully
            if not all(results):
                print(f"[DELTA SAVE] Warning: Some patches failed to apply: {results}")
            
            new_version = current_version + 1
            print(f"[DELTA SAVE] Version: {current_version} -> {new_version}")
            
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
            print(f"[DELTA SAVE] Error applying patches: {e}")
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

class HighlightModel:
    """Model for managing web highlights from Chrome extension"""
    
    @staticmethod
    def save_highlight(user_id, project_id, source_url, page_title, highlight_text, note=None, tags=None, preview_image_url=None, highlight_id=None):
        """
        Save a highlight. If document for this URL already exists, append to highlights array.
        Otherwise create new document.
        
        Args:
            user_id: User ID
            project_id: Project ID
            source_url: URL of the page
            page_title: Title of the page
            highlight_text: The highlighted text
            note: Optional note
            tags: Optional list of tags
            preview_image_url: Optional S3 URL for the preview image (new highlights use this)
            highlight_id: Optional pre-generated highlight ID (used when uploading to S3 first)
        
        Returns: highlight_id
        """
        db = Database.get_db()
        
        # Use provided highlight_id or generate a new one
        if not highlight_id:
            highlight_id = str(uuid.uuid4())
        
        highlight_obj = {
            'highlight_id': highlight_id,
            'text': highlight_text,
            'timestamp': datetime.utcnow(),
            'note': note,
            'tags': tags or [],
            'preview_image_url': preview_image_url  # S3 URL for the preview image
        }
        
        # Check if document exists for this user+project+url combination
        existing = db.highlights.find_one({
            'user_id': user_id,
            'project_id': project_id,
            'source_url': source_url
        })
        
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
                    '$set': {'updated_at': datetime.utcnow()}
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
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            db.highlights.insert_one(highlight_doc)
        
        return highlight_id
    
    @staticmethod
    def get_highlights_by_project(user_id, project_id):
        """Get all highlights for a project (excludes archived)"""
        db = Database.get_db()
        return list(db.highlights.find({
            'user_id': user_id,
            'project_id': project_id,
            'archived': {'$ne': True}  # Excludes archived=True, includes False, None, or missing
        }).sort('updated_at', -1))
    
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
    def create_pdf_document(user_id, project_id, filename, file_data, content_type='application/pdf'):
        """
        Create a new PDF document entry.
        
        Args:
            user_id: User ID
            project_id: Project ID
            filename: Original filename
            file_data: Binary PDF data (base64 encoded string)
            content_type: MIME type
        
        Returns:
            pdf_document_id
        """
        db = Database.get_db()
        pdf_id = str(uuid.uuid4())
        
        pdf_doc = {
            'pdf_id': pdf_id,
            'user_id': user_id,
            'project_id': project_id,
            'filename': filename,
            'file_data': file_data,  # Base64 encoded PDF data
            'content_type': content_type,
            'highlights': [],  # Will be populated by AI extraction
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
        """Get just the file data for a PDF document"""
        db = Database.get_db()
        doc = db.pdf_documents.find_one(
            {'pdf_id': pdf_id},
            {'file_data': 1, 'content_type': 1, 'filename': 1}
        )
        return doc
    
    @staticmethod
    def update_highlights(pdf_id, highlights):
        """
        Update the highlights for a PDF document.
        Each highlight should have: text, color_tag, page_number (optional), position (optional)
        """
        db = Database.get_db()
        
        # Normalize colors for all highlights
        normalized_highlights = []
        for h in highlights:
            normalized_h = h.copy()
            normalized_h['color_tag'] = PDFDocumentModel.normalize_color(h.get('color', h.get('color_tag', 'yellow')))
            normalized_h['highlight_id'] = str(uuid.uuid4())
            normalized_h['timestamp'] = datetime.utcnow()
            normalized_highlights.append(normalized_h)
        
        result = db.pdf_documents.update_one(
            {'pdf_id': pdf_id},
            {
                '$set': {
                    'highlights': normalized_highlights,
                    'extraction_status': 'completed',
                    'updated_at': datetime.utcnow()
                }
            }
        )
        return result.modified_count > 0
    
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
        """Add a single highlight to a PDF document"""
        db = Database.get_db()
        highlight_id = str(uuid.uuid4())
        
        highlight = {
            'highlight_id': highlight_id,
            'text': highlight_text,
            'color_tag': PDFDocumentModel.normalize_color(color),
            'page_number': page_number,
            'note': note,
            'timestamp': datetime.utcnow()
        }
        
        db.pdf_documents.update_one(
            {'pdf_id': pdf_id},
            {
                '$push': {'highlights': highlight},
                '$set': {'updated_at': datetime.utcnow()}
            }
        )
        return highlight_id
    
    @staticmethod
    def delete_highlight(pdf_id, highlight_id):
        """Delete a specific highlight from a PDF document"""
        db = Database.get_db()
        result = db.pdf_documents.update_one(
            {'pdf_id': pdf_id},
            {
                '$pull': {'highlights': {'highlight_id': highlight_id}},
                '$set': {'updated_at': datetime.utcnow()}
            }
        )
        return result.modified_count > 0
    
    @staticmethod
    def update_highlight_note(pdf_id, highlight_id, note):
        """Update the note for a specific highlight"""
        db = Database.get_db()
        result = db.pdf_documents.update_one(
            {'pdf_id': pdf_id, 'highlights.highlight_id': highlight_id},
            {
                '$set': {
                    'highlights.$.note': note,
                    'updated_at': datetime.utcnow()
                }
            }
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



