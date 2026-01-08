"""
Authentication routes with embedded login support.

Provides:
- /login - Email/password login via Auth0 Authentication API
- /register - Create user in Auth0 and local database
- /sync - Sync OAuth users (Google/Apple) to local database
- /me - Get current user info
- /verify - Verify token validity
"""

import requests
from flask import Blueprint, request, jsonify
from models.database import UserModel
from utils.auth0_validator import validate_token, fetch_user_profile, Auth0Error
from config import Config
from utils.logger import get_logger, log_error

logger = get_logger(__name__)

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user with email/password via Auth0.
    
    Body: {
        email: string (required),
        password: string (required),
        first_name: string (optional),
        last_name: string (optional)
    }
    
    Returns: {
        user_id: string,
        email: string,
        message: string
    }
    """
    try:
        data = request.get_json()
        email = data.get('email') or data.get('username')  # Support both
        password = data.get('password')
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Create user in Auth0
        auth0_signup_url = f'https://{Config.AUTH0_DOMAIN}/dbconnections/signup'
        
        signup_response = requests.post(
            auth0_signup_url,
            json={
                'client_id': Config.AUTH0_CLIENT_ID,
                'connection': 'Username-Password-Authentication',
                'email': email,
                'password': password,
                'name': f'{first_name or ""} {last_name or ""}'.strip() or email,
                'given_name': first_name,
                'family_name': last_name
            },
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if signup_response.status_code == 200:
            auth0_user = signup_response.json()
            auth0_id = f"auth0|{auth0_user.get('_id')}"
            
            # Create/update user in local database
            user = UserModel.create_or_update_auth0_user(
                auth0_id=auth0_id,
                email=email,
                first_name=first_name,
                last_name=last_name,
                email_verified=False,
                auth_provider='email'
            )
            
            return jsonify({
                'user_id': user['user_id'],
                'email': email,
                'first_name': first_name,
                'last_name': last_name,
                'message': 'User registered successfully'
            }), 201
            
        else:
            error_data = signup_response.json()
            error_msg = error_data.get('description') or error_data.get('message') or 'Registration failed'
            
            # Handle specific Auth0 errors
            if 'already exists' in error_msg.lower() or error_data.get('code') == 'user_exists':
                return jsonify({'error': 'An account with this email already exists'}), 400
            if 'password' in error_msg.lower():
                return jsonify({'error': error_msg}), 400
                
            return jsonify({'error': error_msg}), 400
            
    except requests.RequestException as e:
        log_error(logger, e, "Auth0 request error during registration")
        return jsonify({'error': 'Failed to connect to authentication service'}), 500
    except Exception as e:
        log_error(logger, e, "Registration error")
        return jsonify({'error': 'Registration failed'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login with email/password via Auth0.
    
    Body: {
        email: string (required),
        password: string (required)
    }
    
    Returns: {
        token: string (access_token),
        user_id: string,
        email: string,
        first_name: string,
        last_name: string
    }
    """
    try:
        data = request.get_json()
        email = data.get('email') or data.get('username')  # Support both
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Authenticate with Auth0
        auth0_token_url = f'https://{Config.AUTH0_DOMAIN}/oauth/token'
        
        token_response = requests.post(
            auth0_token_url,
            json={
                'grant_type': 'http://auth0.com/oauth/grant-type/password-realm',
                'client_id': Config.AUTH0_CLIENT_ID,
                'client_secret': Config.AUTH0_CLIENT_SECRET,
                'username': email,
                'password': password,
                'audience': Config.AUTH0_API_AUDIENCE,
                'scope': 'openid profile email',
                'realm': 'Username-Password-Authentication'  # Auth0 database connection name
            },
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        logger.debug(f"Auth0 login response status: {token_response.status_code}")
        if Config.IS_DEVELOPMENT:
            logger.debug(f"Auth0 login response: {token_response.text}")
        
        if token_response.status_code == 200:
            token_data = token_response.json()
            access_token = token_data.get('access_token')
            
            # Validate and get user info
            try:
                payload = validate_token(access_token)
                auth0_id = payload.get('sub')
                
                # Fetch user profile from Auth0
                user_info = fetch_user_profile(access_token)
                
                # Sync to local database
                user = UserModel.create_or_update_auth0_user(
                    auth0_id=auth0_id,
                    email=user_info.get('email', email),
                    first_name=user_info.get('given_name'),
                    last_name=user_info.get('family_name'),
                    picture=user_info.get('picture'),
                    email_verified=user_info.get('email_verified', False),
                    auth_provider='email'
                )
                
                return jsonify({
                    'token': access_token,
                    'user_id': user['user_id'],
                    'email': user.get('email'),
                    'first_name': user.get('first_name'),
                    'last_name': user.get('last_name'),
                    'username': user.get('email')  # For compatibility
                }), 200
                
            except Auth0Error as e:
                log_error(logger, e, "Token validation error during login")
                return jsonify({'error': 'Authentication failed'}), 401
                
        else:
            error_data = token_response.json()
            error_msg = error_data.get('error_description') or error_data.get('error') or 'Invalid credentials'
            logger.warning(f"Auth0 login error: {error_msg}")
            
            # Make error messages user-friendly
            if 'wrong email or password' in error_msg.lower() or 'invalid' in error_msg.lower():
                return jsonify({'error': 'Invalid email or password'}), 401
            if 'blocked' in error_msg.lower():
                return jsonify({'error': 'Account is blocked. Please contact support.'}), 401
            if 'grant' in error_msg.lower():
                return jsonify({'error': f'Auth0 error: {error_msg}. Please enable Password grant in Auth0 Dashboard.'}), 401
                
            return jsonify({'error': f'Auth0: {error_msg}'}), 401
            
    except requests.RequestException as e:
        log_error(logger, e, "Auth0 request error during login")
        return jsonify({'error': 'Failed to connect to authentication service'}), 500
    except Exception as e:
        log_error(logger, e, "Login error")
        return jsonify({'error': 'Login failed'}), 500


@auth_bp.route('/sync', methods=['POST'])
def sync_auth0_user():
    """
    Sync OAuth user (Google/Apple) to local database.
    Called after Auth0 social login redirect.
    
    Headers:
        Authorization: Bearer <auth0_access_token>
    
    Returns: User data
    """
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({'error': 'No authorization header'}), 401
    
    try:
        token = auth_header.split(' ')[1]
    except IndexError:
        return jsonify({'error': 'Invalid authorization header format'}), 401
    
    try:
        payload = validate_token(token)
        auth0_id = payload.get('sub')
        
        if not auth0_id:
            return jsonify({'error': 'Invalid token: missing sub claim'}), 401
        
        # Fetch complete user profile from Auth0
        user_info = fetch_user_profile(token)
        
        email = user_info.get('email')
        first_name = user_info.get('given_name') or user_info.get('name', '').split(' ')[0]
        last_name = user_info.get('family_name') or (
            ' '.join(user_info.get('name', '').split(' ')[1:]) if user_info.get('name') else None
        )
        picture = user_info.get('picture')
        email_verified = user_info.get('email_verified', False)
        
        # Determine auth provider
        auth_provider = 'auth0'
        if '|' in auth0_id:
            provider_part = auth0_id.split('|')[0]
            if provider_part == 'google-oauth2':
                auth_provider = 'google'
            elif provider_part == 'apple':
                auth_provider = 'apple'
            elif provider_part == 'auth0':
                auth_provider = 'email'
        
        existing_user = UserModel.get_user_by_auth0_id(auth0_id)
        is_new_user = existing_user is None
        
        user = UserModel.create_or_update_auth0_user(
            auth0_id=auth0_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
            picture=picture,
            email_verified=email_verified,
            auth_provider=auth_provider
        )
        
        return jsonify({
            'user_id': user['user_id'],
            'email': user.get('email'),
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
            'picture': user.get('picture'),
            'auth_provider': user.get('auth_provider'),
            'is_new_user': is_new_user,
            'message': 'User synced successfully'
        }), 200
        
    except Auth0Error as e:
        return jsonify({'error': f'Auth0 error: {str(e)}'}), 401
    except Exception as e:
        log_error(logger, e, "Error syncing user")
        return jsonify({'error': 'Failed to sync user'}), 500


@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    """Get current authenticated user's information."""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({'error': 'No authorization header'}), 401
    
    try:
        token = auth_header.split(' ')[1]
        payload = validate_token(token)
        auth0_id = payload.get('sub')
        
        if not auth0_id:
            return jsonify({'error': 'Invalid token'}), 401
        
        user = UserModel.get_user_by_auth0_id(auth0_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'user_id': user['user_id'],
            'email': user.get('email'),
            'first_name': user.get('first_name'),
            'last_name': user.get('last_name'),
            'picture': user.get('picture'),
            'auth_provider': user.get('auth_provider')
        }), 200
        
    except Auth0Error as e:
        return jsonify({'error': str(e)}), 401
    except Exception as e:
        return jsonify({'error': 'Failed to get user'}), 500


@auth_bp.route('/verify', methods=['GET'])
def verify_token_endpoint():
    """Verify that the current token is valid."""
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({'valid': False, 'error': 'No authorization header'}), 401
    
    try:
        token = auth_header.split(' ')[1]
        payload = validate_token(token)
        return jsonify({
            'valid': True,
            'auth0_id': payload.get('sub')
        }), 200
    except Auth0Error as e:
        return jsonify({'valid': False, 'error': str(e)}), 401
    except Exception:
        return jsonify({'valid': False, 'error': 'Token validation failed'}), 401
