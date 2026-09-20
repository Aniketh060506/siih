/**
 * TalkScreen — iTantra (Team Monte Carlo)
 * 
 * Combined Talk + Messages screen:
 * - Mic button with pulsing rings
 * - PTT / Hands-free toggle
 * - Send / SOS Broadcast mode switcher
 * - 10-language selector modal
 * - Live chat bubbles (sent: amber, received: obsidian)
 * - Real STT → packet → WebSocket → TTS on the other device
 */

import React, {
  useState, useEffect, useRef, useCallback, useLayoutEffect
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Modal, FlatList, Alert, Platform, Switch,
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
import WalkieLcdDisplay from '../components/WalkieLcdDisplay';
import RadarView from '../components/RadarView';

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
  { label: '50 bps', bps: 50 },
  { label: '300 bps', bps: 300 },
  { label: '1.2 kbps', bps: 1200 },
  { label: 'Wi-Fi', bps: 1_000_000 },
];

export default function TalkScreen({
  nodeId, nodeName, onPipelineUpdate, serverUrl,
}: TalkScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);
  const [mode, setMode] = useState<'send' | 'sos'>('send');
  const [selectedLang, setSelectedLang] = useState(0);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [rfChannelIdx, setRfChannelIdx] = useState(2);
  const [isConnected, setIsConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [peers, setPeers] = useState<{ nodeId: string; name: string }[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [dashboardMode, setDashboardMode] = useState<'broadcast' | 'receiver'>('broadcast');
  const [activeNetwork, setActiveNetwork] = useState(wsService.getCurrentNetwork());
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS.map(s => ({ ...s })));

  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const sttStartTime = useRef<number>(0);

  // ── Pulse Animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      const animate = (ring: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(ring, { toValue: 1.8, duration: 1000, useNativeDriver: true }),
            ]),
            Animated.timing(ring, { toValue: 1, duration: 0, useNativeDriver: true }),
          ])
        );

      Animated.loop(
        Animated.sequence([
          Animated.timing(ring1, { toValue: 1.6, duration: 800, useNativeDriver: true }),
          Animated.timing(ring1, { toValue: 1, duration: 200, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.delay(250),
          Animated.timing(ring2, { toValue: 2.0, duration: 800, useNativeDriver: true }),
          Animated.timing(ring2, { toValue: 1, duration: 200, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.delay(500),
          Animated.timing(ring3, { toValue: 2.4, duration: 800, useNativeDriver: true }),
          Animated.timing(ring3, { toValue: 1, duration: 200, useNativeDriver: true }),
        ])
      ).start();
    } else {
      ring1.stopAnimation(); ring1.setValue(1);
      ring2.stopAnimation(); ring2.setValue(1);
      ring3.stopAnimation(); ring3.setValue(1);
    }
  }, [isRecording]);

  // ── Init Speech & WebSocket ───────────────────────────────────────────
  useEffect(() => {
    speechService.setServerHost(serverUrl);
    speechService.init().then(() => {
      speechService.setCallbacks(handleSTTResult, handleSTTError);
    });

    const unsub = wsService.addListener((event) => {
      if (event.type === 'connected') setIsConnected(true);
      if (event.type === 'disconnected') setIsConnected(false);
      if (event.type === 'latency') setLatencyMs(event.ms);
      if (event.type === 'nodes') setPeers(event.nodes);
      if (event.type === 'network_changed') setActiveNetwork(event.network);
      if (event.type === 'message') handleIncomingPacket(event.packet, event.serverTs);
    });

    return () => { unsub(); speechService.stopListening(); };
  }, [selectedLang, rfChannelIdx]);

  // ── STT Callbacks ─────────────────────────────────────────────────────
  const handleSTTResult = useCallback((transcript: string, isFinal: boolean) => {
    setPartialText(isFinal ? '' : transcript);
    if (isFinal && transcript.trim()) {
      sendTranscript(transcript.trim());
    }
  }, [selectedLang, mode, rfChannelIdx, nodeId, nodeName]);

  const handleSTTError = useCallback((error: string) => {
    console.warn('[STT Error]:', error);
    setIsRecording(false);
    updateStep(2, 'error', `Error: ${error}`);
  }, []);

  const processedUUIDs = useRef<Set<string>>(new Set());

  // ── Incoming Packet Handler ───────────────────────────────────────────
  const handleIncomingPacket = useCallback((packet: ITantraPacket, serverTs: number) => {
    if (!packet || !packet.uuid) return;
    if (packet.from === nodeId) return; // Never play own messages on sender device!
    if (processedUUIDs.current.has(packet.uuid)) {
      console.log('[iTantra] Dropping duplicate packet:', packet.uuid);
      return;
    }
    processedUUIDs.current.add(packet.uuid);
    if (processedUUIDs.current.size > 500) {
      const first = processedUUIDs.current.values().next().value;
      if (first) processedUUIDs.current.delete(first);
    }

    console.log('[iTantra] Received packet on node:', nodeId, packet.text);
    speechService.unlockAudio(); // unlock audio on web/mobile

    const receiveTs = Date.now();
    const endToEndMs = receiveTs - packet.sttDoneAt;
    const langInfo = getLangInfo(packet.langId);

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

    // Update debug steps 5→7
    updateStep(5, 'done', `Mesh Hop OK — TTL:${packet.ttl}`);

    const ttsStart = Date.now();
    updateStep(6, 'active', `Synthesizing ${langInfo.name}...`);

    if (packet.sos) {
      Vibration.vibrate([0, 200, 100, 200, 100, 500]);
    }

    speechService.speak(packet.text, packet.langId, packet.sos, () => {
      const ttsMs = Date.now() - ttsStart;
      updateStep(6, 'done', `TTS done — ${ttsMs}ms`);
      updateStep(7, 'done', `Played! E2E: ${endToEndMs}ms`);
    });
  }, [nodeId]);

  // ── Test Voice Handler ────────────────────────────────────────────────
  const handleTestSpeaker = useCallback(() => {
    speechService.unlockAudio();
    const testPhrases = [
      'नमस्ते, आई-तंत्र ऑडियो तैयार है', // Hindi
      'નમસ્તે, આઈ-તંત્ર ઓડિયો તૈયાર છે', // Gujarati
      'नमस्कार, आय-तंत्र ऑडिओ तयार आहे', // Marathi
      'ನಮಸ್ಕಾರ, ಐ-ತಂತ್ರ ಆಡಿಯೋ ಸಿದ್ಧವಾಗಿದೆ', // Kannada
      'നമസ്കാരം, ഐ-തന്ത്ര ഓഡിയോ തയ്യാറാണ്', // Malayalam
      'வணக்கம், ஐ-தந்திர ஆடியோ தயார்', // Tamil
      'నమస్కారం, ఐ-తంత్ర ఆడియో సిద్ధంగా ఉంది', // Telugu
      'ନମସ୍କାର, ଆଇ-ତନ୍ତ୍ର ଅଡିଓ ପ୍ରସ୍ତୁତ', // Odia
      'নমস্কার, আই-তন্ত্র অডিও প্রস্তুত', // Bengali
      'Hello, iTantra transceiver audio ready', // English
    ];
    const phrase = testPhrases[selectedLang] || testPhrases[9];
    speechService.speak(phrase, selectedLang, mode === 'sos');
  }, [selectedLang, mode]);

  // ── Send Transcript ───────────────────────────────────────────────────
  const sendTranscript = useCallback((text: string) => {
    const sttMs = Date.now() - sttStartTime.current;
    const rf = RF_CHANNELS[rfChannelIdx];
    const packet = buildPacket({
      text,
      langId: selectedLang,
      isSOS: mode === 'sos',
      isPhoneMode: isHandsFree,
      fromNodeId: nodeId,
      fromName: nodeName,
      networkId: activeNetwork.id,
      channel: activeNetwork.channel,
    });

    const byteSize = new TextEncoder().encode(text).length;
    const crc = computeCRC16(text);
    const txMs = estimateTransmitMs(byteSize, rf.bps);
    const savings = bandwidthSavingsPct(byteSize, text.length * 0.06); // ~60ms per char audio

    // Update pipeline steps
    updateStep(1, 'done', `VAD pause detected`);
    updateStep(2, 'done', `STT: ${sttMs}ms | RTF: ${(sttMs / (text.length * 60)).toFixed(2)}x`);
    updateStep(3, 'done', `Packet: ${byteSize}B | CRC: ${crc}`);
    updateStep(4, 'active', `Transmitting @ ${rf.label}...`);

    setTimeout(() => {
      updateStep(4, 'done', `Sent! ${savings.toFixed(1)}% saved vs raw audio`);
      updateStep(5, 'active', `Gossip routing TTL:${packet.ttl}...`);
    }, Math.min(txMs, 1500));

    // Push to messages
    const msg: Message = {
      id: packet.uuid,
      text,
      langId: selectedLang,
      isOwn: true,
      timestamp: Date.now(),
      byteSize,
      isSOS: mode === 'sos',
    };
    processedUUIDs.current.add(packet.uuid);
    setMessages(prev => [...prev, msg]);
    scrollRef.current?.scrollToEnd({ animated: true });

    // Send over WebSocket
    wsService.sendPacket(packet);
  }, [selectedLang, mode, isHandsFree, rfChannelIdx, nodeId, nodeName]);

  // ── Pipeline step updater ─────────────────────────────────────────────
  const updateStep = useCallback((id: number, status: PipelineStep['status'], detail: string) => {
    setSteps(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, status, detail } : s);
      onPipelineUpdate(updated);
      return updated;
    });
  }, [onPipelineUpdate]);

  // ── PTT Handlers ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isRecording) return;
    setIsRecording(true);
    setPartialText('');
    sttStartTime.current = Date.now();
    resetPipeline();
    updateStep(1, 'active', 'Listening for speech...');
    updateStep(2, 'active', 'STT engine ready...');
    await speechService.startListening(selectedLang);
  }, [isRecording, selectedLang]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    await speechService.stopListening();
  }, [isRecording]);

  const resetPipeline = () => {
    setSteps(INITIAL_STEPS.map(s => ({ ...s })));
  };

  // ── Hands-Free Auto-Start ─────────────────────────────────────────────
  useEffect(() => {
    if (isHandsFree && isConnected) {
      startRecording();
    } else if (!isHandsFree && isRecording) {
      stopRecording();
    }
  }, [isHandsFree, isConnected]);

  const langInfo = getLangInfo(selectedLang);
  const rf = RF_CHANNELS[rfChannelIdx];
  const isSOS = mode === 'sos';

  return (
    <SafeAreaView style={[styles.container, isSOS && styles.containerSOS]}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>iTantra</Text>
          <Text style={styles.subTitle}>Neural Transceiver</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, isConnected ? styles.dotGreen : styles.dotRed]} />
          <TouchableOpacity
            style={styles.langBadge}
            onPress={() => setLangModalVisible(true)}
          >
            <Text style={styles.langBadgeText}>{langInfo.shortName}</Text>
            <Ionicons name="chevron-down" size={12} color={COLORS.textOnAmber} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scrollable Body ────────────────────────────────────────────── */}
      <ScrollView
        ref={scrollRef}
        style={styles.mainScrollView}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Active Mesh Network Bar ─────────────────────────────────── */}
        <View style={styles.activeNetBar}>
          <View style={styles.activeNetLeft}>
            <View style={[styles.activeNetDot, { backgroundColor: activeNetwork.color || COLORS.primary }]} />
            <Text style={styles.activeNetText} numberOfLines={1}>{activeNetwork.name}</Text>
            <View style={styles.activeNetChBadge}>
              <Text style={styles.activeNetChText}>CH-{activeNetwork.channel}</Text>
            </View>
          </View>
          <Text style={styles.activeNetFreqText}>{activeNetwork.freq}</Text>
        </View>

        {/* ── Mode Switcher Tab (Wireframe Spec: [📥 RECEIVER] [📤 BROADCAST]) ── */}
        <View style={styles.modeSwitcherRow}>
          <TouchableOpacity
            style={[styles.modeBtn, dashboardMode === 'receiver' && styles.modeBtnActive]}
            onPress={() => setDashboardMode('receiver')}
          >
            <Ionicons name="download-outline" size={14}
              color={dashboardMode === 'receiver' ? COLORS.textOnDark : COLORS.textSecondary} />
            <Text style={[styles.modeBtnText, dashboardMode === 'receiver' && styles.modeBtnTextActive]}>
              📥 RECEIVER
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, dashboardMode === 'broadcast' && styles.modeBtnActive]}
            onPress={() => setDashboardMode('broadcast')}
          >
            <Ionicons name="radio-outline" size={14}
              color={dashboardMode === 'broadcast' ? COLORS.textOnDark : COLORS.textSecondary} />
            <Text style={[styles.modeBtnText, dashboardMode === 'broadcast' && styles.modeBtnTextActive]}>
              📤 BROADCAST
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Walkie LCD Display (Wireframe Component) ─────────────────── */}
        <View style={{ marginHorizontal: SPACING.md }}>
          <WalkieLcdDisplay
            networkName={activeNetwork.name}
            channel={activeNetwork.channel}
            totalChannels={10}
            langName={langInfo.name}
            peersCount={peers.length}
            status={isRecording ? 'TRANSMITTING...' : (mode === 'sos' ? 'SOS DISTRESS' : 'LISTENING / READY')}
            signalBars={peers.length > 0 ? 5 : 4}
          />
        </View>

        {/* ── Peer Connection Banner ───────────────────────────────────── */}
        <View style={[styles.peerBanner, peers.length > 0 ? styles.peerBannerConnected : styles.peerBannerWaiting]}>
          <Ionicons
            name={peers.length > 0 ? "checkmark-circle" : "radio-outline"}
            size={13}
            color={peers.length > 0 ? COLORS.success : COLORS.primary}
          />
          <Text style={[styles.peerBannerText, peers.length > 0 ? styles.peerBannerTextConnected : styles.peerBannerTextWaiting]} numberOfLines={1}>
            {peers.length > 0
              ? `🟢 ${peers.length} Peer Connected (${peers.map(p => p.name).join(', ')})`
              : `Open 2nd device: http://192.168.29.222:8081`}
          </Text>
        </View>

        {/* ── RECEIVER MODE: Radar View & Incoming Monitoring ─────────── */}
        {dashboardMode === 'receiver' && (
          <View style={{ marginHorizontal: SPACING.md, marginBottom: SPACING.sm }}>
            <RadarView peers={peers} />
          </View>
        )}

        {/* ── BROADCAST MODE: Hero Mic Card & Controls ────────────────── */}
        {dashboardMode === 'broadcast' && (
          <>
            {/* Hero Mic Card */}
            <View style={[styles.heroCard, isSOS && styles.heroCardSOS]}>
              <View style={styles.micWrapper}>
                {/* Pulse rings */}
                {[ring3, ring2, ring1].map((anim, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.pulseRing,
                      {
                        width: 80 + i * 20,
                        height: 80 + i * 20,
                        transform: [{ scale: anim }],
                        opacity: isRecording ? 0.15 - i * 0.04 : 0,
                        backgroundColor: isSOS ? COLORS.sos : COLORS.primary,
                      },
                    ]}
                  />
                ))}
                {/* Mic button */}
                <TouchableOpacity
                  style={[styles.micCircle, isSOS && styles.micCircleSOS, isRecording && styles.micActive]}
                  onPressIn={!isHandsFree ? startRecording : undefined}
                  onPressOut={!isHandsFree ? stopRecording : undefined}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={isRecording ? 'mic' : 'mic-outline'}
                    size={38}
                    color={COLORS.textOnDark}
                  />
                  {isRecording && (
                    <ActivityIndicator size="small" color="rgba(255,255,255,0.6)"
                      style={styles.recordingSpinner} />
                  )}
                </TouchableOpacity>
              </View>

              {/* PTT label */}
              <Text style={styles.pttHint}>
                {isHandsFree
                  ? (isRecording ? '● Listening (Hands-Free)...' : '○ Hands-Free — Waiting')
                  : 'HOLD TO TALK'}
              </Text>

              {/* Partial transcript preview */}
              {partialText ? (
                <Text style={styles.partialText} numberOfLines={2}>{partialText}</Text>
              ) : null}

              {/* RF channel row */}
              <View style={styles.rfRow}>
                <View style={styles.rfChip}>
                  <Ionicons name="radio-outline" size={11} color={COLORS.primaryLight} />
                  <Text style={styles.rfChipText}>{rf.label}</Text>
                </View>
                <View style={styles.rfChip}>
                  <Ionicons name={isConnected ? 'wifi' : 'wifi-outline'} size={11}
                    color={isConnected ? COLORS.success : COLORS.textMuted} />
                  <Text style={[styles.rfChipText, { color: isConnected ? COLORS.success : COLORS.textMuted }]}>
                    {isConnected ? 'Connected' : 'Offline'}
                  </Text>
                </View>
                {latencyMs && (
                  <View style={styles.rfChip}>
                    <Ionicons name="timer-outline" size={11} color={COLORS.primaryLight} />
                    <Text style={styles.rfChipText}>{latencyMs}ms</Text>
                  </View>
                )}
              </View>

              {/* Hands-Free toggle & Test Voice row */}
              <View style={styles.cardControlsRow}>
                <View style={styles.handsFreeRow}>
                  <Text style={styles.handsFreeLabel}>Hands-Free</Text>
                  <Switch
                    value={isHandsFree}
                    onValueChange={setIsHandsFree}
                    trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
                    thumbColor={isHandsFree ? COLORS.primary : COLORS.textMuted}
                  />
                </View>

                <TouchableOpacity style={styles.testVoiceBtn} onPress={handleTestSpeaker} activeOpacity={0.8}>
                  <Ionicons name="volume-high" size={13} color="#fff" />
                  <Text style={styles.testVoiceBtnText}>Test Voice</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* RF Channel Selector */}
            <View style={styles.rfSelector}>
              <Text style={styles.rfSelectorLabel}>RF Channel</Text>
              <View style={styles.rfPills}>
                {RF_CHANNELS.map((ch, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.rfPill, rfChannelIdx === i && styles.rfPillActive]}
                    onPress={() => setRfChannelIdx(i)}
                  >
                    <Text style={[styles.rfPillText, rfChannelIdx === i && styles.rfPillTextActive]}>
                      {ch.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Quick Send Text Bar */}
            <View style={styles.quickSendRow}>
              <TextInput
                style={styles.quickInput}
                placeholder={`Type message in ${langInfo.name}...`}
                placeholderTextColor={COLORS.textMuted}
                value={customInput}
                onChangeText={setCustomInput}
                onSubmitEditing={() => {
                  if (customInput.trim()) {
                    sendTranscript(customInput.trim());
                    setCustomInput('');
                  }
                }}
              />
              <TouchableOpacity
                style={[styles.quickSendBtn, customInput.trim() ? styles.quickSendBtnActive : null]}
                onPress={() => {
                  if (customInput.trim()) {
                    sendTranscript(customInput.trim());
                    setCustomInput('');
                  }
                }}
              >
                <Ionicons name="send" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Live Transcript & Message Stream ────────────────────────── */}
        <View style={styles.transcriptSection}>
          <Text style={styles.sectionLabel}>
            {dashboardMode === 'receiver' ? '📡 Incoming Transmissions' : 'Live Transcript'}
          </Text>
          <View style={styles.messageContent}>
            {messages.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={30} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No transmissions yet</Text>
                <Text style={styles.emptySubText}>
                  {dashboardMode === 'receiver'
                    ? 'Listening on current RF channel for incoming packets...'
                    : 'Hold the mic to start talking'}
                </Text>
              </View>
            )}
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Language Selector Modal ───────────────────────────────────── */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setLangModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Language</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.langOption, selectedLang === item.id && styles.langOptionActive]}
                  onPress={() => { setSelectedLang(item.id); setLangModalVisible(false); }}
                >
                  <View style={[styles.langBadgeSmall,
                    selectedLang === item.id && styles.langBadgeSmallActive]}>
                    <Text style={[styles.langBadgeSmallText,
                      selectedLang === item.id && { color: COLORS.textOnDark }]}>
                      {item.shortName}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.langName}>{item.name}</Text>
                    <Text style={styles.langScript}>{item.script} · {item.code}</Text>
                  </View>
                  {selectedLang === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary}
                      style={styles.langCheck} />
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

