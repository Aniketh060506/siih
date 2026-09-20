/**
 * iTantra — Root App (Team Monte Carlo, SIH PS 26173)
 * 
 * Bottom tab navigator with:
 * - Tab 1: Talk + Messages (combined)
 * - Tab 2: Network / Mesh Peers
 * - Tab 3: Debug / Pipeline Monitor
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StatusBar, Platform, Alert, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from './src/theme';
import TalkScreen from './src/screens/TalkScreen';
import NetworkScreen from './src/screens/NetworkScreen';
import DebugScreen from './src/screens/DebugScreen';
import { INITIAL_STEPS, PipelineStep } from './src/services/SpeechService';
import { wsService } from './src/services/WebSocketService';
import { generateNodeId } from './src/protocol';

const Tab = createBottomTabNavigator();

// Generate a stable node ID for this device session
const MY_NODE_ID = generateNodeId();
const MY_NODE_NAME = `Node-${MY_NODE_ID.split('-')[1]}`;

const getDefaultServer = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname || 'localhost';
    return `ws://${host}:3001`;
  }
  return 'ws://192.168.29.222:3001';
};

const DEFAULT_SERVER = getDefaultServer();

export default function App() {
  const [pipeline, setPipeline] = useState<PipelineStep[]>(
    INITIAL_STEPS.map(s => ({ ...s }))
  );
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);

  // Connect to relay server on startup
  useEffect(() => {
    wsService.connect(serverUrl, MY_NODE_ID, MY_NODE_NAME);
    return () => wsService.disconnect();
  }, []);

  const handleServerUrlChange = useCallback((url: string) => {
    setServerUrl(url);
  }, []);

  const handlePipelineUpdate = useCallback((steps: PipelineStep[]) => {
    setPipeline(steps);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.webBackdrop}>
        <View style={styles.mobileContainer}>
          <NavigationContainer>
            <Tab.Navigator
              id="MainTabs"
              screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                  backgroundColor: COLORS.cardWhite,
                  borderTopColor: COLORS.border,
                  borderTopWidth: 1,
                  height: Platform.OS === 'ios' ? 85 : 62,
                  paddingBottom: Platform.OS === 'ios' ? 24 : 8,
                  paddingTop: 8,
                },
                tabBarActiveTintColor: COLORS.primary,
                tabBarInactiveTintColor: COLORS.textMuted,
                tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
                tabBarIcon: ({ focused, color, size }) => {
                  const icons: Record<string, { active: string; inactive: string }> = {
                    Talk: { active: 'mic', inactive: 'mic-outline' },
                    Network: { active: 'radio', inactive: 'radio-outline' },
                    Debug: { active: 'pulse', inactive: 'pulse-outline' },
                  };
                  const iconSet = icons[route.name] ?? { active: 'help', inactive: 'help-outline' };
                  return (
                    <Ionicons
                      name={(focused ? iconSet.active : iconSet.inactive) as any}
                      size={size}
                      color={color}
                    />
                  );
                },
              })}
            >
              <Tab.Screen name="Talk">
                {() => (
                  <TalkScreen
                    nodeId={MY_NODE_ID}
                    nodeName={MY_NODE_NAME}
                    onPipelineUpdate={handlePipelineUpdate}
                    serverUrl={serverUrl}
                  />
                )}
              </Tab.Screen>
              <Tab.Screen name="Network">
                {() => (
                  <NetworkScreen
                    nodeId={MY_NODE_ID}
                    nodeName={MY_NODE_NAME}
                    serverUrl={serverUrl}
                    onServerUrlChange={handleServerUrlChange}
                  />
                )}
              </Tab.Screen>
              <Tab.Screen name="Debug">
                {() => <DebugScreen steps={pipeline} />}
              </Tab.Screen>
            </Tab.Navigator>
          </NavigationContainer>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  webBackdrop: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#18171A' : COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileContainer: {
    width: '100%',
    maxWidth: 480,
    flex: 1,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
    borderLeftWidth: Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: '#2F2D36',
  },
});

