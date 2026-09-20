#!/usr/bin/env python3
"""
iTantra Offline AI Server — Team Monte Carlo SIH 2026 (PS 26173)

Provides 100% OFFLINE STT and TTS for all 10 Indian languages.
Uses sherpa-onnx under the hood (no internet required after download).

Endpoints:
  GET  /health              → server status + loaded models
  POST /stt                 → Speech-to-Text (WAV/PCM audio → transcript)
  GET  /tts?text=X&lang=hi  → Text-to-Speech (text → WAV audio stream)

Architecture:
  ┌─────────────────────────┐
  │  React Native App       │
  │  (iTantra client)       │
  │                         │
  │  1. Record mic audio    │
  │  2. POST /stt → text    │
  │  3. Receive transcript  │
  │  4. Send via WebSocket  │
  │  5. Receive packet      │
  │  6. GET /tts → audio    │
  │  7. Play on speaker     │
  └─────────┬───────────────┘
            │ HTTP on LAN (localhost:3002)
  ┌─────────▼───────────────┐
  │  ai_server.py           │
  │  (this file)            │
  │                         │
  │  STT: whisper-tiny-int8 │ ← 39MB ONNX model
  │  TTS: MMS-VITS per lang │ ← ~30MB each, 10 langs
  │                         │
  │  100% OFFLINE. No API.  │
  │  No internet. No cloud. │
  └─────────────────────────┘
"""

import os
import sys
import json
import time
import struct
import threading
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import wave
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

# ─── Paths ───────────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE, "models")
REGISTRY_PATH = os.path.join(MODELS_DIR, "registry.json")

PORT = int(os.environ.get("AI_PORT", 3002))

# ─── Check models downloaded ─────────────────────────────────────────────────
if not os.path.exists(REGISTRY_PATH):
    print("\n❌ Models not downloaded yet!")
    print("   Run first: python download_models.py")
    print("   This downloads ~350MB of offline AI models.\n")
    sys.exit(1)

with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
    REGISTRY = json.load(f)

# ─── Import sherpa-onnx ──────────────────────────────────────────────────────
try:
    import sherpa_onnx
except ImportError:
    print("\n❌ sherpa-onnx not installed!")
    print("   Run: pip install sherpa-onnx\n")
    sys.exit(1)

# ─── Language code mapping ────────────────────────────────────────────────────
# App sends BCP-47 short code; we map to our TTS registry key
LANG_ALIASES = {
    'hi-IN': 'hi', 'hi': 'hi',
    'gu-IN': 'gu', 'gu': 'gu',
    'mr-IN': 'mr', 'mr': 'mr',
    'kn-IN': 'kn', 'kn': 'kn',
    'ml-IN': 'ml', 'ml': 'ml',
    'ta-IN': 'ta', 'ta': 'ta',
    'te-IN': 'te', 'te': 'te',
    'or-IN': 'or', 'or': 'or',
    'bn-IN': 'bn', 'bn': 'bn',
    'en-IN': 'en', 'en': 'en',
}

# ─── Lazy-load STT recognizer ─────────────────────────────────────────────────
_stt_recognizer = None
_stt_lock = threading.Lock()

def get_stt():
    global _stt_recognizer
    if _stt_recognizer is not None:
        return _stt_recognizer
    with _stt_lock:
        if _stt_recognizer is not None:
            return _stt_recognizer
        cfg = REGISTRY.get("stt", {})
        encoder = cfg.get("encoder", "")
        decoder = cfg.get("decoder", "")
        tokens = cfg.get("tokens", "")

        if not os.path.exists(encoder):
            print(f"❌ STT encoder not found: {encoder}")
            print("   Run: python download_models.py")
            return None

        print(f"🔄 Loading Whisper Tiny INT8 STT model...")
        t0 = time.time()
        try:
            recognizer = sherpa_onnx.OfflineRecognizer.from_whisper(
                encoder=encoder,
                decoder=decoder,
                tokens=tokens,
                num_threads=2,
                decoding_method="greedy_search",
                language="",          # empty = auto-detect language
                task="transcribe",
            )
            _stt_recognizer = recognizer
            print(f"✅ STT ready ({time.time()-t0:.1f}s)")
        except Exception as e:
            print(f"❌ STT load failed: {e}")
            traceback.print_exc()
            return None
    return _stt_recognizer

# ─── Offline TTS Synthesizers (Indic Neural + English MMS) ───────────────────
_indic_synth = None
_eng_synth = None
_tts_lock = threading.Lock()

