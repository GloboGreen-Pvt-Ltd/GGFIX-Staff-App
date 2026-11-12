import './global.css';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
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
  );
}
