from flask import Blueprint, request, jsonify
from models.database import HighlightModel, ProjectModel
from utils.auth import get_user_id_from_token, log_auth_info

highlight_bp = Blueprint('highlight', __name__)


@highlight_bp.route('', methods=['POST'])
def save_highlight():
    """
    Save a highlight from Chrome extension.
    
    Body: {
        project_id: string (required),
        source_url: string (required),
        page_title: string (required),
        text: string (required),
        note: string (optional),
        tags: [string] (optional)
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
    
    # Log auth info for Chrome extension
    log_auth_info(project_id)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
    # Save highlight
    highlight_id = HighlightModel.save_highlight(
        user_id=user_id,
        project_id=project_id,
        source_url=source_url,
        page_title=page_title,
        highlight_text=text,
        note=note,
        tags=tags
    )
    
    print(f"Highlight saved: {highlight_id} for project {project_id}")
    
    return jsonify({
        'success': True,
        'highlight_id': highlight_id,
        'message': 'Highlight saved successfully'
    }), 201


@highlight_bp.route('', methods=['GET'])
def get_highlights():
    """
    Get highlights with optional filters.
    
    Query params:
        project_id: string (required)
        source_url: string (optional)
    
    Returns: { highlights: [...] }
    """
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    
    project_id = request.args.get('project_id')
    source_url = request.args.get('source_url')
    
    if not project_id:
        return jsonify({'error': 'project_id is required'}), 400
    
    # Log auth info for Chrome extension
    log_auth_info(project_id)
    
    # Validate project belongs to user
    project = ProjectModel.get_project(project_id)
    if not project or project.get('user_id') != user_id:
        return jsonify({'error': 'Project not found or access denied'}), 404
    
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
        # Get all highlights for project
        highlights = HighlightModel.get_highlights_by_project(
            user_id=user_id,
            project_id=project_id
        )
    
    # Convert ObjectId to string for JSON serialization
    for h in highlights:
        if '_id' in h:
            h['_id'] = str(h['_id'])
    
    return jsonify({'highlights': highlights}), 200


@highlight_bp.route('', methods=['DELETE'])
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
        return jsonify({
            'success': True,
            'message': 'Highlight deleted successfully'
        }), 200
    else:
        return jsonify({'error': 'Highlight not found'}), 404
