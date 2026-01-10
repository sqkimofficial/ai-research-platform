"""
Structured logging utility with sanitization and environment-aware configuration.

This module provides:
- Structured logging with JSON formatting for production
- Human-readable formatting for development
- Automatic sanitization of sensitive data
- File rotation and console logging
- Security event logging
"""

import os
import json
import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, Optional
from flask import request, g

# Import Config for environment awareness
from config import Config


def sanitize_data(data: Any) -> Any:
    """
    Remove or mask sensitive information from log data.
    
    Recursively processes dictionaries and lists to find and sanitize
    sensitive fields like passwords, tokens, API keys, etc.
    
    Args:
        data: The data to sanitize (dict, list, str, or other)
        
    Returns:
        Sanitized version of the data
    """
    if isinstance(data, dict):
        sanitized = {}
        for key, value in data.items():
            # Check if key indicates sensitive data
            key_lower = str(key).lower()
            if any(sensitive in key_lower for sensitive in [
                'password', 'token', 'secret', 'api_key', 'access_token',
                'refresh_token', 'authorization', 'auth', 'credential',
                'private_key', 'secret_key', 'api_secret', 'client_secret',
                'credit_card', 'card_number', 'cvv', 'ssn', 'social_security'
            ]):
                # Mask sensitive values
                if isinstance(value, str) and len(value) > 8:
                    sanitized[key] = f"{value[:8]}...{value[-4:]}" if len(value) > 12 else f"{value[:8]}..."
                elif isinstance(value, str):
                    sanitized[key] = "***"
                else:
                    sanitized[key] = "***"
            else:
                # Recursively sanitize nested structures
                sanitized[key] = sanitize_data(value)
        return sanitized
    
    elif isinstance(data, list):
        return [sanitize_data(item) for item in data]
    
    elif isinstance(data, str):
        # Check for patterns that might be tokens or secrets
        # JWT tokens (three base64url-encoded parts separated by dots)
        # Pattern: base64url.base64url.base64url (JWT format)
        jwt_pattern = r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'
        matches = re.finditer(jwt_pattern, data)
        for match in matches:
            token = match.group(0)
            # Only treat as JWT if it's reasonably long (JWT tokens are typically 100+ chars)
            if len(token) > 50:
                parts = token.split('.')
                if len(parts) == 3:  # JWT has exactly 3 parts
                    return data.replace(token, f"{parts[0][:8]}...{parts[-1][-4:]}")
        
        # Long alphanumeric strings that might be API keys
        if len(data) > 32 and re.match(r'^[A-Za-z0-9_-]+$', data):
            return f"{data[:8]}...{data[-4:]}"
        
        return data
    
    return data


def get_request_context(skip_user_lookup: bool = False) -> Dict[str, Any]:
    """
    Get request context information for logging.
    
    Args:
        skip_user_lookup: If True, skip getting user_id from token
                         (prevents circular dependency when called from auth logging)
    
    Returns:
        Dictionary with request context (user_id, IP, endpoint, method, request_id)
    """
    context = {}
    
    try:
        if request:
            context['method'] = request.method
            context['endpoint'] = request.endpoint or request.path
            context['ip'] = request.remote_addr
            context['user_agent'] = request.headers.get('User-Agent', 'Unknown')
    except RuntimeError:
        # Outside of request context
        pass
    
    # Get request ID if available (from Phase 4, but prepare for it)
    try:
        if hasattr(g, 'request_id'):
            context['request_id'] = g.request_id
    except RuntimeError:
        pass
    
    # Get user_id if available from token (skip if called from auth code to prevent recursion)
    if not skip_user_lookup:
        try:
            from utils.auth import get_user_id_from_token
            user_id = get_user_id_from_token()
            if user_id:
                context['user_id'] = user_id
        except Exception:
            # Silently fail if token validation fails (prevents circular logging)
            pass
    
    return context


