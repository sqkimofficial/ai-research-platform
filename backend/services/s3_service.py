"""
AWS S3 Service for uploading and managing files.

This service handles:
- Uploading processed preview images to S3
- Uploading PDF/image documents to S3
- Deleting files from S3 when removed
- Generating public URLs for stored files
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
    import re
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    print("Warning: boto3 not installed. S3 uploads will be disabled.")


class S3Service:
    """Service for managing S3 operations for highlight preview images."""
    
    _client = None
    _clients_by_region = {}  # Cache clients by region
    _bucket_region = None  # Cached bucket region
    
    @classmethod
    def get_bucket_region(cls, bucket_name=None):
        """
        Detect the actual region of the S3 bucket.
        First tries us-east-2 (most common), then falls back to API detection.
        
        Args:
            bucket_name: Optional bucket name. If not provided, uses Config.AWS_S3_BUCKET_NAME
        
        Returns:
            str: Bucket region or None if detection fails
        """
        target_bucket = bucket_name or Config.AWS_S3_BUCKET_NAME
        
        if cls._bucket_region:
            return cls._bucket_region
        
        if not Config.is_s3_configured() or not target_bucket:
            return None
        
        # First, try us-east-2 (most common region for this bucket)
        try:
            client_us_east_2 = boto3.client(
                's3',
                aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY,
                region_name='us-east-2'
            )
            # Try a simple operation to verify the bucket is in us-east-2
            client_us_east_2.head_bucket(Bucket=target_bucket)
            # If successful, bucket is in us-east-2
            cls._bucket_region = 'us-east-2'
            print(f"[S3] Detected bucket region for {target_bucket}: us-east-2")
            return 'us-east-2'
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            error_message = e.response.get('Error', {}).get('Message', '')
            
            # If we get PermanentRedirect, extract region from error message
            if error_code == 'PermanentRedirect':
                region_match = re.search(r'\.s3[.-]([^.]+)\.amazonaws\.com', error_message)
                if region_match:
                    region = region_match.group(1)
                    cls._bucket_region = region
                    print(f"[S3] Detected bucket region from PermanentRedirect error: {region}")
                    return region
            # If it's not a PermanentRedirect, bucket is not in us-east-2, continue to API detection
        except Exception:
            # If head_bucket fails for other reasons, continue to API detection
            pass
        
        # If us-east-2 didn't work, try API detection
        try:
            # Use a client without region specified to query bucket location
            # This should work from any region
            client = boto3.client(
                's3',
                aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY
            )
            
            # Get bucket location
            response = client.get_bucket_location(Bucket=target_bucket)
            region = response.get('LocationConstraint')
            
            # us-east-1 returns None, so handle that case
            if region is None or region == '':
                region = 'us-east-1'
            
            cls._bucket_region = region
            print(f"[S3] Detected bucket region for {target_bucket}: {region}")
            return region
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            error_message = e.response.get('Error', {}).get('Message', '')
            
            # If we get PermanentRedirect, extract region from error message
            if error_code == 'PermanentRedirect':
                region_match = re.search(r'\.s3[.-]([^.]+)\.amazonaws\.com', error_message)
                if region_match:
                    region = region_match.group(1)
                    cls._bucket_region = region
                    print(f"[S3] Detected bucket region from PermanentRedirect error: {region}")
                    return region
            
            # Don't log intermediate errors - we'll try fallback options
            # Don't cache on error - try again next time
            return None
        except Exception:
            # Don't log intermediate errors - we'll try fallback options
            return None
    
    @classmethod
    def fix_s3_url_region(cls, url, is_pdf_highlight=False):
        """
        Fix an S3 URL to use the correct region.
        
        Args:
            url: S3 URL that may have wrong region
            is_pdf_highlight: If True, prioritize us-east-2 check first. If False (URL highlights), 
                           trust the URL's existing region first.
        
        Returns:
            str: URL with correct region, or original URL if parsing fails
        """
        if not url:
            return url
        
        bucket_name, current_region, key = cls.parse_s3_url(url)
        if not bucket_name or not key:
            return url
        
        # For URL highlights: If URL already has a region, verify it works first
        # For PDF highlights: Check us-east-2 first (as requested)
        if not is_pdf_highlight and current_region:
            # URL highlight - verify the existing region works
            try:
                client = cls.get_client(region=current_region)
                if client:
                    # Try a simple operation to verify the region is correct
                    client.head_bucket(Bucket=bucket_name)
                    # If successful, the region is correct - return URL as-is
                    return url
            except (ClientError, Exception):
                # Region verification failed, continue to detection
                pass
        
        # Get the correct region for this specific bucket
        # For PDF highlights, get_bucket_region already checks us-east-2 first
        # For URL highlights, we'll try the URL's region first if it exists
        correct_region = None
        
        if is_pdf_highlight:
            # PDF highlights: use get_bucket_region which checks us-east-2 first
            correct_region = cls.get_bucket_region(bucket_name=bucket_name)
        else:
            # URL highlights: if URL has a region, try that first before detection
            if current_region:
                try:
                    client = cls.get_client(region=current_region)
                    if client:
                        client.head_bucket(Bucket=bucket_name)
                        # If successful, use the URL's region
                        correct_region = current_region
                except (ClientError, Exception):
                    # URL's region doesn't work, try detection
                    pass
            
            # If URL's region didn't work, try detection
            if not correct_region:
                correct_region = cls.get_bucket_region(bucket_name=bucket_name)
        
        # If detection failed, use fallbacks
        if not correct_region:
            if is_pdf_highlight:
                # PDF highlights: fallback to us-east-2
                if current_region != 'us-east-2':
                    correct_region = 'us-east-2'
            else:
                # URL highlights: if URL had a region, try us-east-2 as fallback
                if current_region and current_region != 'us-east-2':
                    correct_region = 'us-east-2'
                elif not current_region:
                    # No region in URL, try us-east-2
                    correct_region = 'us-east-2'
        
        # If we still don't have a region, return original URL (only log if we tried everything)
        if not correct_region:
            if current_region:
                # Only log if we've exhausted all options
                print(f"[S3] Warning: Could not verify or detect bucket region for {bucket_name}. URL may have incorrect region: {current_region}")
            return url
        
        # If region is already correct, return as-is
        if current_region == correct_region:
            return url
        
        # Rewrite URL with correct region
        fixed_url = f"https://{bucket_name}.s3.{correct_region}.amazonaws.com/{key}"
        print(f"[S3] Fixed URL region: {current_region} -> {correct_region} for bucket {bucket_name}")
        return fixed_url
    
    @classmethod
    def get_client(cls, region=None):
        """
        Get or create S3 client for a specific region.
        
        Args:
            region: AWS region name. If None, uses Config.AWS_S3_REGION
        
        Returns:
            boto3 S3 client or None
        """
        if not BOTO3_AVAILABLE:
            return None
        
        if not Config.is_s3_configured():
            return None
        
        # Use provided region or default from config
        target_region = region or Config.AWS_S3_REGION
        
        # Return cached client for this region if it exists
        if target_region in cls._clients_by_region:
            return cls._clients_by_region[target_region]
        
        # Create new client for this region
        try:
            client = boto3.client(
                's3',
                aws_access_key_id=Config.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=Config.AWS_SECRET_ACCESS_KEY,
                region_name=target_region
            )
            cls._clients_by_region[target_region] = client
            
            # Also set as default client if it's the configured region
            if target_region == Config.AWS_S3_REGION:
                cls._client = client
            
            return client
        except Exception as e:
            print(f"Error creating S3 client for region {target_region}: {e}")
            return None
    
    @classmethod
    def parse_s3_url(cls, url):
        """
        Parse an S3 URL to extract bucket name, region, and key.
        
        Args:
            url: S3 URL in format: https://bucket.s3.region.amazonaws.com/key
        
        Returns:
            tuple: (bucket_name, region, key) or (None, None, None) if parsing fails
        """
        if not url:
            return None, None, None
        
        # Pattern: https://bucket.s3.region.amazonaws.com/key
        # Also handles: https://bucket.s3-region.amazonaws.com/key (legacy format)
        # Region is between s3. and .amazonaws.com
        pattern = r'https://([^/]+)\.s3[.-]([^.]+)\.amazonaws\.com/(.+)'
        match = re.match(pattern, url)
        
        if match:
            bucket_name = match.group(1)
            region = match.group(2)
            key = match.group(3)
            return bucket_name, region, key
        
        # Try alternative format: https://s3.region.amazonaws.com/bucket/key
        pattern2 = r'https://s3[.-]([^.]+)\.amazonaws\.com/([^/]+)/(.+)'
        match2 = re.match(pattern2, url)
        
        if match2:
            region = match2.group(1)
            bucket_name = match2.group(2)
            key = match2.group(3)
            return bucket_name, region, key
        
        return None, None, None
    
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
            
            # Generate the public URL using the actual bucket region
            bucket_region = cls.get_bucket_region() or Config.AWS_S3_REGION
            url = f"https://{Config.AWS_S3_BUCKET_NAME}.s3.{bucket_region}.amazonaws.com/{s3_key}"
            
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
        if not url:
            return False
        
        # Parse bucket, region, and key from URL
        bucket_name, region, s3_key = cls.parse_s3_url(url)
        
        if not bucket_name or not region or not s3_key:
            print(f"[S3] Failed to parse S3 URL: {url}")
            return False
        
        # Get client for the correct region
        client = cls.get_client(region=region)
        if not client:
            print(f"[S3] Failed to create S3 client for region: {region}")
            return False
        
        try:
            client.delete_object(
                Bucket=bucket_name,
                Key=s3_key
            )
            print(f"[S3] Successfully deleted highlight image: {s3_key} from region {region}")
            return True
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            error_message = e.response.get('Error', {}).get('Message', '')
            
            # Handle PermanentRedirect
            if error_code == 'PermanentRedirect':
                region_match = re.search(r'\.s3[.-]([^.]+)\.amazonaws\.com', error_message)
                if region_match:
                    correct_region = region_match.group(1)
                    print(f"[S3] PermanentRedirect detected, retrying with region: {correct_region}")
                    client = cls.get_client(region=correct_region)
                    if client:
                        try:
                            client.delete_object(
                                Bucket=bucket_name,
                                Key=s3_key
                            )
                            print(f"[S3] Successfully deleted highlight image after redirect: {s3_key}")
                            return True
                        except Exception as retry_e:
                            print(f"[S3] Error retrying delete with correct region: {retry_e}")
            
            print(f"[S3] Error deleting highlight image: {error_code} - {error_message}")
            return False
        except Exception as e:
            print(f"[S3] Error deleting by URL: {e}")
            return False
    
    @classmethod
    def upload_document_file(cls, file_bytes, user_id, pdf_id, filename, content_type='application/pdf'):
        """
        Upload a PDF/image document file to S3.
        
        Args:
            file_bytes: The file data as bytes
            user_id: User ID for organizing files
            pdf_id: PDF document ID for the filename
            filename: Original filename (used to determine extension)
            content_type: MIME type of the file
        
        Returns:
            str: Public URL of the uploaded file, or None if upload fails
        """
        client = cls.get_client()
        if not client:
            print("[S3] S3 client not available, skipping file upload")
            return None
        
        # Determine file extension from filename
        import os
        _, ext = os.path.splitext(filename.lower())
        if not ext:
            # Default based on content type
            if 'pdf' in content_type:
                ext = '.pdf'
            elif 'jpeg' in content_type or 'jpg' in content_type:
                ext = '.jpg'
            elif 'png' in content_type:
                ext = '.png'
            else:
                ext = '.pdf'  # Default fallback
        
        # Generate the S3 key (path within the bucket)
        s3_key = f"documents/{user_id}/{pdf_id}{ext}"
        
        try:
            # Upload the file
            client.put_object(
                Bucket=Config.AWS_S3_BUCKET_NAME,
                Key=s3_key,
                Body=file_bytes,
                ContentType=content_type,
                CacheControl='max-age=31536000'  # Cache for 1 year
            )
            
            # Generate the public URL using the actual bucket region
            bucket_region = cls.get_bucket_region() or Config.AWS_S3_REGION
            url = f"https://{Config.AWS_S3_BUCKET_NAME}.s3.{bucket_region}.amazonaws.com/{s3_key}"
            
            print(f"[S3] Successfully uploaded document file: {s3_key} ({len(file_bytes)} bytes)")
            return url
            
        except ClientError as e:
            print(f"[S3] Error uploading document to S3: {e}")
            return None
        except NoCredentialsError:
            print("[S3] AWS credentials not found")
            return None
        except Exception as e:
            print(f"[S3] Unexpected error during document upload: {e}")
            return None
    
    @classmethod
    def delete_document_file(cls, user_id, pdf_id, filename):
        """
        Delete a document file from S3.
        
        Args:
            user_id: User ID for the file path
            pdf_id: PDF document ID
            filename: Original filename (used to determine extension)
        
        Returns:
            bool: True if deletion succeeded, False otherwise
        """
        client = cls.get_client()
        if not client:
            print("[S3] S3 client not available, skipping file deletion")
            return False
        
        # Determine file extension
        import os
        _, ext = os.path.splitext(filename.lower())
        if not ext:
            ext = '.pdf'  # Default
        
        s3_key = f"documents/{user_id}/{pdf_id}{ext}"
        
        try:
            client.delete_object(
                Bucket=Config.AWS_S3_BUCKET_NAME,
                Key=s3_key
            )
            print(f"[S3] Successfully deleted document file: {s3_key}")
            return True
            
        except ClientError as e:
            print(f"[S3] Error deleting document from S3: {e}")
            return False
        except Exception as e:
            print(f"[S3] Unexpected error during document deletion: {e}")
            return False
    
    @classmethod
    def delete_document_file_by_url(cls, url):
        """
        Delete a document file from S3 using its URL.
        
        Args:
            url: The full S3 URL of the file
        
        Returns:
            bool: True if deletion succeeded, False otherwise
        """
        if not url:
            return False
        
        # Parse bucket, region, and key from URL
        bucket_name, region, s3_key = cls.parse_s3_url(url)
        
        if not bucket_name or not region or not s3_key:
            print(f"[S3] Failed to parse S3 URL: {url}")
            return False
        
        # Get client for the correct region
        client = cls.get_client(region=region)
        if not client:
            print(f"[S3] Failed to create S3 client for region: {region}")
            return False
        
        try:
            client.delete_object(
                Bucket=bucket_name,
                Key=s3_key
            )
            print(f"[S3] Successfully deleted document file: {s3_key} from region {region}")
            return True
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            error_message = e.response.get('Error', {}).get('Message', '')
            
            # Handle PermanentRedirect
            if error_code == 'PermanentRedirect':
                region_match = re.search(r'\.s3[.-]([^.]+)\.amazonaws\.com', error_message)
                if region_match:
                    correct_region = region_match.group(1)
                    print(f"[S3] PermanentRedirect detected, retrying with region: {correct_region}")
                    client = cls.get_client(region=correct_region)
                    if client:
                        try:
                            client.delete_object(
                                Bucket=bucket_name,
                                Key=s3_key
                            )
                            print(f"[S3] Successfully deleted document file after redirect: {s3_key}")
                            return True
                        except Exception as retry_e:
                            print(f"[S3] Error retrying delete with correct region: {retry_e}")
            
            print(f"[S3] Error deleting document file: {error_code} - {error_message}")
            return False
        except Exception as e:
            print(f"[S3] Error deleting document by URL: {e}")
            return False
    
    @classmethod
    def get_file_from_s3(cls, url):
        """
        Download a file from S3 by URL.
        
        Args:
            url: The full S3 URL of the file
        
        Returns:
            bytes: File data, or None if download fails
        """
        if not url:
            return None
        
        # Parse bucket, region, and key from URL
        bucket_name, region, s3_key = cls.parse_s3_url(url)
        
        if not bucket_name or not region or not s3_key:
            print(f"[S3] Failed to parse S3 URL: {url}")
            return None
        
        # Get client for the correct region
        client = cls.get_client(region=region)
        if not client:
            print(f"[S3] Failed to create S3 client for region: {region}")
            return None
        
        try:
            response = client.get_object(
                Bucket=bucket_name,
                Key=s3_key
            )
            
            file_bytes = response['Body'].read()
            print(f"[S3] Successfully downloaded file from S3: {s3_key} ({len(file_bytes)} bytes) from region {region}")
            return file_bytes
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            error_message = e.response.get('Error', {}).get('Message', '')
            
            # Handle PermanentRedirect - extract correct region from error
            if error_code == 'PermanentRedirect':
                # Try to extract region from error message
                # Error format: "The bucket you are attempting to access must be addressed using the specified endpoint. Please send all future requests to this endpoint.bucket.s3.region.amazonaws.com"
                region_match = re.search(r'\.s3[.-]([^.]+)\.amazonaws\.com', error_message)
                if region_match:
                    correct_region = region_match.group(1)
                    print(f"[S3] PermanentRedirect detected, retrying with region: {correct_region}")
                    # Retry with correct region
                    client = cls.get_client(region=correct_region)
                    if client:
                        try:
                            response = client.get_object(
                                Bucket=bucket_name,
                                Key=s3_key
                            )
                            file_bytes = response['Body'].read()
                            print(f"[S3] Successfully downloaded file from S3 after redirect: {s3_key} ({len(file_bytes)} bytes)")
                            return file_bytes
                        except Exception as retry_e:
                            print(f"[S3] Error retrying download with correct region: {retry_e}")
            
            print(f"[S3] Error downloading file from S3: {error_code} - {error_message}")
            return None
        except Exception as e:
            print(f"[S3] Unexpected error downloading file from S3: {e}")
            return None

