from flask import Blueprint, request, jsonify, send_file
from utils.file_helpers import get_session_dir
from models.database import ChatSessionModel, DocumentModel
from services.vector_service import VectorService
from services.document_structure_service import DocumentStructureService
from utils.auth import verify_token
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.enums import TA_LEFT
import os
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
    """Get document content for a session"""
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
        if os.path.exists(doc_path):
            with open(doc_path, 'r', encoding='utf-8') as f:
                content = f.read()
        else:
            content = ''
        
        # Get document structure
        structure = DocumentModel.get_document_structure(session_id)
        
        return jsonify({
            'content': content,
            'structure': structure
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@document_bp.route('/document', methods=['POST'])
def save_document():
    """Save document content for a session"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        session_id = data.get('session_id')
        content = data.get('content', '')
        mode = data.get('mode', 'replace')  # 'append' or 'replace'
        
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

