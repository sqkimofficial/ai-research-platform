from flask import Blueprint, request, jsonify, send_file
from utils.file_helpers import get_session_dir
from models.database import ChatSessionModel, DocumentModel, ResearchDocumentModel, ProjectModel
from services.vector_service import VectorService
from utils.auth import verify_token, log_auth_info
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

def get_user_id_from_token():
    """Extract user_id from JWT token in Authorization header"""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    try:
        token = auth_header.split(' ')[1]  # Bearer <token>
        return verify_token(token)
    except:
        return None

@document_bp.route('/document', methods=['GET'])
def get_document():
    """Get document content - supports both session_id (legacy) and document_id"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        document_id = request.args.get('document_id')
        session_id = request.args.get('session_id')  # Legacy support
        
        # New approach: use document_id
        if document_id:
            document = ResearchDocumentModel.get_document(document_id)
            if not document:
                return jsonify({'error': 'Document not found'}), 404
            
            if document['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            # Log auth info for Chrome extension
            project_id = document.get('project_id')
            log_auth_info(project_id)
            
            # Return HTML content directly (stored in markdown_content field for backward compatibility)
            return jsonify({
                'content': document.get('markdown_content', ''),  # Actually HTML now
                'structure': [],  # Structure removed - kept for backward compatibility
                'title': document.get('title', 'Untitled'),
                'document_id': document_id
            }), 200
        
        # Legacy approach: use session_id
        if session_id:
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
            if os.path.exists(doc_path):
                with open(doc_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            else:
                content = ''
            
            return jsonify({
                'content': content,
                'structure': []  # Structure removed - kept for backward compatibility
            }), 200
        
        return jsonify({'error': 'document_id or session_id is required'}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document', methods=['POST'])
def save_document():
    """Save document content - supports both session_id (legacy) and document_id"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        document_id = data.get('document_id')
        session_id = data.get('session_id')  # Legacy support
        content = data.get('content', '')
        mode = data.get('mode', 'replace')  # 'append' or 'replace'
        title = data.get('title')
        
        # New approach: use document_id
        if document_id:
            document = ResearchDocumentModel.get_document(document_id)
            if not document:
                return jsonify({'error': 'Document not found'}), 404
            
            if document['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            # Log auth info for Chrome extension
            project_id = document.get('project_id')
            log_auth_info(project_id)
            
            # Get current content (stored as HTML in markdown_content field)
            current_content = document.get('markdown_content', '')
            
            # Apply mode
            if mode == 'append':
                new_content = current_content + content
            else:
                new_content = content
            
            # Update document (storing HTML in markdown_content field for backward compatibility)
            ResearchDocumentModel.update_document(
                document_id,
                markdown_content=new_content,  # Actually HTML now
                title=title
            )
            
            # Index document for semantic search (will strip HTML tags in vector service)
            try:
                vector_service.index_document(document_id, new_content)
            except Exception as index_error:
                print(f"Warning: Failed to index document: {index_error}")
            
            return jsonify({'status': 'ok'}), 200
        
        # Legacy approach: use session_id
        if session_id:
            # Verify user owns this session
            session = ChatSessionModel.get_session(session_id)
            if not session:
                return jsonify({'error': 'Session not found'}), 404
            
            if session['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            # Log auth info for Chrome extension
            project_id = session.get('project_id')
            log_auth_info(project_id)
            
            # Get document file path
            session_dir = get_session_dir(session_id)
            doc_path = session_dir / 'doc.md'
            
            # Ensure directory exists
            os.makedirs(session_dir, exist_ok=True)
            
            # Write document content
            if mode == 'append':
                # Append mode: add content to existing file
                with open(doc_path, 'a', encoding='utf-8') as f:
                    f.write(content)
                # Read full document for indexing
                with open(doc_path, 'r', encoding='utf-8') as f:
                    full_content = f.read()
            else:
                # Replace mode: overwrite file
                with open(doc_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                full_content = content
            
            # Index document for semantic search
            try:
                vector_service.index_document(session_id, full_content)
            except Exception as index_error:
                # Log but don't fail if indexing fails
                print(f"Warning: Failed to index document: {index_error}")
            
            return jsonify({'status': 'ok'}), 200
        
        return jsonify({'error': 'document_id or session_id is required'}), 400
    
    except Exception as e:
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
        
        # Get content (stored as HTML in markdown_content field)
        html_content = document.get('markdown_content', '')
        
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
        documents = ResearchDocumentModel.get_all_documents(user_id, project_id)
        
        # Serialize documents
        serialized_docs = []
        for doc in documents:
            serialized_docs.append({
                'document_id': doc['document_id'],
                'title': doc.get('title', 'Untitled'),
                'project_id': doc.get('project_id'),
                'created_at': doc.get('created_at').isoformat() if doc.get('created_at') else None,
                'updated_at': doc.get('updated_at').isoformat() if doc.get('updated_at') else None
            })
        
        return jsonify({'documents': serialized_docs}), 200
    
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
        
        success = ResearchDocumentModel.delete_document(document_id)
        
        if success:
            return jsonify({'status': 'deleted'}), 200
        else:
            return jsonify({'error': 'Failed to delete document'}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

