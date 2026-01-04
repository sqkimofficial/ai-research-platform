"""
Service for generating document snapshots from HTML content.
Converts HTML to base64-encoded PNG images for document card previews.
"""
import base64
import os
import tempfile

try:
    from html2image import Html2Image
    HTML2IMAGE_AVAILABLE = True
except ImportError:
    HTML2IMAGE_AVAILABLE = False
    print("Warning: html2image not installed. Install with: pip install html2image[playwright]")


class SnapshotService:
    """Service for generating document snapshots"""
    
    def __init__(self):
        """Initialize the snapshot service"""
        if not HTML2IMAGE_AVAILABLE:
            self.hti = None
            print("Warning: html2image not available. Snapshots will not be generated.")
        else:
            try:
                # html2image requires Chromium/Chrome to be installed
                # It will try to find it automatically or download it
                self.hti = Html2Image()
                # Configure output size - 2x quality for better resolution
                # Base dimensions from Figma: card width ~400px
                # Snapshot should be 90% of card width = 360px, at 2x = 720px
                # Minimal padding to avoid gray bars on sides
                self.card_width = 400  # Base card width
                self.snapshot_width_pct = 0.90  # 90% of card width
                self.content_width = int(self.card_width * self.snapshot_width_pct * 2)  # 720px at 2x
                self.padding = 40  # Minimal padding (20px * 2) to avoid gray bars
                self.width = self.content_width + (self.padding * 2)  # 800px total
                # Height stays the same - zoom level is perfect
                self.height = 1200  # Taller to show more content (zoomed out)
            except Exception as e:
                print(f"Warning: Failed to initialize Html2Image: {e}")
                print("Note: html2image requires Chromium/Chrome. Install with: pip install html2image[playwright] && playwright install chromium")
                self.hti = None
    
    def generate_snapshot(self, html_content: str) -> str:
        """
        Generate a base64-encoded PNG snapshot from HTML content.
        
        Args:
            html_content: HTML content of the document
            
        Returns:
            Base64 data URI string (format: data:image/png;base64,...)
            Returns None if content is empty or generation fails
        """
        if not html_content or not html_content.strip():
            return None
        
        if self.hti is None:
            print("Html2Image not initialized - cannot generate snapshot")
            return None
        
        temp_file = None
        try:
            # Wrap HTML content in a styled container for better rendering
            styled_html = self._wrap_html_content(html_content)
            
            # Create temporary directory and file for snapshot
            temp_dir = tempfile.gettempdir()
            temp_filename = f"snapshot_{os.urandom(8).hex()}.png"
            temp_path = os.path.join(temp_dir, temp_filename)
            
            # Set output path and generate image
            # Use larger size for 2x quality, then scale down in CSS if needed
            self.hti.output_path = temp_dir
            self.hti.screenshot(
                html_str=styled_html,
                size=(self.width, self.height),
                save_as=temp_filename
            )
            
            # Read the generated image file
            if not os.path.exists(temp_path):
                return None
            
            with open(temp_path, 'rb') as f:
                image_bytes = f.read()
            
            # Clean up temp file
            os.unlink(temp_path)
            
            if not image_bytes:
                return None
            
            # Convert to base64 data URI
            base64_string = base64.b64encode(image_bytes).decode('utf-8')
            data_uri = f"data:image/png;base64,{base64_string}"
            
            return data_uri
            
        except Exception as e:
            print(f"Error generating snapshot: {e}")
            # Clean up temp file if it exists
            if temp_file and os.path.exists(temp_file.name):
                try:
                    os.unlink(temp_file.name)
                except:
                    pass
            return None
    
    def _wrap_html_content(self, html_content: str) -> str:
        """
        Wrap HTML content in a styled container for better snapshot rendering.
        
        Args:
            html_content: Raw HTML content
            
        Returns:
            Styled HTML string
        """
        # Basic styling to ensure readable preview
        # Match typical document styling
        # White background, padding on left/right only, zoomed out to show more content
        wrapper = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{
                    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #323232;
                    padding: 0 {self.padding}px;
                    margin: 0;
                    background-color: #FFFFFF;
                    width: {self.content_width}px;
                    overflow: visible;
                }}
                h1, h2, h3, h4, h5, h6 {{
                    font-weight: 600;
                    margin-top: 16px;
                    margin-bottom: 8px;
                }}
                p {{
                    margin: 8px 0;
                }}
                img {{
                    max-width: 100%;
                    height: auto;
                }}
            </style>
        </head>
        <body>
            {html_content}
        </body>
        </html>
        """
        return wrapper

# Singleton instance
_snapshot_service = None

def get_snapshot_service():
    """Get the singleton snapshot service instance"""
    global _snapshot_service
    if _snapshot_service is None:
        _snapshot_service = SnapshotService()
    return _snapshot_service

