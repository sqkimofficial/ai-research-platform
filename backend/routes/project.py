from flask import Blueprint, request, jsonify
from models.database import ProjectModel
from utils.auth import verify_token

project_bp = Blueprint('project', __name__)

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

@project_bp.route('', methods=['POST'])
def create_project():
    """Create a new project"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        project_name = data.get('project_name')
        description = data.get('description')
        
        if not project_name:
            return jsonify({'error': 'project_name is required'}), 400
        
        project_id = ProjectModel.create_project(user_id, project_name, description)
        return jsonify({
            'project_id': project_id,
            'project_name': project_name,
            'message': 'Project created successfully'
        }), 201
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@project_bp.route('', methods=['GET'])
def get_projects():
    """Get all projects for user or a specific project"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        project_id = request.args.get('project_id')
        
        if project_id:
            # Get specific project
            project = ProjectModel.get_project(project_id)
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            # Verify user owns this project
            if project['user_id'] != user_id:
                return jsonify({'error': 'Unauthorized'}), 403
            
            # Serialize project
            serialized_project = {
                'project_id': project['project_id'],
                'project_name': project['project_name'],
                'description': project.get('description'),
                'created_at': project['created_at'].isoformat(),
                'updated_at': project['updated_at'].isoformat()
            }
            
            return jsonify(serialized_project), 200
        else:
            # Get all projects for user
            projects = ProjectModel.get_all_projects(user_id)
            projects_list = []
            for project in projects:
                projects_list.append({
                    'project_id': project['project_id'],
                    'project_name': project['project_name'],
                    'description': project.get('description'),
                    'created_at': project['created_at'].isoformat(),
                    'updated_at': project['updated_at'].isoformat()
                })
            
            return jsonify({'projects': projects_list}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@project_bp.route('', methods=['PUT'])
def update_project():
    """Update a project"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        project_id = data.get('project_id')
        project_name = data.get('project_name')
        description = data.get('description')
        
        if not project_id:
            return jsonify({'error': 'project_id is required'}), 400
        
        # Verify project exists and belongs to user
        project = ProjectModel.get_project(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        if project['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Update project
        success = ProjectModel.update_project(project_id, project_name, description)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Project updated successfully'
            }), 200
        else:
            return jsonify({'error': 'Failed to update project'}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@project_bp.route('', methods=['DELETE'])
def delete_project():
    """Delete a project"""
    try:
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        data = request.get_json()
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({'error': 'project_id is required'}), 400
        
        # Verify project exists and belongs to user
        project = ProjectModel.get_project(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404
        
        if project['user_id'] != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Delete project
        success = ProjectModel.delete_project(project_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Project deleted successfully'
            }), 200
        else:
            return jsonify({'error': 'Failed to delete project'}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

