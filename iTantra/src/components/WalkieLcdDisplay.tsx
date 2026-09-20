/**
 * WalkieLcdDisplay — iTantra (Team Monte Carlo)
 * 
 * Retro-futuristic LCD panel with Obsidian & Amber glow:
 * - Channel, Language, Signal Bars (████░ 4/5), Active Peers, Transceiver Status
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';

interface WalkieLcdDisplayProps {
  networkName: string;
  channel: number;
  totalChannels?: number;
  langName: string;
  peersCount: number;
  status: string;
  signalBars?: number; // 0 to 5
}

export default function WalkieLcdDisplay({
  networkName,
  channel,
  totalChannels = 10,
  langName,
  peersCount,
  status,
  signalBars = 4,
}: WalkieLcdDisplayProps) {
  const filledBars = '█'.repeat(Math.max(0, Math.min(5, signalBars)));
  const emptyBars = '░'.repeat(Math.max(0, 5 - signalBars));
  const signalText = `${filledBars}${emptyBars} ${signalBars}/5`;

  return (
    <View style={styles.lcdContainer}>
      <View style={styles.rowBetween}>
        <Text style={styles.lcdHeader}>● {networkName.toUpperCase()}</Text>
        <Text style={styles.lcdHeader}>CH {channel}/{totalChannels}</Text>
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.lcdText}>LANG: {langName}</Text>
        <Text style={styles.lcdText}>PEERS: {peersCount}</Text>
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.lcdText}>SIGNAL: {signalText}</Text>
        <Text style={[styles.lcdText, styles.statusGlow]}>
          {status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lcdContainer: {
    backgroundColor: '#161517',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#2A2730',
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    gap: 4,
    marginVertical: SPACING.xs,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lcdHeader: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    fontWeight: '800',
    color: '#F7A034',
    letterSpacing: 0.5,
  },
  lcdText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.3,
  },
  statusGlow: {
    color: '#34D399',
  },
});
