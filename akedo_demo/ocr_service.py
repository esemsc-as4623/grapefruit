"""
OCR Microservice - REST API for receipt processing

Optimized for edge deployment with EasyOCR (lightweight & accurate).

Features:
- FastAPI REST endpoints
- EasyOCR as default engine (~100MB, fast, accurate)
- Gemini LLM cleaning for better item extraction
- Async processing for better throughput
- Health checks and metrics
- Multiple OCR engines: EasyOCR, PaddleOCR, Tesseract, Florence-2

Usage:
    uvicorn ocr_service:app --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import tempfile
import os
from datetime import datetime
import asyncio
from pathlib import Path

# Import OCR functions
from ocr_demo import (
    process_receipt_edge,
    florence_ocr,
    FLORENCE_AVAILABLE,
    ONNX_AVAILABLE,
    TESSERACT_AVAILABLE,
    EASYOCR_AVAILABLE,
    PADDLE_AVAILABLE
)

# Initialize FastAPI
app = FastAPI(
    title="Receipt OCR Microservice",
    description="Edge-optimized OCR service with EasyOCR + Gemini LLM cleaning",
    version="1.0.0"
)

# Configure CORS to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development. Restrict in production!
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Service configuration
class OCRConfig:
    """Global configuration for OCR service"""
    # EasyOCR is the default - lightweight, fast, and accurate
    DEFAULT_METHOD = "easyocr" if EASYOCR_AVAILABLE else "auto"
    DEFAULT_MODEL_SIZE = "base"  # For Florence if explicitly requested
    USE_ONNX = False  # Not needed for EasyOCR
    USE_LLM_CLEANING = True  # Use Gemini for item cleaning
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
    preprocessing: Optional[str] = None
    item_count: int
    processing_time_ms: float
    timestamp: str

class HealthResponse(BaseModel):
    status: str
    available_engines: dict
    onnx_enabled: bool
    timestamp: str

# Statistics tracking
class ServiceStats:
    def __init__(self):
        self.total_requests = 0
        self.total_items_extracted = 0
        self.avg_processing_time_ms = 0.0
        self.error_count = 0

    def update(self, items_count: int, processing_time_ms: float):
        self.total_requests += 1
        self.total_items_extracted += items_count
        # Running average
        self.avg_processing_time_ms = (
            (self.avg_processing_time_ms * (self.total_requests - 1) + processing_time_ms)
            / self.total_requests
        )

    def record_error(self):
        self.error_count += 1

stats = ServiceStats()

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/", response_model=dict)
async def root():
    """Root endpoint with API information"""
    return {
        "service": "Receipt OCR Microservice",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "POST /ocr": "Process receipt image",
            "GET /health": "Service health check",
            "GET /stats": "Service statistics",
            "GET /config": "Current configuration"
        },
        "documentation": "/docs"
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        available_engines={
            "florence": FLORENCE_AVAILABLE,
            "onnx": ONNX_AVAILABLE,
            "tesseract": TESSERACT_AVAILABLE,
            "easyocr": EASYOCR_AVAILABLE,
            "paddleocr": PADDLE_AVAILABLE
        },
        onnx_enabled=config.USE_ONNX and ONNX_AVAILABLE,
        timestamp=datetime.utcnow().isoformat()
    )

@app.get("/stats")
async def get_stats():
    """Get service statistics"""
    return {
        "total_requests": stats.total_requests,
        "total_items_extracted": stats.total_items_extracted,
        "avg_processing_time_ms": round(stats.avg_processing_time_ms, 2),
        "error_count": stats.error_count,
        "error_rate": round(stats.error_count / max(stats.total_requests, 1) * 100, 2),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/config")
async def get_config():
    """Get current service configuration"""
    return {
        "default_method": config.DEFAULT_METHOD,
        "default_model_size": config.DEFAULT_MODEL_SIZE,
        "use_onnx": config.USE_ONNX,
        "use_llm_cleaning": config.USE_LLM_CLEANING,
        "max_file_size_mb": config.MAX_FILE_SIZE_MB,
        "gemini_available": os.getenv('GOOGLE_API_KEY') is not None
    }

@app.post("/ocr", response_model=OCRResponse)
async def process_receipt(
    file: UploadFile = File(..., description="Receipt image file"),
    method: Optional[str] = None,
    model_size: Optional[str] = None,
    use_onnx: Optional[bool] = None,
    use_llm: Optional[bool] = None,
    include_raw_text: bool = False
):
    """
    Process a receipt image and extract items.

    Args:
        file: Receipt image (JPEG, PNG, WebP)
        method: OCR method ('florence', 'florence-onnx', 'tesseract', 'easyocr', 'paddle', 'auto')
        model_size: Florence model size ('base' or 'large') - use 'base' for edge
        use_onnx: Enable ONNX quantization (default: True)
        use_llm: Use Gemini LLM for item cleaning (default: True)
        include_raw_text: Include raw OCR text in response

    Returns:
        OCRResponse with extracted items and metadata
    """
    import time
    start_time = time.time()

    # Use config defaults if not specified
    method = method or config.DEFAULT_METHOD
    model_size = model_size or config.DEFAULT_MODEL_SIZE
    use_onnx = use_onnx if use_onnx is not None else config.USE_ONNX
    use_llm = use_llm if use_llm is not None else config.USE_LLM_CLEANING

    # Validate file size
    file_size_mb = 0
    temp_path = None

    try:
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
            method=method,
            florence_model_size=model_size,
            use_onnx=use_onnx,
            use_llm=use_llm
        )

        # Check for errors
        if 'error' in result:
            stats.record_error()
            raise HTTPException(status_code=500, detail=result['error'])

        # Calculate processing time
        processing_time_ms = (time.time() - start_time) * 1000

        # Update stats
        stats.update(result['item_count'], processing_time_ms)

        # Build response
        response = OCRResponse(
            success=True,
            items=[OCRItem(**item) for item in result['items']],
            raw_text=result['raw_text'] if include_raw_text else None,
            method_used=result['method_used'],
            preprocessing=result.get('preprocessing'),
            item_count=result['item_count'],
            processing_time_ms=round(processing_time_ms, 2),
            timestamp=datetime.utcnow().isoformat()
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        stats.record_error()
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    finally:
        # Cleanup temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass

@app.post("/ocr/with-metadata")
async def process_receipt_with_metadata(
    image: UploadFile = File(..., description="Receipt image"),
    metadata: Optional[UploadFile] = File(None, description="Metadata file (.txt, .md, .json)"),
    notes: Optional[str] = None,
    method: Optional[str] = None,
    model_size: Optional[str] = None,
    use_onnx: Optional[bool] = None,
    use_llm: Optional[bool] = None
):
    """
    Process receipt with optional metadata files.

    You can upload:
    - image: Receipt image (required)
    - metadata: Text/markdown/JSON file with additional context (optional)
    - notes: Inline notes as form field (optional)

    The metadata is included in the response for reference.
    """
    import time
    start_time = time.time()

    # Read metadata if provided
    metadata_content = None
    metadata_filename = None
    if metadata:
        metadata_filename = metadata.filename
        content = await metadata.read()
        try:
            metadata_content = content.decode('utf-8')
        except:
            metadata_content = content.decode('latin-1')

    # Use config defaults
    method = method or config.DEFAULT_METHOD
    model_size = model_size or config.DEFAULT_MODEL_SIZE
    use_onnx = use_onnx if use_onnx is not None else config.USE_ONNX
    use_llm = use_llm if use_llm is not None else config.USE_LLM_CLEANING

    temp_path = None

    try:
        # Save image to temp location
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(image.filename).suffix) as temp_file:
            content = await image.read()
            temp_file.write(content)
            temp_path = temp_file.name

        # Process the receipt
        result = process_receipt_edge(
            image_path=temp_path,
            method=method,
            florence_model_size=model_size,
            use_onnx=use_onnx,
            use_llm=use_llm
        )

        if 'error' in result:
            stats.record_error()
            raise HTTPException(status_code=500, detail=result['error'])

        processing_time_ms = (time.time() - start_time) * 1000
        stats.update(result['item_count'], processing_time_ms)

        return {
            "success": True,
            "image_filename": image.filename,
            "metadata_filename": metadata_filename,
            "metadata_content": metadata_content,
            "notes": notes,
            "items": [OCRItem(**item) for item in result['items']],
            "method_used": result['method_used'],
            "item_count": result['item_count'],
            "processing_time_ms": round(processing_time_ms, 2),
            "timestamp": datetime.utcnow().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        stats.record_error()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass


@app.post("/ocr/batch")
async def process_receipts_batch(
    files: List[UploadFile] = File(..., description="Multiple receipt images"),
    method: Optional[str] = None,
    background_tasks: BackgroundTasks = None
):
    """
    Process multiple receipts in batch.

    Note: This processes receipts sequentially. For true parallel processing,
    consider using a task queue (Celery, RQ, etc.)
    """
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per batch request")

    results = []
    for file in files:
        try:
            result = await process_receipt(file=file, method=method)
            results.append({
                "filename": file.filename,
                "success": True,
                "result": result
            })
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e)
            })

    return {
        "total": len(files),
        "successful": sum(1 for r in results if r["success"]),
        "failed": sum(1 for r in results if not r["success"]),
        "results": results
    }

# ============================================================================
# Startup/Shutdown Events
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize service on startup"""
    print("\n" + "="*70)
    print("🚀 Receipt OCR Microservice Starting")
    print("="*70)
    print(f"Default Method: {config.DEFAULT_METHOD.upper()}")
    print(f"LLM Cleaning: {'✓' if config.USE_LLM_CLEANING and os.getenv('GOOGLE_API_KEY') else '✗'}")
    print(f"\nAvailable Engines:")
    print(f"  - EasyOCR:   {'✓ [DEFAULT]' if EASYOCR_AVAILABLE else '✗'}")
    print(f"  - PaddleOCR: {'✓' if PADDLE_AVAILABLE else '✗'}")
    print(f"  - Tesseract: {'✓' if TESSERACT_AVAILABLE else '✗'}")
    print(f"  - Florence-2: {'✓' if FLORENCE_AVAILABLE else '✗'}")
    print(f"  - ONNX (for Florence): {'✓' if ONNX_AVAILABLE else '✗'}")
    print("="*70)
    print("📖 API Documentation: http://localhost:8000/docs")
    print("📊 Health Check: http://localhost:8000/health")
    print("="*70 + "\n")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("\n" + "="*70)
    print("🛑 Receipt OCR Microservice Shutting Down")
    print("="*70)
    print(f"Total Requests Processed: {stats.total_requests}")
    print(f"Total Items Extracted: {stats.total_items_extracted}")
    print(f"Avg Processing Time: {stats.avg_processing_time_ms:.2f}ms")
    print(f"Error Rate: {stats.error_count / max(stats.total_requests, 1) * 100:.2f}%")
    print("="*70 + "\n")

# ============================================================================
# Run with: uvicorn ocr_service:app --reload --host 0.0.0.0 --port 8000
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
