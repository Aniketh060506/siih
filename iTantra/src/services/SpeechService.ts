/**
 * iTantra Speech Service — Team Monte Carlo (SIH PS 26173)
 *
 * STT:  Web     → window.SpeechRecognition (Chrome, no internet needed for Indic in Chrome OS)
 *       Android → expo-speech-recognition (Expo native module)
 *
 * TTS:  Both    → expo-speech (wraps Web Speech Synthesis on web, Android TTS engine on Android)
 */

import { Platform } from 'react-native';
import * as ExpoSpeech from 'expo-speech';
import { Audio } from 'expo-av';

// ─── Pipeline Step Tracker ─────────────────────────────────────────────────
export interface PipelineStep {
  id: number;
  label: string;
  detail: string;
  status: 'idle' | 'active' | 'done' | 'error';
  ms?: number;
}

export const INITIAL_STEPS: PipelineStep[] = [
  { id: 1, label: 'VAD Pause',     detail: 'Waiting for voice...', status: 'idle' },
  { id: 2, label: 'STT Engine',    detail: 'Transcribing speech',  status: 'idle' },
  { id: 3, label: 'Packet Encode', detail: 'Building micro-packet',status: 'idle' },
  { id: 4, label: 'RF Transmit',   detail: 'Sending over link',    status: 'idle' },
  { id: 5, label: 'Mesh Hop',      detail: 'TTL routing',          status: 'idle' },
  { id: 6, label: 'TTS Synth',     detail: 'Generating speech',    status: 'idle' },
  { id: 7, label: 'Audio Played',  detail: 'Playing on speaker',   status: 'idle' },
];

// ─── Language BCP-47 codes for STT/TTS engines ────────────────────────────
export const LANG_STT_CODES: Record<number, string> = {
  0: 'hi-IN',
  1: 'gu-IN',
  2: 'mr-IN',
  3: 'kn-IN',
  4: 'ml-IN',
  5: 'ta-IN',
  6: 'te-IN',
  7: 'or-IN',
  8: 'bn-IN',
  9: 'en-IN',
};

type SpeechCallback = (transcript: string, isFinal: boolean) => void;
type ErrorCallback = (error: string) => void;

// ─── Lazy-load expo-speech-recognition on native only ─────────────────────
// We use a module-level variable so we only import once.
let ESR: any = null;

async function getESR() {
  if (ESR !== null) return ESR;
  if (Platform.OS === 'web') return null;
  try {
    // Static import avoided intentionally — expo-speech-recognition has
    // native-only code that breaks Metro web bundling if imported at top-level.
    // Metro's require() is synchronous; we use a require call wrapped in try/catch.
    ESR = require('expo-speech-recognition');
    return ESR;
  } catch {
    console.warn('[STT] expo-speech-recognition unavailable');
    ESR = null;
    return null;
  }
}

class SpeechService {
  private webRecognition: any = null;
  private isListening = false;
  private onResult: SpeechCallback | null = null;
  private onError: ErrorCallback | null = null;
  private nativeSubs: any[] = [];

  // Offline Audio Recording state (Web Audio API)
  private mediaStream: MediaStream | null = null;
  private audioContext: any = null;
  private audioInput: any = null;
  private scriptProcessor: any = null;
  private audioChunks: Float32Array[] = [];
  private currentSampleRate = 16000;
  private currentLangCode = 'en-IN';
  private serverHost: string = 'localhost';
  private nativeRecording: any = null;
  private nativeSound: any = null;

  setServerHost(host: string) {
    if (host) {
      const clean = host.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').split(':')[0];
      if (clean) this.serverHost = clean;
    }
  }

