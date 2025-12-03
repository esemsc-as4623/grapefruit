#!/usr/bin/env python3
"""
Python OCR Microservice
Provides OCR endpoint for receipt image processing
"""
import os
import sys
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
import tempfile

# Add akedo_demo to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../..', 'akedo_demo'))

from ocr_demo import (
    load_image,
    easyocr_ocr,
    tesseract_ocr,
    extract_items_from_text
)

app = Flask(__name__)

# Configuration
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'ocr'}), 200

@app.route('/ocr/receipt', methods=['POST'])
def ocr_receipt():
    """
    Process receipt image with OCR
    
    Request:
        - file: Image file (multipart/form-data)
        - engine: OCR engine ('tesseract' or 'easyocr', default: 'easyocr')
        - use_llm: Enable LLM post-processing (default: true)
    
    Response:
        {
            "text": "extracted OCR text",
            "items": [...],
            "processing_time": 12.5,
            "engine": "easyocr"
        }
    """
    try:
        # Validate file upload
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Empty filename'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Allowed: jpg, jpeg, png, pdf'}), 400
        
        # Get parameters
        engine = request.form.get('engine', 'easyocr').lower()
        use_llm = request.form.get('use_llm', 'true').lower() == 'true'
        
        # Save to temporary file
        temp_dir = tempfile.gettempdir()
        filename = secure_filename(file.filename)
        filepath = os.path.join(temp_dir, filename)
        file.save(filepath)
        
        try:
            # Load and process image
            import time
            start_time = time.time()
            
            img = load_image(filepath)
            if img is None:
                return jsonify({'error': 'Failed to load image'}), 400
            
            # Run OCR
            if engine == 'tesseract':
                ocr_text = tesseract_ocr(img)
            elif engine == 'easyocr':
                ocr_text = easyocr_ocr(img)
            else:
                return jsonify({'error': f'Invalid engine: {engine}. Use tesseract or easyocr'}), 400
            
            if not ocr_text:
                return jsonify({'error': 'OCR failed to extract text'}), 500
            
            # Extract items
            items = extract_items_from_text(ocr_text, use_llm=use_llm)
            
            processing_time = time.time() - start_time
            
            return jsonify({
                'text': ocr_text,
                'items': items,
                'processing_time': round(processing_time, 2),
                'engine': engine,
                'llm_enabled': use_llm
            }), 200
            
        finally:
            # Clean up temp file
            if os.path.exists(filepath):
                os.remove(filepath)
    
    except Exception as e:
        app.logger.error(f'OCR error: {str(e)}')
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('OCR_PORT', 5002))
    app.run(host='0.0.0.0', port=port, debug=True)
