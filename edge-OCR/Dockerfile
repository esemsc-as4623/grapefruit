# Multi-stage build for OCR Microservice
# Optimized for edge deployment with ONNX quantization

FROM python:3.10-slim as base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY ocr_demo.py .
COPY ocr_service.py .

# Create directories
RUN mkdir -p /app/onnx_models /app/receipts

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import requests; requests.get('http://localhost:8000/health')"

# Run the service
CMD ["uvicorn", "ocr_service:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "180"]
