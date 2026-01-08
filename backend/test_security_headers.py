#!/usr/bin/env python3
"""
Test script to verify security headers are correctly set in development mode.
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Ensure we're in development mode
os.environ['FLASK_ENV'] = 'development'

from utils.security_headers import get_security_headers
from config import Config

def test_development_headers():
    """Test that development headers are correctly configured."""
    print("=" * 60)
    print("Testing Security Headers - Development Mode")
    print("=" * 60)
    print(f"FLASK_ENV: {Config.FLASK_ENV}")
    print(f"IS_PRODUCTION: {Config.IS_PRODUCTION}")
    print(f"IS_DEVELOPMENT: {Config.IS_DEVELOPMENT}")
    print()
    
    headers = get_security_headers()
    
    print("Security Headers Generated:")
    print("-" * 60)
    
    expected_headers = {
        'Content-Security-Policy': 'Should be present (relaxed for dev)',
        'X-Frame-Options': 'Should be SAMEORIGIN (not DENY)',
        'X-Content-Type-Options': 'Should be nosniff',
        'Referrer-Policy': 'Should be no-referrer-when-downgrade',
        'X-XSS-Protection': 'Should be 1; mode=block',
        'Permissions-Policy': 'Should be present (empty in dev)',
    }
    
    # HSTS should NOT be in development headers
    unexpected_headers = {
        'Strict-Transport-Security': 'Should NOT be present in development'
    }
    
    all_passed = True
    
    # Check expected headers
    for header_name, description in expected_headers.items():
        if header_name in headers:
            value = headers[header_name]
            print(f"✓ {header_name}: {value[:80]}..." if len(str(value)) > 80 else f"✓ {header_name}: {value}")
            
            # Specific checks
            if header_name == 'X-Frame-Options':
                if value != 'SAMEORIGIN':
                    print(f"  ⚠ WARNING: Expected 'SAMEORIGIN' but got '{value}'")
                    all_passed = False
                else:
                    print(f"  ✓ Correct: X-Frame-Options is SAMEORIGIN (relaxed for dev)")
            
            if header_name == 'Referrer-Policy':
                if value != 'no-referrer-when-downgrade':
                    print(f"  ⚠ WARNING: Expected 'no-referrer-when-downgrade' but got '{value}'")
                    all_passed = False
                else:
                    print(f"  ✓ Correct: Referrer-Policy is relaxed for dev")
        else:
            print(f"✗ MISSING: {header_name} - {description}")
            all_passed = False
    
    print()
    
    # Check that HSTS is NOT present
    for header_name, description in unexpected_headers.items():
        if header_name in headers:
            print(f"✗ UNEXPECTED: {header_name} is present - {description}")
            print(f"  Value: {headers[header_name]}")
            all_passed = False
        else:
            print(f"✓ Correct: {header_name} is NOT present (as expected for dev)")
    
    print()
    print("-" * 60)
    
    # Check CSP content
    if 'Content-Security-Policy' in headers:
        csp = headers['Content-Security-Policy']
        print("CSP Analysis:")
        if 'localhost' in csp.lower():
            print("  ✓ CSP includes localhost (good for dev)")
        if 'unsafe-inline' in csp.lower():
            print("  ✓ CSP includes unsafe-inline (needed for React dev)")
        if 'unsafe-eval' in csp.lower():
            print("  ✓ CSP includes unsafe-eval (needed for React dev)")
    
    print()
    print("=" * 60)
    if all_passed:
        print("✓ All development headers are correctly configured!")
    else:
        print("✗ Some headers need attention")
    print("=" * 60)
    
    return all_passed, headers

if __name__ == '__main__':
    try:
        passed, headers = test_development_headers()
        sys.exit(0 if passed else 1)
    except Exception as e:
        print(f"Error testing headers: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

