"""
Receipt OCR Demo - Edge Optimized

100% on-device processing using edge ML libraries. No cloud APIs.

Methods (in order of recommendation for edge):
1. Tesseract OCR - Fast, lightweight, works offline
2. EasyOCR - Better accuracy, larger model, GPU optional
3. PaddleOCR - Best accuracy for receipts, optimized for edge

All methods include preprocessing:
- Proper image format handling (WebP, JPEG, PNG)
- Grayscale conversion
- Contrast enhancement (CLAHE)
- Light denoising
"""

import os
import re
from PIL import Image
import cv2
import numpy as np
from io import BytesIO

# Edge ML OCR libraries (all run locally, no cloud)
try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False

try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
except ImportError:
    PADDLE_AVAILABLE = False


# IMAGE_PATH = "/Users/bs1324/repos/grapefruit/akedo_demo/receipts/inbox_12421376_4d5c600731265119bb28668959d5c357_Frame 16.png"
IMAGE_PATH="/Users/bs1324/repos/grapefruit/akedo_demo/receipts/download.jpeg"

# ============================================================================
# Image Loading (handles WebP, JPEG, PNG correctly)
# ============================================================================

def load_image(image_path: str) -> np.ndarray:
    """
    Load image using PIL first (handles WebP correctly), then convert to OpenCV format.
    """
    # Use PIL to load - it handles WebP and other formats correctly
    pil_image = Image.open(image_path)
    
    # Convert to RGB if needed (handles RGBA, palette modes, etc.)
    if pil_image.mode != 'RGB':
        pil_image = pil_image.convert('RGB')
    
    # Convert to numpy array (OpenCV format)
    img = np.array(pil_image)
    
    # PIL is RGB, OpenCV is BGR
    img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    
    return img


# ============================================================================
# Simple Preprocessing (don't over-process!)
# ============================================================================

def preprocess_simple(image: np.ndarray) -> np.ndarray:
    """
    Light preprocessing - don't destroy the text!
    
    For receipts, minimal processing is often best:
    1. Grayscale
    2. Light contrast enhancement (CLAHE)
    3. Optional: slight denoise
    """
    # Grayscale
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    
    # CLAHE for contrast enhancement (much gentler than adaptive threshold)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    return enhanced


def preprocess_for_tesseract(image: np.ndarray) -> np.ndarray:
    """
    Preprocessing optimized for Tesseract.
    Tesseract works best with black text on white background.
    """
    gray = preprocess_simple(image)
    
    # Otsu's thresholding - automatically finds optimal threshold
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    return binary


# ============================================================================
# Method 1: Tesseract OCR (Fastest, ~5MB model)
# ============================================================================

def tesseract_ocr(image_path: str) -> str:
    """
    Tesseract OCR - fastest edge option.
    
    Pros: Very fast, tiny footprint, works on any device
    Cons: Lower accuracy on noisy/skewed receipts
    
    Install: brew install tesseract (macOS) or apt install tesseract-ocr (Linux)
    """
    if not TESSERACT_AVAILABLE:
        return "Error: pytesseract not installed. Run: pip install pytesseract"
    
    try:
        # Load image properly (handles WebP)
        image = load_image(image_path)
        
        # Preprocess for Tesseract
        processed = preprocess_for_tesseract(image)
        
        # Tesseract config for receipts
        # PSM 4: Assume a single column of text of variable sizes
        # PSM 6: Assume a single uniform block of text (alternative)
        config = "--psm 4 --oem 3"
        text = pytesseract.image_to_string(processed, config=config)
        
        return text.strip()
    except Exception as e:
        return f"Error: {str(e)}"


# ============================================================================
# Method 2: EasyOCR (Better accuracy, ~100MB models)
# ============================================================================

