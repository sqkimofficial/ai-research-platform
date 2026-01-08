import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the backend directory (where this file is located)
backend_dir = Path(__file__).parent
env_path = backend_dir / '.env'

# Try backend/.env first, then project root .env
env_loaded = False
if env_path.exists():
    load_dotenv(env_path)
    print(f"[CONFIG] Loaded .env from: {env_path}")
    env_loaded = True
else:
    # Try project root
    root_env = backend_dir.parent / '.env'
    if root_env.exists():
        load_dotenv(root_env)
        print(f"[CONFIG] Loaded .env from: {root_env}")
        env_loaded = True
    else:
        load_dotenv()  # Default behavior
        print(f"[CONFIG] Using default .env loading (cwd)")

class Config:
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    IS_PRODUCTION = FLASK_ENV == 'production'
    IS_DEVELOPMENT = not IS_PRODUCTION
    
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    PERPLEXITY_API_KEY = os.getenv('PERPLEXITY_API_KEY')  # For Stage 1 AI (content generation)
    MONGODB_URI = os.getenv('MONGODB_URI')
    
    # Auth0 Configuration - No defaults, fail fast if missing
    AUTH0_DOMAIN = os.getenv('AUTH0_DOMAIN')  # No default!
    AUTH0_CLIENT_ID = os.getenv('AUTH0_CLIENT_ID')  # No default!
    AUTH0_CLIENT_SECRET = os.getenv('AUTH0_CLIENT_SECRET')  # Required for password grant
    AUTH0_API_AUDIENCE = os.getenv('AUTH0_API_AUDIENCE', 'https://api.stitch.app')
    AUTH0_ALGORITHMS = ['RS256']
    # AUTH0_ISSUER will be set after AUTH0_DOMAIN is validated in validate() method
    AUTH0_ISSUER = None
    
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
    
    # CORS Configuration - Environment-aware
    # In development: Allow localhost origins
    # In production: Require ALLOWED_ORIGINS env var (comma-separated list)
    if IS_PRODUCTION:
        origins_env = os.getenv('ALLOWED_ORIGINS', '')
        CORS_ALLOWED_ORIGINS = [o.strip() for o in origins_env.split(',') if o.strip()]
        # Only validate in production if actually set to production
        # This allows dev to continue working without production URLs
    else:
        # Development: Default to localhost origins
        # Can be overridden with ALLOWED_ORIGINS env var if needed
        dev_origins_env = os.getenv('ALLOWED_ORIGINS', '')
        if dev_origins_env:
            CORS_ALLOWED_ORIGINS = [o.strip() for o in dev_origins_env.split(',') if o.strip()]
        else:
            CORS_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
    
    @staticmethod
    def get_required_env(var_name):
        """Get required environment variable or raise ValueError with clear message"""
        value = os.getenv(var_name)
        if not value:
            raise ValueError(f"Required environment variable '{var_name}' is not set. Please set it in your .env file or environment.")
        return value
    
    @staticmethod
    def is_auth0_configured():
        """Check if Auth0 is properly configured"""
        return all([
            Config.AUTH0_DOMAIN,
            Config.AUTH0_CLIENT_ID,
            Config.AUTH0_CLIENT_SECRET,
            Config.AUTH0_API_AUDIENCE
        ])
    
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
        """Validate all required environment variables with clear error messages"""
        # Warn if no .env file found in development
        if Config.IS_DEVELOPMENT and not env_loaded:
            print("[WARNING] No .env file found. Running in development mode without .env file.")
            print("[WARNING] Some features may not work correctly. Consider creating a .env file.")
        
        # Core required variables
        required_vars = ['OPENAI_API_KEY', 'MONGODB_URI']
        missing = [var for var in required_vars if not os.getenv(var)]
        
        # Auth0 required variables (all must be present)
        auth0_vars = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']
        missing_auth0 = [var for var in auth0_vars if not os.getenv(var)]
        
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
        
        if missing_auth0:
            raise ValueError(
                f"Missing required Auth0 environment variables: {', '.join(missing_auth0)}. "
                "All Auth0 variables must be set (AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET)."
            )
        
        # Validate CORS configuration in production
        if Config.IS_PRODUCTION:
            if not Config.CORS_ALLOWED_ORIGINS:
                raise ValueError(
                    "ALLOWED_ORIGINS must be set in production. "
                    "Set it as a comma-separated list of allowed origins (e.g., 'https://app.example.com,https://www.example.com')"
                )
        
        # Set AUTH0_ISSUER after validation
        Config.AUTH0_ISSUER = f'https://{Config.AUTH0_DOMAIN}/'


