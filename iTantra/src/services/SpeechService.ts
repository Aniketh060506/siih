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

  async init() {
    if (Platform.OS !== 'web') {
      const esr = await getESR();
      if (!esr) return;
      try {
        await esr.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      } catch (e) {
        console.warn('[STT] Permission request failed:', e);
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
    this.isListening = true;

    if (Platform.OS === 'web') {
      this.startWebSTT(langCode);
    } else {
      await this.startNativeSTT(langCode);
    }
  }

  private startWebSTT(langCode: string) {
    const SpeechRecognition: any =
      (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));

    if (!SpeechRecognition) {
      this.onError?.('Use Chrome or Edge for speech recognition. Safari not supported.');
      this.isListening = false;
      return;
    }

    // Abort previous session
    if (this.webRecognition) {
      try { this.webRecognition.abort(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = langCode;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interimText = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) this.onResult?.(finalText, true);
      else if (interimText) this.onResult?.(interimText, false);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech') {
        this.onError?.(`STT: ${event.error}`);
      }
      this.isListening = false;
    };

    recognition.onend = () => {
      // Auto-restart for continuous listening while PTT is held / hands-free
      if (this.isListening) {
        setTimeout(() => { if (this.isListening) { try { recognition.start(); } catch {} } }, 150);
      }
    };

    try {
      recognition.start();
      this.webRecognition = recognition;
    } catch (e) {
      this.onError?.('Could not start microphone. Allow mic access in browser.');
      this.isListening = false;
    }
  }

  private async startNativeSTT(langCode: string) {
    const esr = await getESR();
    if (!esr) {
      this.onError?.('Native speech recognition unavailable. Build APK with expo-speech-recognition.');
      this.isListening = false;
      return;
    }

    // Wire up listeners fresh each time
    this.nativeSubs.forEach(s => { try { s?.remove?.(); } catch {} });
    this.nativeSubs = [];

    this.nativeSubs.push(
      esr.addSpeechRecognitionListener('result', (event: any) => {
        const resultItem = event.results?.[event.resultIndex];
        const text = resultItem?.[0]?.transcript ?? '';
        const isFinal = resultItem?.isFinal ?? false;
        if (text) this.onResult?.(text, isFinal);
      })
    );
    this.nativeSubs.push(
      esr.addSpeechRecognitionListener('error', (event: any) => {
        this.isListening = false;
        this.onError?.(`STT Error: ${event.message || event.error || 'unknown'}`);
      })
    );
    this.nativeSubs.push(
      esr.addSpeechRecognitionListener('end', () => {
        this.isListening = false;
      })
    );

    try {
      esr.ExpoSpeechRecognitionModule.start({
        lang: langCode,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: false,
      });
    } catch (e: any) {
      this.onError?.(`Could not start native STT: ${e?.message}`);
      this.isListening = false;
    }
  }

  async stopListening(): Promise<void> {
    this.isListening = false;

    if (Platform.OS === 'web') {
      try { this.webRecognition?.stop(); } catch {}
    } else {
      const esr = await getESR();
      if (esr) {
        try { esr.ExpoSpeechRecognitionModule.stop(); } catch {}
      }
    }
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
      const ttsUrl = `http://${serverHost}:3001/tts` +
        `?text=${encodeURIComponent(text.slice(0, 200))}` +
        `&lang=${bcp47Short}` +
        `&slow=${isSOS ? '1' : '0'}`;

      let fallbackTriggered = false;
      const doFallback = () => {
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

        audio.src = ttsUrl;
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

    // ── 2. Native: expo-speech ────────────────────────────────────────────
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

  stopSpeaking() {
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
