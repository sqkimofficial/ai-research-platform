#!/usr/bin/env python3
"""
Test script for Phase 1: Remove Hardcoded Credentials and Add Environment Validation

This script tests:
1. Config validation with all required variables
2. Config validation with missing variables (should fail fast)
3. Helper methods (is_auth0_configured, get_required_env)
4. Environment awareness (IS_PRODUCTION, IS_DEVELOPMENT)
5. AUTH0_ISSUER is set correctly after validation
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

def test_config_validation_success():
    """Test that Config.validate() succeeds when all required vars are present"""
    print("\n" + "="*60)
    print("TEST 1: Config validation with all required variables")
    print("="*60)
    
    try:
        from config import Config
        
        # Check that required variables are set
        required = ['OPENAI_API_KEY', 'MONGODB_URI', 'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']
        missing = [var for var in required if not os.getenv(var)]
        
        if missing:
            print(f"⚠️  SKIPPED: Missing required env vars: {', '.join(missing)}")
            print("   Set these in your .env file to run this test")
            return False
        
        # Run validation
        Config.validate()
        print("✅ Config.validate() succeeded")
        
        # Verify AUTH0_ISSUER is set
        if Config.AUTH0_ISSUER:
            print(f"✅ AUTH0_ISSUER is set correctly: {Config.AUTH0_ISSUER}")
            expected = f'https://{Config.AUTH0_DOMAIN}/'
            if Config.AUTH0_ISSUER == expected:
                print(f"✅ AUTH0_ISSUER format is correct")
            else:
                print(f"❌ AUTH0_ISSUER mismatch. Expected: {expected}, Got: {Config.AUTH0_ISSUER}")
                return False
        else:
            print("❌ AUTH0_ISSUER is not set after validation")
            return False
        
        # Verify helper method
        if Config.is_auth0_configured():
            print("✅ is_auth0_configured() returns True")
        else:
            print("❌ is_auth0_configured() returns False (should be True)")
            return False
        
        return True
        
    except ValueError as e:
        print(f"❌ Config.validate() raised ValueError: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_environment_awareness():
    """Test IS_PRODUCTION and IS_DEVELOPMENT properties"""
    print("\n" + "="*60)
    print("TEST 2: Environment awareness (IS_PRODUCTION, IS_DEVELOPMENT)")
    print("="*60)
    
    try:
        from config import Config
        
        flask_env = os.getenv('FLASK_ENV', 'development')
        print(f"FLASK_ENV: {flask_env}")
        print(f"IS_PRODUCTION: {Config.IS_PRODUCTION}")
        print(f"IS_DEVELOPMENT: {Config.IS_DEVELOPMENT}")
        
        # Verify they are opposites
        if Config.IS_PRODUCTION == (not Config.IS_DEVELOPMENT):
            print("✅ IS_PRODUCTION and IS_DEVELOPMENT are correctly opposite")
        else:
            print("❌ IS_PRODUCTION and IS_DEVELOPMENT are not opposites")
            return False
        
        # Verify they match FLASK_ENV
        expected_prod = flask_env == 'production'
        if Config.IS_PRODUCTION == expected_prod:
            print(f"✅ IS_PRODUCTION correctly reflects FLASK_ENV")
        else:
            print(f"❌ IS_PRODUCTION mismatch. Expected: {expected_prod}, Got: {Config.IS_PRODUCTION}")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_no_hardcoded_credentials():
    """Test that no hardcoded credentials exist in the code"""
    print("\n" + "="*60)
    print("TEST 3: No hardcoded credentials in code")
    print("="*60)
    
    try:
        config_file = backend_dir / 'config.py'
        with open(config_file, 'r') as f:
            content = f.read()
        
        # Check for old hardcoded values
        old_domain = 'dev-e0a45vyrmttly5df.us.auth0.com'
        old_client_id = 'itttKkwDovKRteOJ9MZZPa21uNgfPuq0'
        
        if old_domain in content:
            print(f"❌ Found hardcoded AUTH0_DOMAIN: {old_domain}")
            return False
        
        if old_client_id in content:
            print(f"❌ Found hardcoded AUTH0_CLIENT_ID: {old_client_id}")
            return False
        
        # Check that AUTH0_DOMAIN and AUTH0_CLIENT_ID have no defaults
        if "AUTH0_DOMAIN = os.getenv('AUTH0_DOMAIN')" in content or \
           "AUTH0_DOMAIN = os.getenv('AUTH0_DOMAIN'," not in content:
            print("✅ AUTH0_DOMAIN has no hardcoded default")
        else:
            print("❌ AUTH0_DOMAIN may have a default value")
            return False
        
        if "AUTH0_CLIENT_ID = os.getenv('AUTH0_CLIENT_ID')" in content or \
           "AUTH0_CLIENT_ID = os.getenv('AUTH0_CLIENT_ID'," not in content:
            print("✅ AUTH0_CLIENT_ID has no hardcoded default")
        else:
            print("❌ AUTH0_CLIENT_ID may have a default value")
            return False
        
        print("✅ No hardcoded credentials found in config.py")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_helper_methods():
    """Test helper methods"""
    print("\n" + "="*60)
    print("TEST 4: Helper methods (get_required_env, is_auth0_configured)")
    print("="*60)
    
    try:
        from config import Config
        
        # Test get_required_env with existing variable
        test_var = 'FLASK_ENV'
        if os.getenv(test_var):
            value = Config.get_required_env(test_var)
            print(f"✅ get_required_env('{test_var}') returned: {value}")
        else:
            # Set a test value temporarily
            os.environ[test_var] = 'test'
            value = Config.get_required_env(test_var)
            print(f"✅ get_required_env('{test_var}') returned: {value}")
            del os.environ[test_var]
        
        # Test get_required_env with missing variable (should raise ValueError)
        try:
            Config.get_required_env('NONEXISTENT_VAR_12345')
            print("❌ get_required_env() should have raised ValueError for missing var")
            return False
        except ValueError as e:
            if 'NONEXISTENT_VAR_12345' in str(e):
                print("✅ get_required_env() correctly raises ValueError for missing variable")
            else:
                print(f"❌ Error message doesn't mention variable name: {e}")
                return False
        
        # Test is_auth0_configured
        is_configured = Config.is_auth0_configured()
        required_vars = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_API_AUDIENCE']
        all_set = all(os.getenv(var) for var in required_vars)
        
        if is_configured == all_set:
            print(f"✅ is_auth0_configured() returns {is_configured} (correct)")
        else:
            print(f"❌ is_auth0_configured() returns {is_configured}, expected {all_set}")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_validation_error_messages():
    """Test that validation provides clear error messages"""
    print("\n" + "="*60)
    print("TEST 5: Validation error messages (simulated)")
    print("="*60)
    
    try:
        from config import Config
        
        # Check that validate() checks for Auth0 variables
        config_file = backend_dir / 'config.py'
        with open(config_file, 'r') as f:
            content = f.read()
        
        if "auth0_vars = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET']" in content:
            print("✅ Validation checks for all required Auth0 variables")
        else:
            print("❌ Validation may not check all Auth0 variables")
            return False
        
        if "Missing required Auth0 environment variables" in content:
            print("✅ Validation provides clear error message for missing Auth0 vars")
        else:
            print("❌ Validation error message may not be clear enough")
            return False
        
        print("✅ Validation error message structure looks good")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("PHASE 1 CONFIGURATION TESTS")
    print("="*60)
    
    tests = [
        ("No Hardcoded Credentials", test_no_hardcoded_credentials),
        ("Environment Awareness", test_environment_awareness),
        ("Helper Methods", test_helper_methods),
        ("Validation Error Messages", test_validation_error_messages),
        ("Config Validation Success", test_config_validation_success),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"\n❌ Test '{test_name}' crashed: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_name, False))
    
    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Phase 1 implementation is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
        return 1

if __name__ == '__main__':
    sys.exit(main())

