"""
Highlight Document Extraction Service using OpenAI GPT-4o mini.
Extracts highlighted text from PDFs, JPGs, and PNGs using vision capabilities.
Uses PyMuPDF for PDF to image conversion.
"""
import os
import sys
import json
import base64
import io
import re
import uuid

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from openai import OpenAI
from config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

# Try to import PDF to image conversion libraries
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    logger.warning("PyMuPDF not installed. Install with: pip install pymupdf")

# Try to import PIL for image processing
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("Pillow not installed. Install with: pip install pillow")

# Try to import OCR position service for image text location
try:
    from services.ocr_position_service import get_ocr_position_service
    OCR_SERVICE_AVAILABLE = True
except ImportError:
    OCR_SERVICE_AVAILABLE = False
    logger.warning("OCR position service not available.")

# Try to import S3 service
try:
    from services.s3_service import S3Service
    S3_SERVICE_AVAILABLE = True
except ImportError:
    S3_SERVICE_AVAILABLE = False
    logger.warning("S3 service not available.")


class HighlightExtractionService:
    """Service for extracting highlights from PDFs and images using OpenAI GPT-4o mini."""
    
    # Supported file types
    SUPPORTED_TYPES = {
        'application/pdf': 'pdf',
        'image/jpeg': 'image',
        'image/jpg': 'image',
        'image/png': 'image',
    }
    
    def __init__(self):
        self.client = OpenAI(api_key=Config.OPENAI_API_KEY)
        self.model = "gpt-4o-mini"
    
    def extract_highlights(self, file_base64_data, content_type='application/pdf', user_id=None, pdf_id=None):
        """
        Extract highlighted text from a document (PDF or image) using OpenAI's vision capabilities.
        
        Args:
            file_base64_data: Base64 encoded file data
            content_type: MIME type of the file (application/pdf, image/jpeg, image/png)
            user_id: User ID for S3 uploads (optional)
            pdf_id: PDF document ID for S3 uploads (optional)
        
        Returns:
            List of highlights with text and color information (preview_image_url instead of preview_image)
        """
        file_type = self.SUPPORTED_TYPES.get(content_type, 'pdf')
        
        if file_type == 'pdf':
            return self._extract_from_pdf(file_base64_data, user_id, pdf_id)
        else:
            return self._extract_from_image(file_base64_data, content_type, user_id, pdf_id)
    
    def _extract_from_pdf(self, pdf_base64_data, user_id=None, pdf_id=None):
        """Extract highlights from a PDF file."""
        if not PYMUPDF_AVAILABLE:
            raise ValueError("PyMuPDF is required for PDF processing. Install with: pip install pymupdf")
        
        try:
            # Decode base64 to bytes
            pdf_bytes = base64.b64decode(pdf_base64_data)
            
            # Open the PDF document for position detection and preview generation
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            
            # Convert PDF pages to images
            images = self._pdf_to_images(pdf_bytes)
            
            if not images:
                logger.debug("No images extracted from PDF")
                doc.close()
                return []
            
            # Process each page and collect highlights
            all_highlights = []
            
            for page_num, image_base64 in enumerate(images, start=1):
                logger.debug(f"Processing page {page_num}...")
                page_highlights = self._extract_highlights_from_image(image_base64, page_num)
                
                # Add position and preview for each highlight
                for idx, highlight in enumerate(page_highlights, 1):
                    # Generate highlight_id if not present
                    if 'highlight_id' not in highlight:
                        highlight['highlight_id'] = str(uuid.uuid4())
                    highlight_id = highlight['highlight_id']
                    bbox = self._find_highlight_position(doc, highlight['text'], page_num)
                    if bbox:
                        highlight['bounding_box'] = bbox
                        preview_image_bytes = self._generate_preview_image_bytes(doc, page_num, bbox)
                        preview_image_url = self._upload_preview_to_s3(preview_image_bytes, user_id, highlight_id)
                        if preview_image_url:
                            highlight['preview_image_url'] = preview_image_url
                            logger.debug(f"  Highlight {idx}: Position found, preview uploaded to S3: {preview_image_url}")
                        else:
                            logger.debug(f"  Highlight {idx}: Position found, but S3 upload failed")
                    else:
                        # Fallback: use page center if text not found
                        # This is normal - GPT-4o extracts from images, but text search may fail due to formatting differences
                        preview_image_bytes = self._generate_page_preview_bytes(doc, page_num)
                        preview_image_url = self._upload_preview_to_s3(preview_image_bytes, user_id, highlight_id)
                        if preview_image_url:
                            highlight['preview_image_url'] = preview_image_url
                            logger.debug(f"  Highlight {idx}: Text position not found (using centered preview), uploaded to S3: {preview_image_url}")
                        else:
                            logger.debug(f"  Highlight {idx}: Text position not found, S3 upload failed")
                
                all_highlights.extend(page_highlights)
            
            doc.close()
            return all_highlights
            
        except Exception as e:
            logger.debug(f"Error extracting highlights from PDF: {e}")
            raise
    
    def _extract_from_image(self, image_base64_data, content_type, user_id=None, pdf_id=None):
        """Extract highlights from an image file (JPG/PNG)."""
        try:
            # For images, we process directly - no conversion needed
            logger.debug("Processing image...")
            highlights = self._extract_highlights_from_image(image_base64_data, page_number=1, content_type=content_type)
            
            # Initialize OCR service for finding text positions
            ocr_service = None
            if OCR_SERVICE_AVAILABLE:
                try:
                    ocr_service = get_ocr_position_service()
                    if not ocr_service.available:
                        ocr_service = None
                        logger.debug("OCR service not available - using centered previews")
                except Exception as e:
                    logger.debug(f"Failed to initialize OCR service: {e}")
                    ocr_service = None
            
            # Generate preview images for each highlight
            for idx, highlight in enumerate(highlights, 1):
                # Generate highlight_id if not present
                if 'highlight_id' not in highlight:
                    highlight['highlight_id'] = str(uuid.uuid4())
                highlight_id = highlight['highlight_id']
                bbox = None
                
                # Try to find the highlight text position using OCR
                if ocr_service:
                    bbox = ocr_service.find_text_position(image_base64_data, highlight['text'])
                    if bbox:
                        highlight['bounding_box'] = bbox
                        logger.debug(f"  Highlight {idx}: Found position via OCR")
                    else:
                        logger.debug(f"  Highlight {idx}: Text position not found via OCR (using centered preview)")
                
                # Generate preview image (centered on bbox if found, otherwise centered on image)
                preview_image_bytes = self._generate_image_preview_bytes(image_base64_data, bbox=bbox)
                preview_image_url = self._upload_preview_to_s3(preview_image_bytes, user_id, highlight_id)
                
                if preview_image_url:
                    highlight['preview_image_url'] = preview_image_url
                    logger.debug(f"  Highlight {idx}: Preview uploaded to S3: {preview_image_url}")
                else:
                    logger.debug(f"  Highlight {idx}: Preview generated but S3 upload failed")
            
            return highlights
            
        except Exception as e:
            logger.debug(f"Error extracting highlights from image: {e}")
            raise
    
    def _pdf_to_images(self, pdf_bytes, max_pages=20):
        """
        Convert PDF pages to base64 encoded images.
        
        Args:
            pdf_bytes: PDF file bytes
            max_pages: Maximum number of pages to process
        
        Returns:
            List of base64 encoded images
        """
        images = []
        
        try:
            # Open PDF with PyMuPDF
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            
            # Limit pages to process
            num_pages = min(len(doc), max_pages)
            
            for page_num in range(num_pages):
                page = doc[page_num]
                
                # Render page to image at 150 DPI for good quality
                mat = fitz.Matrix(150/72, 150/72)
                pix = page.get_pixmap(matrix=mat)
                
                # Convert to PNG bytes
                img_bytes = pix.tobytes("png")
                
                # Encode to base64
                img_base64 = base64.b64encode(img_bytes).decode('utf-8')
                images.append(img_base64)
            
            doc.close()
            
        except Exception as e:
            logger.debug(f"Error converting PDF to images: {e}")
            raise
        
        return images
    
    def _extract_highlights_from_image(self, image_base64, page_number, content_type='image/png'):
        """
        Extract highlights from a single page image using GPT-4o mini.
        
        Args:
            image_base64: Base64 encoded image
            page_number: Page number for reference
            content_type: MIME type for the image
        
        Returns:
            List of highlights found on this page
        """
        # Determine the correct mime type for the data URL
        if content_type in ['image/jpeg', 'image/jpg']:
            mime_type = 'image/jpeg'
        else:
            mime_type = 'image/png'
        
        prompt = """You are a precise document analyzer. Your task is to find ALL text that has been highlighted with a colored background in this document image.

SEARCH FOR THESE HIGHLIGHT COLORS:
- YELLOW (most common - bright yellow, light yellow, golden)
- ORANGE (orange, peach, tangerine)
- PINK (pink, magenta, rose, salmon)
- RED (red, crimson, scarlet)
- GREEN (green, lime, mint, light green)
- BLUE (blue, light blue, sky blue, cyan)
- PURPLE (purple, violet, lavender)

CRITICAL INSTRUCTIONS:
1. A "highlight" is text that has a colored background/marker behind it (like a highlighter pen was used)
2. Scan the ENTIRE image carefully for ANY of the colors listed above
3. For EACH highlighted section, you MUST identify:
   - The EXACT text that is highlighted (word for word, character for character)
   - The SPECIFIC color of THAT highlight's background (not any other color in the document)

4. Each highlight must be reported with ITS OWN color. Do NOT mix up colors between different highlights.
   - If text "Apple" has a YELLOW background, report: {"text": "Apple", "color": "yellow"}
   - If text "Banana" has a GREEN background, report: {"text": "Banana", "color": "green"}
   - Do NOT report Apple as green or Banana as yellow

5. Map colors to these standard values: yellow, orange, pink, red, green, blue, purple
   - Match to the closest standard color from this list

6. Include the COMPLETE highlighted text, even if it spans multiple lines

7. If NO text is highlighted on this page, return an empty array

OUTPUT FORMAT - Return ONLY this JSON structure, nothing else:
{
  "highlights": [
    {"text": "exact highlighted text here", "color": "the color of THIS specific highlight"},
    {"text": "another highlighted text", "color": "the color of THIS specific highlight"}
  ]
}

If no highlights exist:
{"highlights": []}

Now analyze the image carefully and extract ALL highlights with their correct colors."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{image_base64}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=4096,
                temperature=0.1
            )
            
            response_text = response.choices[0].message.content
            highlights = self._parse_highlights_response(response_text, page_number)
            return highlights
            
        except Exception as e:
            logger.debug(f"Error extracting highlights from page {page_number}: {e}")
            return []
    
    def _parse_highlights_response(self, response_text, page_number):
        """Parse the GPT response to extract highlights."""
        try:
            # Try to find JSON in the response
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if not json_match:
                logger.debug(f"No JSON found in response for page {page_number}")
                return []
            
            json_str = json_match.group(0)
            
            # Parse JSON
            try:
                data = json.loads(json_str)
            except json.JSONDecodeError:
                # Try to fix common JSON issues
                json_str = self._fix_json_string(json_str)
                data = json.loads(json_str)
            
            # Extract highlights array
            highlights = data.get('highlights', [])
            
            # Validate and add page number
            valid_highlights = []
            for h in highlights:
                if isinstance(h, dict) and h.get('text'):
                    valid_highlights.append({
                        'text': str(h.get('text', '')).strip(),
                        'color': str(h.get('color', 'yellow')).strip().lower(),
                        'page_number': page_number
                    })
            
            return valid_highlights
            
        except Exception as e:
            logger.debug(f"Error parsing highlights response for page {page_number}: {e}")
            return []
    
    def _fix_json_string(self, json_str):
        """Fix common JSON formatting issues."""
        result = []
        in_string = False
        escape_next = False
        
        for char in json_str:
            if escape_next:
                result.append(char)
                escape_next = False
            elif char == '\\':
                result.append(char)
                escape_next = True
            elif char == '"' and not escape_next:
                in_string = not in_string
                result.append(char)
            elif in_string:
                if char == '\n':
                    result.append('\\n')
                elif char == '\r':
                    result.append('\\r')
                elif char == '\t':
                    result.append('\\t')
                elif ord(char) < 32:
                    result.append(f'\\u{ord(char):04x}')
                else:
                    result.append(char)
            else:
                result.append(char)
        
        return ''.join(result)
    
    def _find_highlight_position(self, doc, highlight_text, page_number):
        """
        Use PyMuPDF's text search to find highlight bounding box.
        Returns normalized coordinates (0-1 range) or None if not found.
        
        Args:
            doc: PyMuPDF document object
            highlight_text: Text to search for
            page_number: 1-indexed page number
        
        Returns:
            dict with x0, y0, x1, y1 normalized coordinates, or None
        """
        if not PYMUPDF_AVAILABLE:
            return None
        
        try:
            page = doc[page_number - 1]
            
            # Search for text - try progressively shorter prefixes
            # PyMuPDF search can be sensitive to exact whitespace/formatting
            search_lengths = [100, 75, 50, 30, 20]
            
            for search_len in search_lengths:
                search_text = highlight_text[:search_len].strip()
                if not search_text:
                    continue
                    
                rects = page.search_for(search_text)
                
                if rects:
                    # Use the first match
                    rect = rects[0]
                    page_rect = page.rect
                    
                    return {
                        'x0': rect.x0 / page_rect.width,
                        'y0': rect.y0 / page_rect.height,
                        'x1': rect.x1 / page_rect.width,
                        'y1': rect.y1 / page_rect.height
                    }
            
            return None
            
        except Exception as e:
            logger.debug(f"Error finding highlight position: {e}")
            return None
    
    def _upload_preview_to_s3(self, image_bytes, user_id, highlight_id):
        """
        Upload preview image bytes to S3.
        
        Args:
            image_bytes: Image bytes (PNG or JPEG)
            user_id: User ID
            highlight_id: Highlight ID
        
        Returns:
            S3 URL string or None if upload fails
        """
        if not S3_SERVICE_AVAILABLE or not image_bytes:
            return None
        
        if not user_id or not highlight_id:
            logger.debug(f"[PDF EXTRACTION] Cannot upload to S3: user_id={user_id}, highlight_id={highlight_id}")
            return None
        
        if S3Service.is_available():
            url = S3Service.upload_highlight_image(image_bytes, user_id, highlight_id)
            return url
        else:
            logger.debug("[PDF EXTRACTION] S3 not configured, skipping upload")
            return None
    
    def _generate_preview_image_bytes(self, doc, page_number, bbox, width=600, height=320):
        """
        Generate a cropped preview image centered on the highlight (returns bytes).
        Includes context above and below the highlight.
        
        Args:
            doc: PyMuPDF document object
            page_number: 1-indexed page number
            bbox: Normalized bounding box dict with x0, y0, x1, y1
            width: Target width in pixels
            height: Target height in pixels
        
        Returns:
            PNG image bytes or None
        """
        if not PYMUPDF_AVAILABLE or not PIL_AVAILABLE:
            return None
        
        try:
            page = doc[page_number - 1]
            page_rect = page.rect
            
            # Calculate the center of the highlight
            highlight_center_y = (bbox['y0'] + bbox['y1']) / 2 * page_rect.height
            
            # Determine crop region with context
            # Calculate how much page height we need for the aspect ratio
            aspect_ratio = width / height
            crop_width = page_rect.width
            crop_height = crop_width / aspect_ratio
            
            # Center the crop on the highlight
            crop_top = max(0, highlight_center_y - crop_height / 2)
            crop_bottom = crop_top + crop_height
            
            # Adjust if we go beyond page bounds
            if crop_bottom > page_rect.height:
                crop_bottom = page_rect.height
                crop_top = max(0, crop_bottom - crop_height)
            
            # Render at higher DPI for quality
            clip = fitz.Rect(0, crop_top, page_rect.width, crop_bottom)
            mat = fitz.Matrix(2, 2)  # 2x scale for better quality
            pix = page.get_pixmap(matrix=mat, clip=clip)
            
            # Convert to PIL Image and resize
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))
            img = img.resize((width, height), Image.LANCZOS)
            
            # Save as optimized PNG
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True)
            
            return buffer.getvalue()
            
        except Exception as e:
            logger.debug(f"Error generating preview image: {e}")
            return None
    
    def _generate_preview_image(self, doc, page_number, bbox, width=600, height=320):
        """
        Generate a cropped preview image centered on the highlight.
        Includes context above and below the highlight.
        
        Args:
            doc: PyMuPDF document object
            page_number: 1-indexed page number
            bbox: Normalized bounding box dict with x0, y0, x1, y1
            width: Target width in pixels
            height: Target height in pixels
        
        Returns:
            Base64 encoded PNG string (DEPRECATED - use _generate_preview_image_bytes)
        """
        if not PYMUPDF_AVAILABLE or not PIL_AVAILABLE:
            return None
        
        try:
            page = doc[page_number - 1]
            page_rect = page.rect
            
            # Calculate the center of the highlight
            highlight_center_y = (bbox['y0'] + bbox['y1']) / 2 * page_rect.height
            
            # Determine crop region with context
            # Calculate how much page height we need for the aspect ratio
            aspect_ratio = width / height
            crop_width = page_rect.width
            crop_height = crop_width / aspect_ratio
            
            # Center the crop on the highlight
            crop_top = max(0, highlight_center_y - crop_height / 2)
            crop_bottom = crop_top + crop_height
            
            # Adjust if we go beyond page bounds
            if crop_bottom > page_rect.height:
                crop_bottom = page_rect.height
                crop_top = max(0, crop_bottom - crop_height)
            
            # Render at higher DPI for quality
            clip = fitz.Rect(0, crop_top, page_rect.width, crop_bottom)
            mat = fitz.Matrix(2, 2)  # 2x scale for better quality
            pix = page.get_pixmap(matrix=mat, clip=clip)
            
            # Convert to PIL Image and resize
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))
            img = img.resize((width, height), Image.LANCZOS)
            
            # Save as optimized PNG
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True)
            
            return base64.b64encode(buffer.getvalue()).decode('utf-8')
            
        except Exception as e:
            logger.debug(f"Error generating preview image: {e}")
            return None
    
    def _generate_page_preview_bytes(self, doc, page_number, width=600, height=320):
        """
        Generate a centered preview of the page (fallback when text position not found) - returns bytes.
        
        Args:
            doc: PyMuPDF document object
            page_number: 1-indexed page number
            width: Target width in pixels
            height: Target height in pixels
        
        Returns:
            PNG image bytes or None
        """
        if not PYMUPDF_AVAILABLE or not PIL_AVAILABLE:
            return None
        
        try:
            page = doc[page_number - 1]
            page_rect = page.rect
            
            # Calculate center crop
            aspect_ratio = width / height
            crop_width = page_rect.width
            crop_height = crop_width / aspect_ratio
            
            # Center on page
            crop_top = max(0, (page_rect.height - crop_height) / 2)
            crop_bottom = min(page_rect.height, crop_top + crop_height)
            
            # Render at higher DPI
            clip = fitz.Rect(0, crop_top, page_rect.width, crop_bottom)
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat, clip=clip)
            
            # Convert to PIL Image and resize
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))
            img = img.resize((width, height), Image.LANCZOS)
            
            # Save as optimized PNG
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True)
            
            return buffer.getvalue()
            
        except Exception as e:
            logger.debug(f"Error generating page preview: {e}")
            return None
    
    def _generate_page_preview(self, doc, page_number, width=600, height=320):
        """
        Generate a centered preview of the page (fallback when text position not found).
        
        Args:
            doc: PyMuPDF document object
            page_number: 1-indexed page number
            width: Target width in pixels
            height: Target height in pixels
        
        Returns:
            Base64 encoded PNG string
        """
        if not PYMUPDF_AVAILABLE or not PIL_AVAILABLE:
            return None
        
        try:
            page = doc[page_number - 1]
            page_rect = page.rect
            
            # Calculate center crop
            aspect_ratio = width / height
            crop_width = page_rect.width
            crop_height = crop_width / aspect_ratio
            
            # Center on page
            crop_top = max(0, (page_rect.height - crop_height) / 2)
            crop_bottom = min(page_rect.height, crop_top + crop_height)
            
            # Render at higher DPI
            clip = fitz.Rect(0, crop_top, page_rect.width, crop_bottom)
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat, clip=clip)
            
            # Convert to PIL Image and resize
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))
            img = img.resize((width, height), Image.LANCZOS)
            
            # Save as optimized PNG
            buffer = io.BytesIO()
            img.save(buffer, format='PNG', optimize=True)
            
            return base64.b64encode(buffer.getvalue()).decode('utf-8')
            
        except Exception as e:
            logger.debug(f"Error generating page preview: {e}")
            return None
    
    def _generate_image_preview_bytes(self, image_base64, bbox=None, width=600, height=320):
        """
        Generate a cropped preview from an image (for standalone images, not PDFs) - returns bytes.
        
        Args:
            image_base64: Base64 encoded image
            bbox: Optional normalized bounding box dict with x0, y0, x1, y1
            width: Target width in pixels
            height: Target height in pixels
        
        Returns:
            PNG image bytes or None
        """
        if not PIL_AVAILABLE:
            return None
        
        try:
            img_bytes = base64.b64decode(image_base64)
            img = Image.open(io.BytesIO(img_bytes))
            img_width, img_height = img.size
            
            # Calculate crop area
            aspect_ratio = width / height
            
            if bbox:
                # Center on the highlight bounding box
                center_x = (bbox['x0'] + bbox['x1']) / 2 * img_width
                center_y = (bbox['y0'] + bbox['y1']) / 2 * img_height
            else:
                # Center on image
                center_x = img_width / 2
                center_y = img_height / 2
            
            # Calculate crop dimensions
            crop_width = min(img_width, img_width * 0.8)  # Max 80% of image width
            crop_height = crop_width / aspect_ratio
            
            if crop_height > img_height:
                crop_height = img_height
                crop_width = crop_height * aspect_ratio
            
            # Calculate crop bounds centered on target point
            left = max(0, min(img_width - crop_width, center_x - crop_width / 2))
            top = max(0, min(img_height - crop_height, center_y - crop_height / 2))
            right = left + crop_width
            bottom = top + crop_height
            
            # Crop and resize
            cropped = img.crop((left, top, right, bottom))
            cropped = cropped.resize((width, height), Image.LANCZOS)
            
            # Save as optimized PNG
            buffer = io.BytesIO()
            cropped.save(buffer, format='PNG', optimize=True)
            
            return buffer.getvalue()
            
        except Exception as e:
            logger.debug(f"Error generating image preview: {e}")
            return None
    
    def _generate_image_preview(self, image_base64, bbox=None, width=600, height=320):
        """
        Generate a cropped preview from an image (for standalone images, not PDFs).
        
        Args:
            image_base64: Base64 encoded image
            bbox: Optional normalized bounding box dict with x0, y0, x1, y1
            width: Target width in pixels
            height: Target height in pixels
        
        Returns:
            Base64 encoded PNG string (DEPRECATED - use _generate_image_preview_bytes)
        """
        if not PIL_AVAILABLE:
            return None
        
        try:
            img_bytes = base64.b64decode(image_base64)
            img = Image.open(io.BytesIO(img_bytes))
            img_width, img_height = img.size
            
            # Calculate crop area
            aspect_ratio = width / height
            
            if bbox:
                # Center on the highlight bounding box
                center_x = (bbox['x0'] + bbox['x1']) / 2 * img_width
                center_y = (bbox['y0'] + bbox['y1']) / 2 * img_height
            else:
                # Center on image
                center_x = img_width / 2
                center_y = img_height / 2
            
            # Calculate crop dimensions
            crop_width = min(img_width, img_width * 0.8)  # Max 80% of image width
            crop_height = crop_width / aspect_ratio
            
            if crop_height > img_height:
                crop_height = img_height
                crop_width = crop_height * aspect_ratio
            
            # Calculate crop bounds centered on target point
            left = max(0, min(img_width - crop_width, center_x - crop_width / 2))
            top = max(0, min(img_height - crop_height, center_y - crop_height / 2))
            right = left + crop_width
            bottom = top + crop_height
            
            # Crop and resize
            cropped = img.crop((left, top, right, bottom))
            cropped = cropped.resize((width, height), Image.LANCZOS)
            
            # Save as optimized PNG
            buffer = io.BytesIO()
            cropped.save(buffer, format='PNG', optimize=True)
            
            return base64.b64encode(buffer.getvalue()).decode('utf-8')
            
        except Exception as e:
            logger.debug(f"Error generating image preview: {e}")
            return None
    
    def extract_full_text(self, file_base64_data, content_type='application/pdf'):
        """
        Extract full text from a PDF using PyMuPDF's get_text() method.
        
        Args:
            file_base64_data: Base64 encoded PDF file data
            content_type: MIME type (should be 'application/pdf')
        
        Returns:
            Full text string extracted from all pages of the PDF, or None if extraction fails
        """
        if content_type != 'application/pdf':
            logger.warning(f"extract_full_text called with non-PDF content type: {content_type}")
            return None
        
        if not PYMUPDF_AVAILABLE:
            logger.warning("PyMuPDF not available for text extraction")
            return None
        
        try:
            # Decode base64 to bytes
            pdf_bytes = base64.b64decode(file_base64_data)
            
            # Open the PDF document
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            
            # Get page count before processing
            num_pages = len(doc)
            
            # Extract text from all pages
            full_text_parts = []
            for page_num in range(num_pages):
                page = doc[page_num]
                # Use get_text() to extract text from the page
                page_text = page.get_text()
                if page_text:
                    full_text_parts.append(page_text)
            
            doc.close()
            
            # Combine all pages into single text
            full_text = '\n\n'.join(full_text_parts)
            
            logger.debug(f"Extracted {len(full_text)} characters from PDF ({num_pages} pages)")
            return full_text
            
        except Exception as e:
            logger.error(f"Error extracting full text from PDF: {e}")
            return None


# Singleton instance
_highlight_extraction_service = None

def get_highlight_extraction_service():
    """Get or create the highlight extraction service singleton."""
    global _highlight_extraction_service
    if _highlight_extraction_service is None:
        _highlight_extraction_service = HighlightExtractionService()
    return _highlight_extraction_service

# Backwards compatibility alias
def get_pdf_extraction_service():
    """Alias for backwards compatibility."""
    return get_highlight_extraction_service()

