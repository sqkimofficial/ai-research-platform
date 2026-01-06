"""
AWS S3 Service for uploading and managing highlight preview images.

This service handles:
- Uploading processed preview images to S3
- Deleting images from S3 when highlights are removed
- Generating public URLs for stored images
"""

import os
import sys

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from config import Config

# Try to import boto3
try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    print("Warning: boto3 not installed. S3 uploads will be disabled.")


class S3Service:
    """Service for managing S3 operations for highlight preview images."""
    
    _client = None
    
    @classmethod
    def get_client(cls):
        """Get or create S3 client."""
        if not BOTO3_AVAILABLE:
            return None
        
        if not Config.is_s3_configured():
            return None
        
        if cls._client is None:
            try:
                cls._client = boto3.client(
                    's3',
                    aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY,
                    region_name=Config.AWS_S3_REGION
                )
            except Exception as e:
                print(f"Error creating S3 client: {e}")
                return None
        
        return cls._client
    
    @classmethod
    def is_available(cls):
        """Check if S3 service is available and configured."""
        # Debug: Print what values we're seeing
        print(f"[S3 DEBUG] boto3 available: {BOTO3_AVAILABLE}")
        print(f"[S3 DEBUG] AWS_ACCESS_KEY_ID: {'SET' if Config.AWS_ACCESS_KEY_ID else 'NOT SET'}")
        print(f"[S3 DEBUG] AWS_SECRET_ACCESS_KEY: {'SET' if Config.AWS_SECRET_ACCESS_KEY else 'NOT SET'}")
        print(f"[S3 DEBUG] AWS_S3_BUCKET_NAME: {Config.AWS_S3_BUCKET_NAME or 'NOT SET'}")
        print(f"[S3 DEBUG] AWS_S3_REGION: {Config.AWS_S3_REGION or 'NOT SET'}")
        print(f"[S3 DEBUG] is_s3_configured(): {Config.is_s3_configured()}")
        
        return BOTO3_AVAILABLE and Config.is_s3_configured() and cls.get_client() is not None
    
    @classmethod
    def upload_highlight_image(cls, image_bytes, user_id, highlight_id):
        """
        Upload a highlight preview image to S3.
        
        Args:
            image_bytes: The JPEG image data as bytes
            user_id: User ID for organizing files
            highlight_id: Unique highlight ID for the filename
        
        Returns:
            str: Public URL of the uploaded image, or None if upload fails
        """
        client = cls.get_client()
        if not client:
            print("[S3] S3 client not available, skipping upload")
            return None
        
        # Generate the S3 key (path within the bucket)
        s3_key = f"highlights/{user_id}/{highlight_id}.jpg"
        
        try:
            # Upload the image
            client.put_object(
                Bucket=Config.AWS_S3_BUCKET_NAME,
                Key=s3_key,
                Body=image_bytes,
                ContentType='image/jpeg',
                CacheControl='max-age=31536000'  # Cache for 1 year (images don't change)
            )
            
            # Generate the public URL
            url = f"https://{Config.AWS_S3_BUCKET_NAME}.s3.{Config.AWS_S3_REGION}.amazonaws.com/{s3_key}"
            
            print(f"[S3] Successfully uploaded highlight image: {s3_key}")
            return url
            
        except ClientError as e:
            print(f"[S3] Error uploading to S3: {e}")
            return None
        except NoCredentialsError:
            print("[S3] AWS credentials not found")
            return None
        except Exception as e:
            print(f"[S3] Unexpected error during upload: {e}")
            return None
    
    @classmethod
    def delete_highlight_image(cls, user_id, highlight_id):
        """
        Delete a highlight preview image from S3.
        
        Args:
            user_id: User ID for the file path
            highlight_id: Unique highlight ID
        
        Returns:
            bool: True if deletion succeeded, False otherwise
        """
        client = cls.get_client()
        if not client:
            print("[S3] S3 client not available, skipping deletion")
            return False
        
        s3_key = f"highlights/{user_id}/{highlight_id}.jpg"
        
        try:
            client.delete_object(
                Bucket=Config.AWS_S3_BUCKET_NAME,
                Key=s3_key
            )
            print(f"[S3] Successfully deleted highlight image: {s3_key}")
            return True
            
        except ClientError as e:
            print(f"[S3] Error deleting from S3: {e}")
            return False
        except Exception as e:
            print(f"[S3] Unexpected error during deletion: {e}")
            return False
    
    @classmethod
    def delete_highlight_image_by_url(cls, url):
        """
        Delete a highlight preview image from S3 using its URL.
        
        Args:
            url: The full S3 URL of the image
        
        Returns:
            bool: True if deletion succeeded, False otherwise
        """
        client = cls.get_client()
        if not client or not url:
            return False
        
        try:
            # Extract the key from the URL
            # URL format: https://bucket.s3.region.amazonaws.com/highlights/user_id/highlight_id.jpg
            bucket_prefix = f"https://{Config.AWS_S3_BUCKET_NAME}.s3.{Config.AWS_S3_REGION}.amazonaws.com/"
            if url.startswith(bucket_prefix):
                s3_key = url[len(bucket_prefix):]
                
                client.delete_object(
                    Bucket=Config.AWS_S3_BUCKET_NAME,
                    Key=s3_key
                )
                print(f"[S3] Successfully deleted highlight image: {s3_key}")
                return True
            else:
                print(f"[S3] URL doesn't match expected bucket format: {url}")
                return False
                
        except Exception as e:
            print(f"[S3] Error deleting by URL: {e}")
            return False

