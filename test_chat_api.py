#!/usr/bin/env python3
"""
Test script to verify chat API JSON responses
"""
import requests
import json
import os
from pathlib import Path

BASE_URL = "http://localhost:5000"

# You'll need to set a valid JWT token here
# For testing, you might need to login first or use a test token
JWT_TOKEN = "your_jwt_token_here"  # Replace with actual token

headers = {
    "Authorization": f"Bearer {JWT_TOKEN}",
    "Content-Type": "application/json"
}

def test_basic_conversation():
    """Test 1: Basic conversation - should only return message, no document_content"""
    print("\n=== Test 1: Basic Conversation ===")
    
    # Create session
    session_response = requests.post(f"{BASE_URL}/api/chat/session", headers=headers)
    if session_response.status_code != 201:
        print(f"Failed to create session: {session_response.status_code}")
        return
    session_id = session_response.json()['session_id']
    print(f"Created session: {session_id}")
    
    # Send message
    message_data = {
        "session_id": session_id,
        "message": "Hello, how are you?"
    }
    response = requests.post(f"{BASE_URL}/api/chat/message", headers=headers, json=message_data)
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response status: {response.status_code}")
        print(f"Chat message: {data.get('response', '')[:200]}...")
        print(f"Document content: '{data.get('document_content', '')}'")
        
        # Verify JSON structure
        assert 'response' in data, "Missing 'response' field"
        assert 'document_content' in data, "Missing 'document_content' field"
        assert data.get('document_content', '') == '', "document_content should be empty for basic conversation"
        print("✓ Test 1 PASSED: JSON structure correct, document_content is empty")
    else:
        print(f"✗ Test 1 FAILED: {response.status_code} - {response.text}")

def test_document_addition():
    """Test 2: Request to add research content - should return both message and document_content"""
    print("\n=== Test 2: Add Research Content ===")
    
    # Create session
    session_response = requests.post(f"{BASE_URL}/api/chat/session", headers=headers)
    if session_response.status_code != 201:
        print(f"Failed to create session: {session_response.status_code}")
        return
    session_id = session_response.json()['session_id']
    print(f"Created session: {session_id}")
    
    # Send message requesting document addition
    message_data = {
        "session_id": session_id,
        "message": "Add a section about machine learning to the research document"
    }
    response = requests.post(f"{BASE_URL}/api/chat/message", headers=headers, json=message_data)
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response status: {response.status_code}")
        print(f"Chat message: {data.get('response', '')[:200]}...")
        doc_content = data.get('document_content', '')
        print(f"Document content length: {len(doc_content)}")
        print(f"Document content preview: {doc_content[:300]}...")
        
        # Verify JSON structure
        assert 'response' in data, "Missing 'response' field"
        assert 'document_content' in data, "Missing 'document_content' field"
        assert len(doc_content) > 0, "document_content should not be empty"
        print("✓ Test 2 PASSED: JSON structure correct, document_content provided")
    else:
        print(f"✗ Test 2 FAILED: {response.status_code} - {response.text}")

def test_code_snippet():
    """Test 3: Request with code snippets - verify markdown formatting"""
    print("\n=== Test 3: Code Snippet Request ===")
    
    # Create session
    session_response = requests.post(f"{BASE_URL}/api/chat/session", headers=headers)
    if session_response.status_code != 201:
        print(f"Failed to create session: {session_response.status_code}")
        return
    session_id = session_response.json()['session_id']
    print(f"Created session: {session_id}")
    
    # Send message requesting code snippet
    message_data = {
        "session_id": session_id,
        "message": "Add a Python code example for data processing to the document"
    }
    response = requests.post(f"{BASE_URL}/api/chat/message", headers=headers, json=message_data)
    
    if response.status_code == 200:
        data = response.json()
        doc_content = data.get('document_content', '')
        print(f"Document content preview: {doc_content[:500]}...")
        
        # Check for markdown code block formatting
        has_code_block = '```python' in doc_content or '```' in doc_content
        assert has_code_block, "Code snippet should be in markdown code block format"
        print("✓ Test 3 PASSED: Code snippet properly formatted in markdown")
    else:
        print(f"✗ Test 3 FAILED: {response.status_code} - {response.text}")

def test_table():
    """Test 4: Request with tables - verify markdown table formatting"""
    print("\n=== Test 4: Table Request ===")
    
    # Create session
    session_response = requests.post(f"{BASE_URL}/api/chat/session", headers=headers)
    if session_response.status_code != 201:
        print(f"Failed to create session: {session_response.status_code}")
        return
    session_id = session_response.json()['session_id']
    print(f"Created session: {session_id}")
    
    # Send message requesting table
    message_data = {
        "session_id": session_id,
        "message": "Create a comparison table of different algorithms in the document"
    }
    response = requests.post(f"{BASE_URL}/api/chat/message", headers=headers, json=message_data)
    
    if response.status_code == 200:
        data = response.json()
        doc_content = data.get('document_content', '')
        print(f"Document content preview: {doc_content[:500]}...")
        
        # Check for markdown table formatting
        has_table = '|' in doc_content and '---' in doc_content or '|' in doc_content and '|' in doc_content.split('\n')[1] if '\n' in doc_content else False
        assert has_table, "Table should be in markdown table format"
        print("✓ Test 4 PASSED: Table properly formatted in markdown")
    else:
        print(f"✗ Test 4 FAILED: {response.status_code} - {response.text}")

if __name__ == "__main__":
    print("Testing Chat API JSON Responses")
    print("=" * 50)
    
    # Note: You'll need to set a valid JWT token above
    if JWT_TOKEN == "your_jwt_token_here":
        print("ERROR: Please set a valid JWT_TOKEN in the script")
        print("You can get a token by logging in through the frontend")
        exit(1)
    
    try:
        test_basic_conversation()
        test_document_addition()
        test_code_snippet()
        test_table()
        print("\n" + "=" * 50)
        print("All tests completed!")
    except Exception as e:
        print(f"\nError during testing: {e}")
        import traceback
        traceback.print_exc()


