/**
 * iTantra — Root App (Team Monte Carlo, SIH PS 26173)
 *
 * Clean modern tab navigator with white pill-style bottom bar.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar, Platform, View, StyleSheet } from 'react-native';
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

const MY_NODE_ID   = generateNodeId();
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
  const [pipeline,  setPipeline]  = useState<PipelineStep[]>(INITIAL_STEPS.map(s => ({ ...s })));
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);

  useEffect(() => {
    wsService.connect(serverUrl, MY_NODE_ID, MY_NODE_NAME);
    return () => wsService.disconnect();
  }, []);

  const handleServerUrlChange = useCallback((url: string) => setServerUrl(url), []);
  const handlePipelineUpdate  = useCallback((steps: PipelineStep[]) => setPipeline(steps), []);

  const TAB_ICONS: Record<string, { on: any; off: any }> = {
    Talk:    { on: 'mic',   off: 'mic-outline'   },
    Network: { on: 'radio', off: 'radio-outline' },
    Debug:   { on: 'pulse', off: 'pulse-outline' },
  };

  const TAB_LABELS: Record<string, string> = {
    Talk:    '🎙️ Talk',
    Network: '📡 Network',
    Debug:   '⚙️ Debug',
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <NavigationContainer>
            <Tab.Navigator
              id="MainTabs"
              screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                  backgroundColor: '#fff',
                  borderTopColor: '#EAEDF2',
                  borderTopWidth: 1,
                  height:        Platform.OS === 'ios' ? 86 : 64,
                  paddingBottom: Platform.OS === 'ios' ? 26 : 10,
                  paddingTop: 8,
                  paddingHorizontal: 8,
                },
                tabBarActiveTintColor:      COLORS.primary,
                tabBarInactiveTintColor:    '#9BA3B2',
                tabBarLabelStyle:           { fontSize: 11, fontWeight: '700', marginTop: 2 },
                tabBarItemStyle:            { borderRadius: 14 },
                tabBarActiveBackgroundColor: '#FFF5EE',
                tabBarLabel: TAB_LABELS[route.name] ?? route.name,
                tabBarIcon: ({ focused, color }) => (
                  <Ionicons
                    name={(focused ? TAB_ICONS[route.name]?.on : TAB_ICONS[route.name]?.off) ?? 'help-outline'}
                    size={22}
                    color={color}
                  />
                ),
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
  backdrop: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#EAEDF2' : '#F2F4F8',
    alignItems:      'center',
    justifyContent:  'center',
  },
  container: {
    width:      '100%',
    maxWidth:   480,
    flex:       1,
    backgroundColor: '#F2F4F8',
    overflow:   'hidden',
    borderLeftWidth:  Platform.OS === 'web' ? 1 : 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    borderColor: '#DDDFE8',
    // Web drop-shadow
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: Platform.OS === 'web' ? 0.12 : 0,
    shadowRadius:  32,
    elevation:     Platform.OS === 'web' ? 0 : 0,
  },
});