def easyocr_ocr(image_path: str, gpu: bool = False) -> str:
    """
    EasyOCR - good balance of accuracy and speed.
    
    Pros: Better accuracy than Tesseract, handles various fonts
    Cons: Larger model size, slower on CPU
    
    Set gpu=True if CUDA available for 10x speedup.
    """
    if not EASYOCR_AVAILABLE:
        return "Error: easyocr not installed. Run: pip install easyocr"
    
    try:
        # Load image properly (handles WebP)
        image = load_image(image_path)
        
        # Light preprocessing only
        processed = preprocess_simple(image)
        
        # Initialize reader (models are cached after first run)
        reader = easyocr.Reader(['en'], gpu=gpu, verbose=False)
        
        # Run OCR on preprocessed grayscale
        results = reader.readtext(processed)
        
        # Sort by vertical position and concatenate
        lines = []
        for (bbox, text, confidence) in results:
            if confidence > 0.3:  # Filter low confidence
                y_pos = bbox[0][1]
                lines.append((y_pos, text))
        
        lines.sort(key=lambda x: x[0])
        return "\n".join([text for _, text in lines])
    except Exception as e:
        return f"Error: {str(e)}"


# ============================================================================
# Method 3: PaddleOCR (Best accuracy for receipts, ~50MB)
# ============================================================================

def paddle_ocr(image_path: str, use_gpu: bool = False) -> str:
    """
    PaddleOCR - best accuracy for structured documents like receipts.
    
    Pros: Excellent accuracy, optimized for edge, good with tables/receipts
    Cons: Requires paddlepaddle, slightly complex setup
    
    Install: pip install paddlepaddle paddleocr
    """
    if not PADDLE_AVAILABLE:
        return "Error: paddleocr not installed. Run: pip install paddlepaddle paddleocr"
    
    try:
        # Load image properly (handles WebP)
        image = load_image(image_path)
        
        # Initialize PaddleOCR (uses lightweight models by default)
        ocr = PaddleOCR(
            use_angle_cls=True,  # Detect text orientation
            lang='en',
            use_gpu=use_gpu,
            show_log=False,
        )
        
        # Run OCR directly on the loaded image
        results = ocr.ocr(image, cls=True)
        
        if not results or not results[0]:
            return ""
        
        # Extract text sorted by position
        lines = []
        for line in results[0]:
            bbox, (text, confidence) = line
            if confidence > 0.5:
                y_pos = bbox[0][1]
                lines.append((y_pos, text))
        
        lines.sort(key=lambda x: x[0])
        return "\n".join([text for _, text in lines])
    except Exception as e:
        return f"Error: {str(e)}"


# ============================================================================
# Item Extraction (On-device NLP parsing)
# ============================================================================

def extract_items_from_text(ocr_text: str) -> list:
    """
    Parse raw OCR text to extract items using regex-based NLP.
    100% on-device, no cloud APIs.
    """
    items = []
    lines = ocr_text.split('\n')
    
    # Patterns to skip (not actual items)
    skip_patterns = [
        r'(?:sub)?total', r'savings?', r'promotions?', r'clubcard',
        r'points?', r'balance', r'\bcard\b', r'\bvat\b', r'\bchange\b',
        r'\bcash\b', r'thank\s*you', r'receipt', r'www\.', r'number',
        r'^\s*\d{2}[/\-]\d{2}', r'^\s*\d{2}:\d{2}', r'tel:', r'phone',
        r'customer', r'transaction', r'payment', r'visa', r'mastercard',
        r'debit', r'credit', r'approved', r'auth', r'ref\s*:', r'store',
    ]
    
    # Price pattern
    price_pattern = r'[£$€]?\s*-?\d+[.,]\d{2}'
    
    for line in lines:
        line = line.strip()
        if len(line) < 3:
            continue
        
        line_lower = line.lower()
        if any(re.search(p, line_lower) for p in skip_patterns):
            continue
        
        # Skip lines that are ONLY prices
        if re.match(rf'^{price_pattern}\s*$', line):
            continue
        
        # Remove trailing price
        clean = re.sub(rf'\s*{price_pattern}\s*$', '', line).strip()
        
        # Remove category markers like (F), (V) etc
        clean = re.sub(r'\s*\([a-zA-Z]\)\s*$', '', clean).strip()
        
        # Remove leading item codes/numbers
        clean = re.sub(r'^[\d]{4,}\s+', '', clean).strip()
        
        if len(clean) < 2:
            continue
        
        # Extract quantity if present
        qty_match = re.match(r'^(\d+)\s*[xX@]?\s+(.+)$', clean)
        if qty_match:
            qty = int(qty_match.group(1))
            item_name = qty_match.group(2).strip()
        else:
            qty = 1
            item_name = clean
        
        # Skip if item name looks like noise
        if re.match(r'^[\d\W]+$', item_name):
            continue
        
        items.append({
            'quantity': qty,
            'name': item_name.title()  # Normalize case
        })
    
    return items


