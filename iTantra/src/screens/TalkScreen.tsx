/**
 * TalkScreen — iTantra (Team Monte Carlo, SIH 2026, PS 26173)
 *
 * Clean card-based UI inspired by modern finance/dashboard apps.
 * Simple, bold, easy to understand at a glance.
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Modal, FlatList, Platform, Switch,
  Pressable, ActivityIndicator, Vibration, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import {
  LANGUAGES, buildPacket, getLangInfo, computeCRC16,
  estimateTransmitMs, bandwidthSavingsPct, ITantraPacket,
} from '../protocol';
import { speechService, INITIAL_STEPS, PipelineStep } from '../services/SpeechService';
import { wsService } from '../services/WebSocketService';

export interface Message {
  id: string;
  text: string;
  langId: number;
  isOwn: boolean;
  timestamp: number;
  byteSize: number;
  latencyMs?: number;
  isSOS: boolean;
  fromName?: string;
}

interface TalkScreenProps {
  nodeId: string;
  nodeName: string;
  onPipelineUpdate: (steps: PipelineStep[]) => void;
  serverUrl: string;
}

const RF_CHANNELS = [
  { label: '50 bps',   bps: 50,        icon: 'cellular-outline' as const },
  { label: '300 bps',  bps: 300,       icon: 'cellular'         as const },
  { label: '1.2 kbps', bps: 1200,      icon: 'wifi-outline'     as const },
  { label: 'Wi-Fi',    bps: 1_000_000, icon: 'wifi'             as const },
];

export default function TalkScreen({
  nodeId, nodeName, onPipelineUpdate, serverUrl,
}: TalkScreenProps) {
  const [messages,          setMessages]          = useState<Message[]>([]);
  const [isRecording,       setIsRecording]       = useState(false);
  const [isHandsFree,       setIsHandsFree]       = useState(false);
  const [isSOS,             setIsSOS]             = useState(false);
  const [selectedLang,      setSelectedLang]      = useState(0);
  const [langModalVisible,  setLangModalVisible]  = useState(false);
  const [partialText,       setPartialText]       = useState('');
  const [rfChannelIdx,      setRfChannelIdx]      = useState(2);
  const [isConnected,       setIsConnected]       = useState(false);
  const [latencyMs,         setLatencyMs]         = useState<number | null>(null);
  const [peers,             setPeers]             = useState<{ nodeId: string; name: string }[]>([]);
  const [customInput,       setCustomInput]       = useState('');
  const [activeNetwork,     setActiveNetwork]     = useState(wsService.getCurrentNetwork());
  const [steps,             setSteps]             = useState<PipelineStep[]>(INITIAL_STEPS.map(s => ({ ...s })));

  const scrollRef    = useRef<ScrollView>(null);
  const ring1        = useRef(new Animated.Value(1)).current;
  const ring2        = useRef(new Animated.Value(1)).current;
  const ring3        = useRef(new Animated.Value(1)).current;
  const sttStartTime = useRef<number>(0);
  const processedUUIDs = useRef<Set<string>>(new Set());

  // ── Pulse rings ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      [ring1, ring2, ring3].forEach((ring, i) => {
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 200),
            Animated.timing(ring, { toValue: 1.9 + i * 0.3, duration: 900, useNativeDriver: true }),
            Animated.timing(ring, { toValue: 1, duration: 100, useNativeDriver: true }),
          ])
        ).start();
      });
    } else {
      [ring1, ring2, ring3].forEach(r => { r.stopAnimation(); r.setValue(1); });
    }
  }, [isRecording]);

  // ── WebSocket + Speech init ────────────────────────────────────────────
  useEffect(() => {
    speechService.setServerHost(serverUrl);
    speechService.init().then(() => {
      speechService.setCallbacks(handleSTTResult, handleSTTError);
    });

    const unsub = wsService.addListener((event) => {
      if (event.type === 'connected')      setIsConnected(true);
      if (event.type === 'disconnected')   setIsConnected(false);
      if (event.type === 'latency')        setLatencyMs(event.ms);
      if (event.type === 'nodes')          setPeers(event.nodes);
      if (event.type === 'network_changed') setActiveNetwork(event.network);
      if (event.type === 'message')        handleIncomingPacket(event.packet, event.serverTs);
    });
    return () => { unsub(); speechService.stopListening(); };
  }, [selectedLang, rfChannelIdx]);

  // ── STT callbacks ──────────────────────────────────────────────────────
  const handleSTTResult = useCallback((transcript: string, isFinal: boolean) => {
    setPartialText(isFinal ? '' : transcript);
    if (isFinal && transcript.trim()) sendTranscript(transcript.trim());
  }, [selectedLang, isSOS, rfChannelIdx, nodeId, nodeName]);

  const handleSTTError = useCallback((error: string) => {
    setIsRecording(false);
    updateStep(2, 'error', `Error: ${error}`);
  }, []);

  // ── Incoming packet ────────────────────────────────────────────────────
  const handleIncomingPacket = useCallback((packet: ITantraPacket, serverTs: number) => {
    if (!packet?.uuid) return;
    if (packet.from === nodeId) return;
    if (processedUUIDs.current.has(packet.uuid)) return;
    processedUUIDs.current.add(packet.uuid);
    if (processedUUIDs.current.size > 500) {
      const first = processedUUIDs.current.values().next().value;
      if (first) processedUUIDs.current.delete(first);
    }

    speechService.unlockAudio();
    const endToEndMs = Date.now() - packet.sttDoneAt;

    const msg: Message = {
      id: packet.uuid,
      text: packet.text,
      langId: packet.langId,
      isOwn: false,
      timestamp: packet.sttDoneAt,
      byteSize: packet.byteSize,
      latencyMs: endToEndMs,
      isSOS: packet.sos,
      fromName: packet.fromName,
    };

    setMessages(prev => [...prev, msg]);
    scrollRef.current?.scrollToEnd({ animated: true });
    updateStep(5, 'done', `Hop OK — TTL:${packet.ttl}`);

    if (packet.sos) Vibration.vibrate([0, 200, 100, 200, 100, 500]);
    speechService.speak(packet.text, packet.langId, packet.sos, () => {
      updateStep(6, 'done', `TTS done — ${Date.now() - packet.sttDoneAt}ms`);
    });
  }, [nodeId]);

  // ── Send transcript ────────────────────────────────────────────────────
  const sendTranscript = useCallback((text: string) => {
    const sttMs = Date.now() - sttStartTime.current;
    const rf    = RF_CHANNELS[rfChannelIdx];
    const packet = buildPacket({
      text,
      langId: selectedLang,
      isSOS,
      isPhoneMode: isHandsFree,
      fromNodeId: nodeId,
      fromName: nodeName,
      networkId: activeNetwork.id,
      channel: activeNetwork.channel,
    });

    const byteSize = new TextEncoder().encode(text).length;
    updateStep(1, 'done', 'VAD done');
    updateStep(2, 'done', `STT: ${sttMs}ms`);
    updateStep(3, 'done', `Packet: ${byteSize}B | CRC: ${computeCRC16(text)}`);
    updateStep(4, 'active', `Tx @ ${rf.label}...`);
    setTimeout(() => updateStep(4, 'done', `Sent! ${bandwidthSavingsPct(byteSize, text.length * 0.06).toFixed(0)}% saved`), Math.min(estimateTransmitMs(byteSize, rf.bps), 1500));

    const msg: Message = {
      id: packet.uuid, text, langId: selectedLang,
      isOwn: true, timestamp: Date.now(), byteSize, isSOS, fromName: nodeName,
    };
    processedUUIDs.current.add(packet.uuid);
    setMessages(prev => [...prev, msg]);
    scrollRef.current?.scrollToEnd({ animated: true });
    wsService.sendPacket(packet);
  }, [selectedLang, isSOS, isHandsFree, rfChannelIdx, nodeId, nodeName]);

  const updateStep = useCallback((id: number, status: PipelineStep['status'], detail: string) => {
    setSteps(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, status, detail } : s);
      onPipelineUpdate(updated);
      return updated;
    });
  }, [onPipelineUpdate]);

  const resetPipeline = () => setSteps(INITIAL_STEPS.map(s => ({ ...s })));

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    setIsRecording(true);
    setPartialText('');
    sttStartTime.current = Date.now();
    resetPipeline();
    updateStep(1, 'active', 'Listening...');
    updateStep(2, 'active', 'STT ready...');
    await speechService.startListening(selectedLang);
  }, [isRecording, selectedLang]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    await speechService.stopListening();
  }, [isRecording]);

  const handleTestSpeaker = useCallback(() => {
    speechService.unlockAudio();
    const testPhrases = [
      'Hello, iTantra transceiver audio ready',
      'नमस्ते, आई-तंत्र ऑडियो तैयार है',
    ];
    const phrase = testPhrases[selectedLang] ?? testPhrases[0];
    speechService.speak(phrase, selectedLang, isSOS);
  }, [selectedLang, isSOS]);

  useEffect(() => {
    if (isHandsFree && isConnected) startRecording();
    else if (!isHandsFree && isRecording) stopRecording();
  }, [isHandsFree, isConnected]);

  const langInfo = getLangInfo(selectedLang);
  const rf       = RF_CHANNELS[rfChannelIdx];

  return (
    <SafeAreaView style={styles.root}>

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>iTantra 🎙️</Text>
          <Text style={styles.subtitle}>Neural Voice Radio</Text>
        </View>
        <View style={styles.headerActions}>
          {/* Connection dot */}
          <View style={[styles.connBadge, isConnected ? styles.connOnline : styles.connOffline]}>
            <View style={[styles.connDot, isConnected ? styles.connDotOn : styles.connDotOff]} />
            <Text style={[styles.connText, isConnected ? styles.connTextOn : styles.connTextOff]}>
              {isConnected ? 'Online' : 'Offline'}
            </Text>
          </View>
          {/* Language pill */}
          <TouchableOpacity style={styles.langPill} onPress={() => setLangModalVisible(true)}>
            <Text style={styles.langPillText}>{langInfo.shortName}</Text>
            <Ionicons name="chevron-down" size={11} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Status Cards Row ─────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="people-outline" size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{peers.length}</Text>
            <Text style={styles.statLabel}>Peers</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="radio-outline" size={20} color={COLORS.info} />
            <Text style={styles.statValue}>CH-{activeNetwork.channel}</Text>
            <Text style={styles.statLabel}>{activeNetwork.name.split('-')[1] ?? activeNetwork.name}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="speedometer-outline" size={20} color={COLORS.success} />
            <Text style={styles.statValue}>{rf.label}</Text>
            <Text style={styles.statLabel}>RF Speed</Text>
          </View>
          {latencyMs && (
            <View style={styles.statCard}>
              <Ionicons name="timer-outline" size={20} color={COLORS.warning} />
              <Text style={styles.statValue}>{latencyMs}</Text>
              <Text style={styles.statLabel}>ms</Text>
            </View>
          )}
        </View>

        {/* ── Big Mic Card ─────────────────────────────────── */}
        <View style={[styles.micCard, isSOS && styles.micCardSOS]}>
          {/* SOS toggle */}
          <View style={styles.micCardTop}>
            <Text style={styles.micCardTitle}>
              {isSOS ? '🚨 SOS BROADCAST' : isRecording ? '● Recording...' : '🎙️ Push to Talk'}
            </Text>
            <TouchableOpacity
              style={[styles.sosToggle, isSOS && styles.sosToggleActive]}
              onPress={() => setIsSOS(!isSOS)}
            >
              <Text style={[styles.sosToggleText, isSOS && styles.sosToggleTextActive]}>SOS</Text>
            </TouchableOpacity>
          </View>

          {/* Mic button with pulse rings */}
          <View style={styles.micOuter}>
            {[ring3, ring2, ring1].map((anim, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.pulseRing,
                  {
                    width: 100 + i * 28, height: 100 + i * 28,
                    transform: [{ scale: anim }],
                    opacity: isRecording ? 0.12 - i * 0.03 : 0,
                    backgroundColor: isSOS ? COLORS.sos : COLORS.primary,
                  },
                ]}
              />
            ))}
            <TouchableOpacity
              style={[styles.micBtn, isSOS && styles.micBtnSOS, isRecording && styles.micBtnActive]}
              onPressIn={!isHandsFree ? startRecording : undefined}
              onPressOut={!isHandsFree ? stopRecording : undefined}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isRecording ? 'mic' : 'mic-outline'}
                size={42}
                color="#fff"
              />
              {isRecording && (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={styles.recordSpinner} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.pttLabel}>
            {isHandsFree
              ? (isRecording ? '● Listening hands-free...' : '○ Hands-free — waiting for voice')
              : 'HOLD TO TALK'}
          </Text>

          {partialText ? (
            <Text style={styles.partialText} numberOfLines={2}>{partialText}</Text>
          ) : null}

          {/* Quick controls row */}
          <View style={styles.micControls}>
            <View style={styles.handsFreeToggle}>
              <Ionicons name="ear-outline" size={15} color="rgba(255,255,255,0.85)" />
              <Text style={styles.handsFreeLabel}>Hands-Free</Text>
              <Switch
                value={isHandsFree}
                onValueChange={setIsHandsFree}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: 'rgba(255,255,255,0.5)' }}
                thumbColor="#fff"
              />
            </View>
            <TouchableOpacity style={styles.testBtn} onPress={handleTestSpeaker}>
              <Ionicons name="volume-high-outline" size={14} color="#fff" />
              <Text style={styles.testBtnText}>Test</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── RF Channel Selector ──────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Ionicons name="radio" size={16} color={COLORS.primary} />
            <Text style={styles.sectionCardTitle}>RF Channel</Text>
          </View>
          <View style={styles.rfPills}>
            {RF_CHANNELS.map((ch, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.rfPill, rfChannelIdx === i && styles.rfPillActive]}
                onPress={() => setRfChannelIdx(i)}
              >
                <Ionicons name={ch.icon} size={12} color={rfChannelIdx === i ? '#fff' : COLORS.textSecondary} />
                <Text style={[styles.rfPillText, rfChannelIdx === i && styles.rfPillTextActive]}>
                  {ch.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Type & Send ──────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Ionicons name="chatbubble-outline" size={16} color={COLORS.primary} />
            <Text style={styles.sectionCardTitle}>Type Message</Text>
            <Text style={styles.sectionCardSub}>{langInfo.name}</Text>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder={`Message in ${langInfo.name}...`}
              placeholderTextColor={COLORS.textMuted}
              value={customInput}
              onChangeText={setCustomInput}
              onSubmitEditing={() => {
                if (customInput.trim()) { sendTranscript(customInput.trim()); setCustomInput(''); }
              }}
            />
            <TouchableOpacity
              style={[styles.sendBtn, customInput.trim() && styles.sendBtnActive]}
              onPress={() => {
                if (customInput.trim()) { sendTranscript(customInput.trim()); setCustomInput(''); }
              }}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Peer Banner ──────────────────────────────────── */}
        {peers.length > 0 && (
          <View style={styles.peerBanner}>
            <View style={styles.peerDot} />
            <Text style={styles.peerText}>
              {peers.length} peer{peers.length > 1 ? 's' : ''} online — {peers.map(p => p.name).join(', ')}
            </Text>
          </View>
        )}

        {/* ── Messages ─────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionCardHeader}>
            <Ionicons name="chatbubbles-outline" size={16} color={COLORS.primary} />
            <Text style={styles.sectionCardTitle}>Messages</Text>
            {messages.length > 0 && (
              <View style={styles.msgCountBadge}>
                <Text style={styles.msgCountText}>{messages.length}</Text>
              </View>
            )}
          </View>

          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="mic-circle-outline" size={40} color={COLORS.border} />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubText}>Hold the mic button to start talking</Text>
            </View>
          ) : (
            messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))
          )}
        </View>

      </ScrollView>

      {/* ── Language Modal ───────────────────────────────────── */}
      <Modal visible={langModalVisible} transparent animationType="slide" onRequestClose={() => setLangModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setLangModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose Language</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.langRow, selectedLang === item.id && styles.langRowActive]}
                  onPress={() => { setSelectedLang(item.id); setLangModalVisible(false); }}
                >
                  <View style={[styles.langAvatar, selectedLang === item.id && styles.langAvatarActive]}>
                    <Text style={styles.langAvatarText}>{item.shortName}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.langRowName}>{item.name}</Text>
                    <Text style={styles.langRowSub}>{item.script} · {item.code}</Text>
                  </View>
                  {selectedLang === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

// ─── MessageBubble ──────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const lang    = getLangInfo(message.langId);
  const timeStr = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity
      style={[
        styles.bubble,
        message.isOwn ? styles.bubbleOwn : styles.bubbleOther,
        message.isSOS && styles.bubbleSOS,
      ]}
      activeOpacity={0.75}
      onPress={() => { speechService.unlockAudio(); speechService.speak(message.text, message.langId, message.isSOS); }}
    >
      {!message.isOwn && message.fromName && (
        <Text style={styles.bubbleFrom}>{message.fromName}</Text>
      )}
      {message.isSOS && (
        <View style={styles.sosBadge}><Text style={styles.sosBadgeText}>🚨 SOS</Text></View>
      )}
      <Text style={[styles.bubbleText, message.isOwn && styles.bubbleTextOwn]}>
        {message.text}
      </Text>
      <View style={styles.bubbleFoot}>
        <Ionicons name="volume-medium-outline" size={11} color={message.isOwn ? 'rgba(255,255,255,0.6)' : COLORS.textMuted} />
        <Text style={[styles.bubbleMeta, message.isOwn && styles.bubbleMetaOwn]}>
          {lang.shortName} · {message.byteSize}B{message.latencyMs ? ` · ${message.latencyMs}ms` : ''} · {timeStr}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F2F4F8' },
  scroll:  { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#EAEDF2',
  },
  greeting: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: '#9BA3B2', marginTop: 1, fontWeight: '500' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  connBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  connOnline:  { backgroundColor: '#E6FBF0' },
  connOffline: { backgroundColor: '#FEE8E8' },
  connDot:     { width: 7, height: 7, borderRadius: 4 },
  connDotOn:   { backgroundColor: '#22C55E' },
  connDotOff:  { backgroundColor: '#EF4444' },
  connText:    { fontSize: 12, fontWeight: '700' },
  connTextOn:  { color: '#16A34A' },
  connTextOff: { color: '#DC2626' },

  langPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  langPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Stats row
  statsRow: {
    flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 4,
  },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12,
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statValue: { fontSize: 15, fontWeight: '800', color: '#1A1A2E', marginTop: 2 },
  statLabel: { fontSize: 10, color: '#9BA3B2', fontWeight: '600', textAlign: 'center' },

  // Mic card
  micCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 24, padding: 20, marginTop: 12,
    alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 10,
  },
  micCardSOS: {
    backgroundColor: COLORS.sos,
    shadowColor: COLORS.sos,
  },
  micCardTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', marginBottom: 20,
  },
  micCardTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sosToggle: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  sosToggleActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  sosToggleText:       { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  sosToggleTextActive: { color: '#fff' },

  micOuter: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  pulseRing: { position: 'absolute', borderRadius: 9999 },
  micBtn: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)',
  },
  micBtnSOS:    { backgroundColor: 'rgba(220,38,38,0.3)' },
  micBtnActive: { backgroundColor: 'rgba(255,255,255,0.4)' },
  recordSpinner: { position: 'absolute', bottom: -6 },

  pttLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },
  partialText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 8, paddingHorizontal: 16 },

  micControls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 12,
  },
  handsFreeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  handsFreeLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  testBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  testBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Section cards
  sectionCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionCardTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E', flex: 1 },
  sectionCardSub:   { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  // RF pills
  rfPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rfPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#EAEDF2',
    backgroundColor: '#F8F9FC',
  },
  rfPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rfPillText:       { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  rfPillTextActive: { color: '#fff' },

  // Input
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: {
    flex: 1, backgroundColor: '#F8F9FC', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14,
    color: '#1A1A2E', borderWidth: 1.5, borderColor: '#EAEDF2',
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#EAEDF2', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: COLORS.primary },

  // Peer banner
  peerBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E6FBF0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 12,
  },
  peerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  peerText: { fontSize: 12, color: '#16A34A', fontWeight: '600', flex: 1 },

  // Messages
  msgCountBadge: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  msgCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: 28 },
  emptyText:    { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600', marginTop: 10 },
  emptySubText: { fontSize: 12, color: COLORS.textMuted, marginTop: 4, textAlign: 'center' },

  // Bubbles
  bubble: {
    maxWidth: '82%', borderRadius: 18, padding: 12,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  bubbleOwn:   { alignSelf: 'flex-end', backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: '#F2F4F8', borderBottomLeftRadius: 4 },
  bubbleSOS:   { borderWidth: 2, borderColor: COLORS.sos },
  bubbleFrom:  { fontSize: 10, color: COLORS.textMuted, marginBottom: 3, fontWeight: '700' },
  bubbleText:       { fontSize: 15, color: '#1A1A2E', lineHeight: 22 },
  bubbleTextOwn:    { color: '#fff' },
  bubbleFoot: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  bubbleMeta:    { fontSize: 10, color: COLORS.textMuted },
  bubbleMetaOwn: { color: 'rgba(255,255,255,0.65)' },
  sosBadge:     { backgroundColor: '#FEE2E2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6, alignSelf: 'flex-start' },
  sosBadgeText: { fontSize: 11, color: COLORS.sos, fontWeight: '800' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, maxHeight: '78%',
  },
  modalHandle: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: '#EAEDF2',
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A2E', marginBottom: 12 },
  langRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F8',
  },
  langRowActive: { backgroundColor: '#FFF5EE', borderRadius: 14, paddingHorizontal: 8 },
  langAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F2F4F8', alignItems: 'center', justifyContent: 'center',
  },
  langAvatarActive: { backgroundColor: COLORS.primary },
  langAvatarText: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary },
  langRowName: { fontSize: 15, fontWeight: '700', color: '#1A1A2E' },
  langRowSub:  { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
});
