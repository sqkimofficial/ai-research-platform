"""
Test Perplexity API connection.
This script tests the connection to Perplexity API with a simple question.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_perplexity_connection():
    """Test Perplexity API with a simple question"""
    
    # Get API key from environment (user mentioned it's stored as PERPLEXITY_API)
    api_key = os.getenv('PERPLEXITY_API')
    
    if not api_key:
        print("ERROR: PERPLEXITY_API environment variable not found!")
        print("Please set PERPLEXITY_API in your .env file")
        return False
    
    print(f"API key found: {api_key[:10]}...")
    
    try:
        from perplexity import Perplexity
        
        # Initialize client with API key
        client = Perplexity(api_key=api_key)
        
        # Simple test question
        print("\nSending test question: 'What comes after Tuesday?'")
        
        completion = client.chat.completions.create(
            model="sonar",  # Using sonar model for basic queries
            messages=[
                {"role": "user", "content": "What comes after Tuesday?"}
            ]
        )
        
        # Get the response
        response_content = completion.choices[0].message.content
        
        print(f"\n✅ SUCCESS! Perplexity API is working.")
        print(f"\nResponse: {response_content}")
        
        # Check if citations are available
        if hasattr(completion, 'citations') and completion.citations:
            print(f"\nCitations: {completion.citations}")
        
        return True
        
    except ImportError:
        print("\nERROR: perplexityai package not installed!")
        print("Please run: pip install perplexityai")
        return False
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        
        # Try alternative approach using OpenAI-compatible endpoint
        print("\nTrying OpenAI-compatible endpoint as fallback...")
        try:
            from openai import OpenAI
            
            client = OpenAI(
                api_key=api_key,
                base_url="https://api.perplexity.ai"
            )
            
            completion = client.chat.completions.create(
                model="sonar",
                messages=[
                    {"role": "user", "content": "What comes after Tuesday?"}
                ]
            )
            
            response_content = completion.choices[0].message.content
            
            print(f"\n✅ SUCCESS using OpenAI-compatible endpoint!")
            print(f"\nResponse: {response_content}")
            return True
            
        except Exception as e2:
            print(f"\n❌ Fallback also failed: {e2}")
            return False


if __name__ == "__main__":
    test_perplexity_connection()

