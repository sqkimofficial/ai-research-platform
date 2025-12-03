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

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from openai import OpenAI
from config import Config

# Try to import PDF to image conversion libraries
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    print("Warning: PyMuPDF not installed. Install with: pip install pymupdf")


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
    
    def extract_highlights(self, file_base64_data, content_type='application/pdf'):
        """
        Extract highlighted text from a document (PDF or image) using OpenAI's vision capabilities.
        
        Args:
            file_base64_data: Base64 encoded file data
            content_type: MIME type of the file (application/pdf, image/jpeg, image/png)
        
        Returns:
            List of highlights with text and color information
        """
        file_type = self.SUPPORTED_TYPES.get(content_type, 'pdf')
        
        if file_type == 'pdf':
            return self._extract_from_pdf(file_base64_data)
        else:
            return self._extract_from_image(file_base64_data, content_type)
    
    def _extract_from_pdf(self, pdf_base64_data):
        """Extract highlights from a PDF file."""
        if not PYMUPDF_AVAILABLE:
            raise ValueError("PyMuPDF is required for PDF processing. Install with: pip install pymupdf")
        
        try:
            # Decode base64 to bytes
            pdf_bytes = base64.b64decode(pdf_base64_data)
            
            # Convert PDF pages to images
            images = self._pdf_to_images(pdf_bytes)
            
            if not images:
                print("No images extracted from PDF")
                return []
            
            # Process each page and collect highlights
            all_highlights = []
            
            for page_num, image_base64 in enumerate(images, start=1):
                print(f"Processing page {page_num}...")
                page_highlights = self._extract_highlights_from_image(image_base64, page_num)
                all_highlights.extend(page_highlights)
            
            return all_highlights
            
        except Exception as e:
            print(f"Error extracting highlights from PDF: {e}")
            raise
    
    def _extract_from_image(self, image_base64_data, content_type):
        """Extract highlights from an image file (JPG/PNG)."""
        try:
            # For images, we process directly - no conversion needed
            print("Processing image...")
            highlights = self._extract_highlights_from_image(image_base64_data, page_number=1, content_type=content_type)
            return highlights
            
        except Exception as e:
            print(f"Error extracting highlights from image: {e}")
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
            print(f"Error converting PDF to images: {e}")
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
            print(f"Error extracting highlights from page {page_number}: {e}")
            return []
    
    def _parse_highlights_response(self, response_text, page_number):
        """Parse the GPT response to extract highlights."""
        try:
            # Try to find JSON in the response
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if not json_match:
                print(f"No JSON found in response for page {page_number}")
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
            print(f"Error parsing highlights response for page {page_number}: {e}")
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

