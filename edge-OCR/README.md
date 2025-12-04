# Receipt OCR Service

This service provides OCR (Optical Character Recognition) functionality for processing receipt images and extracting grocery items.

## Features

- **Multiple OCR Engines**: EasyOCR (default), PaddleOCR, Tesseract, Florence-2
- **Smart Item Extraction**: Uses pattern matching and optional Gemini LLM for better accuracy
- **Image Preprocessing**: Handles rotation, contrast enhancement, and noise reduction
- **REST API**: FastAPI-based service with health checks and monitoring

## Files

- `ocr_service.py` - FastAPI service that provides the REST endpoints
- `ocr_demo.py` - Core OCR functions and image processing logic
- `requirements.txt` - Python dependencies
- `Dockerfile` - Container configuration
- `receipts/` - Sample receipt images for testing

## Endpoints

### `POST /ocr/receipt`
Process a receipt image and extract items.

**Parameters:**
- `file` - Receipt image (JPEG, PNG, WebP, PDF)
- `engine` - OCR engine ('easyocr', 'tesseract', 'paddleocr', 'florence') 
- `use_llm` - Enable Gemini LLM for better item extraction (default: true)

**Response:**
```json
{
  "success": true,
  "items": [
    {"name": "Milk", "quantity": 1, "price": 1.50},
    {"name": "Bread", "quantity": 2, "price": 2.00}
  ],
  "method_used": "easyocr",
  "item_count": 2,
  "processing_time_ms": 1250.5
}
```

### `GET /health`
Service health check with available engines.

### `GET /`
API information and documentation links.

## Usage

The service runs on port 8000 and is automatically started by Docker Compose as part of the main application.

## Environment Variables

- `GOOGLE_API_KEY` - Required for Gemini LLM item cleaning (optional but recommended)

## Dependencies

### System Dependencies
- `tesseract-ocr` - For Tesseract OCR engine
- `libgl1` - For OpenCV image processing
- `curl` - For health checks

### Python Dependencies
- `fastapi` - Web framework
- `easyocr` - Default OCR engine
- `opencv-python` - Image preprocessing
- `google-generativeai` - LLM integration