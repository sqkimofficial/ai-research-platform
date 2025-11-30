import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    MONGODB_URI = os.getenv('MONGODB_URI')
    JWT_SECRET = os.getenv('JWT_SECRET', 'default-secret-change-in-production')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    
    # Validate required environment variables
    @staticmethod
    def validate():
        required_vars = ['OPENAI_API_KEY', 'MONGODB_URI', 'JWT_SECRET']
        missing = [var for var in required_vars if not os.getenv(var)]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")


