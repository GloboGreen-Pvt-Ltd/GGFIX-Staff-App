import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronRight,
  User as UserIcon,
  Lock,
  Briefcase,
  CreditCard,
  FileText,
  ShieldCheck,
  HelpCircle,
  LogOut,
  Fingerprint,
} from 'lucide-react-native';
import { selectSession } from '../store/authSlice';
import { useLogout } from '../auth/LogoutContext';
import { getRoleDisplayLabel } from '../config/categories';
import { employeeIdFromSession } from '../utils/employeeId';
import { confirm, notify } from '../components/confirm';
import { listMyKycDocuments } from '../api/technicianKyc';
import { isAppLockEnabled, setAppLockEnabled, isDeviceSecure, authenticate } from '../auth/appLock';
import { rf } from '../utils/responsive';

// Brand green — matches the bottom tab bar + the customer/shop apps so the
// employee app reads as one product. Kept local so we don't touch the global
// (navy) theme token used by other screens.
// Teal ramp, not three copies of one colour: these feed a 3-stop LinearGradient
// and identical stops render as a flat block. Solid fills elsewhere in the file
// still use the brand #004C40 via GREEN_DARK.
const GREEN = '#005C4E';
const GREEN_DARK = '#004C40';
const GREEN_LIGHT = '#00695C';

function initialsFromName(name) {
  if (!name) return 'E';
  return name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}

