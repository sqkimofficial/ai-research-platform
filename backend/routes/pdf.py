"""
Highlight Document Routes for handling PDF/Image uploads, viewing, and highlight extraction.
Supports PDF, JPG, and PNG files.
"""
from flask import Blueprint, request, jsonify, send_file, Response, stream_with_context
from models.database import PDFDocumentModel, ProjectModel, HighlightModel
from utils.auth import get_user_id_from_token
from utils.rate_limiter import get_limiter
from services.pdf_extraction_service import get_highlight_extraction_service
from services.redis_service import get_redis_service
from services.s3_service import S3Service
from services.sse_service import SSEService
from config import Config
from utils.logger import get_logger, log_error
import base64
import io
import threading
import queue
import json

logger = get_logger(__name__)
pdf_bp = Blueprint('pdf', __name__)

# Get rate limiter instance
limiter = get_limiter()

# Supported file extensions and their MIME types
SUPPORTED_EXTENSIONS = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
}


def extract_highlights_async(doc_id, file_base64_data=None, content_type='application/pdf', file_url=None):
    """
    Extract highlights from document in background thread using OpenAI GPT-4o mini.
    Updates the document with extracted highlights.
    
    Args:
        doc_id: PDF document ID
        file_base64_data: Base64 encoded file data (legacy - for old documents)
        content_type: MIME type
        file_url: S3 URL of the file (preferred for new uploads)
    """
    try:
        # Get PDF document to retrieve user_id
        pdf_doc = PDFDocumentModel.get_pdf_document(doc_id)
        if not pdf_doc:
            logger.error(f"PDF document {doc_id} not found")
            PDFDocumentModel.update_extraction_status(doc_id, 'failed', 'Document not found')
            return
        
        user_id = pdf_doc.get('user_id')
        if not user_id:
            logger.error(f"No user_id found for PDF document {doc_id}")
            PDFDocumentModel.update_extraction_status(doc_id, 'failed', 'User ID not found')
            return
        
        # Update status to processing
        PDFDocumentModel.update_extraction_status(doc_id, 'processing')
        
        # Send SSE event to notify frontend that extraction started
        try:
            SSEService.broadcast_to_user(
                user_id=user_id,
                event_type='extraction_started',
                data={
                    'pdf_id': doc_id,
                    'status': 'processing'
                }
            )
            logger.debug(f"[SSE] Sent extraction_started event for PDF {doc_id}")
        except Exception as sse_error:
            logger.debug(f"[SSE] Failed to send extraction_started event: {sse_error}")
        
        # Get file data - prefer S3 URL, fallback to legacy file_data
        if file_url:
            # Fetch from S3
            logger.debug(f"[EXTRACTION] Fetching file from S3: {file_url}")
            file_bytes = S3Service.get_file_from_s3(file_url)
            if file_bytes:
                # Convert to base64 for extraction service (it expects base64)
                file_base64_data = base64.b64encode(file_bytes).decode('utf-8')
                logger.debug(f"[EXTRACTION] Successfully fetched file from S3 ({len(file_bytes)} bytes)")
            else:
                logger.debug(f"[EXTRACTION] Failed to fetch file from S3")
                PDFDocumentModel.update_extraction_status(doc_id, 'failed', 'Failed to fetch file from S3')
                return
        elif not file_base64_data:
            # Try to get from legacy file_data
            file_doc = PDFDocumentModel.get_pdf_file_data(doc_id)
            if file_doc and file_doc.get('file_data'):
                file_base64_data = file_doc['file_data']
                logger.debug(f"[EXTRACTION] Using legacy file_data from MongoDB")
            else:
                logger.debug(f"[EXTRACTION] No file data available")
                PDFDocumentModel.update_extraction_status(doc_id, 'failed', 'No file data available')
                return
        
        # Get highlight extraction service (uses OpenAI GPT-4o mini) and extract highlights
        extraction_service = get_highlight_extraction_service()
        highlights = extraction_service.extract_highlights(file_base64_data, content_type, user_id=user_id, pdf_id=doc_id)
        
        # Update the document with highlights
        update_success = PDFDocumentModel.update_highlights(doc_id, highlights)
        
        if not update_success:
            logger.debug(f"[ERROR] Failed to update highlights in database for PDF {doc_id}")
            PDFDocumentModel.update_extraction_status(doc_id, 'failed', 'Failed to save highlights to database')
            raise Exception("Failed to update highlights in database")
        
        logger.debug(f"Extracted {len(highlights)} highlights from document {doc_id}")
        logger.debug(f"[EXTRACTION] Continuing to verification and cache invalidation for PDF {doc_id}, user_id: {user_id}")
        
        # Verify the update was successful by reading back from DB
        try:
            updated_doc = PDFDocumentModel.get_pdf_document(doc_id)
            if updated_doc:
                actual_status = updated_doc.get('extraction_status')
                # Get highlight count from highlights collection
                file_url = updated_doc.get('file_url')
                project_id = updated_doc.get('project_id')
                actual_highlight_count = 0
                if file_url:
                    highlight_doc = HighlightModel.get_highlights_by_url(user_id, project_id, file_url)
                    if highlight_doc:
                        actual_highlight_count = len(highlight_doc.get('highlights', []))
                logger.debug(f"[VERIFY] PDF {doc_id} status in DB: {actual_status}, highlights: {actual_highlight_count}")
                if actual_status != 'completed':
                    logger.debug(f"[ERROR] Extraction status is {actual_status}, expected 'completed'")
            else:
                logger.debug(f"[ERROR] Could not verify update - PDF {doc_id} not found in database")
        except Exception as verify_error:
            logger.debug(f"[ERROR] Exception during verification: {verify_error}")
            import traceback
            traceback.print_exc()
        
        # Invalidate cache AFTER confirming DB update succeeded
        try:
            project_id = pdf_doc.get('project_id')
            redis_service = get_redis_service()
            if project_id:
                redis_service.delete(f"cache:pdfs:{user_id}:{project_id}")
            redis_service.delete(f"cache:pdfs:{user_id}:all")
            logger.debug(f"[REDIS] Cache invalidated after extraction completion for PDF {doc_id}")
        except Exception as cache_error:
            logger.debug(f"[ERROR] Exception during cache invalidation: {cache_error}")
            import traceback
            traceback.print_exc()
        
        # Small delay to ensure DB write is fully committed and any in-flight reads complete
        import time
        time.sleep(0.5)
        
        # Send SSE event to notify frontend that extraction completed
        # Wait additional time before notifying (as requested - total 2.5 seconds)
        time.sleep(2)
        try:
            SSEService.broadcast_to_user(
                user_id=user_id,
                event_type='extraction_complete',
                data={
                    'pdf_id': doc_id,
                    'highlight_count': len(highlights),
                    'status': 'completed'
                }
            )
            logger.debug(f"[SSE] Sent extraction_complete event for PDF {doc_id}")
        except Exception as sse_error:
            logger.debug(f"[ERROR] Exception during SSE broadcast: {sse_error}")
            import traceback
            traceback.print_exc()
        
    except Exception as e:
        error_msg = str(e)
        import traceback
        logger.debug(f"[ERROR] Error extracting highlights from document {doc_id}: {error_msg}")
        traceback.print_exc()
        PDFDocumentModel.update_extraction_status(doc_id, 'failed', error_msg)
        
        # Send SSE event for failed extraction (only if user_id is available)
        try:
            # Try to get user_id if not already set
            if 'user_id' not in locals() or not user_id:
                pdf_doc = PDFDocumentModel.get_pdf_document(doc_id)
                if pdf_doc:
                    user_id = pdf_doc.get('user_id')
            
            if user_id:
                SSEService.broadcast_to_user(
                    user_id=user_id,
                    event_type='extraction_failed',
                    data={
                        'pdf_id': doc_id,
                        'error': error_msg,
                        'status': 'failed'
                    }
                )
                logger.debug(f"[SSE] Sent extraction_failed event for PDF {doc_id}")
            else:
                logger.debug(f"[SSE] Cannot send extraction_failed event - user_id not available")
        except Exception as sse_error:
            logger.debug(f"[SSE] Failed to send extraction_failed event: {sse_error}")
            import traceback
            traceback.print_exc()


