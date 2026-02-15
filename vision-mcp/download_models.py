#!/usr/bin/env python3
"""
Pre-download script for Moondream2 model
Downloads model files at build time to avoid startup delays
"""
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

print("Downloading Moondream2 model...")
model_id = "vikhyatk/moondream2"
revision = "2024-08-26"

# Download tokenizer
print("Downloading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
print("✓ Tokenizer downloaded")

# Download model (this is the big one - 1.6GB)
print("Downloading model weights...")
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    trust_remote_code=True,
    revision=revision,
    torch_dtype=torch.float32
)
print("✓ Model weights downloaded")

print("All models downloaded successfully!")
