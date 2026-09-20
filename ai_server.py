#!/usr/bin/env python3
"""
iTantra Offline AI Server — Team Monte Carlo SIH 2026 (PS 26173)

100% OFFLINE. No internet. No cloud APIs.

Endpoints:
  GET  /health                   - server status + model info
  POST /stt?lang=hi              - Speech-to-Text (WAV → transcript)
  GET  /tts?text=...&lang=hi     - Text-to-Speech (text → WAV audio)

Models used:
  VAD: Silero VAD (1.8 MB)
  STT: AI4Bharat IndicConformer per language (~197 MB each, int8)
       → trained on Indian speech data, very high accuracy for all 10 languages
  TTS: Piper Priyamvada (Hindi neural TTS + espeak-ng for all Indic scripts)
       MMS-VITS English
"""

import os
import sys
import json
import time
import threading
import io
import wave
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE          = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR    = os.path.join(BASE, "models")
REGISTRY_PATH = os.path.join(MODELS_DIR, "registry.json")
PORT          = int(os.environ.get("AI_PORT", 3002))

if not os.path.exists(REGISTRY_PATH):
    print("\n❌ Models not downloaded yet! Run: python download_models.py\n")
    sys.exit(1)

with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
    REGISTRY = json.load(f)

try:
    import sherpa_onnx
except ImportError:
    print("\n❌ sherpa-onnx not installed! Run: pip install sherpa-onnx\n")
    sys.exit(1)

# ─── Language code normalisation ─────────────────────────────────────────────
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

def norm_lang(raw: str) -> str:
    raw = raw.lower().split('-')[0].strip()
    return LANG_ALIASES.get(raw, raw)

# ─── STT: IndicConformer per language ────────────────────────────────────────
# Each language has its own ~197 MB NeMo-CTC model.
# Loaded lazily on first request and cached for subsequent calls.
_stt_cache: dict = {}   # lang -> recognizer | None
_stt_lock = threading.Lock()

def _load_indic_stt(lang: str):
    """Load AI4Bharat IndicConformer for one language.  Returns recognizer or None."""
    stt_cfg  = REGISTRY.get("stt", {})
    model_dir = stt_cfg.get("model_dir", "")
    model_path = os.path.join(model_dir, lang, "model.int8.onnx")

    # English uses its own tokens; all Indic languages share the same tokens
    if lang == "en":
        tokens = stt_cfg.get("en_tokens", os.path.join(model_dir, "en", "tokens.txt"))
    else:
        tokens = stt_cfg.get("tokens", os.path.join(model_dir, "tokens.txt"))

    if not os.path.exists(model_path):
        print(f"❌ STT model not found for [{lang}]: {model_path}")
        print("   Run: python download_models.py")
        return None

    print(f"🔄 Loading IndicConformer STT [{lang}]…")
    t0 = time.time()
    try:
        rec = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(
            model=model_path,
            tokens=tokens,
            num_threads=2,
            decoding_method="greedy_search",
        )
        print(f"✅ STT [{lang}] ready ({time.time()-t0:.1f}s)")
        return rec
    except Exception as e:
        print(f"❌ STT [{lang}] load failed: {e}")
        traceback.print_exc()
        return None


def get_stt(lang: str = 'hi'):
    """Return cached IndicConformer recognizer for the given language."""
    lang = norm_lang(lang)
    if lang in _stt_cache:
        return _stt_cache[lang]
    with _stt_lock:
        if lang in _stt_cache:
            return _stt_cache[lang]
        rec = _load_indic_stt(lang)
        _stt_cache[lang] = rec
        return rec


# ─── TTS: Piper Indic + MMS English ─────────────────────────────────────────
_indic_synth = None
_eng_synth   = None
_tts_lock    = threading.Lock()


