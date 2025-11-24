import os
import sys

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from config import Config
from routes.auth import auth_bp
from routes.chat import chat_bp
from routes.document import document_bp

# Validate configuration
Config.validate()

app = Flask(__name__)
CORS(app, origins="*")  # Allow all origins in development

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(chat_bp, url_prefix='/api/chat')
app.register_blueprint(document_bp, url_prefix='/api')

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return {'status': 'ok', 'message': 'API is running'}, 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

