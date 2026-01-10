from flask import Blueprint, request, jsonify
from models.database import HighlightModel, ProjectModel, PDFDocumentModel
from utils.auth import get_user_id_from_token, log_auth_info
from utils.rate_limiter import get_limiter
from services.s3_service import S3Service
from services.vector_service import VectorService
from services.redis_service import get_redis_service
from services.sse_service import SSEService
from config import Config
from utils.logger import get_logger
from datetime import datetime
import base64
import io
import re

logger = get_logger(__name__)

# Get rate limiter instance
limiter = get_limiter()

# Try to import PIL for image processing
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("Pillow not installed. Web highlight previews will not be generated.")

highlight_bp = Blueprint('highlight', __name__)


def generate_cropped_preview(preview_data, scale_factor=0.3):
    """
    Generate a cropped preview image with 1:2 aspect ratio (height:width), centered on selection.
    
    Process:
    1. Scale down screenshot by fixed factor (default 0.3 = 30% of original size)
    2. Crop with 1:2 aspect ratio (height:width): full width, height = width/2, centered on selection
    3. No horizontal cropping - preserves full viewport width
    
    Args:
        preview_data: dict with 'screenshot' (base64) and 'selection_rect'
        scale_factor: Scaling factor (default 0.3 = 30% of original size)
    
    Returns:
        bytes: JPEG image bytes, or None if processing fails
    """
    if not PIL_AVAILABLE:
        return None
    
    if not preview_data or not preview_data.get('screenshot'):
        return None
    
    try:
        # Decode the screenshot
        screenshot_base64 = preview_data['screenshot']
        img_bytes = base64.b64decode(screenshot_base64)
        img = Image.open(io.BytesIO(img_bytes))
        original_width, original_height = img.size
        
        selection_rect = preview_data.get('selection_rect', {})
        viewport_width = selection_rect.get('viewport_width', original_width)
        viewport_height = selection_rect.get('viewport_height', original_height)
        
        logger.debug(f"Original screenshot: {original_width}x{original_height}")
        logger.debug(f"Viewport: {viewport_width}x{viewport_height}")
        
        # Calculate device pixel ratio
        device_pixel_ratio = original_width / viewport_width if viewport_width > 0 else 1
        logger.debug(f"Device pixel ratio: {device_pixel_ratio}")
        
        # STEP 1: Scale down by fixed factor (0.3 = 30% of original size)
        scaled_width = int(original_width * scale_factor)
        scaled_height = int(original_height * scale_factor)
        img = img.resize((scaled_width, scaled_height), Image.LANCZOS)
        logger.debug(f"Scaled screenshot to: {scaled_width}x{scaled_height} (scale_factor: {scale_factor:.3f}, {scale_factor*100:.1f}% of original)")
        
        # STEP 2: Calculate crop with 1:2 aspect ratio (height:width)
        # Get selection position in viewport coordinates
        sel_x = selection_rect.get('x', 0)
        sel_y = selection_rect.get('y', 0)
        sel_width = selection_rect.get('width', 100)
        sel_height = selection_rect.get('height', 20)
        scroll_x = selection_rect.get('scroll_x', 0)
        scroll_y = selection_rect.get('scroll_y', 0)
        
        # Selection center relative to viewport (viewport coordinates)
        sel_viewport_x = sel_x - scroll_x
        sel_viewport_y = sel_y - scroll_y
        center_y_viewport = sel_viewport_y + sel_height / 2
        
        # Convert viewport coordinates to scaled screenshot coordinates
        # First convert viewport coords to original screenshot coords, then apply scale
        center_y_original = center_y_viewport * device_pixel_ratio
        center_y_scaled = center_y_original * scale_factor
        
        # Crop dimensions: 1:2 aspect ratio (height:width)
        # Height = width / 2
        crop_width = scaled_width  # Full width
        crop_height = int(scaled_width / 2)  # Height is half of width (1:2 ratio)
        
        # Safety check: if scaled height is less than crop height, use scaled height
        if crop_height > scaled_height:
            crop_height = scaled_height
            logger.debug(f"WARNING: Crop height {crop_height} exceeds scaled height {scaled_height}, using scaled height")
        
        # Crop area: full width, height = width/2, centered vertically on selection
        left = 0
        top = max(0, min(scaled_height - crop_height, center_y_scaled - crop_height // 2))
        right = scaled_width  # Full width
        bottom = min(scaled_height, top + crop_height)
        
        logger.debug(f"Crop: left={left}, top={top}, right={right}, bottom={bottom} (width={right-left}, height={bottom-top}, aspect_ratio={((right-left)/(bottom-top)):.2f}:1)")
        
        # STEP 3: Crop the image (1:2 aspect ratio)
        cropped = img.crop((int(left), int(top), int(right), int(bottom)))
        final_width, final_height = cropped.size
        
        logger.debug(f"Final cropped image: {final_width}x{final_height}")
        
        # Convert to JPEG bytes (JPEG is much smaller than PNG for screenshots)
        buffer = io.BytesIO()
        # Convert RGBA to RGB if needed (JPEG doesn't support transparency)
        if cropped.mode in ('RGBA', 'LA', 'P'):
            # Create a white background for transparency
            rgb_img = Image.new('RGB', cropped.size, (255, 255, 255))
            if cropped.mode == 'P':
                cropped = cropped.convert('RGBA')
            rgb_img.paste(cropped, mask=cropped.split()[-1] if cropped.mode in ('RGBA', 'LA') else None)
            cropped = rgb_img
        
        # Save as JPEG with quality 85 (good balance between quality and file size)
        cropped.save(buffer, format='JPEG', quality=85, optimize=True)
        image_bytes = buffer.getvalue()
        
        logger.debug(f"Final preview size: {len(image_bytes)} bytes (JPEG format)")
        
        return image_bytes
        
    except Exception as e:
        logger.debug(f"Error generating cropped preview: {e}")
        import traceback
        traceback.print_exc()
        return None


@highlight_bp.route('', methods=['POST'])
@limiter.limit("30 per minute") if limiter else lambda f: f
def save_highlight():
    """
    Save a highlight from Chrome extension.
    
    Body: {
        project_id: string (required),
        source_url: string (required),
        page_title: string (required),
        text: string (required),
        note: string (optional),
        tags: [string] (optional),
        preview_data: { screenshot: base64, selection_rect: {...} } (optional)
    }
    
    Returns: { success: true, highlight_id: string, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validate required fields
    required_fields = ['project_id', 'source_url', 'page_title', 'text']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    project_id = data['project_id']
    source_url = data['source_url']
    page_title = data['page_title']
    text = data['text']
    note = data.get('note')
    tags = data.get('tags', [])
    preview_data = data.get('preview_data')
    timestamp_str = data.get('timestamp')  # Get timestamp from browser's local time
    
    # Log auth info for Chrome extension
    log_auth_info(project_id)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Generate a highlight_id upfront (needed for S3 key)
    import uuid
    highlight_id = str(uuid.uuid4())
    
    # Process preview data to generate cropped preview image
    preview_image_url = None
    if preview_data:
        logger.debug(f"[HIGHLIGHT] Received preview_data with keys: {preview_data.keys() if isinstance(preview_data, dict) else 'not a dict'}")
        if isinstance(preview_data, dict):
            screenshot_len = len(preview_data.get('screenshot', '')) if preview_data.get('screenshot') else 0
            logger.debug(f"[HIGHLIGHT] Screenshot base64 length: {screenshot_len}")
            logger.debug(f"[HIGHLIGHT] Selection rect: {preview_data.get('selection_rect')}")
        
        # Generate cropped preview image (returns bytes)
        image_bytes = generate_cropped_preview(preview_data)
        
        if image_bytes:
            logger.debug(f"[HIGHLIGHT] Generated preview image: {len(image_bytes)} bytes")
            
            # Upload to S3 if available
            if S3Service.is_available():
                preview_image_url = S3Service.upload_highlight_image(
                    image_bytes=image_bytes,
                    user_id=user_id,
                    highlight_id=highlight_id
                )
                if preview_image_url:
                    logger.debug(f"[HIGHLIGHT] Uploaded to S3: {preview_image_url}")
                else:
                    logger.debug("[HIGHLIGHT] S3 upload failed, preview will not be saved")
            else:
                logger.debug("[HIGHLIGHT] S3 not configured, preview will not be saved")
        else:
            logger.debug("[HIGHLIGHT] Failed to generate preview image")
    else:
        logger.debug("[HIGHLIGHT] No preview_data received")
    
    # Parse timestamp if provided (from browser's local time as ISO string)
    timestamp = None
    if timestamp_str:
        try:
            from datetime import datetime
            # Parse ISO string from browser (toISOString() returns UTC format like "2026-01-07T20:00:00.000Z")
            if timestamp_str.endswith('Z'):
                # Replace Z with +00:00 for fromisoformat, then convert to naive UTC datetime
                timestamp_aware = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                timestamp = timestamp_aware.replace(tzinfo=None)
            else:
                # Already in ISO format without Z, parse directly
                timestamp = datetime.fromisoformat(timestamp_str)
                if timestamp.tzinfo is not None:
                    # Convert timezone-aware to naive UTC
                    timestamp = timestamp.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        except (ValueError, AttributeError, TypeError) as e:
            logger.debug(f"[HIGHLIGHT] Failed to parse timestamp '{timestamp_str}': {e}")
            # Will fall back to server time in save_highlight
    
    # Save highlight with S3 URL
    saved_highlight_id = HighlightModel.save_highlight(
        user_id=user_id,
        project_id=project_id,
        source_url=source_url,
        page_title=page_title,
        highlight_text=text,
        note=note,
        tags=tags,
        preview_image_url=preview_image_url,
        highlight_id=highlight_id,  # Pass the pre-generated ID
        timestamp=timestamp  # Pass timestamp from browser if available
    )
    
    # Index highlight for semantic search (Phase I)
    try:
        # Combine highlight text and note for indexing
        combined_text = text
        if note:
            combined_text = f"{text}\n\n{note}"
        
        vector_service = VectorService()
        vector_service.index_highlight(
            highlight_id=saved_highlight_id,
            text=combined_text,
            user_id=user_id,
            project_id=project_id,
            source_url=source_url
        )
        logger.debug(f"[VECTORIZATION] Successfully indexed highlight {saved_highlight_id}")
    except Exception as vec_error:
        logger.error(f"[VECTORIZATION] Error indexing highlight: {vec_error}")
        import traceback
        traceback.print_exc()
        # Don't fail highlight save if vectorization fails
    
    # Invalidate cache
    redis_service = get_redis_service()
    redis_service.delete(f"cache:highlights:{user_id}:{project_id}")
    redis_service.delete(f"cache:highlights:{user_id}:{project_id}:{source_url}")
    logger.debug(f"[REDIS] Invalidating cache: cache:highlights:{user_id}:{project_id}")
    logger.debug(f"[REDIS] Cache invalidated successfully")
    
    # Send SSE event to notify frontend that highlight was saved
    try:
        SSEService.broadcast_to_user(
            user_id=user_id,
            event_type='highlight_saved',
            data={
                'project_id': project_id,
                'highlight_id': saved_highlight_id,
                'source_url': source_url
            }
        )
        logger.debug(f"[SSE] Sent highlight_saved event for highlight {saved_highlight_id} in project {project_id}")
    except Exception as sse_error:
        logger.debug(f"[SSE] Failed to send highlight_saved event: {sse_error}")
    
    logger.debug(f"Highlight saved: {saved_highlight_id} for project {project_id}" + 
          (f" (with S3 preview: {preview_image_url})" if preview_image_url else " (no preview)"))
    
    return jsonify({
        'success': True,
        'highlight_id': saved_highlight_id,
        'message': 'Highlight saved successfully'
    }), 201


@highlight_bp.route('', methods=['GET'])
@limiter.limit("60 per minute") if limiter else lambda f: f
def get_highlights():
    """
    Get highlights with optional filters.
    
    Query params:
        project_id: string (required)
        source_url: string (optional)
        limit: int (optional) - limit number of results (for initial load)
    
    Returns: { highlights: [...] }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    project_id = request.args.get('project_id')
    source_url = request.args.get('source_url')
    limit = request.args.get('limit', type=int)
    
    if not project_id:
        return jsonify({'error': 'project_id is required'}), 400
    
    # Log auth info for Chrome extension
    log_auth_info(project_id)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Generate cache key (include limit in cache key if specified)
    if source_url:
        cache_key = f"cache:highlights:{user_id}:{project_id}:{source_url}"
    elif limit:
        cache_key = f"cache:highlights:{user_id}:{project_id}:limit:{limit}"
    else:
        cache_key = f"cache:highlights:{user_id}:{project_id}"
    
    # Check Redis cache first (only if no limit specified, to avoid caching limited results)
    redis_service = get_redis_service()
    cached_data = None
    if not limit:
        cached_data = redis_service.get(cache_key)
    
    if cached_data is not None:
        logger.debug(f"[REDIS] get_highlights: Cache hit")
        # Fix URLs in cached data before returning
        if 'highlights' in cached_data:
            for h_doc in cached_data['highlights']:
                if 'highlights' in h_doc:
                    for h in h_doc['highlights']:
                        if 'preview_image_url' in h and h['preview_image_url']:
                            h['preview_image_url'] = S3Service.fix_s3_url_region(h['preview_image_url'])
        return jsonify(cached_data), 200
    
    # Cache miss - fetch from MongoDB
    logger.debug(f"[REDIS] get_highlights: Cache key: {cache_key}")
    logger.debug(f"[REDIS] get_highlights: Cache miss, fetching from MongoDB")
    
    # Get highlights based on filters
    if source_url:
        # Get highlights for specific URL
        highlight_doc = HighlightModel.get_highlights_by_url(
            user_id=user_id,
            project_id=project_id,
            source_url=source_url
        )
        highlights = [highlight_doc] if highlight_doc else []
    else:
        # Get highlights for project (with optional limit)
        highlights = HighlightModel.get_highlights_by_project(
            user_id=user_id,
            project_id=project_id,
            limit=limit
        )
    
    # Convert ObjectId to string for JSON serialization and fix URLs
    # Also limit highlights per document if limit is specified (for initial load)
    highlights_per_source = 2  # Top 2 highlights per source
    for h_doc in highlights:
        if '_id' in h_doc:
            h_doc['_id'] = str(h_doc['_id'])
        
        # Explicitly serialize datetime fields to ISO format with 'Z' suffix for UTC
        if 'created_at' in h_doc and h_doc['created_at']:
            h_doc['created_at'] = h_doc['created_at'].isoformat() + 'Z'
        if 'updated_at' in h_doc and h_doc['updated_at']:
            h_doc['updated_at'] = h_doc['updated_at'].isoformat() + 'Z'
        
        # Limit highlights per document if limit is specified (for initial load)
        if limit and 'highlights' in h_doc and h_doc['highlights']:
            # Sort highlights by timestamp descending (most recent first)
            # MongoDB returns datetime objects, which are directly comparable
            sorted_highlights = sorted(
                h_doc['highlights'],
                key=lambda h: h.get('timestamp') or datetime.min,
                reverse=True
            )
            # Take only top N highlights per source
            h_doc['highlights'] = sorted_highlights[:highlights_per_source]
        
        # Fix preview_image_url and serialize timestamps in nested highlights array
        if 'highlights' in h_doc:
            for h in h_doc['highlights']:
                if 'preview_image_url' in h and h['preview_image_url']:
                    h['preview_image_url'] = S3Service.fix_s3_url_region(h['preview_image_url'])
                if 'timestamp' in h and h['timestamp']:
                    h['timestamp'] = h['timestamp'].isoformat() + 'Z'
    
    response_data = {'highlights': highlights}
    
    # Cache the result (only if no limit specified)
    if not limit:
        redis_service.set(cache_key, response_data, ttl=Config.REDIS_TTL_DOCUMENTS)
        logger.debug(f"[REDIS] get_highlights: Cached {len(highlights)} highlights")
    
    return jsonify(response_data), 200


@highlight_bp.route('/search', methods=['GET'])
@limiter.limit("30 per minute") if limiter else lambda f: f
def search_highlights():
    """
    Search highlights across all sources (web and PDF) for a project.
    Searches in highlight text, notes, source URLs, page titles, and PDF filenames.
    
    Query params:
        project_id: string (required)
        query: string (required) - search query
        limit: int (optional, default 10) - max number of results to return
    
    Returns: { 
        highlights: [
            {
                type: 'web' | 'pdf',
                source_url: string (for web),
                pdf_id: string (for PDF),
                page_title: string (for web),
                filename: string (for PDF),
                highlights: [...]  # matching highlights only
            }
        ]
    }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    project_id = request.args.get('project_id')
    query = request.args.get('query', '').strip()
    limit = request.args.get('limit', type=int) or 10
    
    if not project_id:
        return jsonify({'error': 'project_id is required'}), 400
    
    if not query:
        return jsonify({'highlights': []}), 200
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Generate cache key for search results (short TTL since searches are dynamic)
    cache_key = f"cache:highlights:search:{user_id}:{project_id}:{query.lower()}:{limit}"
    
    # Check Redis cache first (short TTL for search results)
    redis_service = get_redis_service()
    cached_data = redis_service.get(cache_key)
    
    if cached_data is not None:
        logger.debug(f"[REDIS] search_highlights: Cache hit for query: {query}")
        # Fix URLs in cached data before returning
        for h_doc in cached_data.get('highlights', []):
            if 'highlights' in h_doc:
                for h in h_doc['highlights']:
                    if 'preview_image_url' in h and h['preview_image_url']:
                        h['preview_image_url'] = S3Service.fix_s3_url_region(h['preview_image_url'])
        return jsonify(cached_data), 200
    
    # Cache miss - search MongoDB
    logger.debug(f"[SEARCH] Searching highlights for query: '{query}' in project {project_id}")
    
    # Search web highlights
    web_results = HighlightModel.search_highlights(
        user_id=user_id,
        project_id=project_id,
        query=query,
        limit=limit
    )
    
    # Search PDF highlights
    pdf_results = PDFDocumentModel.search_highlights(
        user_id=user_id,
        project_id=project_id,
        query=query,
        limit=limit
    )
    
    # Combine results (we want up to limit total sources, not limit per type)
    # Sort by updated_at descending
    all_results = web_results + pdf_results
    all_results.sort(key=lambda x: x.get('updated_at') or datetime.min, reverse=True)
    all_results = all_results[:limit]
    
    # Convert ObjectId to string and fix URLs
    for h_doc in all_results:
        if '_id' in h_doc:
            h_doc['_id'] = str(h_doc['_id'])
        if 'highlights' in h_doc:
            for h in h_doc['highlights']:
                if 'preview_image_url' in h and h['preview_image_url']:
                    h['preview_image_url'] = S3Service.fix_s3_url_region(h['preview_image_url'])
    
    response_data = {'highlights': all_results}
    
    # Cache the result with short TTL (30 seconds for search results)
    redis_service.set(cache_key, response_data, ttl=30)
    logger.debug(f"[REDIS] search_highlights: Cached {len(all_results)} results for query: {query}")
    
    return jsonify(response_data), 200


@highlight_bp.route('', methods=['DELETE'])
@limiter.limit("20 per minute") if limiter else lambda f: f
def delete_highlight():
    """
    Delete a specific highlight.
    
    Body: {
        project_id: string (required),
        source_url: string (required),
        highlight_id: string (required)
    }
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validate required fields
    required_fields = ['project_id', 'source_url', 'highlight_id']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    project_id = data['project_id']
    source_url = data['source_url']
    highlight_id = data['highlight_id']
    
    # Log auth info for Chrome extension
    log_auth_info(project_id)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Delete highlight
    success = HighlightModel.delete_highlight(
        user_id=user_id,
        project_id=project_id,
        source_url=source_url,
        highlight_id=highlight_id
    )
    
    if success:
        # Invalidate cache
        redis_service = get_redis_service()
        redis_service.delete(f"cache:highlights:{user_id}:{project_id}")
        redis_service.delete(f"cache:highlights:{user_id}:{project_id}:{source_url}")
        logger.debug(f"[REDIS] Invalidating cache: cache:highlights:{user_id}:{project_id}")
        logger.debug(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'success': True,
            'message': 'Highlight deleted successfully'
        }), 200
    else:
        return jsonify({'error': 'Highlight not found'}), 404


@highlight_bp.route('/archive', methods=['PUT'])
@limiter.limit("20 per minute") if limiter else lambda f: f
def archive_highlight():
    """
    Archive a web highlight document.
    
    Body: {
        project_id: string (required),
        source_url: string (required)
    }
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validate required fields
    required_fields = ['project_id', 'source_url']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    project_id = data['project_id']
    source_url = data['source_url']
    
    # Log auth info for Chrome extension
    log_auth_info(project_id)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Archive highlight
    success = HighlightModel.archive_highlight(
        user_id=user_id,
        project_id=project_id,
        source_url=source_url
    )
    
    if success:
        # Invalidate cache
        redis_service = get_redis_service()
        redis_service.delete(f"cache:highlights:{user_id}:{project_id}")
        redis_service.delete(f"cache:highlights:{user_id}:{project_id}:{source_url}")
        logger.debug(f"[REDIS] Invalidating cache: cache:highlights:{user_id}:{project_id}")
        logger.debug(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'success': True,
            'message': 'Highlight archived successfully'
        }), 200
    else:
        return jsonify({'error': 'Highlight not found'}), 404


@highlight_bp.route('/unarchive', methods=['PUT'])
@limiter.limit("20 per minute") if limiter else lambda f: f
def unarchive_highlight():
    """
    Unarchive a web highlight document.
    
    Body: {
        project_id: string (required),
        source_url: string (required)
    }
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validate required fields
    required_fields = ['project_id', 'source_url']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    project_id = data['project_id']
    source_url = data['source_url']
    
    # Log auth info for Chrome extension
    log_auth_info(project_id)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Unarchive highlight
    success = HighlightModel.unarchive_highlight(
        user_id=user_id,
        project_id=project_id,
        source_url=source_url
    )
    
    if success:
        # Invalidate cache
        redis_service = get_redis_service()
        redis_service.delete(f"cache:highlights:{user_id}:{project_id}")
        redis_service.delete(f"cache:highlights:{user_id}:{project_id}:{source_url}")
        logger.debug(f"[REDIS] Invalidating cache: cache:highlights:{user_id}:{project_id}")
        logger.debug(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'success': True,
            'message': 'Highlight unarchived successfully'
        }), 200
    else:
        return jsonify({'error': 'Highlight not found'}), 404