@pdf_bp.route('', methods=['POST'])
@limiter.limit("5 per minute") if limiter else lambda f: f
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
        
        # Read file bytes
        file_bytes = file.read()
        filename = file.filename
        content_type = file.content_type or SUPPORTED_EXTENSIONS[file_ext]
    
    # Handle JSON body with base64 data
    else:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        file_data_base64 = data.get('file_data')
        filename = data.get('filename')
        project_id = data.get('project_id')
        content_type = data.get('content_type', 'application/pdf')
        
        if not file_data_base64 or not filename or not project_id:
            return jsonify({'error': 'file_data, filename, and project_id are required'}), 400
        
        # Decode base64 to bytes
        file_bytes = base64.b64decode(file_data_base64)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Generate PDF ID upfront (needed for S3 key)
    import uuid
    doc_id = str(uuid.uuid4())
    
    # Upload file to S3
    file_url = None
    if S3Service.is_available():
        file_url = S3Service.upload_document_file(
            file_bytes=file_bytes,
            user_id=user_id,
            pdf_id=doc_id,
            filename=filename,
            content_type=content_type
        )
        if file_url:
            logger.debug(f"[PDF UPLOAD] Successfully uploaded to S3: {file_url}")
        else:
            logger.debug(f"[PDF UPLOAD] S3 upload failed, will store in MongoDB (legacy mode)")
            # Fallback to base64 for legacy support
            file_data = base64.b64encode(file_bytes).decode('utf-8')
    else:
        logger.debug(f"[PDF UPLOAD] S3 not configured, storing in MongoDB (legacy mode)")
        # Fallback to base64 for legacy support
        file_data = base64.b64encode(file_bytes).decode('utf-8')
    
    # Create document entry
    PDFDocumentModel.create_pdf_document(
        user_id=user_id,
        project_id=project_id,
        filename=filename,
        file_url=file_url,
        file_data=file_data if not file_url else None,  # Only store base64 if S3 upload failed
        content_type=content_type,
        pdf_id=doc_id  # Use the pre-generated ID
    )
    
    # Invalidate cache
    redis_service = get_redis_service()
    if project_id:
        redis_service.delete(f"cache:pdfs:{user_id}:{project_id}")
    redis_service.delete(f"cache:pdfs:{user_id}:all")
    logger.debug(f"[REDIS] Invalidating cache: cache:pdfs:{user_id}:{project_id or 'all'}")
    logger.debug(f"[REDIS] Cache invalidated successfully")
    
    # Prepare file data for extraction (needed for extraction service)
    file_base64_for_extraction = base64.b64encode(file_bytes).decode('utf-8')
    
    # Start background thread to extract highlights
    thread = threading.Thread(
        target=extract_highlights_async,
        args=(doc_id, file_base64_for_extraction, content_type, file_url)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'pdf_id': doc_id,
        'message': 'Document uploaded successfully. Highlight extraction in progress.'
    }), 201


