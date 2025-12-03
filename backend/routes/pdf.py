"""
Highlight Document Routes for handling PDF/Image uploads, viewing, and highlight extraction.
Supports PDF, JPG, and PNG files.
"""
from flask import Blueprint, request, jsonify, send_file
from models.database import PDFDocumentModel, ProjectModel
from utils.auth import get_user_id_from_token
from services.pdf_extraction_service import get_highlight_extraction_service
import base64
import io
import threading

pdf_bp = Blueprint('pdf', __name__)

# Supported file extensions and their MIME types
SUPPORTED_EXTENSIONS = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
}


def extract_highlights_async(doc_id, file_base64_data, content_type='application/pdf'):
    """
    Extract highlights from document in background thread using OpenAI GPT-4o mini.
    Updates the document with extracted highlights.
    """
    try:
        # Update status to processing
        PDFDocumentModel.update_extraction_status(doc_id, 'processing')
        
        # Get highlight extraction service (uses OpenAI GPT-4o mini) and extract highlights
        extraction_service = get_highlight_extraction_service()
        highlights = extraction_service.extract_highlights(file_base64_data, content_type)
        
        # Update the document with highlights
        PDFDocumentModel.update_highlights(doc_id, highlights)
        
        print(f"Extracted {len(highlights)} highlights from document {doc_id}")
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error extracting highlights from document {doc_id}: {error_msg}")
        PDFDocumentModel.update_extraction_status(doc_id, 'failed', error_msg)


@pdf_bp.route('', methods=['POST'])
def upload_document():
    """
    Upload a new highlight document (PDF, JPG, or PNG).
    
    Body (multipart/form-data):
        file: PDF/JPG/PNG file (required)
        project_id: string (required)
    
    OR Body (JSON):
        file_data: base64 encoded file (required)
        filename: string (required)
        project_id: string (required)
        content_type: string (optional)
    
    Returns: { success: true, pdf_id: string, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Handle multipart form data (file upload)
    if request.content_type and 'multipart/form-data' in request.content_type:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        project_id = request.form.get('project_id')
        
        if not file.filename:
            return jsonify({'error': 'No file selected'}), 400
        
        if not project_id:
            return jsonify({'error': 'project_id is required'}), 400
        
        # Check file type
        filename_lower = file.filename.lower()
        file_ext = None
        for ext in SUPPORTED_EXTENSIONS:
            if filename_lower.endswith(ext):
                file_ext = ext
                break
        
        if not file_ext:
            return jsonify({'error': 'Only PDF, JPG, and PNG files are allowed'}), 400
        
        # Read file and encode to base64
        file_data = base64.b64encode(file.read()).decode('utf-8')
        filename = file.filename
        content_type = file.content_type or SUPPORTED_EXTENSIONS[file_ext]
    
    # Handle JSON body with base64 data
    else:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        file_data = data.get('file_data')
        filename = data.get('filename')
        project_id = data.get('project_id')
        content_type = data.get('content_type', 'application/pdf')
        
        if not file_data or not filename or not project_id:
            return jsonify({'error': 'file_data, filename, and project_id are required'}), 400
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Create document entry
    doc_id = PDFDocumentModel.create_pdf_document(
        user_id=user_id,
        project_id=project_id,
        filename=filename,
        file_data=file_data,
        content_type=content_type
    )
    
    # Start background thread to extract highlights
    thread = threading.Thread(
        target=extract_highlights_async,
        args=(doc_id, file_data, content_type)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'pdf_id': doc_id,
        'message': 'Document uploaded successfully. Highlight extraction in progress.'
    }), 201


@pdf_bp.route('', methods=['GET'])
def get_pdfs():
    """
    Get PDF documents with optional filters.
    
    Query params:
        project_id: string (optional) - filter by project
        pdf_id: string (optional) - get specific PDF
    
    Returns: { pdfs: [...] } or { pdf: {...} }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    pdf_id = request.args.get('pdf_id')
    project_id = request.args.get('project_id')
    
    if pdf_id:
        # Get specific PDF
        pdf = PDFDocumentModel.get_pdf_document(pdf_id)
        if not pdf or pdf.get('user_id') != user_id:
            return jsonify({'error': 'PDF not found or access denied'}), 404
        
        # Convert ObjectId and datetime
        pdf['_id'] = str(pdf['_id'])
        if 'created_at' in pdf:
            pdf['created_at'] = pdf['created_at'].isoformat()
        if 'updated_at' in pdf:
            pdf['updated_at'] = pdf['updated_at'].isoformat()
        for h in pdf.get('highlights', []):
            if 'timestamp' in h:
                h['timestamp'] = h['timestamp'].isoformat()
        
        # Don't include file_data in response (too large)
        pdf.pop('file_data', None)
        
        return jsonify({'pdf': pdf}), 200
    
    elif project_id:
        # Validate project belongs to user
        project = ProjectModel.get_project(project_id)
        if not project or project.get('user_id') != user_id:
            return jsonify({'error': 'Project not found or access denied'}), 404
        
        # Get all PDFs for project
        pdfs = PDFDocumentModel.get_pdf_documents_by_project(user_id, project_id)
    else:
        # Get all PDFs for user
        pdfs = PDFDocumentModel.get_all_pdf_documents(user_id)
    
    # Convert ObjectId and datetime
    for pdf in pdfs:
        pdf['_id'] = str(pdf['_id'])
        if 'created_at' in pdf:
            pdf['created_at'] = pdf['created_at'].isoformat()
        if 'updated_at' in pdf:
            pdf['updated_at'] = pdf['updated_at'].isoformat()
        for h in pdf.get('highlights', []):
            if 'timestamp' in h:
                h['timestamp'] = h['timestamp'].isoformat()
    
    return jsonify({'pdfs': pdfs}), 200


