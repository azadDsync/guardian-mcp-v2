"""
Moondream2 Vision Analyzer for Abstract/Environmental Conditions
Detects: lighting, weather visibility, wet surfaces, area quality
"""
import base64
import logging
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from PIL import Image
import requests
from io import BytesIO
import time

logger = logging.getLogger(__name__)


class ConditionAnalyzer:
    def __init__(self):
        """
        Initialize Moondream2 vision analyzer with lazy loading
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model_id = "vikhyatk/moondream2"
        self.revision = "2024-08-26"
        self.model = None
        self.tokenizer = None
        logger.info("Moondream2 analyzer initialized (lazy loading enabled)")
    
    def _ensure_loaded(self):
        """Load model on first use"""
        if self.model is None:
            logger.info(f"Loading Moondream2 on {self.device}...")
            logger.info("This may take 2-3 minutes on first call while downloading model...")
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                trust_remote_code=True,
                revision=self.revision,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                low_cpu_mem_usage=True
            ).to(self.device)
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_id,
                revision=self.revision
            )
            logger.info("Moondream2 loaded successfully!")
    
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

    def analyze(self, image_url=None, image_base64=None, image_headers=None):
        """
        Analyze environmental conditions using Moondream2
        
        Returns:
            {
                "conditions": {...},
                "hazards": [...],
                "analysis_time_ms": 500
            }
        """
        start_time = time.time()
        
        try:
            # Ensure model is loaded
            self._ensure_loaded()
            
            logger.info(f"Analyzing image with Moondream2")
            
            image = self._load_image(
                image_url=image_url,
                image_base64=image_base64,
                image_headers=image_headers
            )
            
            # Encode image for Moondream2
            enc_image = self.model.encode_image(image)
            
            # Ask specific questions about conditions
            questions = {
                'lighting': "Is this area well-lit, poorly-lit, or dark? Answer with only: well_lit, poorly_lit, or dark",
                'weather_visible': "What weather/surface condition is visible? Answer with only: clear, wet_surface, rain, fog, or snow",
                'visibility': "How is the visibility? Answer with only: good, moderate, or poor",
                'area_quality': "Is this area well-maintained, average, or poorly-maintained? Answer with only one word",
                'area_type': "What type of area is this? Answer with only: busy_street, quiet_street, isolated, residential, or commercial"
            }
            
            conditions = {}
            for key, question in questions.items():
                answer = self.model.answer_question(enc_image, question, self.tokenizer)
                conditions[key] = answer.strip().lower().replace('-', '_').replace(' ', '_')
                # Validate and clean answer
                if key == 'lighting':
                    if 'dark' in answer: conditions[key] = 'dark'
                    elif 'poor' in answer: conditions[key] = 'poorly_lit'
                    else: conditions[key] = 'well_lit'
            
            # Get description
            desc_q = "In one sentence, assess any safety concerns visible in this image"
            conditions['description'] = self.model.answer_question(enc_image, desc_q, self.tokenizer)
            
            # Map conditions to hazards
            hazards = []
            
            # Lighting hazard
            if conditions.get('lighting') in ['poorly_lit', 'dark']:
                severity = 0.7 if conditions['lighting'] == 'dark' else 0.6
                hazards.append({
                    'type': 'poorly_lit',
                    'severity': severity,
                    'confidence': 0.8,
                    'description': f'Area is {conditions["lighting"].replace("_", " ")}',
                    'location': 'Overall scene'
                })
            
            # Weather-related hazards
            weather = conditions.get('weather_visible', 'clear')
            if weather == 'wet_surface':
                hazards.append({
                    'type': 'wet_floor',
                    'severity': 0.5,
                    'confidence': 0.75,
                    'description': 'Wet surface detected, slip risk',
                    'location': 'Ground level'
                })
            elif weather in ['rain', 'snow']:
                hazards.append({
                    'type': 'adverse_weather',
                    'severity': 0.65,
                    'confidence': 0.8,
                    'description': f'{weather.capitalize()} conditions present',
                    'location': 'Overall scene'
                })
            elif weather == 'fog':
                hazards.append({
                    'type': 'low_visibility',
                    'severity': 0.7,
                    'confidence': 0.75,
                    'description': 'Fog reducing visibility',
                    'location': 'Overall scene'
                })
            
            # Visibility hazard
            if conditions.get('visibility') == 'poor':
                if not any(h['type'] == 'low_visibility' for h in hazards):
                    hazards.append({
                        'type': 'low_visibility',
                        'severity': 0.65,
                        'confidence': 0.7,
                        'description': 'Poor visibility conditions',
                        'location': 'Overall scene'
                    })
            
            # Area quality hazard
            if conditions.get('area_quality') == 'poorly_maintained':
                hazards.append({
                    'type': 'area_neglect',
                    'severity': 0.45,
                    'confidence': 0.65,
                    'description': 'Poorly maintained area, potential hazards',
                    'location': 'Environment'
                })
            
            # Isolation risk
            if conditions.get('area_type') == 'isolated':
                hazards.append({
                    'type': 'isolation',
                    'severity': 0.55,
                    'confidence': 0.7,
                    'description': 'Isolated area with low foot traffic',
                    'location': 'Environment'
                })
            
            analysis_time = int((time.time() - start_time) * 1000)
            
            logger.info(f"Moondream2 analysis completed: {len(hazards)} hazards in {analysis_time}ms")
            
            return {
                'conditions': conditions,
                'hazards': hazards,
                'analysis_time_ms': analysis_time
            }
            
        except Exception as e:
            logger.error(f"Moondream2 analysis failed: {e}")
            # Return graceful fallback
            return {
                'conditions': {
                    'lighting': 'unknown',
                    'weather_visible': 'unknown',
                    'visibility': 'unknown',
                    'area_quality': 'unknown',
                    'area_type': 'unknown',
                    'description': 'Analysis unavailable'
                },
                'hazards': [],
                'analysis_time_ms': int((time.time() - start_time) * 1000),
                'error': str(e)
            }
