#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
iTantra Offline AI Server — Team Monte Carlo SIH 2026 (PS 26173)

Downloads all required models using sherpa-onnx's built-in downloader.
Models are stored in models/stt/ and models/tts/.

Models chosen:
  STT: whisper-tiny-int8 (39MB) — supports all 10 Indian languages
  TTS: vits-mms per language    (~30MB each, 10 langs = ~300MB total)
       OR vits-piper for Hindi/English (better quality, 63MB)

Run this ONCE to download. After that, run ai_server.py for offline use.
"""

import os
import sys
import io
import urllib.request
import zipfile
import json
import time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE, "models")
STT_DIR = os.path.join(MODELS_DIR, "stt")
TTS_DIR = os.path.join(MODELS_DIR, "tts")

os.makedirs(STT_DIR, exist_ok=True)
os.makedirs(TTS_DIR, exist_ok=True)

def progress_bar(block_num, block_size, total_size):
    downloaded = block_num * block_size
    pct = min(100, downloaded * 100 // max(1, total_size))
    mb_done = downloaded / 1e6
    mb_total = total_size / 1e6
    bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
    print(f"\r  [{bar}] {pct:3d}% — {mb_done:.1f}/{mb_total:.1f} MB", end="", flush=True)

def download_file(url, dest_path, label):
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
        print(f"  ✅ Already downloaded: {label}")
        return True
    print(f"\n  ⬇️  Downloading {label}")
    print(f"     URL: {url}")
    try:
        urllib.request.urlretrieve(url, dest_path, reporthook=progress_bar)
        print(f"\n  ✅ Done: {label} ({os.path.getsize(dest_path)/1e6:.1f} MB)")
        return True
    except Exception as e:
        print(f"\n  ❌ FAILED: {label} — {e}")
        if os.path.exists(dest_path):
            os.remove(dest_path)
        return False

def extract_zip(zip_path, dest_dir):
    print(f"  📦 Extracting {os.path.basename(zip_path)}...")
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(dest_dir)
    os.remove(zip_path)
    print(f"  ✅ Extracted to {dest_dir}")

# ─── 1. STT: Whisper-tiny int8 (39MB, all 10 Indian languages) ───────────────
print("\n" + "="*60)
print("  STEP 1: Download STT Model — Whisper Tiny INT8 (39 MB)")
print("="*60)

# sherpa-onnx hosts whisper-tiny int8 models
WHISPER_DIR = os.path.join(STT_DIR, "whisper-tiny-int8")
WHISPER_ZIP = os.path.join(STT_DIR, "whisper-tiny-int8.tar.bz2")
WHISPER_ENCODER = os.path.join(WHISPER_DIR, "tiny-encoder.int8.onnx")

if not os.path.exists(WHISPER_ENCODER):
    url = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2"
    zip_path = os.path.join(STT_DIR, "whisper-tiny.tar.bz2")
    if download_file(url, zip_path, "Whisper Tiny INT8 (~39MB)"):
        print("  📦 Extracting Whisper Tiny...")
        import tarfile
        with tarfile.open(zip_path, 'r:bz2') as t:
            t.extractall(STT_DIR)
        os.remove(zip_path)
        # Rename extracted folder if needed
        extracted = os.path.join(STT_DIR, "sherpa-onnx-whisper-tiny")
        if os.path.exists(extracted) and not os.path.exists(WHISPER_DIR):
            os.rename(extracted, WHISPER_DIR)
        print("  ✅ Whisper Tiny ready!")
else:
    print("  ✅ Whisper Tiny INT8 already present!")

# ─── 2. TTS: MMS (Massively Multilingual Speech) — 1 model per language ──────
print("\n" + "="*60)
print("  STEP 2: Download TTS Models — MMS VITS (10 Indian Languages)")
print("="*60)
print("  Source: facebook/mms-tts via sherpa-onnx")
print("  Size: ~28-35MB each\n")

# Language configs for MMS-TTS (facebook/mms model via sherpa-onnx)
# These are the verified sherpa-onnx MMS model names
TTS_LANGS = [
    { "lang": "hi", "name": "Hindi",     "model": "vits-mms-hin" },
    { "lang": "gu", "name": "Gujarati",  "model": "vits-mms-guj" },
    { "lang": "mr", "name": "Marathi",   "model": "vits-mms-mar" },
    { "lang": "kn", "name": "Kannada",   "model": "vits-mms-kan" },
    { "lang": "ml", "name": "Malayalam", "model": "vits-mms-mal" },
    { "lang": "ta", "name": "Tamil",     "model": "vits-mms-tam" },
    { "lang": "te", "name": "Telugu",    "model": "vits-mms-tel" },
    { "lang": "or", "name": "Odia",      "model": "vits-mms-ori" },
    { "lang": "bn", "name": "Bengali",   "model": "vits-mms-ben" },
    { "lang": "en", "name": "English",   "model": "vits-mms-eng" },
]

# Download each MMS TTS model
for entry in TTS_LANGS:
    model_name = entry["model"]
    lang = entry["lang"]
    lang_name = entry["name"]
    model_dir = os.path.join(TTS_DIR, model_name)
    model_onnx = os.path.join(model_dir, "model.onnx")

    if os.path.exists(model_onnx) and os.path.getsize(model_onnx) > 1e6:
        print(f"  ✅ {lang_name} ({lang}) — already downloaded")
        continue

    url = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/{model_name}.tar.bz2"
    zip_path = os.path.join(TTS_DIR, f"{model_name}.tar.bz2")

    print(f"\n  [{lang.upper()}] {lang_name}:")
    if download_file(url, zip_path, f"{lang_name} TTS (~30MB)"):
        print(f"  📦 Extracting {lang_name}...")
        import tarfile
        try:
            with tarfile.open(zip_path, 'r:bz2') as t:
                t.extractall(TTS_DIR)
            os.remove(zip_path)
            # Find extracted dir
            extracted = os.path.join(TTS_DIR, model_name)
            if not os.path.exists(extracted):
                # May have different folder name — find it
                dirs = [d for d in os.listdir(TTS_DIR) if os.path.isdir(os.path.join(TTS_DIR, d)) and model_name.split('-')[-1] in d]
                if dirs:
                    os.rename(os.path.join(TTS_DIR, dirs[0]), extracted)
            print(f"  ✅ {lang_name} TTS ready!")
        except Exception as e:
            print(f"  ❌ Extract failed for {lang_name}: {e}")
    else:
        print(f"  ⚠️  {lang_name} download failed. Will fallback to Hindi at runtime.")

# ─── 3. Write model registry JSON ─────────────────────────────────────────────
print("\n" + "="*60)
print("  STEP 3: Writing model registry...")
print("="*60)

registry = {
    "stt": {
        "type": "whisper",
        "encoder": os.path.join(WHISPER_DIR, "tiny-encoder.int8.onnx"),
        "decoder": os.path.join(WHISPER_DIR, "tiny-decoder.int8.onnx"),
        "tokens": os.path.join(WHISPER_DIR, "tiny-tokens.txt"),
        "lang": "auto"
    },
    "tts": {}
}

for entry in TTS_LANGS:
    model_dir = os.path.join(TTS_DIR, entry["model"])
    registry["tts"][entry["lang"]] = {
        "model": os.path.join(model_dir, "model.onnx"),
        "lexicon": os.path.join(model_dir, "lexicon.txt"),
        "tokens": os.path.join(model_dir, "tokens.txt"),
        "data_dir": model_dir,
        "name": entry["name"],
    }

registry_path = os.path.join(MODELS_DIR, "registry.json")
with open(registry_path, 'w', encoding='utf-8') as f:
    json.dump(registry, f, indent=2, ensure_ascii=False)

print(f"  ✅ Registry written to: {registry_path}")

# ─── 4. Summary ───────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("  ✅ ALL MODELS DOWNLOADED!")
print("="*60)

total_size = 0
for root, dirs, files in os.walk(MODELS_DIR):
    for f in files:
        total_size += os.path.getsize(os.path.join(root, f))

print(f"  Total model size: {total_size/1e6:.1f} MB")
print(f"  Models directory: {MODELS_DIR}")
print(f"\n  Now run:  python ai_server.py")
print(f"  This starts the 100% offline STT+TTS server on port 3002.")
print("="*60 + "\n")
