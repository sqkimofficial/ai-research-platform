# #!/usr/bin/env python3
# """
# Diagnostic script to check which environment variables are loaded
# This helps identify if variables are set correctly in .env
# """

# import os
# from pathlib import Path
# from dotenv import load_dotenv

# # Load .env
# backend_dir = Path(__file__).parent
# env_path = backend_dir / '.env'

# if env_path.exists():
#     load_dotenv(env_path)
#     print(f"✅ Loaded .env from: {env_path}")
# else:
#     root_env = backend_dir.parent / '.env'
#     if root_env.exists():
#         load_dotenv(root_env)
#         print(f"✅ Loaded .env from: {root_env}")
#     else:
#         load_dotenv()
#         print("⚠️  Using default .env loading")

# print("\n" + "="*60)
# print("ENVIRONMENT VARIABLE STATUS")
# print("="*60)

# # Check required variables
# required_vars = {
#     'OPENAI_API_KEY': 'Core',
#     'MONGODB_URI': 'Core',
#     'AUTH0_DOMAIN': 'Auth0',
#     'AUTH0_CLIENT_ID': 'Auth0',
#     'AUTH0_CLIENT_SECRET': 'Auth0',
#     'AUTH0_API_AUDIENCE': 'Auth0 (optional, has default)',
# }

# print("\nRequired Variables:")
# for var, category in required_vars.items():
#     value = os.getenv(var)
#     if value:
#         # Show first 20 chars for security
#         display = value[:20] + '...' if len(value) > 20 else value
#         print(f"  ✅ {var:25} = {display} ({category})")
#     else:
#         print(f"  ❌ {var:25} = NOT SET ({category})")

# print("\n" + "="*60)
# print("TESTING CONFIG VALIDATION")
# print("="*60)

# try:
#     from config import Config
#     Config.validate()
#     print("✅ Config validation PASSED")
#     print(f"\nConfig Status:")
#     print(f"  FLASK_ENV: {Config.FLASK_ENV}")
#     print(f"  IS_PRODUCTION: {Config.IS_PRODUCTION}")
#     print(f"  IS_DEVELOPMENT: {Config.IS_DEVELOPMENT}")
#     print(f"  AUTH0_ISSUER: {Config.AUTH0_ISSUER}")
#     print(f"  is_auth0_configured(): {Config.is_auth0_configured()}")
# except ValueError as e:
#     print(f"❌ Config validation FAILED:")
#     print(f"   {e}")
#     print("\n💡 Make sure all required variables are set in your .env file")
# except Exception as e:
#     print(f"❌ Unexpected error: {e}")
#     import traceback
#     traceback.print_exc()

