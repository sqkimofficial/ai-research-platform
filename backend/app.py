import os
import sys

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request
from flask_cors import CORS
from werkzeug.serving import WSGIRequestHandler
from config import Config
from utils.logger import get_logger, log_security_event, sanitize_data
import re
from routes.auth import auth_bp
from routes.chat import chat_bp
from routes.document import document_bp
from routes.project import project_bp
from routes.highlight import highlight_bp
from routes.pdf import pdf_bp
from utils.rate_limiter import init_rate_limiter, get_limiter
from utils.security_headers import get_security_headers

# Initialize logger
logger = get_logger(__name__)

# Validate configuration
Config.validate()

app = Flask(__name__)

# Custom request handler to sanitize tokens in access logs
class SanitizedRequestHandler(WSGIRequestHandler):
    """Custom request handler that sanitizes sensitive data in access logs."""
    
    def log_request(self, code='-', size='-'):
        """Override to sanitize tokens in the log message."""
        # Get the original log line
        msg = self.requestline
        
        # Sanitize tokens in query parameters (e.g., ?token=...)
        # Match everything from token= until we hit a space, &, ", or HTTP
        # Use a greedy match to capture the entire token value
        
        # Find the position of token= and match everything until the next delimiter
        # This approach is more reliable than trying to match specific patterns
        token_start = msg.find('token=')
        if token_start != -1:
            # Find where the token value ends (space, &, ", or HTTP)
            token_value_start = token_start + 6  # len('token=')
            # Look for the end of the token value
            end_pos = len(msg)
            for delimiter in [' ', '&', '"', 'HTTP']:
                pos = msg.find(delimiter, token_value_start)
                if pos != -1 and pos < end_pos:
                    end_pos = pos
            
            # Replace the entire token value
            if end_pos > token_value_start:
                msg = msg[:token_value_start] + '***sanitized***' + msg[end_pos:]
        
        # Also sanitize Authorization headers if they appear in logs
        msg = re.sub(r'Authorization:\s*Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)',
                    r'Authorization: Bearer ***sanitized***', msg)
        
        self.log('info', f'"{msg}" {code} {size}')

# Configure CORS with environment-aware settings
CORS(app,
     origins=Config.CORS_ALLOWED_ORIGINS,
     supports_credentials=True,
     methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'],
     max_age=3600)  # Cache preflight requests for 1 hour

# CORS error handling and logging
@app.before_request
def log_cors_request():
    """Log CORS-related request information for security monitoring"""
    origin = request.headers.get('Origin')
    if origin:
        # Log if origin is not in allowed list (for security monitoring)
        if origin not in Config.CORS_ALLOWED_ORIGINS:
            log_security_event(
                logger,
                'cors_blocked',
                f"Blocked request from unauthorized origin: {origin}",
                severity='WARNING',
                origin=origin,
                allowed_origins=Config.CORS_ALLOWED_ORIGINS
            )

@app.after_request
def add_cors_headers(response):
    """Add CORS headers to response and log CORS violations"""
    origin = request.headers.get('Origin')
    if origin and origin not in Config.CORS_ALLOWED_ORIGINS:
        # Log CORS violation for security monitoring
        log_security_event(
            logger,
            'cors_rejected',
            f"Rejected origin: {origin} (not in allowed list)",
            severity='WARNING',
            origin=origin
        )
    return response

@app.after_request
def add_security_headers(response):
    """Add security headers to all responses based on environment"""
    # Get environment-aware security headers
    security_headers = get_security_headers()
    
    # Add each security header to the response
    for header_name, header_value in security_headers.items():
        # Only set HSTS if using HTTPS (check if request was secure)
        # HSTS must only be set over HTTPS, otherwise browsers will ignore it
        if header_name == 'Strict-Transport-Security':
            # Only set HSTS header if the request was made over HTTPS
            # request.is_secure will be True if:
            # 1. Direct HTTPS connection, or
            # 2. Behind a reverse proxy with X-Forwarded-Proto: https header
            if request.is_secure:
                response.headers[header_name] = header_value
        else:
            response.headers[header_name] = header_value
    
    return response

# Initialize rate limiter (must be done before registering blueprints)
limiter = init_rate_limiter(app)

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(chat_bp, url_prefix='/api/chat')
app.register_blueprint(document_bp, url_prefix='/api')
app.register_blueprint(project_bp, url_prefix='/api/project')
app.register_blueprint(highlight_bp, url_prefix='/api/highlights')
app.register_blueprint(pdf_bp, url_prefix='/api/pdfs')

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint - excluded from rate limiting"""
    return {'status': 'ok', 'message': 'API is running'}, 200

# Exclude health check from rate limiting
if limiter:
    limiter.exempt(health_check)

if __name__ == '__main__':
    port = int(os.getenv('FLASK_RUN_PORT', 5001))
    # Use custom request handler to sanitize tokens in access logs
    app.run(debug=True, host='0.0.0.0', port=port, request_handler=SanitizedRequestHandler)

