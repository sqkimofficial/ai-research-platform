import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend directory (where this file is located)
backend_dir = Path(__file__).parent
env_path = backend_dir / '.env'

# Try backend/.env first, then project root .env
if env_path.exists():
    load_dotenv(env_path)
    print(f"[CONFIG] Loaded .env from: {env_path}")
else:
    # Try project root
    root_env = backend_dir.parent / '.env'
    if root_env.exists():
        load_dotenv(root_env)
        print(f"[CONFIG] Loaded .env from: {root_env}")
    else:
        load_dotenv()  # Default behavior
        print(f"[CONFIG] Using default .env loading (cwd)")

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
    
    # AWS S3 Configuration for highlight preview images
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
    AWS_S3_BUCKET_NAME = os.getenv('AWS_S3_BUCKET_NAME')
    AWS_S3_REGION = os.getenv('AWS_S3_REGION', 'us-east-2')
    
    # Redis Configuration for server-side caching
    REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
    REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None)
    REDIS_DB = int(os.getenv('REDIS_DB', 0))
    REDIS_TTL_DOCUMENTS = int(os.getenv('REDIS_TTL_DOCUMENTS', 300))  # 5 min
    REDIS_TTL_METADATA = int(os.getenv('REDIS_TTL_METADATA', 600))  # 10 min
    REDIS_TTL_VERSION = int(os.getenv('REDIS_TTL_VERSION', 60))  # 1 min
    
    @staticmethod
    def is_s3_configured():
        """Check if AWS S3 is properly configured"""
        return all([
            Config.AWS_ACCESS_KEY_ID,
            Config.AWS_SECRET_ACCESS_KEY,
            Config.AWS_S3_BUCKET_NAME
        ])
    
    # Validate required environment variables
    @staticmethod
    def validate():
        required_vars = ['OPENAI_API_KEY', 'MONGODB_URI', 'AUTH0_DOMAIN', 'AUTH0_API_AUDIENCE']
        missing = [var for var in required_vars if not os.getenv(var)]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")


