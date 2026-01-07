from flask import Blueprint, request, jsonify, send_file
from utils.file_helpers import get_session_dir
from models.database import ChatSessionModel, ResearchDocumentModel, ProjectModel
from services.vector_service import VectorService
from services.redis_service import get_redis_service
from utils.auth import get_user_id_from_token, log_auth_info
from config import Config
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.enums import TA_LEFT
import os
import re
from io import BytesIO

vector_service = VectorService()

document_bp = Blueprint('document', __name__)

# get_user_id_from_token is now imported from utils.auth

@document_bp.route('/document', methods=['GET'])
def get_document():
    """Get document content with version for delta sync"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        document_id = request.args.get('document_id')
        
        if not document_id:
            return jsonify({'error': 'document_id is required'}), 400
        
        document = ResearchDocumentModel.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        if document['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Log auth info for Chrome extension
        project_id = document.get('project_id')
        log_auth_info(project_id)
        
        # Get content - support both old (markdown_content) and new (content) field names
        content = document.get('content', '') or document.get('markdown_content', '')
        version = document.get('version', 0)
        
        return jsonify({
            'content': content,
            'version': version,
            'title': document.get('title', 'Untitled'),
            'document_id': document_id
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document', methods=['POST'])
def save_document():
    """Save document using delta patches for efficiency"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        document_id = data.get('document_id')
        patches = data.get('patches', '')  # Patch text from diff-match-patch
        version = data.get('version', 0)  # Expected version for optimistic locking
        title = data.get('title')
        should_generate_snapshot = data.get('should_generate_snapshot', True)  # Phase 3: Default to True for backward compatibility
        
        if not document_id:
            return jsonify({'error': 'document_id is required'}), 400
        
        document = ResearchDocumentModel.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        if document['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Log auth info for Chrome extension
        project_id = document.get('project_id')
        log_auth_info(project_id)
        
        # Apply delta patches
        result = ResearchDocumentModel.apply_delta(document_id, patches, version)
        
        if not result['success']:
            error_msg = result.get('error', 'Unknown error')
            if 'Version mismatch' in error_msg:
                return jsonify({
                    'error': 'Version mismatch',
                    'current_version': result.get('current_version')
                }), 409  # Conflict
            return jsonify({'error': error_msg}), 400
        
        new_version = result['new_version']
        new_content_length = result['new_content_length']
        
        # Update title if provided (separate from delta)
        if title:
            ResearchDocumentModel.rename_document(document_id, title)
        
        # Get the new content for snapshot and indexing
        updated_doc = ResearchDocumentModel.get_document(document_id)
        new_content = updated_doc.get('content', '')
        
        # Phase 3: Generate snapshot only if should_generate_snapshot is True
        if should_generate_snapshot:
            # Generate snapshot from HTML content (don't fail save if this fails)
            try:
                from services.snapshot_service import get_snapshot_service
                snapshot_service = get_snapshot_service()
                snapshot = snapshot_service.generate_snapshot(new_content)
                if snapshot:
                    ResearchDocumentModel.update_document(document_id, snapshot=snapshot)
            except Exception as snapshot_error:
                print(f"Warning: Failed to generate snapshot: {snapshot_error}")
        else:
            print(f"[DELTA SAVE] Snapshot generation skipped (edit not on first page)")
        
        # Index document for semantic search (don't fail save if this fails)
        try:
            vector_service.index_document(document_id, new_content)
        except Exception as index_error:
            print(f"Warning: Failed to index document: {index_error}")
        
        # Invalidate cache (document list cache, not content cache - that's handled by version)
        redis_service = get_redis_service()
        if project_id:
            cache_key = f"cache:documents:{user_id}:{project_id}"
            redis_service.delete(cache_key)
        redis_service.delete(f"cache:documents:{user_id}:all")
        redis_service.delete_pattern(f"cache:doc:{document_id}:*")
        print(f"[REDIS] Invalidating cache: cache:documents:{user_id}:{project_id or 'all'}")
        print(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'status': 'ok',
            'version': new_version,
            'content_length': new_content_length
        }), 200
    
    except Exception as e:
        print(f"Error saving document: {e}")
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document/pdf', methods=['GET'])
def download_pdf():
    """Download document as PDF"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        session_id = request.args.get('session_id')
        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400
        
        # Verify user owns this session
        session = ChatSessionModel.get_session(session_id)
        if not session:
            return jsonify({'error': 'Session not found'}), 404
        
        if session['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get document file path
        session_dir = get_session_dir(session_id)
        doc_path = session_dir / 'doc.md'
        
        # Read document content
        if not os.path.exists(doc_path):
            return jsonify({'error': 'Document not found'}), 404
        
        with open(doc_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Create PDF in memory
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter,
                                rightMargin=72, leftMargin=72,
                                topMargin=72, bottomMargin=18)
        
        # Container for the 'Flowable' objects
        story = []
        
        # Define styles
        styles = getSampleStyleSheet()
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=12,
            leading=16,
            alignment=TA_LEFT,
            spaceAfter=12
        )
        
        # Split content into paragraphs and add to PDF
        paragraphs = content.split('\n\n')
        for para in paragraphs:
            if para.strip():
                # Replace newlines within paragraphs with <br/>
                para_text = para.replace('\n', '<br/>')
                story.append(Paragraph(para_text, normal_style))
                story.append(Spacer(1, 0.2*inch))
        
        # Build PDF
        doc.build(story)
        
        # Get PDF data
        buffer.seek(0)
        pdf_data = buffer.getvalue()
        buffer.close()
        
        # Return PDF as response
        return send_file(
            BytesIO(pdf_data),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'research-document-{session_id}.pdf'
        )
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def markdown_to_plain_text(markdown_content):
    """
    Convert markdown content to plain text by stripping markdown syntax.
    Preserves paragraph structure and basic formatting.
    """
    if not markdown_content:
        return ""
    
    text = markdown_content
    
    # Remove code blocks (```...```)
    text = re.sub(r'```[\s\S]*?```', '', text)
    
    # Remove inline code (`...`)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    
    # Remove headers (keep the text, remove #)
    text = re.sub(r'^#{1,6}\s+(.+)$', r'\1', text, flags=re.MULTILINE)
    
    # Remove bold (**text** or __text__)
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'__([^_]+)__', r'\1', text)
    
    # Remove italic (*text* or _text_)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'\1', text)
    text = re.sub(r'(?<!_)_([^_]+)_(?!_)', r'\1', text)
    
    # Remove links [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    
    # Remove images ![alt](url)
    text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)
    
    # Remove horizontal rules
    text = re.sub(r'^---+$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\*\*\*+$', '', text, flags=re.MULTILINE)
    
    # Remove list markers (-, *, +, 1.)
    text = re.sub(r'^[\s]*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[\s]*\d+\.\s+', '', text, flags=re.MULTILINE)
    
    # Remove blockquotes (>)
    text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
    
    # Clean up extra whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)  # Max 2 consecutive newlines
    text = text.strip()
    
    return text

@document_bp.route('/document/research-documents/<document_id>/pdf', methods=['GET'])
def download_research_document_pdf(document_id):
    """Download research document as PDF (converts markdown to plain text)"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        # Get document
        document = ResearchDocumentModel.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        if document['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get content (support both old and new field names)
        html_content = document.get('content', '') or document.get('markdown_content', '')
        
        # Strip HTML tags to get plain text for PDF
        from utils.html_helpers import strip_html_tags
        plain_text = strip_html_tags(html_content)
        
        # Get document title for filename
        doc_title = document.get('title', 'Untitled Document')
        safe_title = re.sub(r'[^a-z0-9_\-]+', '_', doc_title.lower())
        
        # Create PDF in memory
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter,
                                rightMargin=72, leftMargin=72,
                                topMargin=72, bottomMargin=18)
        
        # Container for the 'Flowable' objects
        story = []
        
        # Define styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            leading=20,
            alignment=TA_LEFT,
            spaceAfter=24
        )
        normal_style = ParagraphStyle(
            'CustomNormal',
            parent=styles['Normal'],
            fontSize=12,
            leading=16,
            alignment=TA_LEFT,
            spaceAfter=12
        )
        
        # Add document title
        story.append(Paragraph(doc_title, title_style))
        story.append(Spacer(1, 0.3*inch))
        
        # Split plain text into paragraphs and add to PDF
        paragraphs = plain_text.split('\n\n')
        for para in paragraphs:
            if para.strip():
                # Escape HTML special characters and preserve line breaks
                para_text = para.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                para_text = para_text.replace('\n', '<br/>')
                story.append(Paragraph(para_text, normal_style))
                story.append(Spacer(1, 0.2*inch))
        
        # Build PDF
        doc.build(story)
        
        # Get PDF data
        buffer.seek(0)
        pdf_data = buffer.getvalue()
        buffer.close()
        
        # Return PDF as response
        return send_file(
            BytesIO(pdf_data),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f'{safe_title}.pdf'
        )
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document/research-documents', methods=['GET'])
def get_all_research_documents():
    """Get all research documents for the user, optionally filtered by project_id"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        project_id = request.args.get('project_id')
        
        # Generate cache key
        cache_key = f"cache:documents:{user_id}:{project_id or 'all'}"
        
        # Check Redis cache first
        redis_service = get_redis_service()
        cached_data = redis_service.get(cache_key)
        
        if cached_data is not None:
            print(f"[REDIS] get_all_research_documents: Cache hit")
            return jsonify(cached_data), 200
        
        # Cache miss - fetch from MongoDB
        print(f"[REDIS] get_all_research_documents: Checking cache for user {user_id}, project {project_id}")
        print(f"[REDIS] get_all_research_documents: Cache miss, fetching from MongoDB")
        
        documents = ResearchDocumentModel.get_all_documents(user_id, project_id)
        
        # Serialize documents
        serialized_docs = []
        for doc in documents:
            serialized_docs.append({
                'document_id': doc['document_id'],
                'title': doc.get('title', 'Untitled'),
                'project_id': doc.get('project_id'),
                'snapshot': doc.get('snapshot'),  # Base64 image snapshot
                'archived': doc.get('archived', False),  # Archive flag
                'created_at': doc.get('created_at').isoformat() if doc.get('created_at') else None,
                'updated_at': doc.get('updated_at').isoformat() if doc.get('updated_at') else None
            })
        
        response_data = {'documents': serialized_docs}
        
        # Cache the result
        redis_service.set(cache_key, response_data, ttl=Config.REDIS_TTL_DOCUMENTS)
        print(f"[REDIS] get_all_research_documents: Cached {len(serialized_docs)} documents")
        
        return jsonify(response_data), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document/research-documents', methods=['POST'])
def create_research_document():
    """Create a new research document"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        project_id = data.get('project_id')
        title = data.get('title')
        
        if not project_id:
            return jsonify({'error': 'project_id is required'}), 400
        
        # Verify user owns this project
        project = ProjectModel.get_project(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        if project['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        document_id = ResearchDocumentModel.create_document(user_id, project_id, title)
        
        # Invalidate cache
        redis_service = get_redis_service()
        cache_key = f"cache:documents:{user_id}:{project_id}"
        redis_service.delete(cache_key)
        # Also invalidate "all" cache
        redis_service.delete(f"cache:documents:{user_id}:all")
        print(f"[REDIS] Invalidating cache: cache:documents:{user_id}:{project_id}")
        print(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'document_id': document_id,
            'status': 'created'
        }), 201
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document/research-documents/<document_id>', methods=['DELETE'])
def delete_research_document(document_id):
    """Delete a research document"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        document = ResearchDocumentModel.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        if document['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        project_id = document.get('project_id')
        
        success = ResearchDocumentModel.delete_document(document_id)
        
        if success:
            # Invalidate cache
            redis_service = get_redis_service()
            if project_id:
                cache_key = f"cache:documents:{user_id}:{project_id}"
                redis_service.delete(cache_key)
            # Also invalidate "all" cache and document-specific caches
            redis_service.delete(f"cache:documents:{user_id}:all")
            redis_service.delete_pattern(f"cache:doc:{document_id}:*")
            print(f"[REDIS] Invalidating cache: cache:documents:{user_id}:{project_id or 'all'}")
            print(f"[REDIS] Cache invalidated successfully")
            
            return jsonify({'status': 'deleted'}), 200
        else:
            return jsonify({'error': 'Failed to delete document'}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document/research-documents/<document_id>/archive', methods=['POST'])
def archive_document(document_id):
    """Archive a research document"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        document = ResearchDocumentModel.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        if document['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        project_id = document.get('project_id')
        
        success = ResearchDocumentModel.archive_document(document_id)
        
        if not success:
            return jsonify({'error': 'Failed to archive document'}), 500
        
        # Invalidate cache
        redis_service = get_redis_service()
        if project_id:
            cache_key = f"cache:documents:{user_id}:{project_id}"
            redis_service.delete(cache_key)
        redis_service.delete(f"cache:documents:{user_id}:all")
        print(f"[REDIS] Invalidating cache: cache:documents:{user_id}:{project_id or 'all'}")
        print(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({'status': 'ok'}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document/research-documents/<document_id>/unarchive', methods=['POST'])
def unarchive_document(document_id):
    """Unarchive a research document"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        document = ResearchDocumentModel.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        if document['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        project_id = document.get('project_id')
        
        success = ResearchDocumentModel.unarchive_document(document_id)
        
        if not success:
            return jsonify({'error': 'Failed to unarchive document'}), 500
        
        # Invalidate cache
        redis_service = get_redis_service()
        if project_id:
            cache_key = f"cache:documents:{user_id}:{project_id}"
            redis_service.delete(cache_key)
        redis_service.delete(f"cache:documents:{user_id}:all")
        print(f"[REDIS] Invalidating cache: cache:documents:{user_id}:{project_id or 'all'}")
        print(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({'status': 'ok'}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document/research-documents/<document_id>/rename', methods=['PATCH'])
def rename_document(document_id):
    """Rename a research document"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        new_title = data.get('title')
        
        if not new_title or not new_title.strip():
            return jsonify({'error': 'Title is required'}), 400
        
        document = ResearchDocumentModel.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        if document['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        project_id = document.get('project_id')
        
        success = ResearchDocumentModel.rename_document(document_id, new_title.strip())
        
        if not success:
            return jsonify({'error': 'Failed to rename document'}), 500
        
        # Invalidate cache
        redis_service = get_redis_service()
        if project_id:
            cache_key = f"cache:documents:{user_id}:{project_id}"
            redis_service.delete(cache_key)
        redis_service.delete(f"cache:documents:{user_id}:all")
        redis_service.delete_pattern(f"cache:doc:{document_id}:*")
        print(f"[REDIS] Invalidating cache: cache:documents:{user_id}:{project_id or 'all'}")
        print(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({'status': 'ok', 'title': new_title.strip()}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document/research-documents/<document_id>/generate-snapshot', methods=['POST'])
def generate_snapshot_for_document(document_id):
    """Generate snapshot for an existing document that doesn't have one"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        document = ResearchDocumentModel.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        if document['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get document content (support both old and new field names)
        html_content = document.get('content', '') or document.get('markdown_content', '')
        
        if not html_content or not html_content.strip():
            return jsonify({'error': 'Document has no content to generate snapshot from'}), 400
        
        # Generate snapshot
        snapshot = None
        try:
            from services.snapshot_service import get_snapshot_service
            snapshot_service = get_snapshot_service()
            snapshot = snapshot_service.generate_snapshot(html_content)
        except Exception as snapshot_error:
            print(f"Error generating snapshot: {snapshot_error}")
            return jsonify({'error': f'Failed to generate snapshot: {str(snapshot_error)}'}), 500
        
        if not snapshot:
            return jsonify({'error': 'Failed to generate snapshot'}), 500
        
        # Update document with snapshot
        ResearchDocumentModel.update_document(
            document_id,
            snapshot=snapshot
        )
        
        return jsonify({'status': 'ok', 'snapshot': snapshot}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

