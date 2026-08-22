import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useDispatch } from 'react-redux';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getSession, getToken, clearSession, setAuthExpiredHandler } from '../auth/session';
import { logout } from '../api/auth';
import { setSession, clearSession as clearAuth } from '../store/authSlice';
import LoginScreen from '../screens/LoginScreen';
import TechnicianNavigator from './TechnicianNavigator';
import GeofenceGate from '../components/GeofenceGate';
import AppLockGate from '../components/AppLockGate';

const Stack = createNativeStackNavigator();

// Employee app: customer accounts cannot use it. Any other authenticated
// shop role (TECHNICIAN, SHOP_OWNER, etc.) lands on the technician stack
// for now — owner-only screens can be layered in later.
function isCustomerOnly(session) {
  const roles = session?.roles || [];
  if (!roles.length) return false;
  return roles.every((r) => r === 'CUSTOMER');
}

export default function RootNavigator() {
  const dispatch = useDispatch();
  const [session, setSessionState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The token now lives in secure storage (not the persisted profile blob),
    // so re-attach it to the in-memory session for the logged-in routing check.
    (async () => {
      const [profile, token] = await Promise.all([getSession(), getToken()]);
      const s = token ? { ...(profile || {}), accessToken: token } : profile;
      setSessionState(s);
      dispatch(setSession(s));
      setLoading(false);
    })();
  }, [dispatch]);

  useEffect(() => {
    setAuthExpiredHandler(() => {
      setSessionState(null);
      dispatch(clearAuth());
    });
    return () => setAuthExpiredHandler(null);
  }, [dispatch]);

  const handleLogin = (newSession) => {
    setSessionState(newSession);
    dispatch(setSession(newSession));
  };
  const handleLogout = async () => {
    try { await logout(); } catch (_) {}
    await clearSession();
    setSessionState(null);
    dispatch(clearAuth());
  };

  if (loading) return null;

  if (!session?.accessToken || isCustomerOnly(session)) {
    if (isCustomerOnly(session)) {
      // Clear the rejected customer session so the next login isn't blocked.
      clearSession();
    }
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login">
          {(props) => <LoginScreen {...props} onLogin={handleLogin} />}
        </Stack.Screen>
      </Stack.Navigator>
    );
  }

  // Geofence gate wraps the whole authenticated app so the location check runs
  // right after login — out of the shop's 100m range shows a blocking lock
  // screen instead of the technician stack.
  return (
    <AppLockGate onLogout={handleLogout}>
      <GeofenceGate onLogout={handleLogout}>
        <TechnicianNavigator session={session} onLogout={handleLogout} />
      </GeofenceGate>
    </AppLockGate>
  );
}