def get_tts(lang_key='hi'):
    """Get offline neural TTS synthesizer for specified language with robust offline fallback."""
    global _indic_synth, _eng_synth
    tts_registry = REGISTRY.get("tts", {})
    normalized_lang = LANG_ALIASES.get(lang_key.lower().split('-')[0], lang_key.lower().split('-')[0])

    with _tts_lock:
        if normalized_lang == 'en':
            if _eng_synth is not None:
                return _eng_synth
            eng_cfg = tts_registry.get('en', {})
            model_path = eng_cfg.get("model", "")
            if os.path.exists(model_path):
                print(f"🔄 Loading English MMS-VITS TTS model...")
                t0 = time.time()
                try:
                    tts_config = sherpa_onnx.OfflineTtsConfig(
                        model=sherpa_onnx.OfflineTtsModelConfig(
                            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                                model=model_path,
                                lexicon=eng_cfg.get("lexicon", ""),
                                tokens=eng_cfg.get("tokens", ""),
                                data_dir=eng_cfg.get("data_dir", ""),
                            ),
                            num_threads=2,
                            debug=False,
                        ),
                        max_num_sentences=10,
                        rule_fsts="",
                    )
                    _eng_synth = sherpa_onnx.OfflineTts(tts_config)
                    print(f"✅ English TTS ready ({time.time()-t0:.1f}s) — sample_rate={_eng_synth.sample_rate}")
                    return _eng_synth
                except Exception as e:
                    print(f"❌ English TTS load failed: {e}")

        # For all Indic languages (hi, gu, mr, kn, ml, ta, te, or, bn) or fallback
        if _indic_synth is not None:
            return _indic_synth

        indic_cfg = tts_registry.get('hi') or tts_registry.get('gu') or {}
        model_path = indic_cfg.get("model", "")
        if not os.path.exists(model_path):
            print(f"❌ Indic TTS model not found at: {model_path}")
            # Fallback to English if available
            if _eng_synth is not None:
                return _eng_synth
            return None

        print(f"🔄 Loading Multilingual Indic Neural TTS (Piper Priyamvada)...")
        t0 = time.time()
        try:
            tts_config = sherpa_onnx.OfflineTtsConfig(
                model=sherpa_onnx.OfflineTtsModelConfig(
                    vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                        model=model_path,
                        lexicon=indic_cfg.get("lexicon", ""),
                        tokens=indic_cfg.get("tokens", ""),
                        data_dir=indic_cfg.get("data_dir", ""),
                    ),
                    num_threads=2,
                    debug=False,
                ),
                max_num_sentences=10,
                rule_fsts="",
            )
            _indic_synth = sherpa_onnx.OfflineTts(tts_config)
            print(f"✅ Indic Neural TTS ready ({time.time()-t0:.1f}s) — sample_rate={_indic_synth.sample_rate}")
            return _indic_synth
        except Exception as e:
            print(f"❌ Indic TTS load failed: {e}")
            traceback.print_exc()
            return _eng_synth

# ─── Audio Utilities ─────────────────────────────────────────────────────────
def pcm_to_wav_bytes(samples, sample_rate):
    """Convert float32 samples to WAV bytes in-memory."""
    import array
    # Convert float32 → int16
    int16_samples = [max(-32768, min(32767, int(s * 32767))) for s in samples]
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(array.array('h', int16_samples).tobytes())
    return buf.getvalue()

def wav_bytes_to_float32(wav_bytes):
    """Read WAV bytes → float32 samples + sample_rate."""
    import array
    riff_idx = wav_bytes.find(b'RIFF')
    if riff_idx > 0:
        wav_bytes = wav_bytes[riff_idx:]
    buf = io.BytesIO(wav_bytes)
    with wave.open(buf, 'rb') as wf:
        sample_rate = wf.getframerate()
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        raw = wf.readframes(wf.getnframes())

    if sampwidth == 2:  # 16-bit
        samples = array.array('h', raw)
        float_samples = [s / 32768.0 for s in samples]
    elif sampwidth == 4:  # 32-bit int
        samples = array.array('l', raw)
        float_samples = [s / 2147483648.0 for s in samples]
    else:
        raise ValueError(f"Unsupported sample width: {sampwidth}")

    # Stereo → mono (average channels)
    if n_channels == 2:
        float_samples = [(float_samples[i] + float_samples[i+1]) / 2 for i in range(0, len(float_samples), 2)]

    return float_samples, sample_rate

