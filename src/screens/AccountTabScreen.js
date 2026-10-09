import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, TouchableOpacity, ScrollView, Image, Switch, Alert, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import {
  User as UserIcon,
  Lock,
  Briefcase,
  CreditCard,
  FileText,
  ShieldCheck,
  HelpCircle,
  LogOut,
  Fingerprint,
  UserRound,
  LockKeyhole,
  BriefcaseBusiness,
  IdCard,
  Headset,
  Bell,
  Camera,
  Pencil,
  Phone,
  BadgeCheck,
} from 'lucide-react-native';
import Constants from 'expo-constants';
import { selectSession } from '../store/authSlice';
import { useLogout } from '../auth/LogoutContext';
import { getRoleDisplayLabel } from '../config/categories';
import { employeeIdFromSession } from '../utils/employeeId';
import { confirm, notify } from '../components/confirm';
import { listMyKycDocuments } from '../api/technicianKyc';
import { isAppLockEnabled, setAppLockEnabled, isDeviceSecure, authenticate } from '../auth/appLock';
import { loadUnreadNotificationCount } from './NotificationsScreen';
import { rf, rs } from '../utils/responsive';

// Brand palette (same as Home): green, red, yellow, ink + light neutrals.
const C = {
  green: '#09AD2A',
  red: '#F84141',
  yellow: '#F3BF23',
  ink: '#1E1E1E',
  bg: '#F8F8F8',
  surface: '#F3F3F3',
  greenTint: '#E6F7EA',
  redSoft: '#FFF6F6',
  card: '#FFFFFF',
  border: '#EEEEEE',
  muted: '#6E6E6E',
  faint: '#A3A3A3',
};
// App Lock switch track colour.
const GREEN = C.green;

const MAX_CONTENT_WIDTH = 720;
const APP_VERSION = Constants.expoConfig?.version || '1.0';
const cardShadow = {
  shadowColor: C.ink, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
};

