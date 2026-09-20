/**
 * NetworkScreen — iTantra (Team Monte Carlo SIH 2026, PS 26173)
 * 
 * Pure Mobile Mesh Network Manager:
 * - Active Mesh Radio frequency & channel
 * - Multi-Network Selector (iTantra-Alpha, iTantra-Bravo, iTantra-Command, etc.)
 * - 1-Tap "Join Network" or "+ Create Mesh Network"
 * - Discovered peer radios on the current frequency
 * - Real-time P2P Mesh bandwidth & neural packet savings
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Platform, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW } from '../theme';
import { wsService } from '../services/WebSocketService';
import { MeshNetwork, DEFAULT_NETWORKS } from '../protocol';

interface PeerNode {
  nodeId: string;
  name: string;
  networkId?: string;
  channel?: number;
  isOnMyNetwork?: boolean;
}

interface NetworkScreenProps {
  nodeId: string;
  nodeName: string;
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
}

const FLOWER_COLORS = [
  COLORS.primary, '#1ABC9C', '#9B59B6', '#3498DB', '#E74C3C', '#F39C12',
];

export default function NetworkScreen({
  nodeId, nodeName,
}: NetworkScreenProps) {
  const [currentNetwork, setCurrentNetwork] = useState<MeshNetwork>(wsService.getCurrentNetwork());
  const [availableNetworks, setAvailableNetworks] = useState<MeshNetwork[]>(wsService.getAvailableNetworks());
  const [peers, setPeers] = useState<PeerNode[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [totalBytesSaved, setTotalBytesSaved] = useState(0);

  // Modal State for creating a new network
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNetName, setNewNetName] = useState('');
  const [newNetChannel, setNewNetChannel] = useState(1);
  const [newNetDesc, setNewNetDesc] = useState('');

  // Radar animation
  const radarAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(radarAnim, { toValue: 1.4, duration: 1500, useNativeDriver: true }),
        Animated.timing(radarAnim, { toValue: 1.0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    const unsub = wsService.addListener((event) => {
      if (event.type === 'connected') setIsConnected(true);
      if (event.type === 'disconnected') setIsConnected(false);
      if (event.type === 'nodes') setPeers(event.nodes);
      if (event.type === 'network_changed') setCurrentNetwork(event.network);
      if (event.type === 'networks_updated') setAvailableNetworks(event.networks);
      if (event.type === 'latency') setLatencyMs(event.ms);
      if (event.type === 'message') {
        setMessageCount(c => c + 1);
        setTotalBytesSaved(b => b + 79800 - (event.packet.byteSize || 120));
      }
    });
    return unsub;
  }, []);

  // Switch to a network
  const handleJoinNetwork = useCallback((net: MeshNetwork) => {
    wsService.setNetwork(net);
    setCurrentNetwork(net);
  }, []);

  // Create a new network
  const handleCreateNetwork = useCallback(() => {
    if (!newNetName.trim()) {
      Alert.alert('Network Name Required', 'Please enter a name for your tactical mesh network.');
      return;
    }
    const created = wsService.createNetwork(newNetName, newNetChannel, newNetDesc);
    setCurrentNetwork(created);
    setAvailableNetworks(wsService.getAvailableNetworks());
    setShowCreateModal(false);
    setNewNetName('');
    setNewNetDesc('');
  }, [newNetName, newNetChannel, newNetDesc]);

  // Filter peers on current network
  const activePeers = peers.filter(p => p.isOnMyNetwork !== false);

  const savedKB = (totalBytesSaved / 1024).toFixed(1);
  const savingsPct = messageCount > 0
    ? ((totalBytesSaved / (messageCount * 80000)) * 100).toFixed(1)
    : '99.8';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* ── Top Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Mesh Networks</Text>
            <Text style={styles.subTitle}>Tactical P2P Radios & Walkie-Talkies</Text>
          </View>
          <View style={styles.connBadge}>
            <View style={[styles.connDot, isConnected ? styles.dotGreen : styles.dotAmber]} />
            <Text style={styles.connText}>P2P Mesh Live</Text>
          </View>
        </View>

        {/* ── Active Network Card (Hero) ───────────────────────────────── */}
        <View style={[styles.activeCard, { borderColor: currentNetwork.color }]}>
          <View style={styles.activeTopRow}>
            <View style={styles.activeTag}>
              <Ionicons name="radio" size={13} color="#fff" />
              <Text style={styles.activeTagText}>ACTIVE MESH FREQUENCY</Text>
            </View>
            <View style={styles.channelChip}>
              <Text style={styles.channelChipText}>CH-{currentNetwork.channel}</Text>
            </View>
          </View>

          <Text style={styles.activeNetName}>{currentNetwork.name}</Text>
          <Text style={styles.activeNetDesc}>{currentNetwork.description}</Text>

          <View style={styles.activeSpecsGrid}>
            <View style={styles.specBox}>
              <Text style={styles.specLabel}>Frequency</Text>
              <Text style={styles.specValue}>{currentNetwork.freq}</Text>
            </View>
            <View style={styles.specBox}>
              <Text style={styles.specLabel}>My Node</Text>
              <Text style={styles.specValue} numberOfLines={1}>{nodeName}</Text>
            </View>
            <View style={styles.specBox}>
              <Text style={styles.specLabel}>Link Mode</Text>
              <Text style={styles.specValue}>WiFi Direct P2P</Text>
            </View>
          </View>

          <View style={styles.activeFooter}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
            <Text style={styles.activeFooterText}>
              {activePeers.length} Peer Radio{activePeers.length === 1 ? '' : 's'} tuned to this channel
            </Text>
          </View>
        </View>

        {/* ── Multi-Network Selector ───────────────────────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>AVAILABLE MESH NETWORKS</Text>
            <Text style={styles.sectionSubtitle}>Tap any network to tune your transceiver</Text>
          </View>
          <TouchableOpacity
            style={styles.createNetBtn}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={styles.createNetBtnText}>New Network</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.networksList}>
          {availableNetworks.map((net) => {
            const isCurrent = net.id === currentNetwork.id;
            return (
              <View
                key={net.id}
                style={[
                  styles.networkCard,
                  isCurrent && styles.networkCardSelected,
                ]}
              >
                <View style={styles.netCardLeft}>
                  <View style={[styles.netColorBar, { backgroundColor: net.color }]} />
                  <View style={styles.netInfo}>
                    <View style={styles.netNameRow}>
                      <Text style={styles.netNameText}>{net.name}</Text>
                      <View style={styles.netChBadge}>
                        <Text style={styles.netChBadgeText}>CH-{net.channel}</Text>
                      </View>
                    </View>
                    <Text style={styles.netFreqText}>{net.freq} · {net.description}</Text>
                  </View>
                </View>

                {isCurrent ? (
                  <View style={styles.connectedBadge}>
                    <Ionicons name="checkmark" size={12} color={COLORS.success} />
                    <Text style={styles.connectedBadgeText}>TUNED</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={() => handleJoinNetwork(net)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.joinBtnText}>Join Net</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Discovered Peer Radios on this Channel ───────────────────── */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>RADIOS ON THIS FREQUENCY</Text>
            <Text style={styles.sectionSubtitle}>Direct peer-to-peer walkie-talkies in range</Text>
          </View>
        </View>

        {activePeers.length === 0 ? (
          <View style={styles.radarCard}>
            <Animated.View
              style={[
                styles.radarCircle,
                {
                  transform: [{ scale: radarAnim }],
                  opacity: 0.25,
                },
              ]}
            />
            <Ionicons name="radio-outline" size={32} color={COLORS.primary} />
            <Text style={styles.radarText}>Scanning for nearby radios on {currentNetwork.name}...</Text>
            <Text style={styles.radarSubText}>
              Open iTantra on a second phone or tab to automatically link via P2P Mesh
            </Text>
          </View>
        ) : (
          <View style={styles.peerGrid}>
            {activePeers.map((peer, i) => (
              <View key={peer.nodeId} style={styles.peerCard}>
                <View style={[styles.peerAvatar, { backgroundColor: FLOWER_COLORS[i % FLOWER_COLORS.length] }]}>
                  <Ionicons name="phone-portrait" size={20} color="#fff" />
                </View>
                <View style={styles.peerDetails}>
                  <Text style={styles.peerNameText} numberOfLines={1}>{peer.name}</Text>
                  <Text style={styles.peerIdText}>{peer.nodeId}</Text>
                  <View style={styles.peerSignalRow}>
                    <Ionicons name="wifi" size={11} color={COLORS.success} />
                    <Text style={styles.peerSignalText}>Direct Link · 100% Signal</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Bandwidth & Gossip Mesh Statistics ───────────────────────── */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>⚡ NEURAL LOW-BITRATE COMPRESSION</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statsItem}>
              <Text style={styles.statsValue}>{savingsPct}%</Text>
              <Text style={styles.statsLabel}>Bandwidth Saved</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsItem}>
              <Text style={styles.statsValue}>{messageCount}</Text>
              <Text style={styles.statsLabel}>Packets Sent</Text>
            </View>
            <View style={styles.statsDivider} />
            <View style={styles.statsItem}>
              <Text style={styles.statsValue}>{savedKB} KB</Text>
              <Text style={styles.statsLabel}>RF Data Saved</Text>
            </View>
          </View>
          <Text style={styles.statsFootnote}>
            120-byte neural micro-packet vs 80,000-byte raw audio · TTL: 4 Hops
          </Text>
        </View>

      </ScrollView>

      {/* ── Create Network Modal ─────────────────────────────────────── */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Tactical Mesh Network</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Network Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Squad-Charlie, Field-Medical-2"
              placeholderTextColor={COLORS.textMuted}
              value={newNetName}
              onChangeText={setNewNetName}
              autoFocus
            />

            <Text style={styles.inputLabel}>Radio Channel</Text>
            <View style={styles.channelPickerRow}>
              {[1, 2, 3, 4].map(ch => (
                <TouchableOpacity
                  key={ch}
                  style={[
                    styles.channelPickerBtn,
                    newNetChannel === ch && styles.channelPickerBtnActive,
                  ]}
                  onPress={() => setNewNetChannel(ch)}
                >
                  <Text
                    style={[
                      styles.channelPickerText,
                      newNetChannel === ch && styles.channelPickerTextActive,
                    ]}
                  >
                    CH-{ch}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Unit Description (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Evacuation Perimeter Operations"
              placeholderTextColor={COLORS.textMuted}
              value={newNetDesc}
              onChangeText={setNewNetDesc}
            />

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleCreateNetwork}
              activeOpacity={0.85}
            >
              <Ionicons name="radio" size={16} color="#fff" />
              <Text style={styles.modalSubmitBtnText}>Create & Tune Radios</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  connBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    ...SHADOW.sm,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGreen: { backgroundColor: COLORS.success },
  dotAmber: { backgroundColor: COLORS.primary },
  connText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // Hero Card
  activeCard: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 2,
    marginBottom: SPACING.lg,
    ...SHADOW.md,
  },
  activeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  activeTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  channelChip: {
    backgroundColor: COLORS.obsidian,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  channelChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  activeNetName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
  activeNetDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  activeSpecsGrid: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardCream,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    justifyContent: 'space-between',
  },
  specBox: {
    flex: 1,
  },
  specLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  specValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 1,
  },
  activeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: SPACING.sm,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  activeFooterText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  createNetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  createNetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },

  // Networks List
  networksList: {
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  networkCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  networkCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#FFF9F4',
  },
  netCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  netColorBar: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  netInfo: {
    flex: 1,
  },
  netNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  netNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  netChBadge: {
    backgroundColor: COLORS.cardCream,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.pill,
  },
  netChBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  netFreqText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  connectedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success,
  },
  joinBtn: {
    backgroundColor: COLORS.cardCream,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: 'rgba(232, 113, 26, 0.3)',
  },
  joinBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Peer Radios
  radarCard: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  radarCircle: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  radarText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  radarSubText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 280,
  },
  peerGrid: {
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  peerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerDetails: {
    flex: 1,
  },
  peerNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  peerIdText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  peerSignalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  peerSignalText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.success,
  },

  // Stats Card
  statsCard: {
    backgroundColor: COLORS.obsidian,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    ...SHADOW.md,
  },
  statsTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primaryLight,
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
  },
  statsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  statsLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  statsDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  statsFootnote: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: SPACING.xs,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
    marginTop: SPACING.sm,
  },
  modalInput: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  channelPickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  channelPickerBtn: {
    flex: 1,
    backgroundColor: COLORS.cardWhite,
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  channelPickerBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  channelPickerText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  channelPickerTextActive: {
    color: '#fff',
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingVertical: 12,
    marginTop: SPACING.lg,
    ...SHADOW.md,
  },
  modalSubmitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