@pdf_bp.route('', methods=['GET'])
@limiter.limit("60 per minute") if limiter else lambda f: f
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
        # Get specific PDF (don't cache individual PDFs due to size)
        pdf = PDFDocumentModel.get_pdf_document(pdf_id)
        if not pdf or pdf.get('user_id') != user_id:
            return jsonify({'error': 'PDF not found or access denied'}), 404
        
        # Get highlights from highlights collection
        file_url = pdf.get('file_url')
        project_id = pdf.get('project_id')
        highlights = []
        if file_url:
            highlight_doc = HighlightModel.get_highlights_by_url(user_id, project_id, file_url)
            if highlight_doc:
                highlights = highlight_doc.get('highlights', [])
        pdf['highlights'] = highlights
        
        # Convert ObjectId and datetime
        pdf['_id'] = str(pdf['_id'])
        if 'created_at' in pdf:
            pdf['created_at'] = pdf['created_at'].isoformat()
        if 'updated_at' in pdf:
            pdf['updated_at'] = pdf['updated_at'].isoformat()
        for h in pdf.get('highlights', []):
            if 'timestamp' in h:
                h['timestamp'] = h['timestamp'].isoformat()
            # Fix preview_image_url region if present
            if 'preview_image_url' in h and h['preview_image_url']:
                h['preview_image_url'] = S3Service.fix_s3_url_region(h['preview_image_url'], is_pdf_highlight=True)
        
        # Don't include file_data in response (too large)
        pdf.pop('file_data', None)
        
        return jsonify({'pdf': pdf}), 200
    
    # Generate cache key for list endpoints
    if project_id:
        cache_key = f"cache:pdfs:{user_id}:{project_id}"
    else:
        cache_key = f"cache:pdfs:{user_id}:all"
    
    # Check Redis cache first
    redis_service = get_redis_service()
    cached_data = redis_service.get(cache_key)
    
    if cached_data is not None:
        # Verify cached data - check if any PDFs have stale 'processing' status
        pdfs = cached_data.get('pdfs', [])
        needs_refresh = False
        for pdf in pdfs:
            if pdf.get('extraction_status') == 'processing':
                # Verify this PDF's actual status in DB
                pdf_id = pdf.get('pdf_id')
                if pdf_id:
                    actual_doc = PDFDocumentModel.get_pdf_document(pdf_id)
                    if actual_doc:
                        actual_status = actual_doc.get('extraction_status')
                        if actual_status != 'processing':
                            logger.debug(f"[CACHE VERIFY] PDF {pdf_id} in cache has status=processing, but DB has status={actual_status}. Invalidating cache.")
                            needs_refresh = True
                            break
        
        if not needs_refresh:
            logger.debug(f"[REDIS] get_pdfs: Cache hit (verified)")
            return jsonify(cached_data), 200
        else:
            # Invalidate cache and fetch fresh data
            logger.debug(f"[REDIS] get_pdfs: Cache hit but stale, invalidating and fetching fresh")
            redis_service.delete(cache_key)
            if project_id:
                redis_service.delete(f"cache:pdfs:{user_id}:all")
            # Fall through to fetch from MongoDB
    
    # Cache miss - fetch from MongoDB
            logger.debug(f"[REDIS] get_pdfs: Cache key: {cache_key}")
            logger.debug(f"[REDIS] get_pdfs: Cache miss, fetching from MongoDB")
    
    if project_id:
        # Validate project belongs to user
        project = ProjectModel.get_project(project_id)
        if not project or project.get('user_id') != user_id:
            return jsonify({'error': 'Project not found or access denied'}), 404
        
        # Get all PDFs for project
        pdfs = PDFDocumentModel.get_pdf_documents_by_project(user_id, project_id)
    else:
        # Get all PDFs for user
        pdfs = PDFDocumentModel.get_all_pdf_documents(user_id)
    
    # Convert ObjectId and datetime, and fetch highlights from highlights collection
    for pdf in pdfs:
        pdf['_id'] = str(pdf['_id'])
        if 'created_at' in pdf:
            pdf['created_at'] = pdf['created_at'].isoformat()
        if 'updated_at' in pdf:
            pdf['updated_at'] = pdf['updated_at'].isoformat()
        
        # Get highlights from highlights collection using file_url as source_url
        file_url = pdf.get('file_url')
        project_id = pdf.get('project_id')
        highlights = []
        if file_url:
            highlight_doc = HighlightModel.get_highlights_by_url(user_id, project_id, file_url)
            if highlight_doc:
                highlights = highlight_doc.get('highlights', [])
        pdf['highlights'] = highlights
        
        # Ensure extraction_status is included and log it for debugging
        extraction_status = pdf.get('extraction_status', 'unknown')
        highlight_count = len(highlights)
        logger.debug(f"[GET_PDFS] PDF {pdf.get('pdf_id', 'unknown')}: status={extraction_status}, highlights={highlight_count}")
        
        for h in highlights:
            if 'timestamp' in h:
                h['timestamp'] = h['timestamp'].isoformat()
            # Fix preview_image_url region if present
            if 'preview_image_url' in h and h['preview_image_url']:
                h['preview_image_url'] = S3Service.fix_s3_url_region(h['preview_image_url'], is_pdf_highlight=True)
    
    response_data = {'pdfs': pdfs}
    
    # Cache the result
    redis_service.set(cache_key, response_data, ttl=Config.REDIS_TTL_DOCUMENTS)
    logger.debug(f"[REDIS] get_pdfs: Cached {len(pdfs)} PDFs")
    
    return jsonify(response_data), 200


