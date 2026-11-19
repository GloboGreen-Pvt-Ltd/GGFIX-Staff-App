import './global.css';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Pressable } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { GluestackUIProvider } from '@gluestack-ui/themed';
import { config } from '@gluestack-ui/config';
import { store } from './src/store';
import RootNavigator from './src/navigation/RootNavigator';
import { ToastHost } from './src/components/Toast';
import colors from './src/theme/colors';
import { useFonts } from 'expo-font';
import { fontAssets } from './src/theme/typography';

const navTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.headerBg,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

// Font load that neither finishes nor errors must not hold the app on a blank
// screen: after this wait the app renders with the system font.
const FONT_WAIT_MS = 4000;

// A startup/render crash in a release build otherwise leaves a blank screen
// behind the splash: show a recoverable Retry screen instead.
class StartupBoundary extends React.Component {
  state = { error: null, attempt: 0 };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.warn('[boot] render failed', error?.message || error); }
  render() {
    if (!this.state.error) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F3F4F6' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 }}>Something went wrong</Text>
        <Text style={{ fontSize: 14, color: '#4B5563', textAlign: 'center', marginBottom: 20 }}>{String(this.state.error?.message || 'The app could not start.')}</Text>
        <Pressable onPress={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
          style={{ backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }
}

export default function App() {
  // Inter faces; render on load, on error or after FONT_WAIT_MS (system font fallback).
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [fontWaitOver, setFontWaitOver] = useState(false);
  useEffect(() => {
    if (fontsLoaded || fontError) return undefined;
    const t = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError && !fontWaitOver) return null;
  return (
    <StartupBoundary>
    <Provider store={store}>
      <GluestackUIProvider config={config}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
          {/* App-wide toasts (notify / showToast), above every screen. */}
          <ToastHost />
        </SafeAreaProvider>
      </GluestackUIProvider>
    </Provider>
    </StartupBoundary>
  );
}