class ContextFilter(logging.Filter):
    """Filter to add request context to log records."""
    
    def filter(self, record):
        """Add request context to log record."""
        # Skip user lookup in filter to prevent circular dependency during auth failures
        # The user_id will be added elsewhere if available
        context = get_request_context(skip_user_lookup=True)
        for key, value in context.items():
            setattr(record, key, value)
        # Set default values for formatter fields that might not exist
        if not hasattr(record, 'ip'):
            record.ip = 'N/A'
        if not hasattr(record, 'endpoint'):
            record.endpoint = 'N/A'
        if not hasattr(record, 'method'):
            record.method = 'N/A'
        return True


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging in production."""
    
    def format(self, record):
        """Format log record as JSON."""
        log_data = {
            'timestamp': self.formatTime(record, self.datefmt),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        
        # Add request context (skip user lookup to prevent circular dependency)
        # user_id will be added via extra fields if available
        context = get_request_context(skip_user_lookup=True)
        if context:
            log_data['context'] = context
        
        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        
        # Add extra fields
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'created', 'filename', 'funcName',
                          'levelname', 'levelno', 'lineno', 'module', 'msecs',
                          'message', 'pathname', 'process', 'processName', 'relativeCreated',
                          'thread', 'threadName', 'exc_info', 'exc_text', 'stack_info']:
                log_data[key] = sanitize_data(value)
        
        return json.dumps(log_data, default=str)


def get_logger(name: str = __name__) -> logging.Logger:
    """
    Get a configured logger instance.
    
    Args:
        name: Logger name (typically __name__ of the calling module)
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    
    # Avoid duplicate handlers
    if logger.handlers:
        return logger
    
    # Set log level based on environment
    if Config.IS_PRODUCTION:
        logger.setLevel(logging.INFO)
    else:
        logger.setLevel(logging.DEBUG)
    
    # Create logs directory if it doesn't exist
    logs_dir = Path(__file__).parent.parent / 'logs'
    logs_dir.mkdir(exist_ok=True)
    
    # File handler with rotation
    log_file = logs_dir / 'app.log'
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=10,
        encoding='utf-8'
    )
    
    # Console handler
    console_handler = logging.StreamHandler()
    
    # Set formatters based on environment
    if Config.IS_PRODUCTION:
        # JSON formatting for production (easier parsing by log aggregation tools)
        file_formatter = JSONFormatter()
        console_formatter = JSONFormatter()  # Also JSON in console for production
    else:
        # Human-readable formatting for development
        # Use a custom formatter that handles missing attributes gracefully
        class SafeFormatter(logging.Formatter):
            def format(self, record):
                # Ensure required attributes exist
                if not hasattr(record, 'ip'):
                    record.ip = 'N/A'
                if not hasattr(record, 'endpoint'):
                    record.endpoint = 'N/A'
                if not hasattr(record, 'method'):
                    record.method = 'N/A'
                return super().format(record)
        
        file_formatter = SafeFormatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s - '
            '[%(ip)s] [%(endpoint)s] [%(method)s]'
        )
        console_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    file_handler.setFormatter(file_formatter)
    console_handler.setFormatter(console_formatter)
    
    # Set log levels for handlers
    if Config.IS_PRODUCTION:
        file_handler.setLevel(logging.INFO)
        console_handler.setLevel(logging.INFO)
    else:
        file_handler.setLevel(logging.DEBUG)
        console_handler.setLevel(logging.DEBUG)
    
    # Add context filter
    context_filter = ContextFilter()
    file_handler.addFilter(context_filter)
    console_handler.addFilter(context_filter)
    
    # Add handlers to logger
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger


def log_request(logger: logging.Logger, endpoint: Optional[str] = None, 
                method: Optional[str] = None, **kwargs):
    """
    Log a request with context.
    
    Args:
        logger: Logger instance
        endpoint: Endpoint name (optional, will be extracted from request if not provided)
        method: HTTP method (optional, will be extracted from request if not provided)
        **kwargs: Additional context to log
    """
    context = get_request_context()
    if endpoint:
        context['endpoint'] = endpoint
    if method:
        context['method'] = method
    
    # Sanitize additional kwargs
    sanitized_kwargs = sanitize_data(kwargs)
    context.update(sanitized_kwargs)
    
    logger.info(f"Request: {context.get('method', 'UNKNOWN')} {context.get('endpoint', 'UNKNOWN')}", 
                extra=context)


def log_error(logger: logging.Logger, error: Exception, 
              message: Optional[str] = None, **kwargs):
    """
    Log an error with context and exception details.
    
    Args:
        logger: Logger instance
        error: Exception object
        message: Custom error message
        **kwargs: Additional context to log
    """
    context = get_request_context()
    sanitized_kwargs = sanitize_data(kwargs)
    context.update(sanitized_kwargs)
    
    error_msg = message or str(error)
    logger.error(f"Error: {error_msg}", exc_info=error, extra=context)


def log_security_event(logger: logging.Logger, event_type: str, 
                      message: str, severity: str = 'WARNING', **kwargs):
    """
    Log a security event with enhanced context.
    
    Args:
        logger: Logger instance
        event_type: Type of security event (e.g., 'failed_login', 'token_validation_failure')
        message: Event message
        severity: Log level ('WARNING', 'ERROR', 'CRITICAL')
        **kwargs: Additional context to log
    """
    # Use skip_user_lookup=True to prevent circular dependency when logging auth failures
    # This prevents get_user_id_from_token() -> log_security_event() -> get_request_context() -> get_user_id_from_token() recursion
    context = get_request_context(skip_user_lookup=True)
    sanitized_kwargs = sanitize_data(kwargs)
    context.update(sanitized_kwargs)
    context['security_event_type'] = event_type
    
    log_level = getattr(logging, severity.upper(), logging.WARNING)
    logger.log(log_level, f"[SECURITY] {event_type}: {message}", extra=context)


# Create default logger instance
logger = get_logger(__name__)