# ─── HTTP Request Handler ─────────────────────────────────────────────────────
class AIHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default HTTP logs (we have our own)
        pass

    def send_cors(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', content_type)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_cors(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        # ── /health ─────────────────────────────────────────────
        if parsed.path == '/health':
            tts_registry = REGISTRY.get("tts", {})
            loaded_tts = []
            if _indic_synth is not None:
                loaded_tts.extend(['hi', 'gu', 'mr', 'kn', 'ml', 'ta', 'te', 'or', 'bn'])
            if _eng_synth is not None:
                loaded_tts.append('en')
            stt_loaded = _stt_recognizer is not None
            body = json.dumps({
                "status": "ok",
                "version": "iTantra-AI/1.0",
                "offline": True,
                "stt": {
                    "model": "whisper-tiny-int8",
                    "loaded": stt_loaded,
                    "languages": "all 10 Indian languages",
                },
                "tts": {
                    "model": "Piper Indic Neural + MMS-VITS English",
                    "loaded_languages": loaded_tts,
                    "available_languages": list(tts_registry.keys()),
                },
            }, ensure_ascii=False, indent=2)
            self.send_cors(200)
            self.wfile.write(body.encode())

        # ── /tts?text=...&lang=hi&speed=1.0 ─────────────────────
        elif parsed.path == '/tts':
            text = params.get('text', '').strip()
            lang_input = params.get('lang', 'hi').lower().split('-')[0]
            lang_key = LANG_ALIASES.get(lang_input, 'hi')
            speed = float(params.get('speed', '1.0'))

            if not text:
                self.send_cors(400)
                self.wfile.write(b'{"error":"text required"}')
                return

            print(f"[🔊] TTS [{lang_key}]: \"{text[:50]}\"")
            t0 = time.time()

            synth = get_tts(lang_key)
            if synth is None:
                self.send_cors(503)
                self.wfile.write(json.dumps({"error": f"TTS model not loaded for {lang_key}"}).encode())
                return

            try:
                audio = synth.generate(text, sid=0, speed=speed)
                wav_bytes = pcm_to_wav_bytes(audio.samples, audio.sample_rate)
                elapsed = time.time() - t0
                print(f"   ✅ TTS done in {elapsed:.2f}s — {len(wav_bytes)/1024:.0f} KB WAV")

                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', str(len(wav_bytes)))
                self.send_header('Cache-Control', 'public, max-age=300')
                self.end_headers()
                self.wfile.write(wav_bytes)

            except Exception as e:
                print(f"   ❌ TTS error: {e}")
                traceback.print_exc()
                self.send_cors(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        else:
            self.send_cors(404)
            self.wfile.write(b'{"error":"not found"}')

    def do_POST(self):
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        # ── POST /stt — body: WAV audio bytes ──────────────────
        if parsed.path == '/stt':
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                self.send_cors(400)
                self.wfile.write(b'{"error":"no audio data"}')
                return

            wav_data = self.rfile.read(length)
            lang_input = params.get('lang', 'hi').lower()

            print(f"[🎤] STT [{lang_input}]: {length/1024:.0f} KB audio received")
            t0 = time.time()

            recognizer = get_stt()
            if recognizer is None:
                self.send_cors(503)
                self.wfile.write(b'{"error":"STT model not loaded"}')
                return

            try:
                samples, sample_rate = wav_bytes_to_float32(wav_data)
                stream = recognizer.create_stream()
                stream.accept_waveform(sample_rate, samples)
                recognizer.decode_stream(stream)
                transcript = stream.result.text.strip()
                elapsed = time.time() - t0

                print(f"   ✅ STT done in {elapsed:.2f}s: \"{transcript[:60]}\"")

                body = json.dumps({
                    "transcript": transcript,
                    "lang": lang_input,
                    "elapsed_ms": int(elapsed * 1000),
                    "offline": True,
                }, ensure_ascii=False)
                self.send_cors(200)
                self.wfile.write(body.encode('utf-8'))

            except Exception as e:
                print(f"   ❌ STT error: {e}")
                traceback.print_exc()
                self.send_cors(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        else:
            self.send_cors(404)
            self.wfile.write(b'{"error":"not found"}')

# ─── Main ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("\n" + "="*60)
    print("  iTantra Offline AI Server — Team Monte Carlo SIH 2026")
    print("="*60)

    tts_registry = REGISTRY.get("tts", {})
    stt_cfg = REGISTRY.get("stt", {})

    print(f"\n  Models directory : {MODELS_DIR}")
    print(f"  STT model        : {os.path.basename(stt_cfg.get('encoder','N/A'))}")
    print(f"  TTS languages    : {', '.join(tts_registry.keys())}")
    print(f"\n  Pre-warming STT model (first run may take ~5 sec)...")

    # Warm up STT in background so first request is fast
    threading.Thread(target=get_stt, daemon=True).start()

    # Pre-warm Indic and English offline TTS
    threading.Thread(target=lambda: get_tts('hi'), daemon=True).start()
    threading.Thread(target=lambda: get_tts('en'), daemon=True).start()

    httpd = HTTPServer(('0.0.0.0', PORT), AIHandler)

    from socket import gethostbyname, gethostname
    import subprocess
    try:
        result = subprocess.run(['ipconfig'], capture_output=True, text=True)
        ips = []
        for line in result.stdout.split('\n'):
            if 'IPv4' in line and '192.168' in line:
                ip = line.split(':')[-1].strip()
                ips.append(ip)
    except:
        ips = ['192.168.x.x']

    print(f"\n  ┌─────────────────────────────────────────────┐")
    print(f"  │  LOCAL:   http://localhost:{PORT}              │")
    for ip in ips:
        print(f"  │  NETWORK: http://{ip}:{PORT}         │")
    print(f"  │  HEALTH:  http://localhost:{PORT}/health       │")
    print(f"  │  TTS:     http://localhost:{PORT}/tts?text=नमस्ते&lang=hi │")
    print(f"  │  STT:     POST http://localhost:{PORT}/stt      │")
    print(f"  └─────────────────────────────────────────────┘")
    print(f"\n  100% OFFLINE — No internet required after model download")
    print(f"  Ctrl+C to stop\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