export default function AccountTabScreen({ navigation }) {
  const session = useSelector(selectSession);
  const onLogout = useLogout();
  const displayName = session?.fullName || session?.email || 'Employee';
  const roleLabel = getRoleDisplayLabel(session);
  const employeeId = employeeIdFromSession(session);
  const openProfile = () => navigation.navigate('TechnicianProfile');

  // Route KYC Documents to View (already uploaded) vs Intro (first time)
  // without a manual reload. null = unknown until the first list call lands.
  const [hasKycDocs, setHasKycDocs] = useState(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const list = await listMyKycDocuments();
          if (!cancelled) setHasKycDocs(Array.isArray(list) && list.length > 0);
        } catch {
          if (!cancelled) setHasKycDocs(false);
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );
  const openKyc = () =>
    navigation.navigate(hasKycDocs ? 'TechnicianKycView' : 'TechnicianKycIntro');

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log out?',
      message: 'You will need to sign in again to access your account.',
      confirmText: 'Log out',
      destructive: true,
    });
    if (ok) onLogout?.();
  };

  const comingSoon = (label) => notify(label, 'This section is coming soon.');

  // Sections give the long list a visual rhythm — the user scans grouped
  // cards faster than a flat list of nine identical rows.
  const sections = [
    {
      title: 'Account',
      items: [
        { key: 'profile',  label: 'Profile',         icon: UserIcon, tint: '#DCFCE7', fg: '#004C40', onPress: openProfile },
        { key: 'password', label: 'Change Password', icon: Lock,     tint: '#FEF3C7', fg: '#B45309', onPress: () => comingSoon('Change Password') },
      ],
    },
    {
      title: 'Work',
      items: [
        { key: 'work', label: 'Work Experience', icon: Briefcase,  tint: '#E0E7FF', fg: '#6D28D9', onPress: () => navigation.navigate('WorkExperience') },
        { key: 'kyc',  label: 'KYC Documents',   icon: CreditCard, tint: '#DCFCE7', fg: '#004C40', onPress: openKyc },
      ],
    },
    {
      title: 'Help & Legal',
      items: [
        { key: 'terms',   label: 'Terms & Conditions', icon: FileText,    tint: '#FFE4E6', fg: '#BE123C', onPress: () => comingSoon('Terms & Conditions') },
        { key: 'privacy', label: 'Privacy Policy',     icon: ShieldCheck, tint: '#CFFAFE', fg: '#0E7490', onPress: () => comingSoon('Privacy Policy') },
        { key: 'help',    label: 'Help Center',        icon: HelpCircle,  tint: '#FFEDD5', fg: '#C2410C', onPress: () => comingSoon('Help Center') },
      ],
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* In-screen header — this tab has no native header. */}
      <View className="px-4 pt-3 pb-3 bg-background">
        <Text className="font-extrabold text-text text-center" style={{ fontSize: rf(18) }}>My Account</Text>
        <View className="h-[3px] w-12 rounded-full self-center mt-1.5" style={{ backgroundColor: GREEN }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        {/* Profile hero — green gradient card leading into the Profile screen. */}
        <Pressable
          onPress={openProfile}
          android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
          className="mx-4 mt-4 rounded-3xl overflow-hidden"
          style={{ shadowColor: GREEN, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 7 }}
        >
          <LinearGradient colors={[GREEN_LIGHT, GREEN, GREEN_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18 }}>
            {/* Decorative translucent circles for depth */}
            <View pointerEvents="none" style={{ position: 'absolute', top: -34, right: -22, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.10)' }} />
            <View pointerEvents="none" style={{ position: 'absolute', bottom: -44, left: -16, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.07)' }} />

            <View className="flex-row items-center">
              <View className="h-16 w-16 rounded-full items-center justify-center" style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }}>
                {session?.photoUrl ? (
                  <Image source={{ uri: session.photoUrl }} className="h-[60px] w-[60px] rounded-full" />
                ) : (
                  <View className="h-[60px] w-[60px] rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.20)' }}>
                    <Text className="text-white font-extrabold" style={{ fontSize: rf(19) }}>{initialsFromName(displayName)}</Text>
                  </View>
                )}
              </View>

              <View className="flex-1 ml-3.5 pr-2">
                <Text className="font-extrabold text-white" style={{ fontSize: rf(17) }} numberOfLines={1}>{displayName}</Text>
                <View className="self-start rounded-full px-2.5 py-[3px] mt-1.5 flex-row items-center" style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}>
                  <ShieldCheck size={rf(11)} color="#FFFFFF" strokeWidth={2} />
                  <Text className="font-extrabold tracking-wider text-white ml-1" style={{ fontSize: rf(10) }}>{roleLabel?.toUpperCase()}</Text>
                </View>
              </View>
            </View>

            {/* ID chip */}
            <View className="flex-row items-center mt-3.5 self-start rounded-lg px-2.5 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <Text className="font-bold tracking-wider text-white/70 mr-1.5" style={{ fontSize: rf(10) }}>ID</Text>
              <Text className="font-extrabold text-white tracking-wider" style={{ fontSize: rf(12) }}>{employeeId}</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Grouped sections */}
        {sections.map((sec) => (
          <View key={sec.title} className="mt-5">
            <View className="flex-row items-center px-4 mb-2">
              <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: GREEN, marginRight: 8 }} />
              <Text className="font-extrabold text-text-muted tracking-wider" style={{ fontSize: rf(11.5) }}>{sec.title.toUpperCase()}</Text>
            </View>
            <View
              className="mx-4 bg-card rounded-2xl border border-border overflow-hidden"
              style={{ shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}
            >
              {sec.items.map((it, idx) => {
                const Icon = it.icon;
                const isLast = idx === sec.items.length - 1;
                return (
                  <Pressable
                    key={it.key}
                    onPress={it.onPress}
                    android_ripple={{ color: '#E2E8F0' }}
                    className="flex-row items-center px-4 py-3.5"
                    style={!isLast ? { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' } : null}
                  >
                    <View className="h-9 w-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: it.tint }}>
                      <Icon size={rf(18)} color={it.fg} strokeWidth={2} />
                    </View>
                    <Text className="flex-1 text-text font-bold" style={{ fontSize: rf(14) }}>{it.label}</Text>
                    <ChevronRight size={rf(18)} color="#94A3B8" />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {/* Security — App Lock toggle */}
        <View className="mt-5">
          <View className="flex-row items-center px-4 mb-2">
            <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: GREEN, marginRight: 8 }} />
            <Text className="font-extrabold text-text-muted tracking-wider" style={{ fontSize: rf(11.5) }}>SECURITY</Text>
          </View>
          <View
            className="mx-4 bg-card rounded-2xl border border-border overflow-hidden"
            style={{ shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}
          >
            <AppLockRow />
          </View>
        </View>

        {/* Log out — full-width red button */}
        <Pressable
          onPress={handleLogout}
          android_ripple={{ color: '#FECACA' }}
          className="mx-4 mt-6 rounded-2xl bg-card border flex-row items-center justify-center py-3.5"
          style={{
            borderColor: '#FECACA',
            shadowColor: '#DC2626',
            shadowOpacity: 0.1,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          }}
        >
          <LogOut size={rf(17)} color="#DC2626" strokeWidth={2} />
          <Text className="ml-2 font-extrabold" style={{ fontSize: rf(14), color: '#DC2626' }}>Log out</Text>
        </Pressable>

        <Text className="text-text-muted text-center mt-4 font-semibold" style={{ fontSize: rf(10) }}>
          GG Fix Employee · v1.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// App Lock toggle. Turning ON requires the device to have a lock set and the
// user to pass the OS prompt once. Fails OPEN — if the device has no lock we
// tell the user to add one rather than locking them out.
function AppLockRow() {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const enabled = await isAppLockEnabled();
      if (!alive) return; // avoid setState after unmount
      setOn(enabled);
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);
  const toggle = async (next) => {
    if (next) {
      if (!(await isDeviceSecure())) {
        Alert.alert('Set a screen lock', 'Add a fingerprint, pattern or PIN in your phone settings first, then turn on App Lock.');
        return;
      }
      if (!(await authenticate())) return;
    }
    await setAppLockEnabled(next);
    setOn(next);
  };
  return (
    <View className="flex-row items-center px-4 py-3.5">
      <View className="h-9 w-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: '#DCFCE7' }}>
        <Fingerprint size={rf(18)} color={GREEN_DARK} strokeWidth={2} />
      </View>
      <View className="flex-1">
        <Text className="text-text font-bold" style={{ fontSize: rf(14) }}>App Lock</Text>
        <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(11.5) }}>Require fingerprint / pattern / PIN to open</Text>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        disabled={!ready}
        trackColor={{ true: GREEN, false: '#CBD5E1' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