  getServerHost(): string {
    if (this.serverHost && this.serverHost !== 'localhost') return this.serverHost;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
      return window.location.hostname;
    }
    return '192.168.29.222';
  }

  async init() {
    if (Platform.OS !== 'web') {
      try {
        await Audio.requestPermissionsAsync();
      } catch (e) {
        console.warn('[Audio] Permission request failed:', e);
      }
    }
  }

  setCallbacks(onResult: SpeechCallback, onError: ErrorCallback) {
    this.onResult = onResult;
    this.onError = onError;
  }

  unlockAudio() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.resume();
          const u = new SpeechSynthesisUtterance('');
          u.volume = 0.01;
          window.speechSynthesis.speak(u);
        }
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
        }
      } catch (e) {
        console.warn('[Audio Unlock Error]', e);
      }
    }
  }

  async startListening(langId: number): Promise<void> {
    if (this.isListening) await this.stopListening();
    const langCode = LANG_STT_CODES[langId] ?? 'en-IN';
    this.currentLangCode = langCode;
    this.isListening = true;

    if (Platform.OS === 'web') {
      await this.startWebSTT(langCode);
    } else {
      await this.startNativeSTT(langCode);
    }
  }

  private async startWebSTT(langCode: string) {
    this.audioChunks = [];

    // 1. Initialize Web Audio API to record offline mic PCM samples
    if (typeof window !== 'undefined' && navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        this.mediaStream = stream;

        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          this.currentSampleRate = this.audioContext.sampleRate;
          this.audioInput = this.audioContext.createMediaStreamSource(stream);
          // Script processor with 4096 buffer size
          this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
          this.scriptProcessor.onaudioprocess = (e: any) => {
            if (!this.isListening) return;
            const channel = e.inputBuffer.getChannelData(0);
            this.audioChunks.push(new Float32Array(channel));
          };
          this.audioInput.connect(this.scriptProcessor);
          this.scriptProcessor.connect(this.audioContext.destination);
          console.log('[STT] Offline PCM mic recording started @', this.currentSampleRate, 'Hz');
        }
      } catch (e: any) {
        console.warn('[STT] Mic access error:', e?.message || e);
        this.onError?.('Microphone access denied. Please enable mic permissions.');
      }
    }

    // 2. Concurrently run SpeechRecognition for instant live interim preview if browser supports it
    const SpeechRecognition: any =
      (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));

    if (SpeechRecognition) {
      if (this.webRecognition) {
        try { this.webRecognition.abort(); } catch {}
      }
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = langCode;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          let interimText = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            if (!event.results[i].isFinal) interimText += text;
          }
          if (interimText && this.isListening) {
            this.onResult?.(interimText, false);
          }
        };

        recognition.onerror = (event: any) => {
          // Ignore network errors in browser recognizer since offline Whisper handles final transcript
          if (event.error !== 'no-speech' && event.error !== 'network') {
            console.warn('[WebSTT]', event.error);
          }
        };

        recognition.start();
        this.webRecognition = recognition;
      } catch {}
    }
  }

  private async startNativeSTT(langCode: string) {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        this.onError?.('Microphone permission not granted.');
        this.isListening = false;
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      this.nativeRecording = recording;
      console.log('[Native STT] Recording started offline...');
    } catch (e: any) {
      console.warn('[Native STT] Start recording error:', e?.message || e);
      this.onError?.('Microphone recording error');
      this.isListening = false;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) return;
    this.isListening = false;

    if (Platform.OS === 'web') {
      try { this.webRecognition?.stop(); } catch {}

      // Clean up audio nodes
      if (this.scriptProcessor) {
        try { this.scriptProcessor.disconnect(); } catch {}
        this.scriptProcessor = null;
      }
      if (this.audioInput) {
        try { this.audioInput.disconnect(); } catch {}
        this.audioInput = null;
      }
      if (this.mediaStream) {
        try { this.mediaStream.getTracks().forEach(t => t.stop()); } catch {}
        this.mediaStream = null;
      }

      // Check if we captured audio chunks
      if (this.audioChunks.length > 0) {
        const chunks = [...this.audioChunks];
        this.audioChunks = [];
        const originalRate = this.currentSampleRate;
        const langShort = (this.currentLangCode || 'en').split('-')[0];

        // Send to 100% Offline Whisper STT model
        try {
          const wavBlob = this.encodeWAV(chunks, originalRate, 16000);
          console.log(`[🤖 Offline STT] Sending ${wavBlob.size} bytes WAV to local Whisper model...`);

          const serverHost = this.getServerHost();
          // Try port 3002 (Offline AI Server) first, fallback to port 3001 (Relay)
          let response: Response | null = null;
          try {
            response = await fetch(`http://${serverHost}:3002/stt?lang=${langShort}`, {
              method: 'POST',
              headers: { 'Content-Type': 'audio/wav' },
              body: wavBlob,
            });
          } catch {
            response = await fetch(`http://${serverHost}:3001/stt?lang=${langShort}`, {
              method: 'POST',
              headers: { 'Content-Type': 'audio/wav' },
              body: wavBlob,
            });
          }

          if (response && response.ok) {
            const data = await response.json();
            const transcript = (data.transcript || '').trim();
            console.log(`[🤖 Offline STT Result (${data.elapsed_ms || 0}ms)]:`, transcript);
            if (transcript) {
              this.onResult?.(transcript, true);
              return;
            }
          }
        } catch (e: any) {
          console.warn('[STT] Offline model inference error:', e?.message || e);
        }
      }
    } else {
      if (this.nativeRecording) {
        try {
          await this.nativeRecording.stopAndUnloadAsync();
          const uri = this.nativeRecording.getURI();
          this.nativeRecording = null;
          if (uri) {
            const host = this.getServerHost();
            const langShort = (this.currentLangCode || 'en').split('-')[0];
            const formData = new FormData();
            formData.append('audio', {
              uri,
              type: 'audio/m4a',
              name: 'audio.m4a',
            } as any);

            let res: Response | null = null;
            try {
              res = await fetch(`http://${host}:3002/stt?lang=${langShort}`, {
                method: 'POST',
                body: formData,
              });
            } catch {
              res = await fetch(`http://${host}:3001/stt?lang=${langShort}`, {
                method: 'POST',
                body: formData,
              });
            }

            if (res && res.ok) {
              const data = await res.json();
              const transcript = (data.transcript || '').trim();
              if (transcript) {
                this.onResult?.(transcript, true);
              }
            }
          }
        } catch (e: any) {
          console.warn('[Native STT] Processing error:', e?.message || e);
        }
      }
    }
  }

  private encodeWAV(chunks: Float32Array[], originalSampleRate: number, targetSampleRate = 16000): Blob {
    let totalLength = 0;
    for (const c of chunks) totalLength += c.length;
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    // Downsample to 16000 Hz for Whisper
    let resampled: Float32Array;
    if (originalSampleRate === targetSampleRate) {
      resampled = merged;
    } else {
      const ratio = originalSampleRate / targetSampleRate;
      const newLength = Math.round(merged.length / ratio);
      resampled = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const idx = Math.min(Math.round(i * ratio), merged.length - 1);
        resampled[i] = merged[idx];
      }
    }

    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = targetSampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + resampled.length * 2);
    const view = new DataView(buffer);

    const writeString = (viewOffset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(viewOffset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + resampled.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, resampled.length * 2, true);

    let p = 44;
    for (let i = 0; i < resampled.length; i++, p += 2) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  getIsListening() { return this.isListening; }

  // ─── Current audio element (web) ─────────────────────────────────────────
  private currentAudio: HTMLAudioElement | null = null;

  // ─── TTS ─────────────────────────────────────────────────────────────────
  async speak(
    text: string,
    langId: number,
    isSOS = false,
    onDone?: () => void
  ): Promise<void> {
    // 1. Always stop any previously playing speech first (cancels echos & overlaps)
    this.stopSpeaking();

    if (!text || !text.trim()) {
      onDone?.();
      return;
    }

    const langCode = LANG_STT_CODES[langId] ?? 'en-IN';
    const bcp47Short = langCode.split('-')[0]; // 'hi', 'gu', 'ta', ...

    // ── 1. Web: Single-channel audio playback ──
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (isSOS) {
        this.playSOSBeep();
        await new Promise(r => setTimeout(r, 600));
      }

      const serverHost = window.location.hostname || 'localhost';
      const ttsOfflineUrl = `http://${serverHost}:3002/tts` +
        `?text=${encodeURIComponent(text.slice(0, 200))}` +
        `&lang=${bcp47Short}` +
        `&speed=1.0`;
      const ttsRelayUrl = `http://${serverHost}:3001/tts` +
        `?text=${encodeURIComponent(text.slice(0, 200))}` +
        `&lang=${bcp47Short}` +
        `&slow=${isSOS ? '1' : '0'}`;

      let triedRelay = false;
      let fallbackTriggered = false;

      const doFallback = () => {
        if (!triedRelay) {
          triedRelay = true;
          console.log('[TTS] Trying relay port 3001...');
          if (this.currentAudio) {
            this.currentAudio.src = ttsRelayUrl;
            this.currentAudio.play().catch(() => doFallback());
            return;
          }
        }
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        this.stopSpeaking(); // Kill HTML audio element completely
        try {
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = langCode;
            utterance.pitch = isSOS ? 1.2 : 1.0;
            utterance.rate = isSOS ? 0.85 : 0.95;
            utterance.volume = 1.0;
            utterance.onend = () => { onDone?.(); };
            utterance.onerror = () => { onDone?.(); };
            window.speechSynthesis.speak(utterance);
            return;
          }
        } catch {}
        onDone?.();
      };

      try {
        const audio = new Audio();
        this.currentAudio = audio;

        audio.onended = () => {
          this.currentAudio = null;
          onDone?.();
        };

        audio.onerror = () => {
          doFallback();
        };

        audio.src = ttsOfflineUrl;
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch(() => {
            doFallback();
          });
        }
        return;
      } catch {
        doFallback();
        return;
      }
    }

    // ── 2. Native: Play offline audio via expo-av Audio.Sound ─────────────
    try {
      if (this.nativeSound) {
        try { await this.nativeSound.unloadAsync(); } catch {}
        this.nativeSound = null;
      }
      const host = this.getServerHost();
      const ttsOfflineUrl = `http://${host}:3002/tts?text=${encodeURIComponent(text.slice(0, 200))}&lang=${bcp47Short}&speed=1.0`;
      console.log('[Native TTS] Playing offline audio from:', ttsOfflineUrl);
      const { sound } = await Audio.Sound.createAsync(
        { uri: ttsOfflineUrl },
        { shouldPlay: true }
      );
      this.nativeSound = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          this.nativeSound = null;
          onDone?.();
        }
      });
      return;
    } catch (e) {
      console.warn('[Native Offline TTS Unreachable, falling back to ExpoSpeech]:', e);
      try { ExpoSpeech.stop(); } catch {}
      ExpoSpeech.speak(text, {
        language: langCode,
        pitch: isSOS ? 1.2 : 1.0,
        rate: isSOS ? 0.85 : 0.95,
        volume: 1.0,
        onDone,
        onError: (e) => { console.warn('[TTS/native]', e); onDone?.(); },
      });
    }
  }

  stopSpeaking() {
    if (this.nativeSound) {
      try {
        this.nativeSound.stopAsync();
        this.nativeSound.unloadAsync();
        this.nativeSound = null;
      } catch {}
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;
          this.currentAudio.src = '';
          this.currentAudio = null;
        } catch {}
      }
      try {
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      } catch {}
    }
    try { ExpoSpeech.stop(); } catch {}
  }

  private playSOSBeep() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.55);
    } catch {}
  }

  destroy() {
    this.stopListening();
    this.nativeSubs.forEach(s => { try { s?.remove?.(); } catch {} });
    this.nativeSubs = [];
  }
}

export const speechService = new SpeechService();