@pdf_bp.route('/file/<pdf_id>', methods=['GET'])
@limiter.limit("60 per minute") if limiter else lambda f: f
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
            # Validate Auth0 token from query parameter
            from utils.auth0_validator import validate_token, Auth0Error
            from models.database import UserModel
            try:
                payload = validate_token(token)
                auth0_id = payload.get('sub')
                
                if auth0_id:
                    # Look up user by auth0_id
                    user = UserModel.get_user_by_auth0_id(auth0_id)
                    if user:
                        user_id = user.get('user_id')
            except Auth0Error as e:
                return jsonify({'error': f'Token validation failed: {str(e)}'}), 401
            except Exception as e:
                return jsonify({'error': 'Invalid token'}), 401
    
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Get PDF document to verify ownership
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    # Get file data/URL
    file_doc = PDFDocumentModel.get_pdf_file_data(pdf_id)
    if not file_doc:
        return jsonify({'error': 'PDF file not found'}), 404
    
    # Check for S3 URL first (new uploads)
    file_url = file_doc.get('file_url')
    if file_url:
        # Fix URL region if needed before redirecting
        file_url = S3Service.fix_s3_url_region(file_url, is_pdf_highlight=True)
        # Redirect to S3 URL - browser will fetch directly from S3
        from flask import redirect
        return redirect(file_url, code=302)
    
    # Fallback to legacy file_data (base64)
    if file_doc.get('file_data'):
        pdf_bytes = base64.b64decode(file_doc['file_data'])
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype=file_doc.get('content_type', 'application/pdf'),
            as_attachment=False,
            download_name=file_doc.get('filename', 'document.pdf')
        )
    
    return jsonify({'error': 'PDF file data not found'}), 404