# ============================================================================
# High-level API for edge deployment
# ============================================================================

def process_receipt_edge(image_path: str, method: str = 'auto') -> dict:
    """
    Process receipt using edge-optimized OCR.
    
    Args:
        image_path: Path to receipt image
        method: 'tesseract', 'easyocr', 'paddle', or 'auto' (tries in order)
    
    Returns:
        dict with 'raw_text', 'items', 'method_used'
    """
    methods = {
        'tesseract': (TESSERACT_AVAILABLE, tesseract_ocr),
        'easyocr': (EASYOCR_AVAILABLE, easyocr_ocr),
        'paddle': (PADDLE_AVAILABLE, paddle_ocr),
    }
    
    if method == 'auto':
        # Try methods in order of preference for edge
        order = ['paddle', 'easyocr', 'tesseract']
    else:
        order = [method]
    
    for m in order:
        available, func = methods.get(m, (False, None))
        if available and func:
            raw_text = func(image_path)
            if not raw_text.startswith("Error:"):
                items = extract_items_from_text(raw_text)
                return {
                    'raw_text': raw_text,
                    'items': items,
                    'method_used': m,
                    'item_count': len(items)
                }
    
    return {
        'error': 'No OCR engine available. Install one of: pytesseract, easyocr, paddleocr',
        'items': [],
        'method_used': None
    }


# ============================================================================
# Main - Demo all edge methods
# ============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("RECEIPT OCR - EDGE OPTIMIZED (100% On-Device)")
    print("=" * 60)
    print(f"Image: {IMAGE_PATH}\n")
    
    # Show available engines
    print("Available OCR Engines:")
    print(f"  Tesseract: {'✓' if TESSERACT_AVAILABLE else '✗ (pip install pytesseract)'}")
    print(f"  EasyOCR:   {'✓' if EASYOCR_AVAILABLE else '✗ (pip install easyocr)'}")
    print(f"  PaddleOCR: {'✓' if PADDLE_AVAILABLE else '✗ (pip install paddlepaddle paddleocr)'}")
    print()
    
    # Method 1: Tesseract
    if TESSERACT_AVAILABLE:
        print("-" * 60)
        print("Method 1: TESSERACT (Fastest, ~5MB)")
        print("-" * 60)
        text = tesseract_ocr(IMAGE_PATH)
        print("Raw OCR Output:")
        print(text[:800] if len(text) > 800 else text)
        print("\nExtracted Items:")
        for item in extract_items_from_text(text)[:10]:
            print(f"  {item['quantity']:>2}x {item['name']}")
        print()
    
    # Method 2: EasyOCR
    if EASYOCR_AVAILABLE:
        print("-" * 60)
        print("Method 2: EASYOCR (Better accuracy, ~100MB)")
        print("-" * 60)
        text = easyocr_ocr(IMAGE_PATH)
        print("Raw OCR Output:")
        print(text[:800] if len(text) > 800 else text)
        print("\nExtracted Items:")
        for item in extract_items_from_text(text)[:10]:
            print(f"  {item['quantity']:>2}x {item['name']}")
        print()
    
    # Method 3: PaddleOCR
    if PADDLE_AVAILABLE:
        print("-" * 60)
        print("Method 3: PADDLEOCR (Best for receipts, ~50MB)")
        print("-" * 60)
        text = paddle_ocr(IMAGE_PATH)
        print("Raw OCR Output:")
        print(text[:800] if len(text) > 800 else text)
        print("\nExtracted Items:")
        for item in extract_items_from_text(text)[:10]:
            print(f"  {item['quantity']:>2}x {item['name']}")
        print()
    
    # High-level API demo
    print("=" * 60)
    print("HIGH-LEVEL API: process_receipt_edge()")
    print("=" * 60)
    result = process_receipt_edge(IMAGE_PATH, method='auto')
    if 'error' not in result:
        print(f"Method used: {result['method_used']}")
        print(f"Items found: {result['item_count']}")
        print("\nItems:")
        for item in result['items'][:15]:
            print(f"  {item['quantity']:>2}x {item['name']}")
    else:
        print(f"Error: {result['error']}")