// Presentation only, keyed by the existing item keys: solid icon tile colour,
// icon, and row subtitle. Handlers stay in the sections list below.
const ITEM_LOOK = {
  profile:  { icon: UserRound,         bg: C.green,  fg: '#FFFFFF', sub: 'View and manage your profile information' },
  password: { icon: LockKeyhole,       bg: C.red,    fg: '#FFFFFF', sub: 'Update your account password' },
  work:     { icon: BriefcaseBusiness, bg: C.yellow, fg: C.ink,     sub: 'Your work experience details' },
  kyc:      { icon: IdCard,            bg: C.ink,    fg: '#FFFFFF', sub: 'Manage your KYC documents' },
  terms:    { icon: FileText,          bg: C.ink,    fg: '#FFFFFF', sub: 'Read our terms and conditions' },
  privacy:  { icon: ShieldCheck,       bg: C.green,  fg: '#FFFFFF', sub: 'Learn about your privacy' },
  help:     { icon: Headset,           bg: C.red,    fg: '#FFFFFF', sub: "We're here to help" },
};
// Section headings shown above each card (keyed by the existing section title).
const SECTION_META = {
  Account:        { title: 'Account',  subtitle: 'Your profile and password' },
  Work:           { title: 'Work',     subtitle: 'Experience and documents' },
  Security:       { title: 'Security', subtitle: 'Keep your account safe and secure' },
  'Help & Legal': { title: 'Support',  subtitle: 'Help, legal and other information' },
};

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

  // A dialog (not a brief toast) so the tap visibly does something on the phone.
  const comingSoon = (label) => (Platform.OS === 'web'
    ? notify(label, 'This section is coming soon.')
    : Alert.alert(label, 'This section is coming soon.'));

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

  // Red dot on the header bell — same unread count Home shows.
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    loadUnreadNotificationCount().then((n) => { if (active) setUnreadNotifs(n); });
    return () => { active = false; };
  }, []));

  const { width: winW } = useWindowDimensions();
  const contentW = Math.min(winW, MAX_CONTENT_WIDTH) - rs(32);
  const avatar = rs(50);
  // Same order as the reference: Account, Work, Security, then Support.
  const mainSections = sections.filter((s) => s.title !== 'Help & Legal');
  const supportSection = sections.find((s) => s.title === 'Help & Legal');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: rs(16) }} showsVerticalScrollIndicator={false}>
        <View style={{ width: contentW }}>
          {/* Header */}
          <View className="flex-row items-center" style={{ paddingTop: rs(8) }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: rf(12), fontWeight: '900', color: C.green, letterSpacing: 1 }}>GGFIX</Text>
              <Text style={{ fontSize: rf(20), fontWeight: '800', color: C.ink }}>My Account</Text>
              <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 1 }}>Manage your profile, work and preferences</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              activeOpacity={0.8}
              style={{
                width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: C.card,
                alignItems: 'center', justifyContent: 'center', ...cardShadow,
              }}
            >
              <Bell size={rs(18)} color={C.ink} />
              {unreadNotifs > 0 ? (
                <View style={{ position: 'absolute', top: rs(7), right: rs(8), width: rs(8), height: rs(8), borderRadius: rs(5), backgroundColor: C.red, borderWidth: 1.5, borderColor: '#FFFFFF' }} />
              ) : null}
            </TouchableOpacity>
          </View>

          {/* Profile card */}
          <View className="flex-row items-center" style={{ marginTop: rs(10), backgroundColor: C.card, borderRadius: rs(16), padding: rs(10), ...cardShadow }}>
            <Pressable onPress={openProfile} accessibilityRole="button" accessibilityLabel="Open profile">
              {session?.photoUrl ? (
                <Image source={{ uri: session.photoUrl }} style={{ width: avatar, height: avatar, borderRadius: avatar / 2 }} />
              ) : (
                <View style={{ width: avatar, height: avatar, borderRadius: avatar / 2, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: rf(18), fontWeight: '800', color: '#FFFFFF' }}>{initialsFromName(displayName)}</Text>
                </View>
              )}
              <View style={{ position: 'absolute', right: -rs(2), bottom: -rs(2), width: rs(18), height: rs(18), borderRadius: rs(9), backgroundColor: C.green, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={rs(9)} color="#FFFFFF" strokeWidth={2.4} />
              </View>
            </Pressable>

            <View style={{ flex: 1, marginLeft: rs(10), marginRight: rs(6) }}>
              <View className="flex-row items-center" style={{ flexWrap: 'wrap', gap: rs(6) }}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.ink, flexShrink: 1 }} numberOfLines={1}>{displayName}</Text>
                <View className="flex-row items-center" style={{ backgroundColor: C.greenTint, borderRadius: 999, paddingHorizontal: rs(7), paddingVertical: rs(2) }}>
                  <BadgeCheck size={rs(11)} color={C.green} strokeWidth={2.4} />
                  <Text style={{ fontSize: rf(9.5), fontWeight: '800', color: C.green, marginLeft: rs(3), letterSpacing: 0.4 }}>{roleLabel?.toUpperCase()}</Text>
                </View>
              </View>
              {session?.mobile ? (
                <View className="flex-row items-center" style={{ marginTop: rs(3) }}>
                  <Phone size={rs(12)} color={C.muted} />
                  <Text style={{ fontSize: rf(11.5), color: C.muted, marginLeft: rs(5) }}>{session.mobile}</Text>
                </View>
              ) : null}
              <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
                <IdCard size={rs(12)} color={C.muted} />
                <Text style={{ fontSize: rf(11.5), color: C.muted, marginLeft: rs(5) }}>ID {employeeId}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={openProfile} hitSlop={6} accessibilityRole="button" accessibilityLabel="Edit profile" activeOpacity={0.8} style={{ alignItems: 'center' }}>
              <View style={{ width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: C.greenTint, alignItems: 'center', justifyContent: 'center' }}>
                <Pencil size={rs(15)} color={C.green} strokeWidth={2.2} />
              </View>
              <Text style={{ fontSize: rf(10.5), fontWeight: '700', color: C.green, marginTop: rs(3) }}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Account + Work */}
          {mainSections.map((sec) => (
            <SectionBlock key={sec.title} meta={SECTION_META[sec.title]} count={sec.items.length}>
              {sec.items.map((it, idx) => <MenuRow key={it.key} item={it} last={idx === sec.items.length - 1} />)}
            </SectionBlock>
          ))}

          {/* Security — App Lock toggle */}
          <SectionBlock meta={SECTION_META.Security}>
            <AppLockRow />
          </SectionBlock>

          {/* Support (Help & Legal items) */}
          {supportSection ? (
            <SectionBlock meta={SECTION_META['Help & Legal']} count={supportSection.items.length}>
              {supportSection.items.map((it, idx) => <MenuRow key={it.key} item={it} last={idx === supportSection.items.length - 1} />)}
            </SectionBlock>
          ) : null}

          {/* Log out */}
          <Pressable
            onPress={handleLogout}
            android_ripple={{ color: '#FECACA' }}
            className="flex-row items-center justify-center"
            style={{ marginTop: rs(14), height: rs(42), borderRadius: rs(12), borderWidth: 1.5, borderColor: C.red, backgroundColor: C.redSoft }}
          >
            <LogOut size={rs(17)} color={C.red} strokeWidth={2.4} />
            <Text style={{ marginLeft: rs(8), fontSize: rf(14), fontWeight: '800', color: C.red }}>Log out</Text>
          </Pressable>

          <Text style={{ textAlign: 'center', marginTop: rs(8), fontSize: rf(11), fontWeight: '600', color: C.faint }}>
            GG Fix Employee · v{APP_VERSION}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Section heading (title + subtitle + "N Options" pill) above a white card.