@pdf_bp.route('/highlights/<pdf_id>', methods=['GET'])
@limiter.limit("60 per minute") if limiter else lambda f: f
def get_pdf_highlights(pdf_id):
    """
    Get highlights for a specific PDF (reads from highlights collection).
    
    Returns: { highlights: [...], extraction_status: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    # Get highlights from highlights collection using file_url as source_url
    file_url = pdf.get('file_url')
    project_id = pdf.get('project_id')
    
    highlights = []
    if file_url:
        highlight_doc = HighlightModel.get_highlights_by_url(user_id, project_id, file_url)
        if highlight_doc:
            highlights = highlight_doc.get('highlights', [])
    
    # Format timestamps and fix preview URLs
    for h in highlights:
        if 'timestamp' in h:
            h['timestamp'] = h['timestamp'].isoformat()
        # Fix preview_image_url region if present
        if 'preview_image_url' in h and h['preview_image_url']:
            h['preview_image_url'] = S3Service.fix_s3_url_region(h['preview_image_url'], is_pdf_highlight=True)
    
    return jsonify({
        'highlights': highlights,
        'extraction_status': pdf.get('extraction_status', 'pending'),
        'extraction_error': pdf.get('extraction_error')
    }), 200


@pdf_bp.route('/highlights/<pdf_id>', methods=['POST'])
@limiter.limit("30 per minute") if limiter else lambda f: f
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
@limiter.limit("20 per minute") if limiter else lambda f: f
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
@limiter.limit("20 per minute") if limiter else lambda f: f
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
@limiter.limit("10 per minute") if limiter else lambda f: f
def delete_pdf(pdf_id):
    """
    Delete a PDF document.
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Get PDF to find project_id and file_url before deletion
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    project_id = pdf.get('project_id')
    file_url = pdf.get('file_url')
    filename = pdf.get('filename', 'document.pdf')
    
    # Delete file from S3 if it exists
    if file_url:
        S3Service.delete_document_file_by_url(file_url)
        logger.debug(f"[PDF DELETE] Deleted file from S3: {file_url}")
    
    success = PDFDocumentModel.delete_pdf_document(pdf_id, user_id)
    
    if success:
        # Invalidate cache
        redis_service = get_redis_service()
        if project_id:
            redis_service.delete(f"cache:pdfs:{user_id}:{project_id}")
        redis_service.delete(f"cache:pdfs:{user_id}:all")
        logger.debug(f"[REDIS] Invalidating cache: cache:pdfs:{user_id}:{project_id or 'all'}")
        logger.debug(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'success': True,
            'message': 'PDF deleted successfully'
        }), 200
    else:
        return jsonify({'error': 'PDF deletion failed'}), 500


