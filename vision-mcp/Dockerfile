FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    rm -rf /root/.cache/pip/* && \
    find /usr/local/lib/python3.11 -name "*.pyc" -delete && \
    find /usr/local/lib/python3.11 -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# Copy application code
COPY index.py yolo_detector.py condition_analyzer.py ./

# Pre-download YOLOv8 only (Moondream2 downloads on first use via lazy loading)
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" && \
    rm -rf /root/.cache/pip/*

# Run the MCP server
CMD ["python", "-u", "index.py"]