@highlight_bp.route('/source', methods=['DELETE'])
@limiter.limit("20 per minute") if limiter else lambda f: f
def delete_source():
    """
    Delete an entire source document and all its highlights from the database.
    
    Body: {
        project_id: string (required),
        source_url: string (required)
    }
    
    Returns: { success: true, message: string }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Validate required fields
    required_fields = ['project_id', 'source_url']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    project_id = data['project_id']
    source_url = data['source_url']
    
    # Log auth info for Chrome extension
    log_auth_info(project_id)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Delete source and all highlights
    success = HighlightModel.delete_source(
        user_id=user_id,
        project_id=project_id,
        source_url=source_url
    )
    
    if success:
        # Invalidate cache
        redis_service = get_redis_service()
        redis_service.delete(f"cache:highlights:{user_id}:{project_id}")
        redis_service.delete(f"cache:highlights:{user_id}:{project_id}:{source_url}")
        logger.debug(f"[REDIS] Invalidating cache: cache:highlights:{user_id}:{project_id}")
        logger.debug(f"[REDIS] Cache invalidated successfully")
        
        return jsonify({
            'success': True,
            'message': 'Source and all highlights deleted successfully'
        }), 200
    else:
        return jsonify({'error': 'Source not found'}), 404


@highlight_bp.route('/preview/<highlight_id>', methods=['GET'])
@limiter.limit("60 per minute") if limiter else lambda f: f
def get_highlight_preview(highlight_id):
    """
    Return preview image URL for a specific web highlight.
    
    Query params:
        project_id: string (required)
        source_url: string (required)
    
    Returns: { preview_image_url: string } or { error: 'No preview available' }
    """
    logger.debug(f"[PREVIEW] Fetching preview for highlight_id: {highlight_id}")
    
    user_id = get_user_id_from_token()
    if not user_id:
        logger.debug(f"[PREVIEW] ERROR: Unauthorized - no user_id from token")
        return jsonify({'error': 'Unauthorized'}), 401
    
    logger.debug(f"[PREVIEW] User ID: {user_id}")
    
    project_id = request.args.get('project_id')
    source_url = request.args.get('source_url')
    
    logger.debug(f"[PREVIEW] Project ID: {project_id}, Source URL: {source_url}")
    
    if not project_id or not source_url:
        logger.debug(f"[PREVIEW] ERROR: Missing required params - project_id: {project_id}, source_url: {source_url}")
        return jsonify({'error': 'project_id and source_url required'}), 400
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        logger.debug(f"[PREVIEW] ERROR: Project not found or access denied - project exists: {project is not None}")
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Get highlights for this URL
    highlight_doc = HighlightModel.get_highlights_by_url(user_id, project_id, source_url)
    if not highlight_doc:
        logger.debug(f"[PREVIEW] ERROR: No highlight document found for URL: {source_url}")
        return jsonify({'error': 'Not found'}), 404
    
    logger.debug(f"[PREVIEW] Found highlight doc with {len(highlight_doc.get('highlights', []))} highlights")
    
    # Find the specific highlight
    for h in highlight_doc.get('highlights', []):
        logger.debug(f"[PREVIEW] Checking highlight: {h.get('highlight_id')} - has preview_image_url: {h.get('preview_image_url') is not None}")
        if h.get('highlight_id') == highlight_id:
            # Only return S3 URL - no fallback to base64
            preview_url = h.get('preview_image_url')
            if preview_url:
                # Fix URL region if needed
                preview_url = S3Service.fix_s3_url_region(preview_url)
                logger.debug(f"[PREVIEW] SUCCESS: Found preview URL: {preview_url}")
                return jsonify({'preview_image_url': preview_url})
            
            logger.debug(f"[PREVIEW] ERROR: Highlight found but no preview_image_url field. Keys in highlight: {list(h.keys())}")
            return jsonify({'error': 'No preview available', 'reason': 'preview_image_url field is missing or empty'}), 404
    
    logger.debug(f"[PREVIEW] ERROR: Highlight ID {highlight_id} not found in document")
    return jsonify({'error': 'Highlight not found'}), 404
