"""
Authentication utilities for Auth0 integration.

This module handles Auth0 token validation and user identification.
All authentication now goes through Auth0.
"""

import os
import sys
from flask import request

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from utils.auth0_validator import validate_token, fetch_user_profile, Auth0Error
from models.database import UserModel


def get_token_from_header():
    """
    Extract the token from the Authorization header.
    
    Returns:
        str: The token string, or None if not present
    """
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    
    try:
        # Expected format: "Bearer <token>"
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == 'bearer':
            return parts[1]
    except Exception:
        pass
    
    return None


def get_user_id_from_token():
    """
    Extract and validate user_id from the Auth0 JWT token in Authorization header.
    
    This function:
    1. Extracts the token from the Authorization header
    2. Validates the token with Auth0
    3. Looks up the user in MongoDB by auth0_id
    4. Returns the internal user_id
    
    Returns:
        str: The internal user_id, or None if authentication fails
    """
    token = get_token_from_header()
    if not token:
        return None
    
    try:
        # Validate token with Auth0
        payload = validate_token(token)
        auth0_id = payload.get('sub')
        
        if not auth0_id:
            print("Auth0 token missing 'sub' claim")
            return None
        
        # Look up user by auth0_id
        user = UserModel.get_user_by_auth0_id(auth0_id)
        
        if user:
            return user.get('user_id')
        
        # User not found - they need to sync first via /api/auth/sync
        print(f"User with auth0_id {auth0_id} not found in database")
        return None
        
    except Auth0Error as e:
        print(f"Auth0 token validation failed: {str(e)}")
        return None
    except Exception as e:
        print(f"Unexpected error in token validation: {str(e)}")
        return None


def get_auth0_user_info():
    """
    Get full Auth0 user information from the current request's token.
    
    Returns:
        dict: User info from Auth0 userinfo endpoint, or None if fails
    """
    token = get_token_from_header()
    if not token:
        return None
    
    try:
        return fetch_user_profile(token)
    except Auth0Error as e:
        print(f"Failed to fetch Auth0 user info: {str(e)}")
        return None


def log_auth_info(project_id=None):
    """
    Log authentication info for debugging (e.g., Chrome extension setup).
    
    Note: With Auth0, users get tokens from the web app after login.
    """
    # Logging disabled
    pass