def get_tts(lang: str = 'hi'):
    """Return cached offline TTS synthesizer for the given language."""
    global _indic_synth, _eng_synth
    lang = norm_lang(lang)
    tts_cfg = REGISTRY.get("tts", {})

    with _tts_lock:
        if lang == 'en':
            if _eng_synth is not None:
                return _eng_synth
            cfg = tts_cfg.get('en', {})
            model_path = cfg.get("model", "")
            if not model_path or not os.path.exists(model_path):
                print(f"❌ English TTS model not found: {model_path}")
                return _indic_synth  # fallback
            print("🔄 Loading MMS-VITS English TTS…")
            t0 = time.time()
            try:
                tts_config = sherpa_onnx.OfflineTtsConfig(
                    model=sherpa_onnx.OfflineTtsModelConfig(
                        vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                            model=model_path,
                            lexicon=cfg.get("lexicon", ""),
                            tokens=cfg.get("tokens", ""),
                            data_dir=cfg.get("data_dir", ""),
                        ),
                        num_threads=2,
                        debug=False,
                    ),
                    max_num_sentences=10,
                    rule_fsts="",
                )
                _eng_synth = sherpa_onnx.OfflineTts(tts_config)
                print(f"✅ English TTS ready ({time.time()-t0:.1f}s) sample_rate={_eng_synth.sample_rate}")
                return _eng_synth
            except Exception as e:
                print(f"❌ English TTS load failed: {e}")
                traceback.print_exc()
                return _indic_synth

        # All Indic languages share the Piper Priyamvada model
        if _indic_synth is not None:
            return _indic_synth

        cfg = tts_cfg.get('hi') or tts_cfg.get(lang) or {}
        model_path = cfg.get("model", "")
        if not model_path or not os.path.exists(model_path):
            print(f"❌ Indic TTS model not found: {model_path}")
            return _eng_synth
        print("🔄 Loading Piper Priyamvada Indic TTS…")
        t0 = time.time()
        try:
            tts_config = sherpa_onnx.OfflineTtsConfig(
                model=sherpa_onnx.OfflineTtsModelConfig(
                    vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                        model=model_path,
                        lexicon=cfg.get("lexicon", ""),
                        tokens=cfg.get("tokens", ""),
                        data_dir=cfg.get("data_dir", ""),
                    ),
                    num_threads=2,
                    debug=False,
                ),
                max_num_sentences=10,
                rule_fsts="",
            )
            _indic_synth = sherpa_onnx.OfflineTts(tts_config)
            print(f"✅ Indic TTS ready ({time.time()-t0:.1f}s) sample_rate={_indic_synth.sample_rate}")
            return _indic_synth
        except Exception as e:
            print(f"❌ Indic TTS load failed: {e}")
            traceback.print_exc()
            return _eng_synth


# ─── Audio utilities ─────────────────────────────────────────────────────────
def pcm_to_wav_bytes(samples, sample_rate: int) -> bytes:
    """float32 samples → WAV bytes."""
    import array as _array
    int16 = [max(-32768, min(32767, int(s * 32767))) for s in samples]
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(_array.array('h', int16).tobytes())
    return buf.getvalue()


def wav_bytes_to_float32(wav_bytes: bytes):
    """WAV bytes → (float32_list, sample_rate)."""
    import array as _array
    riff_idx = wav_bytes.find(b'RIFF')
    if riff_idx > 0:
        wav_bytes = wav_bytes[riff_idx:]
    buf = io.BytesIO(wav_bytes)
    with wave.open(buf, 'rb') as wf:
        sample_rate = wf.getframerate()
        n_channels  = wf.getnchannels()
        sampwidth   = wf.getsampwidth()
        raw         = wf.readframes(wf.getnframes())
    if sampwidth == 2:
        samples = list(_array.array('h', raw))
        return [s / 32768.0 for s in samples], sample_rate
    elif sampwidth == 4:
        samples = list(_array.array('l', raw))
        return [s / 2147483648.0 for s in samples], sample_rate
    else:
        raise ValueError(f"Unsupported sample width: {sampwidth}")


