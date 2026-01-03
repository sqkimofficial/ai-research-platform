from flask import Blueprint, request, jsonify
from models.database import UserModel
from utils.auth import hash_password, verify_password, generate_token

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        # Check if user already exists
        existing_user = UserModel.get_user_by_username(username)
        if existing_user:
            return jsonify({'error': 'Username already exists'}), 400
        
        # Create user
        password_hash = hash_password(password)
        user_id = UserModel.create_user(username, password_hash, first_name, last_name)
        
        if not user_id:
            return jsonify({'error': 'Failed to create user'}), 500
        
        return jsonify({
            'user_id': user_id,
            'username': username,
            'first_name': first_name,
            'last_name': last_name,
            'message': 'User registered successfully'
        }), 201
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login a user"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        # Get user
        user = UserModel.get_user_by_username(username)
        if not user:
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Verify password
        if not verify_password(password, user['password_hash']):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Generate token
        token = generate_token(user['user_id'])
        
        return jsonify({
            'token': token,
            'user_id': user['user_id'],
            'username': user['username'],
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name')
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