@pdf_bp.route('/file/<pdf_id>', methods=['GET'])
def get_pdf_file(pdf_id):
    """
    Get the actual PDF file data for viewing.
    Supports token authentication via query parameter for iframe viewing.
    
    Returns: PDF file binary data
    """
    # Try to get user_id from token (header or query param)
    user_id = get_user_id_from_token()
    
    # If no header token, try query param (for iframe)
    if not user_id:
        token = request.args.get('token')
        if token:
            import jwt
            from config import Config
            try:
                payload = jwt.decode(token, Config.JWT_SECRET, algorithms=['HS256'])
                user_id = payload.get('user_id')
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Token expired'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'error': 'Invalid token'}), 401
    
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Get PDF document to verify ownership
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    # Get file data
    file_doc = PDFDocumentModel.get_pdf_file_data(pdf_id)
    if not file_doc or not file_doc.get('file_data'):
        return jsonify({'error': 'PDF file data not found'}), 404
    
    # Decode base64 and return as file
    pdf_bytes = base64.b64decode(file_doc['file_data'])
    
    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype=file_doc.get('content_type', 'application/pdf'),
        as_attachment=False,
        download_name=file_doc.get('filename', 'document.pdf')
    )


@pdf_bp.route('/highlights/<pdf_id>', methods=['GET'])
def get_pdf_highlights(pdf_id):
    """
    Get highlights for a specific PDF.
    
    Returns: { highlights: [...], extraction_status: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    highlights = pdf.get('highlights', [])
    for h in highlights:
        if 'timestamp' in h:
            h['timestamp'] = h['timestamp'].isoformat()
    
    return jsonify({
        'highlights': highlights,
        'extraction_status': pdf.get('extraction_status', 'pending'),
        'extraction_error': pdf.get('extraction_error')
    }), 200


@pdf_bp.route('/highlights/<pdf_id>', methods=['POST'])
def add_pdf_highlight(pdf_id):
    """
    Manually add a highlight to a PDF.
    
    Body: {
        text: string (required),
        color: string (optional, default: yellow),
        page_number: int (optional),
        note: string (optional)
    }
    
    Returns: { success: true, highlight_id: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data or not data.get('text'):
        return jsonify({'error': 'text is required'}), 400
    
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    highlight_id = PDFDocumentModel.add_highlight(
        pdf_id=pdf_id,
        highlight_text=data['text'],
        color=data.get('color', 'yellow'),
        page_number=data.get('page_number'),
        note=data.get('note')
    )
    
    return jsonify({
        'success': True,
        'highlight_id': highlight_id
    }), 201


@pdf_bp.route('/highlights/<pdf_id>/<highlight_id>', methods=['DELETE'])
def delete_pdf_highlight(pdf_id, highlight_id):
    """
    Delete a highlight from a PDF.
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    success = PDFDocumentModel.delete_highlight(pdf_id, highlight_id)
    
    if success:
        return jsonify({
            'success': True,
            'message': 'Highlight deleted successfully'
        }), 200
    else:
        return jsonify({'error': 'Highlight not found'}), 404


@pdf_bp.route('/highlights/<pdf_id>/<highlight_id>', methods=['PUT'])
def update_pdf_highlight(pdf_id, highlight_id):
    """
    Update a highlight's note.
    
    Body: {
        note: string (optional)
    }
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    note = data.get('note', '')
    success = PDFDocumentModel.update_highlight_note(pdf_id, highlight_id, note)
    
    if success:
        return jsonify({
            'success': True,
            'message': 'Highlight updated successfully'
        }), 200
    else:
        return jsonify({'error': 'Highlight not found'}), 404


@pdf_bp.route('/<pdf_id>', methods=['DELETE'])
def delete_pdf(pdf_id):
    """
    Delete a PDF document.
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    success = PDFDocumentModel.delete_pdf_document(pdf_id, user_id)
    
    if success:
        return jsonify({
            'success': True,
            'message': 'PDF deleted successfully'
        }), 200
    else:
        return jsonify({'error': 'PDF not found or access denied'}), 404


@pdf_bp.route('/reextract/<pdf_id>', methods=['POST'])
def reextract_highlights(pdf_id):
    """
    Re-extract highlights from a PDF.
    Useful if the initial extraction failed or needs to be refreshed.
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    # Get file data
    file_doc = PDFDocumentModel.get_pdf_file_data(pdf_id)
    if not file_doc or not file_doc.get('file_data'):
        return jsonify({'error': 'PDF file data not found'}), 404
    
    # Start background thread to re-extract highlights
    thread = threading.Thread(
        target=extract_highlights_async,
        args=(pdf_id, file_doc['file_data'])
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'Highlight re-extraction started'
    }), 200

