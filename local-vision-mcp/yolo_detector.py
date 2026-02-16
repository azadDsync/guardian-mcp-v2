"""
YOLO Object Detector for Physical Hazard Detection
Detects concrete objects: vehicles, obstacles, construction equipment, etc.
"""
import base64
import logging
from ultralytics import YOLO
from PIL import Image
import requests
from io import BytesIO

logger = logging.getLogger(__name__)


class YOLODetector:
    def __init__(self, model_size='n'):
        """
        Initialize YOLO detector
        Args:
            model_size: 'n' (nano), 's' (small), 'm' (medium)
        """
        self.model = YOLO(f'yolov8{model_size}.pt')
        logger.info(f"YOLO model yolov8{model_size}.pt loaded")
        
        # Hazard mapping: YOLO class -> hazard info
        self.hazard_classes = {
            'car': {'type': 'traffic_risk', 'severity': 0.6, 'desc': 'Vehicle traffic detected'},
            'truck': {'type': 'traffic_risk', 'severity': 0.7, 'desc': 'Heavy vehicle detected'},
            'bus': {'type': 'traffic_risk', 'severity': 0.65, 'desc': 'Large vehicle detected'},
            'motorcycle': {'type': 'traffic_risk', 'severity': 0.5, 'desc': 'Motorcycle detected'},
            'bicycle': {'type': 'traffic_risk', 'severity': 0.3, 'desc': 'Bicycle detected'},
            'person': {'type': 'crowding', 'severity': 0.4, 'desc': 'High pedestrian density'},
            'dog': {'type': 'animal_hazard', 'severity': 0.5, 'desc': 'Loose animal detected'},
            'cat': {'type': 'animal_hazard', 'severity': 0.3, 'desc': 'Animal detected'},
            'stop sign': {'type': 'traffic_control', 'severity': 0.2, 'desc': 'Traffic sign present'},
        }
        
        # Construction-related objects (not in standard COCO but we'll check names)
        self.construction_keywords = ['cone', 'barrier', 'excavator', 'crane', 'construction']
        
    def _decode_base64_image(self, data):
        if data.startswith('data:'):
            data = data.split(',', 1)[1]
        try:
            image_bytes = base64.b64decode(data, validate=True)
        except Exception as exc:
            raise ValueError("Invalid image_base64 data") from exc
        return Image.open(BytesIO(image_bytes)).convert('RGB')

    def _normalize_headers(self, image_headers):
        if not image_headers:
            return {}
        if isinstance(image_headers, dict):
            return {str(key): str(value) for key, value in image_headers.items()}
        if isinstance(image_headers, list):
            headers = {}
            for item in image_headers:
                if isinstance(item, dict) and 'key' in item and 'value' in item:
                    headers[str(item['key'])] = str(item['value'])
                else:
                    raise ValueError("image_headers list items must be {key, value} objects")
            return headers
        raise ValueError("image_headers must be an object of string values")

    def _load_image(self, image_url=None, image_base64=None, image_headers=None):
        """Load image from base64 or URL."""
        if image_base64:
            return self._decode_base64_image(image_base64)

        if image_url and image_url.startswith('data:'):
            return self._decode_base64_image(image_url)

        if not image_url:
            raise ValueError("image_url or image_base64 is required")

        headers = self._normalize_headers(image_headers)
        response = requests.get(image_url, headers=headers, timeout=10)
        if response.status_code in (401, 403):
            raise ValueError(
                "Image URL requires authorization. Provide image_base64 or image_headers with Authorization."
            )
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert('RGB')
    
    def detect(self, image_url=None, image_base64=None, image_headers=None):
        """
        Detect objects and map to safety hazards
        
        Returns:
            {
                "objects": [{"class": "car", "confidence": 0.89, "count": 3}],
                "hazards": [{"type": "traffic_risk", "severity": 0.6, ...}],
                "detection_time_ms": 450
            }
        """
        import time
        start_time = time.time()
        
        try:
            # Download and run detection
            image = self._load_image(
                image_url=image_url,
                image_base64=image_base64,
                image_headers=image_headers
            )
            results = self.model(image, verbose=False)
            
            # Extract detections
            detections = {}
            for result in results:
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    cls_name = result.names[cls_id]
                    confidence = float(box.conf[0])
                    
                    if cls_name not in detections:
                        detections[cls_name] = {'count': 0, 'max_conf': 0}
                    
                    detections[cls_name]['count'] += 1
                    detections[cls_name]['max_conf'] = max(
                        detections[cls_name]['max_conf'], 
                        confidence
                    )
            
            # Build objects list
            objects = [
                {
                    'class': cls_name,
                    'confidence': round(data['max_conf'], 2),
                    'count': data['count']
                }
                for cls_name, data in detections.items()
            ]
            
            # Map to hazards
            hazards = []
            hazard_types_seen = set()
            
            # Check for known hazard classes
            for cls_name, data in detections.items():
                if cls_name in self.hazard_classes:
                    hazard_info = self.hazard_classes[cls_name]
                    hazard_type = hazard_info['type']
                    
                    # Special handling for crowding
                    if hazard_type == 'crowding' and data['count'] >= 5:
                        severity = min(0.8, 0.4 + (data['count'] - 5) * 0.05)
                    else:
                        severity = hazard_info['severity']
                    
                    if hazard_type not in hazard_types_seen:
                        hazards.append({
                            'type': hazard_type,
                            'severity': severity,
                            'confidence': data['max_conf'],
                            'evidence': f"{data['count']} {cls_name}(s) detected",
                            'description': hazard_info['desc']
                        })
                        hazard_types_seen.add(hazard_type)
                
                # Check for construction-related keywords
                cls_lower = cls_name.lower()
                if any(kw in cls_lower for kw in self.construction_keywords):
                    if 'construction' not in hazard_types_seen:
                        hazards.append({
                            'type': 'construction',
                            'severity': 0.7,
                            'confidence': data['max_conf'],
                            'evidence': f"{data['count']} construction item(s) detected",
                            'description': 'Construction zone detected'
                        })
                        hazard_types_seen.add('construction')
            
            detection_time = int((time.time() - start_time) * 1000)
            
            logger.info(f"YOLO detected {len(objects)} object types, {len(hazards)} hazards in {detection_time}ms")
            
            return {
                'objects': objects,
                'hazards': hazards,
                'detection_time_ms': detection_time,
                'total_objects': sum(d['count'] for d in detections.values())
            }
            
        except Exception as e:
            logger.error(f"YOLO detection failed: {e}")
            raise
