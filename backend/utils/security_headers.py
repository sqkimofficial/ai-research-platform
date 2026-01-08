"""
Security Headers Utility

Provides environment-aware security headers for Flask responses.
Strict in production, relaxed in development.
"""

from config import Config


def get_security_headers():
    """
    Get security headers based on environment.
    
    Returns:
        dict: Dictionary of security headers to add to responses
    """
    headers = {}
    
    if Config.IS_PRODUCTION:
        # Production: Strict security headers
        headers.update(_get_production_headers())
    else:
        # Development: Relaxed headers for easier debugging
        headers.update(_get_development_headers())
    
    return headers


def _get_production_headers():
    """Get strict security headers for production environment."""
    headers = {}
    
    # HSTS (HTTP Strict Transport Security)
    # Only set if using HTTPS (will be set in production)
    # Standard: 1 year max-age, include subdomains, preload
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    
    # CSP (Content Security Policy) - Strict for production
    csp_directives = []
    
    # Get allowed origins for CSP
    allowed_origins = Config.CORS_ALLOWED_ORIGINS
    if allowed_origins:
        # Extract domains from origins (remove http:// or https://)
        domains = [origin.replace('http://', '').replace('https://', '') for origin in allowed_origins]
        # Allow same-origin and production domains
        csp_directives.append(f"default-src 'self' {' '.join(domains)}")
    else:
        csp_directives.append("default-src 'self'")
    
    # Allow Auth0 for authentication
    if Config.AUTH0_DOMAIN:
        auth0_domain = f"https://{Config.AUTH0_DOMAIN}"
        csp_directives.append(f"connect-src 'self' {auth0_domain} https://*.auth0.com https://*.auth0usercontent.com")
        csp_directives.append(f"frame-src 'self' {auth0_domain} https://*.auth0.com")
    else:
        csp_directives.append("connect-src 'self' https://*.auth0.com https://*.auth0usercontent.com")
        csp_directives.append("frame-src 'self' https://*.auth0.com")
    
    # Allow S3 for images (if configured)
    if Config.AWS_S3_BUCKET_NAME:
        # S3 bucket URLs: https://bucket-name.s3.region.amazonaws.com or https://bucket-name.s3.amazonaws.com
        s3_pattern = f"https://{Config.AWS_S3_BUCKET_NAME}.s3.*.amazonaws.com https://*.s3.*.amazonaws.com"
        csp_directives.append(f"img-src 'self' data: blob: {s3_pattern} https://*.amazonaws.com")
    else:
        csp_directives.append("img-src 'self' data: blob: https://*.amazonaws.com")
    
    # Scripts and styles - strict
    csp_directives.append("script-src 'self' 'unsafe-inline' 'unsafe-eval'")  # 'unsafe-inline' needed for React dev
    csp_directives.append("style-src 'self' 'unsafe-inline'")  # 'unsafe-inline' needed for React
    
    # Fonts and other resources
    csp_directives.append("font-src 'self' data: https://fonts.gstatic.com")
    csp_directives.append("object-src 'none'")
    csp_directives.append("base-uri 'self'")
    csp_directives.append("form-action 'self'")
    
    headers['Content-Security-Policy'] = '; '.join(csp_directives)
    
    # X-Frame-Options: Prevent clickjacking
    headers['X-Frame-Options'] = 'DENY'
    
    # X-Content-Type-Options: Prevent MIME sniffing
    headers['X-Content-Type-Options'] = 'nosniff'
    
    # Referrer-Policy: Balance privacy and functionality
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    
    # X-XSS-Protection: Legacy browser support
    headers['X-XSS-Protection'] = '1; mode=block'
    
    # Permissions-Policy: Restrict browser features
    headers['Permissions-Policy'] = (
        'geolocation=(), '
        'microphone=(), '
        'camera=(), '
        'payment=(), '
        'usb=(), '
        'magnetometer=(), '
        'gyroscope=(), '
        'accelerometer=()'
    )
    
    return headers


def _get_development_headers():
    """Get relaxed security headers for development environment."""
    headers = {}
    
    # HSTS: Disabled in development (not using HTTPS typically)
    # Don't set HSTS header in development
    
    # CSP: Relaxed for development
    csp_directives = []
    
    # Allow localhost and common dev origins
    csp_directives.append("default-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*")
    
    # Allow Auth0 for authentication
    if Config.AUTH0_DOMAIN:
        auth0_domain = f"https://{Config.AUTH0_DOMAIN}"
        csp_directives.append(f"connect-src 'self' {auth0_domain} https://*.auth0.com https://*.auth0usercontent.com http://localhost:* ws://localhost:*")
        csp_directives.append(f"frame-src 'self' {auth0_domain} https://*.auth0.com")
    else:
        csp_directives.append("connect-src 'self' https://*.auth0.com https://*.auth0usercontent.com http://localhost:* ws://localhost:*")
        csp_directives.append("frame-src 'self' https://*.auth0.com")
    
    # Allow S3 for images (if configured)
    if Config.AWS_S3_BUCKET_NAME:
        s3_pattern = f"https://{Config.AWS_S3_BUCKET_NAME}.s3.*.amazonaws.com https://*.s3.*.amazonaws.com"
        csp_directives.append(f"img-src 'self' data: blob: {s3_pattern} https://*.amazonaws.com http://localhost:*")
    else:
        csp_directives.append("img-src 'self' data: blob: https://*.amazonaws.com http://localhost:*")
    
    # Scripts and styles - permissive for React dev tools
    csp_directives.append("script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*")
    csp_directives.append("style-src 'self' 'unsafe-inline' http://localhost:*")
    
    # Fonts and other resources
    csp_directives.append("font-src 'self' data: https://fonts.gstatic.com http://localhost:*")
    csp_directives.append("object-src 'none'")
    csp_directives.append("base-uri 'self'")
    csp_directives.append("form-action 'self'")
    
    headers['Content-Security-Policy'] = '; '.join(csp_directives)
    
    # X-Frame-Options: SAMEORIGIN in dev (allows iframes from same origin for testing)
    headers['X-Frame-Options'] = 'SAMEORIGIN'
    
    # X-Content-Type-Options: Still enforce in development
    headers['X-Content-Type-Options'] = 'nosniff'
    
    # Referrer-Policy: More permissive in development
    headers['Referrer-Policy'] = 'no-referrer-when-downgrade'
    
    # X-XSS-Protection: Still enabled
    headers['X-XSS-Protection'] = '1; mode=block'
    
    # Permissions-Policy: More permissive in development (allow all for testing)
    # Empty means allow all features
    headers['Permissions-Policy'] = ''
    
    return headers