function SectionBlock({ meta, count, children }) {
  return (
    <View style={{ marginTop: rs(12) }}>
      <View className="flex-row items-end" style={{ marginBottom: rs(6) }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.ink }}>{meta.title}</Text>
          <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }}>{meta.subtitle}</Text>
        </View>
        {count ? (
          <View style={{ backgroundColor: C.greenTint, borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(3) }}>
            <Text style={{ fontSize: rf(10), fontWeight: '800', color: C.green }}>{count} {count === 1 ? 'Option' : 'Options'}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ backgroundColor: C.card, borderRadius: rs(14), overflow: 'hidden', ...cardShadow }}>
        {children}
      </View>
    </View>
  );
}

// One menu row: solid colour icon tile, title + subtitle. Uses the item's own onPress.
function MenuRow({ item, last }) {
  const look = ITEM_LOOK[item.key] || { icon: item.icon, bg: C.green, fg: '#FFFFFF' };
  const Icon = look.icon;
  return (
    <TouchableOpacity
      onPress={item.onPress}
      accessibilityRole="button"
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: rs(50), paddingHorizontal: rs(10), paddingVertical: rs(7), backgroundColor: C.card }}
    >
      <View style={{ width: rs(32), height: rs(32), borderRadius: rs(10), backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center', marginRight: rs(10) }}>
        <Icon size={rs(16)} color={look.fg} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: C.ink }}>{item.label}</Text>
        {look.sub ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }} numberOfLines={1}>{look.sub}</Text> : null}
      </View>
      {!last ? <View style={{ position: 'absolute', left: rs(10), right: rs(10), bottom: 0, height: 1, backgroundColor: C.border }} /> : null}
    </TouchableOpacity>
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
    <View className="flex-row items-center" style={{ minHeight: rs(50), paddingHorizontal: rs(10), paddingVertical: rs(7) }}>
      <View style={{ width: rs(32), height: rs(32), borderRadius: rs(10), backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginRight: rs(10) }}>
        <Fingerprint size={rs(16)} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, marginRight: rs(8) }}>
        <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: C.ink }}>App Lock</Text>
        <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 1 }} numberOfLines={1}>Require fingerprint / pattern / PIN to open</Text>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        disabled={!ready}
        trackColor={{ true: GREEN, false: '#D4D4D4' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
