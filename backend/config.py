import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    PERPLEXITY_API_KEY = os.getenv('PERPLEXITY_API_KEY')  # For Stage 1 AI (content generation)
    MONGODB_URI = os.getenv('MONGODB_URI')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    
    # Auth0 Configuration
    AUTH0_DOMAIN = os.getenv('AUTH0_DOMAIN', 'dev-e0a45vyrmttly5df.us.auth0.com')
    AUTH0_CLIENT_ID = os.getenv('AUTH0_CLIENT_ID', 'itttKkwDovKRteOJ9MZZPa21uNgfPuq0')
    AUTH0_CLIENT_SECRET = os.getenv('AUTH0_CLIENT_SECRET')  # Required for password grant
    AUTH0_API_AUDIENCE = os.getenv('AUTH0_API_AUDIENCE', 'https://api.stitch.app')
    AUTH0_ALGORITHMS = ['RS256']
    AUTH0_ISSUER = f'https://{AUTH0_DOMAIN}/'
    
    # Validate required environment variables
    @staticmethod
    def validate():
        required_vars = ['OPENAI_API_KEY', 'MONGODB_URI', 'AUTH0_DOMAIN', 'AUTH0_API_AUDIENCE']
        missing = [var for var in required_vars if not os.getenv(var)]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")


