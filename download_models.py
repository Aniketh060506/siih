#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
iTantra Offline AI Server — Team Monte Carlo SIH 2026 (PS 26173)

Downloads the most ACCURATE offline models for all 10 Indian languages:

  VAD: Silero VAD (1MB) — Voice Activity Detection
  STT: AI4Bharat IndicConformer per language (~197MB each, int8 quantized)
       -> trained specifically on Indian speech data = very high accuracy
  TTS: Piper Priyamvada (Hindi neural + espeak-ng phonemizer for all Indic)
       + MMS-VITS English

Run this ONCE before starting ai_server.py.
Total download: ~2GB
"""

import os
import sys
import io
import json
import time
import urllib.request
import tarfile
import traceback

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE       = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE, "models")
STT_DIR    = os.path.join(MODELS_DIR, "stt")
TTS_DIR    = os.path.join(MODELS_DIR, "tts")
VAD_DIR    = os.path.join(MODELS_DIR, "vad")

for d in [MODELS_DIR, STT_DIR, TTS_DIR, VAD_DIR]:
    os.makedirs(d, exist_ok=True)

GH_BASE    = "https://github.com/k2-fsa/sherpa-onnx/releases/download"
INDIC_HF   = "https://huggingface.co/parismitaglobalsolutions/indicconformer-sherpa-onnx/resolve/main"


def progress_bar(block_num, block_size, total_size):
    downloaded = block_num * block_size
    pct = min(100, downloaded * 100 // max(1, total_size))
    mb_done  = downloaded / 1e6
    mb_total = total_size / 1e6
    bar = "=" * (pct // 5) + "." * (20 - pct // 5)
    print(f"\r  [{bar}] {pct:3d}% {mb_done:.0f}/{mb_total:.0f} MB", end="", flush=True)


def download_file(url, dest_path, label, min_size=1000):
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > min_size:
        print(f"  [OK] Already downloaded: {label}")
        return True
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    print(f"\n  [DL] {label}")
    print(f"       {url}")
    tmp = dest_path + ".tmp"
    try:
        urllib.request.urlretrieve(url, tmp, reporthook=progress_bar)
        os.rename(tmp, dest_path)
        size = os.path.getsize(dest_path) / 1e6
        print(f"\n  [OK] {label} ({size:.1f} MB)")
        return True
    except Exception as e:
        print(f"\n  [!!] FAILED: {label} -- {e}")
        for f in [tmp, dest_path]:
            try:
                if os.path.exists(f) and os.path.getsize(f) < min_size:
                    os.remove(f)
            except:
                pass
        return False


def find_file(directory, suffix):
    if not os.path.exists(directory):
        return ""
    for f in os.listdir(directory):
        if f.endswith(suffix):
            return os.path.join(directory, f)
    return ""


# ─── STEP 1: Silero VAD ───────────────────────────────────────────────────────
print("\n" + "="*60)
print("  STEP 1: Silero VAD (Voice Activity Detection, 1.8 MB)")
print("="*60)

vad_model = os.path.join(VAD_DIR, "silero_vad.onnx")
download_file(
    f"{GH_BASE}/asr-models/silero_vad.onnx",
    vad_model,
    "Silero VAD",
    min_size=100_000
)

# ─── STEP 2: AI4Bharat IndicConformer STT ────────────────────────────────────
print("\n" + "="*60)
print("  STEP 2: STT -- AI4Bharat IndicConformer (per language, ~197 MB)")
print("  Source: parismitaglobalsolutions/indicconformer-sherpa-onnx")
print("="*60)

INDIC_STT_DIR = os.path.join(STT_DIR, "indicconformer")
os.makedirs(INDIC_STT_DIR, exist_ok=True)

# Shared tokens (used by all Indic models)
shared_tokens = os.path.join(INDIC_STT_DIR, "tokens.txt")
download_file(f"{INDIC_HF}/tokens.txt", shared_tokens, "IndicConformer shared tokens.txt")

STT_LANGS = [
    ("hi", "Hindi"),
    ("gu", "Gujarati"),
    ("mr", "Marathi"),
    ("kn", "Kannada"),
    ("ml", "Malayalam"),
    ("ta", "Tamil"),
    ("te", "Telugu"),
    ("or", "Odia"),
    ("bn", "Bengali"),
    ("en", "English"),
]

for code, name in STT_LANGS:
    lang_dir   = os.path.join(INDIC_STT_DIR, code)
    model_path = os.path.join(lang_dir, "model.int8.onnx")
    os.makedirs(lang_dir, exist_ok=True)
    download_file(
        f"{INDIC_HF}/{code}/model.int8.onnx",
        model_path,
        f"IndicConformer {name} STT [int8, 197 MB]",
        min_size=100_000_000
    )
    # English has its own tokens file
    if code == "en":
        en_tokens = os.path.join(lang_dir, "tokens.txt")
        download_file(
            f"{INDIC_HF}/en/tokens.txt",
            en_tokens,
            "IndicConformer English tokens.txt"
        )

# ─── STEP 3: TTS Models ───────────────────────────────────────────────────────
print("\n" + "="*60)
print("  STEP 3: TTS -- Piper Priyamvada (Indic) + MMS-VITS (English)")
print("="*60)

PIPER_ID  = "vits-piper-hi_IN-priyamvada-medium"
MMS_ID    = "vits-mms-eng"

for model_id, label in [(PIPER_ID, "Hindi Piper Priyamvada"), (MMS_ID, "English MMS-VITS")]:
    model_dir  = os.path.join(TTS_DIR, model_id)
    tar_path   = os.path.join(TTS_DIR, f"{model_id}.tar.bz2")
    onnx_files = [f for f in os.listdir(model_dir) if f.endswith('.onnx')] if os.path.exists(model_dir) else []
    if onnx_files:
        print(f"  [OK] {label} TTS already extracted")
        continue
    url = f"{GH_BASE}/tts-models/{model_id}.tar.bz2"
    if download_file(url, tar_path, f"{label} TTS tarball"):
        print(f"  [EX] Extracting {label}...")
        try:
            with tarfile.open(tar_path, 'r:bz2') as t:
                t.extractall(TTS_DIR)
            os.remove(tar_path)
            # Rename extracted dir if needed
            if not os.path.exists(model_dir):
                for d in os.listdir(TTS_DIR):
                    full = os.path.join(TTS_DIR, d)
                    if os.path.isdir(full) and d.startswith('vits') and d != model_id:
                        os.rename(full, model_dir)
                        break
            print(f"  [OK] {label} TTS ready!")
        except Exception as e:
            print(f"  [!!] Extract failed: {e}")

# ─── STEP 4: Write registry.json ─────────────────────────────────────────────
print("\n" + "="*60)
print("  STEP 4: Writing models/registry.json")
print("="*60)

PIPER_DIR = os.path.join(TTS_DIR, PIPER_ID)
ENG_DIR   = os.path.join(TTS_DIR, MMS_ID)

piper_onnx   = find_file(PIPER_DIR, ".onnx")
piper_tokens = find_file(PIPER_DIR, "tokens.txt") or os.path.join(PIPER_DIR, "tokens.txt")
piper_espeak = os.path.join(PIPER_DIR, "espeak-ng-data") if os.path.exists(os.path.join(PIPER_DIR, "espeak-ng-data")) else ""
eng_onnx     = find_file(ENG_DIR, ".onnx")
eng_tokens   = find_file(ENG_DIR, "tokens.txt") or os.path.join(ENG_DIR, "tokens.txt")

def indic_tts(name):
    return {
        "model":    piper_onnx,
        "tokens":   piper_tokens,
        "lexicon":  "",
        "data_dir": piper_espeak,
        "name":     f"{name} (Piper Priyamvada + espeak-ng)",
    }

registry = {
    "vad": {
        "type":    "silero",
        "model":   vad_model,
        "threshold":               0.5,
        "min_silence_duration_ms": 700,
        "speech_pad_ms":           300,
    },
    "stt": {
        "type":      "indicconformer",
        "model_dir": INDIC_STT_DIR,
        "tokens":    shared_tokens,
        "en_tokens": os.path.join(INDIC_STT_DIR, "en", "tokens.txt"),
    },
    "tts": {
        "hi": indic_tts("Hindi"),
        "gu": indic_tts("Gujarati"),
        "mr": indic_tts("Marathi"),
        "kn": indic_tts("Kannada"),
        "ml": indic_tts("Malayalam"),
        "ta": indic_tts("Tamil"),
        "te": indic_tts("Telugu"),
        "or": indic_tts("Odia"),
        "bn": indic_tts("Bengali"),
        "en": {
            "model":    eng_onnx,
            "tokens":   eng_tokens,
            "lexicon":  "",
            "data_dir": "",
            "name":     "English (MMS-VITS)",
        },
    }
}

registry_path = os.path.join(MODELS_DIR, "registry.json")
with open(registry_path, 'w', encoding='utf-8') as f:
    json.dump(registry, f, indent=2, ensure_ascii=False)
print(f"  [OK] Registry written: {registry_path}")

# ─── STEP 5: Summary ──────────────────────────────────────────────────────────
print("\n" + "="*60)
print("  DOWNLOAD SUMMARY")
print("="*60)

errors = []

print("\n  VAD:")
if os.path.exists(vad_model):
    print(f"    [OK] Silero VAD ({os.path.getsize(vad_model)/1e6:.1f} MB)")
else:
    errors.append("Silero VAD MISSING")
    print("    [!!] Silero VAD MISSING")

print("\n  STT (AI4Bharat IndicConformer -- language-specific):")
for code, name in STT_LANGS:
    mp = os.path.join(INDIC_STT_DIR, code, "model.int8.onnx")
    if os.path.exists(mp) and os.path.getsize(mp) > 1e6:
        print(f"    [OK] [{code}] {name} ({os.path.getsize(mp)/1e6:.0f} MB)")
    else:
        errors.append(f"[{code}] {name} STT model MISSING")
        print(f"    [!!] [{code}] {name} MISSING")

print("\n  TTS:")
if piper_onnx and os.path.exists(piper_onnx):
    print(f"    [OK] Piper Priyamvada Hindi (covers all Indic scripts)")
else:
    errors.append("Piper Priyamvada TTS MISSING")
    print("    [!!] Piper Priyamvada TTS MISSING")
if eng_onnx and os.path.exists(eng_onnx):
    print(f"    [OK] MMS-VITS English")
else:
    errors.append("MMS-VITS English TTS MISSING")
    print("    [!!] MMS-VITS English TTS MISSING")

total_size = sum(
    os.path.getsize(os.path.join(r, f))
    for r, dirs, files in os.walk(MODELS_DIR)
    for f in files
)
print(f"\n  Total model size: {total_size/1e9:.2f} GB")

if errors:
    print(f"\n  WARNING: {len(errors)} issue(s):")
    for e in errors:
        print(f"    - {e}")
    print("  Re-run this script to retry downloads.")
else:
    print("\n  ALL MODELS READY! Run: python ai_server.py")
print("=" * 60 + "\n")
