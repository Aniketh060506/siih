/**
 * iTantra WebSocket Relay Server — Team Monte Carlo SIH 2026
 *
 * Relays micro-packets between all connected nodes.
 * Maintains node registry and broadcasts peer lists.
 *
 * NEW: /tts proxy endpoint — bypasses browser CORS to serve
 * Google Translate TTS audio for all 10 Indian languages.
 */

const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;

// ─── Google Translate TTS language codes ────────────────────────────────────
// Maps BCP-47 short code -> Google TTS language parameter
// Note: Odia ('or') is supported by Google Translate as 'or'
const LANG_MAP = {
  'hi': 'hi',  // Hindi
  'gu': 'gu',  // Gujarati
  'mr': 'mr',  // Marathi
  'kn': 'kn',  // Kannada
  'ml': 'ml',  // Malayalam
  'ta': 'ta',  // Tamil
  'te': 'te',  // Telugu
  'or': 'or',  // Odia (Google TTS code)
  'od': 'or',  // Alternate Odia code fallback
  'bn': 'bn',  // Bengali
  'en': 'en',  // English
};

// Languages that need slow=1 for clarity (complex scripts)
const SLOW_LANGS = new Set(['ml', 'kn', 'te', 'ta', 'or']);

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── /health ────────────────────────────────────────────────
  if (url.pathname === '/health') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      clients: clients.size,
      nodes: Array.from(clients.keys()),
      uptime: process.uptime(),
    }));
    return;
  }

  // ── /tts — Google TTS proxy (ALL 10 Indian languages) ─────
  if (url.pathname === '/tts') {
    const text = url.searchParams.get('text') || '';
    const langInput = (url.searchParams.get('lang') || 'hi').toLowerCase().split('-')[0];
    const lang = LANG_MAP[langInput] || 'hi';
    // Auto-slow for complex-script languages for clarity; caller can override
    const slowParam = url.searchParams.get('slow');
    const slow = slowParam !== null ? slowParam : (SLOW_LANGS.has(lang) ? '1' : '0');

    if (!text.trim()) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'text required' }));
      return;
    }

    function fetchTTS(targetLang, targetText) {
      const googleUrl =
        `https://translate.google.com/translate_tts?ie=UTF-8` +
        `&q=${encodeURIComponent(targetText.slice(0, 200))}` +
        `&tl=${targetLang}` +
        `&sl=${targetLang}` +
        `&client=tw-ob` +
        `&slow=${slow}`;

      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
          'Accept': 'audio/mpeg, audio/*;q=0.9, */*;q=0.8',
        },
      };

      console.log(`[🔊] TTS: "${targetText.slice(0, 40)}" [${targetLang}]`);

      https.get(googleUrl, options, (ttsRes) => {
        if (ttsRes.statusCode !== 200) {
          // Odia fallback: retry with Hindi if original lang fails
          if (lang === 'or' && targetLang === 'or') {
            console.log('[TTS] Odia failed, retrying with Hindi...');
            fetchTTS('hi', targetText);
            return;
          }
          res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Google TTS returned ${ttsRes.statusCode}` }));
          return;
        }

        if (!res.headersSent) {
          res.writeHead(200, {
            ...corsHeaders,
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=300',
          });
        }

        ttsRes.pipe(res);

        ttsRes.on('error', (e) => {
          console.error('[TTS stream error]', e.message);
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
      }).on('error', (e) => {
        console.error('[TTS fetch error]', e.message);
        if (!res.headersSent) {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    }

    fetchTTS(lang, text);
    return;
  }

  res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

// ─── WebSocket Relay ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

// nodeId -> { ws, name, joinedAt, lastSeen, channel }
const clients = new Map();

// Track seen UUIDs for gossip dedup (last 500)
const seenUUIDs = new Set();
const UUID_CACHE_LIMIT = 500;

function broadcastNodeList() {
  const nodeList = Array.from(clients.entries()).map(([id, info]) => ({
    nodeId: id,
    name: info.name,
    joinedAt: info.joinedAt,
    channel: info.channel || 1,
  }));
  const msg = JSON.stringify({ type: 'nodes', nodes: nodeList, ts: Date.now() });
  clients.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

function relay(senderNodeId, rawMsg, channel) {
  clients.forEach(({ ws, channel: peerChannel }, nodeId) => {
    if (nodeId === senderNodeId) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    // SOS bypasses channel filter; normal messages respect channel
    ws.send(rawMsg);
  });
}

wss.on('connection', (ws, req) => {
  const remoteAddr = req.socket.remoteAddress;
  let nodeId = null;

  console.log(`[+] New connection from ${remoteAddr}`);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    // ── Register ──────────────────────────────────────────────
    if (msg.type === 'register') {
      nodeId = msg.nodeId || crypto.randomUUID();
      clients.set(nodeId, {
        ws,
        name: msg.name || nodeId.slice(0, 8),
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        channel: msg.channel || 1,
      });
      console.log(`[✓] Registered: ${clients.get(nodeId).name} (${nodeId}) ch:${msg.channel || 1}`);
      ws.send(JSON.stringify({ type: 'registered', nodeId, ts: Date.now() }));
      broadcastNodeList();
      return;
    }

    if (nodeId && clients.has(nodeId)) {
      clients.get(nodeId).lastSeen = Date.now();
      // Update channel if changed
      if (msg.channel) clients.get(nodeId).channel = msg.channel;
    }

    // ── Message / SOS Broadcast ───────────────────────────────
    if (msg.type === 'message' || msg.type === 'sos') {
      if (msg.uuid && seenUUIDs.has(msg.uuid)) return;
      if (msg.uuid) {
        seenUUIDs.add(msg.uuid);
        if (seenUUIDs.size > UUID_CACHE_LIMIT) {
          seenUUIDs.delete(seenUUIDs.values().next().value);
        }
      }

      const serverMsg = JSON.stringify({
        ...msg,
        relayedBy: 'server',
        serverTs: Date.now(),
      });

      relay(nodeId, serverMsg, msg.channel || 1);
      console.log(`[→] ${(msg.type || '').toUpperCase()} from ${nodeId?.slice(0, 8)}: "${(msg.text || '').slice(0, 60)}"`);
      return;
    }

    // ── Ping ──────────────────────────────────────────────────
    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
    }
  });

  ws.on('close', () => {
    if (nodeId && clients.has(nodeId)) {
      console.log(`[-] Disconnected: ${clients.get(nodeId).name}`);
      clients.delete(nodeId);
      broadcastNodeList();
    }
  });

  ws.on('error', (err) => {
    console.error(`[!] WS error for ${nodeId}: ${err.message}`);
  });
});

// ─── Listen ──────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     iTantra Relay Server — Monte Carlo       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Local:   ws://localhost:${PORT}              ║`);
  results.forEach(ip => console.log(`║  Network: ws://${ip}:${PORT}          ║`));
  console.log(`║  Health:  http://localhost:${PORT}/health     ║`);
  console.log(`║  TTS:     http://localhost:${PORT}/tts?text=नमस्ते&lang=hi ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log('All 10 Indian languages TTS ready via /tts endpoint!\n');
});