@pdf_bp.route('/reextract/<pdf_id>', methods=['POST'])
@limiter.limit("3 per minute") if limiter else lambda f: f
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
    if not file_doc:
        return jsonify({'error': 'PDF file not found'}), 404
    
    # Get file data - prefer S3 URL, fallback to legacy file_data
    file_url = file_doc.get('file_url')
    file_data = file_doc.get('file_data')
    
    if not file_url and not file_data:
        return jsonify({'error': 'PDF file data not found'}), 404
    
    # Start background thread to re-extract highlights
    thread = threading.Thread(
        target=extract_highlights_async,
        args=(pdf_id, file_data, file_doc.get('content_type', 'application/pdf'), file_url)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'Highlight re-extraction started'
    }), 200


@pdf_bp.route('/archive', methods=['PUT'])
@limiter.limit("10 per minute") if limiter else lambda f: f
def archive_pdf():
    """
    Archive a PDF document.
    
    Body: {
        pdf_id: string (required),
        project_id: string (optional, for validation)
    }
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    pdf_id = data.get('pdf_id')
    if not pdf_id:
        return jsonify({'error': 'pdf_id is required'}), 400
    
    # Verify PDF belongs to user
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    # Get project_id before archiving
    project_id = pdf.get('project_id')
    
    # Archive PDF
    success = PDFDocumentModel.archive_pdf_document(pdf_id)
    
    if success:
        # Invalidate cache
        redis_service = get_redis_service()
        if project_id:
            redis_service.delete(f"cache:pdfs:{user_id}:{project_id}")
        redis_service.delete(f"cache:pdfs:{user_id}:all")
        logger.debug(f"[REDIS] Invalidating cache: cache:pdfs:{user_id}:{project_id or 'all'}")
        logger.debug(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'success': True,
            'message': 'PDF archived successfully'
        }), 200
    else:
        return jsonify({'error': 'Failed to archive PDF'}), 500


@pdf_bp.route('/unarchive', methods=['PUT'])
@limiter.limit("10 per minute") if limiter else lambda f: f
def unarchive_pdf():
    """
    Unarchive a PDF document.
    
    Body: {
        pdf_id: string (required),
        project_id: string (optional, for validation)
    }
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    pdf_id = data.get('pdf_id')
    if not pdf_id:
        return jsonify({'error': 'pdf_id is required'}), 400
    
    # Verify PDF belongs to user
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    # Get project_id before unarchiving
    project_id = pdf.get('project_id')
    
    # Unarchive PDF
    success = PDFDocumentModel.unarchive_pdf_document(pdf_id)
    
    if success:
        # Invalidate cache
        redis_service = get_redis_service()
        if project_id:
            redis_service.delete(f"cache:pdfs:{user_id}:{project_id}")
        redis_service.delete(f"cache:pdfs:{user_id}:all")
        logger.debug(f"[REDIS] Invalidating cache: cache:pdfs:{user_id}:{project_id or 'all'}")
        logger.debug(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'success': True,
            'message': 'PDF unarchived successfully'
        }), 200
    else:
        return jsonify({'error': 'Failed to unarchive PDF'}), 500