# ─── HTTP Handler ─────────────────────────────────────────────────────────────
class AIHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def send_cors(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Accept')
        self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
        self.send_header('Content-Type', content_type)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_cors(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}

        # ── GET /health ────────────────────────────────────────────
        if parsed.path == '/health':
            loaded_stt = sorted(_stt_cache.keys())
            loaded_tts = []
            if _indic_synth is not None:
                loaded_tts.extend(['hi', 'gu', 'mr', 'kn', 'ml', 'ta', 'te', 'or', 'bn'])
            if _eng_synth is not None:
                loaded_tts.append('en')
            body = json.dumps({
                "status":  "ok",
                "version": "iTantra-AI/2.0",
                "offline": True,
                "stt": {
                    "model":       "AI4Bharat IndicConformer (per language)",
                    "loaded_langs": loaded_stt,
                    "available":   list(LANG_ALIASES.values()),
                },
                "tts": {
                    "model":        "Piper Priyamvada (Indic) + MMS-VITS (English)",
                    "loaded_langs": loaded_tts,
                },
            }, ensure_ascii=False, indent=2)
            self.send_cors(200)
            self.wfile.write(body.encode())

        # ── GET /tts?text=...&lang=hi&speed=1.0 ───────────────────
        elif parsed.path == '/tts':
            text       = params.get('text', '').strip()
            lang_input = params.get('lang', 'hi').lower()
            lang       = norm_lang(lang_input)
            speed      = float(params.get('speed', '1.0'))

            if not text:
                self.send_cors(400)
                self.wfile.write(b'{"error":"text required"}')
                return

            print(f'[TTS] [{lang}]: "{text[:60]}"')
            t0 = time.time()

            synth = get_tts(lang)
            if synth is None:
                self.send_cors(503)
                self.wfile.write(json.dumps({"error": f"TTS not available for [{lang}]"}).encode())
                return

            try:
                audio     = synth.generate(text, sid=0, speed=speed)
                wav_bytes = pcm_to_wav_bytes(audio.samples, audio.sample_rate)
                elapsed   = time.time() - t0
                print(f"   ✅ {elapsed:.2f}s — {len(wav_bytes)//1024} KB WAV")

                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range, Accept')
                self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
                self.send_header('Accept-Ranges', 'bytes')
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

        # ── POST /stt?lang=hi — body: WAV audio bytes ─────────────
        if parsed.path == '/stt':
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                self.send_cors(400)
                self.wfile.write(b'{"error":"no audio data"}')
                return

            wav_data   = self.rfile.read(length)
            lang_input = params.get('lang', 'hi').lower()
            lang       = norm_lang(lang_input)

            print(f"[STT] [{lang}]: {length//1024} KB received")
            t0 = time.time()

            recognizer = get_stt(lang)
            if recognizer is None:
                self.send_cors(503)
                self.wfile.write(json.dumps({"error": f"STT not available for [{lang}]"}).encode())
                return

            try:
                samples, sample_rate = wav_bytes_to_float32(wav_data)
                stream = recognizer.create_stream()
                stream.accept_waveform(sample_rate, samples)
                recognizer.decode_stream(stream)
                transcript = stream.result.text.strip()
                elapsed    = time.time() - t0

                print(f'   ✅ {elapsed:.2f}s: "{transcript[:60]}"')
                body = json.dumps({
                    "transcript": transcript,
                    "lang":       lang,
                    "elapsed_ms": int(elapsed * 1000),
                    "offline":    True,
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
    print("  iTantra Offline AI Server v2.0 — Team Monte Carlo SIH 2026")
    print("="*60)
    print(f"  STT: AI4Bharat IndicConformer (per language, ~197 MB int8)")
    print(f"  TTS: Piper Priyamvada (Indic) + MMS-VITS (English)")
    print(f"  VAD: Silero VAD")
    print(f"  100% OFFLINE — No internet required")
    print(f"\n  Pre-warming Hindi STT + TTS…")

    # Pre-warm Hindi (most common) and English in background
    threading.Thread(target=lambda: get_stt('hi'), daemon=True).start()
    threading.Thread(target=lambda: get_tts('hi'), daemon=True).start()
    threading.Thread(target=lambda: get_tts('en'), daemon=True).start()

    httpd = HTTPServer(('0.0.0.0', PORT), AIHandler)

    try:
        from subprocess import run as _run
        ips = []
        out = _run(['ipconfig'], capture_output=True, text=True).stdout
        for line in out.split('\n'):
            if 'IPv4' in line and '192.168' in line:
                ips.append(line.split(':')[-1].strip())
    except:
        ips = []

    print(f"\n  LOCAL:   http://localhost:{PORT}")
    for ip in ips:
        print(f"  NETWORK: http://{ip}:{PORT}")
    print(f"  HEALTH:  http://localhost:{PORT}/health")
    print(f"  TTS:     http://localhost:{PORT}/tts?text=namaste&lang=hi")
    print(f"  STT:     POST http://localhost:{PORT}/stt?lang=hi")
    print(f"\n  Ctrl+C to stop\n")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
