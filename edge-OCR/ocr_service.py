"""
OCR Microservice - REST API for receipt processing

Optimized for receipt parsing with EasyOCR and Gemini LLM cleaning.

Features:
- FastAPI REST endpoints
- EasyOCR as default engine (lightweight & accurate)
- Gemini LLM cleaning for better item extraction
- Health checks and metrics

Usage:
    uvicorn ocr_service:app --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import tempfile
import os
from datetime import datetime
from pathlib import Path

# Import OCR functions
from ocr_demo import (
    process_receipt_edge,
    TESSERACT_AVAILABLE,
    EASYOCR_AVAILABLE,
    PADDLE_AVAILABLE,
    FLORENCE_AVAILABLE,
    ONNX_AVAILABLE
)

# Initialize FastAPI
app = FastAPI(
    title="Receipt OCR Service",
    description="OCR service for receipt parsing with item extraction",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Service configuration
class OCRConfig:
    DEFAULT_METHOD = "easyocr" if EASYOCR_AVAILABLE else "auto"
    USE_LLM_CLEANING = True
    MAX_FILE_SIZE_MB = 10

config = OCRConfig()

# Response models
class OCRItem(BaseModel):
    name: str = Field(..., description="Item name")
    quantity: int = Field(default=1, description="Quantity purchased") 
    price: Optional[float] = Field(None, description="Price in currency")

class OCRResponse(BaseModel):
    success: bool
    items: List[OCRItem]
    raw_text: Optional[str] = None
    method_used: str
    item_count: int
    processing_time_ms: float

class HealthResponse(BaseModel):
    status: str
    available_engines: dict
    timestamp: str

# Simple statistics tracking
class ServiceStats:
    def __init__(self):
        self.total_requests = 0
        self.total_items_extracted = 0
        self.error_count = 0

stats = ServiceStats()

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/", response_model=dict)
async def root():
    """Root endpoint with API information"""
    return {
        "service": "Receipt OCR Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "POST /ocr/receipt": "Process receipt image",
            "GET /health": "Service health check"
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        available_engines={
            "tesseract": TESSERACT_AVAILABLE,
            "easyocr": EASYOCR_AVAILABLE,
            "paddleocr": PADDLE_AVAILABLE,
            "florence": FLORENCE_AVAILABLE
        },
        timestamp=datetime.utcnow().isoformat()
    )

@app.post("/ocr/receipt", response_model=OCRResponse)
async def process_receipt(
    file: UploadFile = File(..., description="Receipt image file"),
    engine: Optional[str] = "easyocr",
    use_llm: Optional[bool] = True
):
    """
    Process a receipt image and extract items.

    Args:
        file: Receipt image (JPEG, PNG, WebP, PDF)
        engine: OCR engine ('tesseract' or 'easyocr', default: 'easyocr')
        use_llm: Enable LLM post-processing (default: true)

    Returns:
        OCRResponse with extracted items and metadata
    """
    import time
    start_time = time.time()

    # Validate file size
    temp_path = None

    try:
        stats.total_requests += 1

        # Save uploaded file to temp location
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as temp_file:
            content = await file.read()
            file_size_mb = len(content) / (1024 * 1024)

            if file_size_mb > config.MAX_FILE_SIZE_MB:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large: {file_size_mb:.2f}MB (max: {config.MAX_FILE_SIZE_MB}MB)"
                )

            temp_file.write(content)
            temp_path = temp_file.name

        # Process the receipt
        result = process_receipt_edge(
            image_path=temp_path,
            method=engine or config.DEFAULT_METHOD,
            use_llm=use_llm if use_llm is not None else config.USE_LLM_CLEANING
        )

        # Check for errors
        if 'error' in result:
            stats.error_count += 1
            raise HTTPException(status_code=500, detail=result['error'])

        # Calculate processing time
        processing_time_ms = (time.time() - start_time) * 1000
        stats.total_items_extracted += result['item_count']

        # Build response
        response = OCRResponse(
            success=True,
            items=[OCRItem(**item) for item in result['items']],
            raw_text=result.get('raw_text'),
            method_used=result['method_used'],
            item_count=result['item_count'],
            processing_time_ms=round(processing_time_ms, 2)
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        stats.error_count += 1
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    finally:
        # Cleanup temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass

@app.on_event("startup")
async def startup_event():
    """Initialize service on startup"""
    print("\n" + "="*50)
    print("🚀 Receipt OCR Service Starting")
    print("="*50)
    print(f"Default Engine: {config.DEFAULT_METHOD.upper()}")
    print(f"LLM Cleaning: {'✓' if config.USE_LLM_CLEANING and os.getenv('GOOGLE_API_KEY') else '✗'}")
    print(f"\nAvailable Engines:")
    print(f"  - EasyOCR:   {'✓' if EASYOCR_AVAILABLE else '✗'}")
    print(f"  - PaddleOCR: {'✓' if PADDLE_AVAILABLE else '✗'}")
    print(f"  - Tesseract: {'✓' if TESSERACT_AVAILABLE else '✗'}")
    print(f"  - Florence-2: {'✓' if FLORENCE_AVAILABLE else '✗'}")
    print("="*50)
    print("📖 API Documentation: http://localhost:8000/docs")
    print("📊 Health Check: http://localhost:8000/health")
    print("="*50 + "\n")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