@pdf_bp.route('/events', methods=['GET'])
@limiter.limit("10 per minute") if limiter else lambda f: f
def sse_events():
    """
    Server-Sent Events endpoint for real-time extraction status updates.
    
    Clients subscribe to this endpoint to receive notifications when PDF extraction completes.
    
    Query params:
        token: string (optional) - Auth token if not in Authorization header
    
    Returns: SSE stream with extraction events
    """
    user_id = get_user_id_from_token()
    if not user_id:
        logger.debug("[SSE] Unauthorized - no user_id from token")
        return Response(
            'data: {"type":"error","message":"Unauthorized"}\n\n',
            mimetype='text/event-stream',
            status=401
        )
    
    logger.debug(f"[SSE] New connection request from user {user_id}")
    
    # Create a queue for this connection
    event_queue = queue.Queue()
    
    # Add connection to SSE service
    SSEService.add_connection(user_id, event_queue)
    logger.debug(f"[SSE] Connection added for user {user_id}, total connections: {SSEService.get_connection_count(user_id)}")
    
    def event_stream():
        """Generator function that yields SSE events."""
        try:
            # Send initial connection message
            yield f"data: {json.dumps({'type': 'connected', 'message': 'SSE connection established'})}\n\n"
            logger.debug(f"[SSE] Sent connection confirmation to user {user_id}")
            
            while True:
                try:
                    # Wait for event with timeout to allow connection health checks
                    event = event_queue.get(timeout=30)
                    
                    # Format as SSE
                    event_json = json.dumps(event)
                    yield f"data: {event_json}\n\n"
                    logger.debug(f"[SSE] Sent event to user {user_id}: {event.get('type', 'unknown')}")
                    
                except queue.Empty:
                    # Send keepalive ping
                    yield f": keepalive\n\n"
                except Exception as e:
                    logger.debug(f"[SSE] Error in event stream for user {user_id}: {e}")
                    import traceback
                    traceback.print_exc()
                    break
        except GeneratorExit:
            logger.debug(f"[SSE] Client disconnected (GeneratorExit) for user {user_id}")
        except Exception as e:
            logger.debug(f"[SSE] Unexpected error in event stream for user {user_id}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # Remove connection when client disconnects
            SSEService.remove_connection(user_id, event_queue)
            logger.debug(f"[SSE] Connection closed for user {user_id}")
    
    return Response(
        stream_with_context(event_stream()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',  # Disable buffering in nginx
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',  # Allow CORS for SSE
            'Access-Control-Allow-Credentials': 'true'
        }
    )


@pdf_bp.route('/highlight-preview/<pdf_id>/<highlight_id>', methods=['GET'])
@limiter.limit("60 per minute") if limiter else lambda f: f
def get_highlight_preview(pdf_id, highlight_id):
    """
    Get preview image URL for a specific highlight.
    
    Returns the S3 URL for the preview image centered on the highlight text.
    
    Returns: { preview_image_url: string } or { error: 'No preview available' }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    # Get PDF document
    pdf = PDFDocumentModel.get_pdf_document(pdf_id)
    if not pdf or pdf.get('user_id') != user_id:
        return jsonify({'error': 'PDF not found or access denied'}), 404
    
    # Get highlights from highlights collection
    file_url = pdf.get('file_url')
    project_id = pdf.get('project_id')
    if not file_url:
        return jsonify({'error': 'PDF has no file_url'}), 404
    
    highlight_doc = HighlightModel.get_highlights_by_url(user_id, project_id, file_url)
    if not highlight_doc:
        return jsonify({'error': 'Highlight not found'}), 404
    
    # Find the specific highlight
    for highlight in highlight_doc.get('highlights', []):
        if highlight.get('highlight_id') == highlight_id:
            preview_url = highlight.get('preview_image_url')
            if preview_url:
                # Fix URL region if needed
                preview_url = S3Service.fix_s3_url_region(preview_url, is_pdf_highlight=True)
                return jsonify({'preview_image_url': preview_url}), 200
            return jsonify({'error': 'No preview available for this highlight', 'reason': 'preview_image_url field is missing or empty'}), 404
    
    return jsonify({'error': 'Highlight not found'}), 404

