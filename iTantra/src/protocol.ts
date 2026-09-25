/**
 * iTantra Micro-Packet Protocol — Team Monte Carlo (SIH PS 26173)
 * 
 * Encodes & decodes ultra-compact JSON packets that replace raw audio.
 * ~120 bytes per message vs 80,000 bytes raw audio = 99.8% bandwidth savings.
 */

export interface LanguageInfo {
  id: number;
  code: string;       // BCP-47 for STT/TTS engines
  name: string;
  shortName: string;
  script: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { id: 0, code: 'hi-IN', name: 'Hindi',     shortName: 'HI', script: 'Devanagari' },
  { id: 1, code: 'gu-IN', name: 'Gujarati',  shortName: 'GU', script: 'Gujarati'   },
  { id: 2, code: 'mr-IN', name: 'Marathi',   shortName: 'MR', script: 'Devanagari' },
  { id: 3, code: 'kn-IN', name: 'Kannada',   shortName: 'KN', script: 'Kannada'    },
  { id: 4, code: 'ml-IN', name: 'Malayalam', shortName: 'ML', script: 'Malayalam'  },
  { id: 5, code: 'ta-IN', name: 'Tamil',     shortName: 'TA', script: 'Tamil'      },
  { id: 6, code: 'te-IN', name: 'Telugu',    shortName: 'TE', script: 'Telugu'     },
  { id: 7, code: 'or-IN', name: 'Odia',      shortName: 'OR', script: 'Odia'       },
  { id: 8, code: 'bn-IN', name: 'Bengali',   shortName: 'BN', script: 'Bengali'    },
  { id: 9, code: 'en-IN', name: 'English',   shortName: 'EN', script: 'Latin'      },
];

export type TransmitMode = 'send' | 'sos';

export interface MeshNetwork {
  id: string;
  name: string;
  channel: number;
  freq: string;
  description: string;
  color: string;
  isDefault?: boolean;
}

export const DEFAULT_NETWORKS: MeshNetwork[] = [
  {
    id: 'net-alpha',
    name: 'iTantra-Alpha',
    channel: 1,
    freq: '144.250 MHz',
    description: 'Tactical Search & Rescue Unit',
    color: '#E8711A',
    isDefault: true,
  },
  {
    id: 'net-bravo',
    name: 'iTantra-Bravo',
    channel: 2,
    freq: '146.520 MHz',
    description: 'Medical & Triage Evacuation',
    color: '#1ABC9C',
  },
  {
    id: 'net-command',
    name: 'iTantra-Command',
    channel: 3,
    freq: '147.000 MHz',
    description: 'Base Ops & Emergency Command',
    color: '#9B59B6',
  },
];

export interface ITantraPacket {
  /** Message version */
  v: number;
  /** Unique message ID for gossip dedup */
  uuid: string;
  /** Hop count remaining (decrements per relay) */
  ttl: number;
  /** Is this an SOS/Emergency alert? */
  sos: boolean;
  /** PTT walkie-talkie (false) or Phone hands-free (true) */
  phone: boolean;
  /** Language index 0–9 */
  langId: number;
  /** Transcribed text */
  text: string;
  /** Sender node ID */
  from: string;
  /** Sender node human name */
  fromName: string;
  /** Unix timestamp (ms) when sentence was completed (STT done) */
  sttDoneAt: number;
  /** Byte size of the UTF-8 text payload */
  byteSize: number;
  /** Target Mesh Network ID (e.g. 'net-alpha') */
  networkId?: string;
  /** Target RF channel index (1–4) */
  channel?: number;
}

export function buildPacket(params: {
  text: string;
  langId: number;
  isSOS: boolean;
  isPhoneMode: boolean;
  fromNodeId: string;
  fromName: string;
  ttl?: number;
  networkId?: string;
  channel?: number;
}): ITantraPacket {
  const textBytes = new TextEncoder().encode(params.text).length;
  return {
    v: 1,
    uuid: generateUUID(),
    ttl: params.ttl ?? 4,
    sos: params.isSOS,
    phone: params.isPhoneMode,
    langId: params.langId,
    text: params.text,
    from: params.fromNodeId,
    fromName: params.fromName,
    sttDoneAt: Date.now(),
    byteSize: textBytes,
    networkId: params.networkId,
    channel: params.channel,
  };
}

export function serializePacket(packet: ITantraPacket): string {
  return JSON.stringify(packet);
}

export function parsePacket(raw: string): ITantraPacket | null {
  try {
    const p = JSON.parse(raw) as ITantraPacket;
    if (!p.uuid || !p.text || p.langId === undefined) return null;
    return p;
  } catch {
    return null;
  }
}

export function getLangInfo(id: number): LanguageInfo {
  return LANGUAGES[id] ?? LANGUAGES[9];
}

export function computeCRC16(text: string): string {
  let crc = 0xFFFF;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return '0x' + crc.toString(16).toUpperCase().padStart(4, '0');
}

export function estimateTransmitMs(byteSize: number, bps: number): number {
  // Packet overhead: ~24 bytes (uuid, flags etc in JSON wrapping)
  const totalBytes = byteSize + 24;
  const bits = totalBytes * 8;
  return Math.round((bits / bps) * 1000);
}

export function bandwidthSavingsPct(textByteSize: number, audioDurationSec: number): number {
  // 16 kHz, 16-bit mono PCM
  const rawAudioBytes = audioDurationSec * 16000 * 2;
  return Math.min(99.99, ((rawAudioBytes - textByteSize) / rawAudioBytes) * 100);
}

// UUID generator (works on web and React Native)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function generateNodeId(): string {
  return 'node-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}
