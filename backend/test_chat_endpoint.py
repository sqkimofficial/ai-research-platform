"""
Simple test script to verify the chat endpoint works
"""
import requests
import json

# Test the chat endpoint
url = "http://localhost:5000/api/chat/message"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer test-token"  # You'll need a real token
}

data = {
    "session_id": "test-session-id",
    "message": "Hello, can you help me write a research paper?"
}

try:
    response = requests.post(url, headers=headers, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")

