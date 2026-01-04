"""
Auth0 JWT Token Validator

Validates Auth0 access tokens using JWKS (JSON Web Key Set).
Fetches signing keys from Auth0 and verifies token signatures.
"""

import json
import requests
from functools import lru_cache
from jose import jwt, JWTError
from urllib.request import urlopen
import os
import sys

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from config import Config


class Auth0Error(Exception):
    """Custom exception for Auth0 validation errors"""
    pass


@lru_cache(maxsize=1)
def get_jwks():
    """
    Fetch and cache JWKS (JSON Web Key Set) from Auth0.
    The keys are cached to avoid repeated network requests.
    """
    jwks_url = f'https://{Config.AUTH0_DOMAIN}/.well-known/jwks.json'
    try:
        response = requests.get(jwks_url, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        raise Auth0Error(f"Failed to fetch JWKS from Auth0: {str(e)}")


def get_signing_key(token):
    """
    Get the signing key for a specific token from JWKS.
    Matches the token's key ID (kid) with the keys from Auth0.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise Auth0Error(f"Invalid token header: {str(e)}")
    
    jwks = get_jwks()
    
    for key in jwks.get('keys', []):
        if key.get('kid') == unverified_header.get('kid'):
            return {
                'kty': key['kty'],
                'kid': key['kid'],
                'use': key['use'],
                'n': key['n'],
                'e': key['e']
            }
    
    raise Auth0Error("Unable to find matching signing key in JWKS")


def validate_token(token):
    """
    Validate an Auth0 access token.
    
    Args:
        token: The JWT access token string
        
    Returns:
        dict: The decoded token payload containing user info
        
    Raises:
        Auth0Error: If token validation fails
    """
    if not token:
        raise Auth0Error("No token provided")
    
    try:
        signing_key = get_signing_key(token)
        
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=Config.AUTH0_ALGORITHMS,
            audience=Config.AUTH0_API_AUDIENCE,
            issuer=Config.AUTH0_ISSUER
        )
        
        return payload
        
    except jwt.ExpiredSignatureError:
        raise Auth0Error("Token has expired")
    except jwt.JWTClaimsError as e:
        raise Auth0Error(f"Invalid token claims: {str(e)}")
    except JWTError as e:
        raise Auth0Error(f"Token validation failed: {str(e)}")


def get_user_info_from_token(token):
    """
    Extract user information from a validated Auth0 token.
    
    Args:
        token: The JWT access token string
        
    Returns:
        dict: User information extracted from the token
              {
                  'auth0_id': 'auth0|...',
                  'email': 'user@example.com',
                  'email_verified': True,
                  ...
              }
    """
    payload = validate_token(token)
    
    # The 'sub' claim contains the Auth0 user ID
    auth0_id = payload.get('sub')
    
    # For access tokens, we may need to fetch user info from Auth0's /userinfo endpoint
    # But the token should have basic claims
    return {
        'auth0_id': auth0_id,
        'scope': payload.get('scope', ''),
        'permissions': payload.get('permissions', []),
    }


def fetch_user_profile(access_token):
    """
    Fetch complete user profile from Auth0's /userinfo endpoint.
    This provides more details than what's in the access token.
    
    Args:
        access_token: The Auth0 access token
        
    Returns:
        dict: Complete user profile from Auth0
    """
    userinfo_url = f'https://{Config.AUTH0_DOMAIN}/userinfo'
    
    try:
        response = requests.get(
            userinfo_url,
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        raise Auth0Error(f"Failed to fetch user profile: {str(e)}")


def clear_jwks_cache():
    """Clear the JWKS cache. Useful if keys have rotated."""
    get_jwks.cache_clear()

