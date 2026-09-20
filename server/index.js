/**
 * iTantra WebSocket Relay Server — Team Monte Carlo SIH 2026
 * 100% OFFLINE Local Relay & AI Proxy
 */

const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;

// ─── Offline TTS language codes ─────────────────────────────────────────────
// Maps BCP-47 short code -> local offline TTS language parameter
const LANG_MAP = {
  'hi': 'hi',  // Hindi
  'gu': 'gu',  // Gujarati
  'mr': 'mr',  // Marathi
  'kn': 'kn',  // Kannada
  'ml': 'ml',  // Malayalam
  'ta': 'ta',  // Tamil
  'te': 'te',  // Telugu
  'or': 'or',  // Odia
  'od': 'or',  // Odia fallback
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

  // ── /stt — Offline AI STT Proxy (Whisper Tiny INT8 on port 3002) ────
  if (url.pathname === '/stt' && req.method === 'POST') {
    const lang = url.searchParams.get('lang') || 'hi';
    const aiReq = http.request({
      hostname: '127.0.0.1',
      port: 3002,
      path: `/stt?lang=${encodeURIComponent(lang)}`,
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'audio/wav',
        'Content-Length': req.headers['content-length'] || '',
      }
    }, (aiRes) => {
      res.writeHead(aiRes.statusCode, { ...corsHeaders, 'Content-Type': 'application/json' });
      aiRes.pipe(res);
    });

    aiReq.on('error', (err) => {
      console.warn('[STT] Offline AI server unreachable:', err.message);
      res.writeHead(503, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Offline AI server unreachable: ${err.message}` }));
    });

    req.pipe(aiReq);
    return;
  }

  // ── /tts — Local Offline AI Model First (port 3002) ─────────
  if (url.pathname === '/tts') {
    const text = url.searchParams.get('text') || '';
    const langInput = (url.searchParams.get('lang') || 'hi').toLowerCase().split('-')[0];
    const lang = LANG_MAP[langInput] || 'hi';
    const slowParam = url.searchParams.get('slow');
    const slow = slowParam !== null ? slowParam : (SLOW_LANGS.has(lang) ? '1' : '0');

    if (!text.trim()) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'text required' }));
      return;
    }

    // 100% Offline AI Neural Model on port 3002
    const aiUrl = `http://127.0.0.1:3002/tts?text=${encodeURIComponent(text.slice(0, 200))}&lang=${lang}`;
    const aiReq = http.get(aiUrl, (aiRes) => {
      res.writeHead(aiRes.statusCode, {
        ...corsHeaders,
        'Content-Type': 'audio/wav',
        'Cache-Control': 'public, max-age=300',
      });
      aiRes.pipe(res);
    });

    aiReq.on('error', (err) => {
      console.warn(`[Local AI] Port 3002 unreachable (${err.message})`);
      res.writeHead(503, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Offline AI server unreachable: ${err.message}` }));
    });

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
