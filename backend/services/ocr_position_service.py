"""
OCR Position Service for finding text positions in images using Tesseract OCR.
Used for generating highlight preview images centered on the highlighted text.
"""
import base64
import io
from utils.logger import get_logger

logger = get_logger(__name__)

# Try to import required libraries
try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False
    logger.warning("pytesseract not installed. Install with: pip install pytesseract")
    logger.warning("Note: Tesseract OCR must also be installed on your system.")

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    logger.warning("Pillow not installed. Install with: pip install pillow")


class OCRPositionService:
    """Service for finding text positions in images using Tesseract OCR."""
    
    def __init__(self):
        self.available = PYTESSERACT_AVAILABLE and PIL_AVAILABLE
        if not self.available:
            logger.warning("OCRPositionService: Not fully available - missing dependencies")
    
    def find_text_position(self, image_base64, search_text):
        """
        Find the bounding box of text in an image.
        Returns normalized coordinates (0-1 range) or None if not found.
        
        Args:
            image_base64: Base64 encoded image data
            search_text: The text to search for in the image
            
        Returns:
            dict with x0, y0, x1, y1 normalized coordinates (0-1 range), or None
        """
        if not self.available:
            logger.warning("OCRPositionService: Cannot find text position - dependencies not available")
            return None
        
        if not search_text or not search_text.strip():
            return None
        
        try:
            # Decode image
            img_bytes = base64.b64decode(image_base64)
            img = Image.open(io.BytesIO(img_bytes))
            width, height = img.size
            
            # Run Tesseract with bounding box output
            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
            
            # Build text blocks with positions
            blocks = []
            for i, text in enumerate(data['text']):
                if text.strip():
                    blocks.append({
                        'text': text.strip(),
                        'x': data['left'][i],
                        'y': data['top'][i],
                        'w': data['width'][i],
                        'h': data['height'][i]
                    })
            
            if not blocks:
                logger.debug("OCRPositionService: No text found in image by Tesseract")
                return None
            
            # Try multiple search strategies
            bbox = self._try_exact_phrase_match(blocks, search_text, width, height)
            if bbox:
                logger.debug(f"OCRPositionService: Found exact phrase match")
                return bbox
            
            bbox = self._try_word_sequence_match(blocks, search_text, width, height)
            if bbox:
                logger.debug(f"OCRPositionService: Found word sequence match")
                return bbox
            
            bbox = self._try_fuzzy_match(blocks, search_text, width, height)
            if bbox:
                logger.debug(f"OCRPositionService: Found fuzzy match")
                return bbox
            
            logger.debug(f"OCRPositionService: Could not find text '{search_text[:50]}...' in image")
            return None
            
        except Exception as e:
            logger.debug(f"OCRPositionService: Error finding text position: {e}")
            return None
    
    def _try_exact_phrase_match(self, blocks, search_text, img_width, img_height):
        """Try to find the search text as an exact substring in the concatenated OCR text."""
        # Build full text from blocks
        full_text = ' '.join(b['text'] for b in blocks).lower()
        search_lower = search_text.lower()[:100]  # Use first 100 chars
        
        if search_lower not in full_text:
            return None
        
        # Find start position in the concatenated text
        start_idx = full_text.find(search_lower)
        
        # Map back to blocks
        char_count = 0
        start_block = end_block = None
        
        for i, block in enumerate(blocks):
            block_text = block['text'].lower()
            block_len = len(block_text) + 1  # +1 for space
            
            # Check if this block contains the start of our search text
            if start_block is None and char_count <= start_idx < char_count + block_len:
                start_block = i
            
            # Check if this block contains the end of our search text
            search_end = start_idx + len(search_lower)
            if char_count <= search_end <= char_count + block_len:
                end_block = i
                break
            
            char_count += block_len
        
        if start_block is not None and end_block is not None:
            return self._calculate_bbox(blocks[start_block:end_block + 1], img_width, img_height)
        
        return None
    
    def _try_word_sequence_match(self, blocks, search_text, img_width, img_height):
        """Try to find a sequence of words from the search text."""
        # Split search text into words
        search_words = search_text.lower().split()[:10]  # Use first 10 words
        
        if not search_words:
            return None
        
        # Look for the first word in blocks
        first_word = search_words[0]
        
        for i, block in enumerate(blocks):
            if first_word in block['text'].lower():
                # Found potential start - try to match subsequent words
                matched_blocks = [block]
                word_idx = 1
                
                for j in range(i + 1, min(i + 20, len(blocks))):  # Look at next 20 blocks max
                    if word_idx >= len(search_words):
                        break
                    
                    block_text = blocks[j]['text'].lower()
                    if search_words[word_idx] in block_text:
                        matched_blocks.append(blocks[j])
                        word_idx += 1
                
                # If we matched at least 3 words or 50% of search words, consider it a match
                min_match = max(3, len(search_words) // 2)
                if len(matched_blocks) >= min_match:
                    return self._calculate_bbox(matched_blocks, img_width, img_height)
        
        return None
    
    def _try_fuzzy_match(self, blocks, search_text, img_width, img_height):
        """Try a fuzzy match by finding blocks containing significant words from the search text."""
        # Get significant words (>3 chars) from search text
        search_words = [w.lower() for w in search_text.split() if len(w) > 3][:15]
        
        if not search_words:
            return None
        
        # Score each block by how many search words it contains
        matched_blocks = []
        
        for block in blocks:
            block_text = block['text'].lower()
            for word in search_words:
                if word in block_text:
                    matched_blocks.append(block)
                    break
        
        # Need at least 2 matched blocks
        if len(matched_blocks) >= 2:
            # Return bounding box of consecutive matched blocks
            return self._calculate_bbox(matched_blocks, img_width, img_height)
        
        return None
    
    def _calculate_bbox(self, matched_blocks, img_width, img_height):
        """Calculate normalized bounding box from matched blocks."""
        if not matched_blocks:
            return None
        
        # Calculate bounding box spanning all matched blocks
        x0 = min(b['x'] for b in matched_blocks)
        y0 = min(b['y'] for b in matched_blocks)
        x1 = max(b['x'] + b['w'] for b in matched_blocks)
        y1 = max(b['y'] + b['h'] for b in matched_blocks)
        
        # Normalize to 0-1 range
        return {
            'x0': x0 / img_width,
            'y0': y0 / img_height,
            'x1': x1 / img_width,
            'y1': y1 / img_height
        }


# Singleton instance
_ocr_position_service = None


def get_ocr_position_service():
    """Get or create the OCR position service singleton."""
    global _ocr_position_service
    if _ocr_position_service is None:
        _ocr_position_service = OCRPositionService()
    return _ocr_position_service


