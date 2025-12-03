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
from routes.project import project_bp
from routes.highlight import highlight_bp
from routes.pdf import pdf_bp

# Validate configuration
Config.validate()

app = Flask(__name__)
CORS(app, origins="*")  # Allow all origins in development

# Register blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(chat_bp, url_prefix='/api/chat')
app.register_blueprint(document_bp, url_prefix='/api')
app.register_blueprint(project_bp, url_prefix='/api/project')
app.register_blueprint(highlight_bp, url_prefix='/api/highlights')
app.register_blueprint(pdf_bp, url_prefix='/api/pdfs')

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return {'status': 'ok', 'message': 'API is running'}, 200

if __name__ == '__main__':
    port = int(os.getenv('FLASK_RUN_PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port)