// ─── MessageBubble ─────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const lang = getLangInfo(message.langId);
  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit',
  });
  return (
    <View style={[styles.bubble, message.isOwn ? styles.bubbleOwn : styles.bubbleOther,
      message.isSOS && styles.bubbleSOS]}>
      {!message.isOwn && message.fromName && (
        <Text style={styles.bubbleFrom}>{message.fromName}</Text>
      )}
      <Text style={[styles.bubbleText, !message.isOwn && styles.bubbleTextOther]}>
        {message.text}
      </Text>
      <View style={styles.bubbleMeta}>
        <Text style={[styles.bubbleMetaText, !message.isOwn && styles.bubbleMetaTextOther]}>
          {lang.name} · {message.byteSize}B
          {message.latencyMs ? ` · ${message.latencyMs}ms` : ''}
          {' · '}{timeStr}
        </Text>
      </View>
      {message.isSOS && (
        <View style={styles.sosBadge}>
          <Text style={styles.sosBadgeText}>🚨 SOS</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  containerSOS: { backgroundColor: COLORS.sosLight },
  mainScrollView: { flex: 1 },
  mainScrollContent: { paddingBottom: 120 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  appName: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  subTitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: COLORS.success },
  dotRed: { backgroundColor: COLORS.danger },
  langBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.pill,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  langBadgeText: { color: COLORS.textOnDark, fontSize: 13, fontWeight: '700' },

  activeNetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.cardCream,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(232, 113, 26, 0.25)',
  },
  activeNetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  activeNetDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeNetText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  activeNetChBadge: {
    backgroundColor: COLORS.obsidian,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
  },
  activeNetChText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  activeNetFreqText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },

  modeSwitcherRow: {
    flexDirection: 'row', marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.pill,
    padding: 4, ...SHADOW.sm,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: RADIUS.pill, gap: 5,
  },
  modeBtnActive: { backgroundColor: COLORS.obsidian },
  modeSOSActive: { backgroundColor: COLORS.sos },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  modeBtnTextActive: { color: COLORS.textOnDark },

  heroCard: {
    marginHorizontal: SPACING.md, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primaryGradientStart,
    padding: SPACING.md, alignItems: 'center', ...SHADOW.lg,
    marginBottom: SPACING.sm,
  },
  heroCardSOS: { backgroundColor: COLORS.sos },

  micWrapper: { alignItems: 'center', justifyContent: 'center', marginVertical: SPACING.md },
  pulseRing: { position: 'absolute', borderRadius: RADIUS.circle },
  micCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  micCircleSOS: { backgroundColor: 'rgba(255,0,0,0.3)' },
  micActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  recordingSpinner: { position: 'absolute', bottom: -4 },

  pttHint: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700',
    letterSpacing: 0.5, marginTop: SPACING.xs },
  partialText: {
    color: 'rgba(255,255,255,0.75)', fontSize: 13, fontStyle: 'italic',
    textAlign: 'center', marginTop: SPACING.xs, paddingHorizontal: SPACING.md,
  },

  rfRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, flexWrap: 'wrap', justifyContent: 'center' },
  rfChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: RADIUS.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  rfChipText: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },

  handsFreeRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  handsFreeLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },

  rfSelector: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
  },
  rfSelectorLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', width: 72 },
  rfPills: { flexDirection: 'row', gap: 6 },
  rfPill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.cardWhite,
  },
  rfPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rfPillText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  rfPillTextActive: { color: COLORS.textOnDark },

  transcriptSection: { flex: 1, marginHorizontal: SPACING.md },
  sectionLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '700',
    letterSpacing: 0.5, marginBottom: SPACING.sm, textTransform: 'uppercase' },
  messageList: { flex: 1 },
  messageContent: { paddingBottom: SPACING.lg },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xl },
  emptyText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: '600', marginTop: SPACING.sm },
  emptySubText: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },

  bubble: {
    maxWidth: '80%', borderRadius: RADIUS.lg, padding: SPACING.sm + 4,
    marginBottom: SPACING.sm, ...SHADOW.sm,
  },
  bubbleOwn: {
    alignSelf: 'flex-end', backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start', backgroundColor: COLORS.obsidian,
    borderBottomLeftRadius: 4,
  },
  bubbleSOS: { borderWidth: 1.5, borderColor: COLORS.sos },
  bubbleFrom: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2, fontWeight: '600' },
  bubbleText: { fontSize: 15, color: COLORS.textOnDark, lineHeight: 22 },
  bubbleTextOther: { color: COLORS.textOnDark },
  bubbleMeta: { marginTop: 4 },
  bubbleMetaText: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  bubbleMetaTextOther: { color: 'rgba(255,255,255,0.5)' },
  sosBadge: {
    alignSelf: 'flex-start', backgroundColor: COLORS.sos,
    borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4,
  },
  sosBadgeText: { fontSize: 10, color: '#fff', fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.background, borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl, padding: SPACING.md, maxHeight: '75%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: SPACING.md,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  langOption: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderColor: COLORS.border,
  },
  langOptionActive: { backgroundColor: COLORS.cardCream, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm },
  langBadgeSmall: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  langBadgeSmallActive: { backgroundColor: COLORS.primary },
  langBadgeSmallText: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary },
  langName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  langScript: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  langCheck: { marginLeft: 'auto' },

  peerBanner: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill,
  },
  peerBannerConnected: { backgroundColor: COLORS.successLight },
  peerBannerWaiting: { backgroundColor: COLORS.cardCream, borderWidth: 1, borderColor: 'rgba(232, 113, 26, 0.25)' },
  peerBannerText: { fontSize: 11, fontWeight: '600', flex: 1 },
  peerBannerTextConnected: { color: COLORS.success },
  peerBannerTextWaiting: { color: COLORS.primaryDark },

  cardControlsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', paddingHorizontal: SPACING.sm, marginTop: SPACING.sm,
  },
  testVoiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  testVoiceBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  quickSendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
  },
  quickInput: {
    flex: 1, backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.pill,
    paddingHorizontal: 14, paddingVertical: 7, fontSize: 13,
    color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border,
  },
  quickSendBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  quickSendBtnActive: { backgroundColor: COLORS.primary },
});
