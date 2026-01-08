"""
Rate limiting service using Flask-Limiter with Redis backend.

Provides rate limiting functionality across all API endpoints to prevent abuse,
control costs (especially for AI chat), and ensure fair resource usage.
"""
from flask import request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from config import Config
from utils.logger import get_logger
from utils.auth import get_user_id_from_token

logger = get_logger(__name__)

# Global limiter instance
_limiter = None


def get_rate_limit_key():
    """
    Get rate limit key for the current request.
    
    For authenticated requests: uses user_id from token
    For unauthenticated requests: uses IP address
    
    Returns:
        str: Rate limit key (user_id or IP address)
    """
    # Try to get user_id from token first (authenticated requests)
    user_id = get_user_id_from_token()
    if user_id:
        return f"user:{user_id}"
    
    # Fallback to IP address for unauthenticated requests
    return f"ip:{get_remote_address()}"


def init_rate_limiter(app):
    """
    Initialize Flask-Limiter with Redis backend.
    
    Args:
        app: Flask application instance
        
    Returns:
        Limiter: Initialized limiter instance
    """
    global _limiter
    
    if not Config.RATE_LIMIT_ENABLED:
        logger.info("[RATE_LIMIT] Rate limiting is disabled")
        return None
    
    try:
        # Build Redis connection URL for Flask-Limiter
        # Flask-Limiter expects format: redis://[:password@]host:port/db
        redis_url = f"redis://"
        if Config.REDIS_PASSWORD:
            redis_url += f":{Config.REDIS_PASSWORD}@"
        redis_url += f"{Config.REDIS_HOST}:{Config.REDIS_PORT}/{Config.REDIS_DB}"
        
        # Initialize limiter with Redis storage
        _limiter = Limiter(
            app=app,
            key_func=get_rate_limit_key,
            storage_uri=redis_url,
            default_limits=[f"{Config.RATE_LIMIT_DEFAULT_PER_MINUTE} per minute"],
            strategy=Config.RATE_LIMIT_STRATEGY,
            headers_enabled=True,  # Include rate limit headers in responses
            on_breach=_handle_rate_limit_breach
        )
        
        logger.info(f"[RATE_LIMIT] Rate limiting initialized with Redis: {Config.REDIS_HOST}:{Config.REDIS_PORT}")
        logger.info(f"[RATE_LIMIT] Default limit: {Config.RATE_LIMIT_DEFAULT_PER_MINUTE} requests/minute")
        logger.info(f"[RATE_LIMIT] Strategy: {Config.RATE_LIMIT_STRATEGY}")
        
        return _limiter
        
    except Exception as e:
        logger.warning(f"[RATE_LIMIT] Failed to initialize rate limiter: {e}")
        logger.warning("[RATE_LIMIT] Rate limiting disabled - allowing all requests (fail open)")
        return None


def get_limiter():
    """
    Get the global limiter instance.
    
    Returns:
        Limiter: Global limiter instance or None if not initialized
    """
    return _limiter


def _handle_rate_limit_breach(request_limit):
    """
    Handle rate limit breach - log security event.
    
    Args:
        request_limit: The limit that was breached
    """
    from utils.logger import log_security_event
    
    user_id = get_user_id_from_token()
    identifier = f"user:{user_id}" if user_id else f"ip:{get_remote_address()}"
    
    log_security_event(
        logger,
        'rate_limit_exceeded',
        f"Rate limit exceeded for {identifier} on {request.path}",
        severity='WARNING',
        endpoint=request.path,
        method=request.method,
        identifier=identifier,
        limit=str(request_limit)
    )


def create_limit_string(per_minute=None, per_hour=None, per_day=None):
    """
    Create a rate limit string for Flask-Limiter decorator.
    
    Args:
        per_minute: Requests per minute
        per_hour: Requests per hour
        per_day: Requests per day
        
    Returns:
        str: Rate limit string (e.g., "10 per minute, 100 per hour")
    """
    limits = []
    if per_minute:
        limits.append(f"{per_minute} per minute")
    if per_hour:
        limits.append(f"{per_hour} per hour")
    if per_day:
        limits.append(f"{per_day} per day")
    
    if not limits:
        return None
    
    return ", ".join(limits)


def limit(limit_string, key_func=None):
    """
    Apply rate limit decorator if limiter is available, otherwise no-op.
    
    Args:
        limit_string: Rate limit string (e.g., "10 per minute")
        key_func: Optional key function for rate limiting
        
    Returns:
        Decorator function
    """
    limiter_instance = get_limiter()
    if limiter_instance:
        if key_func:
            return limiter_instance.limit(limit_string, key_func=key_func)
        return limiter_instance.limit(limit_string)
    # Return no-op decorator if limiter is not available
    return lambda f: f

