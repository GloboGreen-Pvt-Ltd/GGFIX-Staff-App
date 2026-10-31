import React, { useCallback, useState } from 'react';
import { View, Pressable, TouchableOpacity, ScrollView, Image, RefreshControl, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import {
  User as UserIcon,
  Briefcase,
  CreditCard,
  FileText,
  ShieldCheck,
  HelpCircle,
  LogOut,
  UserRound,
  LockKeyhole,
  BriefcaseBusiness,
  IdCard,
  Headset,
  Bell,
  Phone,
  BadgeCheck,
} from 'lucide-react-native';
import Constants from 'expo-constants';
import { selectSession } from '../store/authSlice';
import { useLogout } from '../auth/LogoutContext';
import { getRoleDisplayLabel } from '../config/categories';
import { employeeIdFromSession } from '../utils/employeeId';
import { notify } from '../components/confirm';
import { listMyKycDocuments } from '../api/technicianKyc';
import { refreshMyProfile } from '../auth/refreshProfile';
import { loadUnreadNotificationCount } from './NotificationsScreen';
import { rf, rs } from '../utils/responsive';
import MintScreenHeader from '../components/MintScreenHeader';
import LogoutSheet from '../components/LogoutSheet';

// Brand palette (same as Home): green, red, yellow, ink + light neutrals.
const C = {
  green: '#035C6C',
  red: '#F32C26',
  yellow: '#FAA700',
  ink: '#111111',
  bg: '#F3F4F6',
  surface: '#F3F4F6',
  greenTint: '#E5F3F5',
  redSoft: '#FFF6F6',
  card: '#FFFFFF',
  border: '#E5E7EB',
  muted: '#6B7280',
  faint: '#A3A3A3',
};

const MAX_CONTENT_WIDTH = 720;
const APP_VERSION = Constants.expoConfig?.version || '1.0';
const cardShadow = {
  shadowColor: C.ink, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
};

// Presentation only, keyed by the existing item keys: solid icon tile colour,
// icon, and row subtitle. Handlers stay in the sections list below.
const ITEM_LOOK = {
  profile:  { icon: UserRound,         bg: '#609138', fg: '#FFFFFF', sub: 'View and manage your profile information' },
  password: { icon: LockKeyhole,       bg: C.red,    fg: '#FFFFFF', sub: 'Update your account password' },
  work:     { icon: BriefcaseBusiness, bg: '#FAA700', fg: '#FFFFFF', sub: 'Your work experience details' },
  kyc:      { icon: IdCard,            bg: '#035C6C', fg: '#FFFFFF', sub: 'Manage your KYC documents' },
  terms:    { icon: FileText,          bg: '#0788C9', fg: '#FFFFFF', sub: 'Read our terms and conditions' },
  privacy:  { icon: ShieldCheck,       bg: '#1C3053', fg: '#FFFFFF', sub: 'Learn about your privacy' },
  help:     { icon: Headset,           bg: '#035C6C', fg: '#FFFFFF', sub: "We're here to help" },
};

function initialsFromName(name) {
  if (!name) return 'E';
  return name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}

export default function AccountTabScreen({ navigation }) {
  const session = useSelector(selectSession);
  const dispatch = useDispatch();
  const onLogout = useLogout();

  // Re-read /technicians/me whenever the tab gains focus (and on pull-to-
  // refresh) so owner edits — e.g. a phone number set in the Partner app —
  // replace the values cached from login. Failures keep the last values.
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      refreshMyProfile(dispatch);
    }, [dispatch])
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshMyProfile(dispatch); } finally { setRefreshing(false); }
  }, [dispatch]);
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
    navigation.navigate(hasKycDocs ? 'TechnicianKycView' : 'TechnicianKycUpload');

  // Logout confirmation bottom sheet (components/LogoutSheet).
  const [logoutOpen, setLogoutOpen] = useState(false);
  const handleLogout = () => setLogoutOpen(true);

  const comingSoon = (label) => notify(label, 'This section is coming soon.', { type: 'info' });

  // Sections give the long list a visual rhythm — the user scans grouped
  // cards faster than a flat list of nine identical rows.
  const sections = [
    {
      title: 'Account',
      items: [
        { key: 'profile',  label: 'Profile',         icon: UserIcon, tint: '#DCFCE7', fg: '#609138', onPress: openProfile },
      ],
    },
    {
      title: 'Work',
      items: [
        { key: 'work', label: 'Work Experience', icon: Briefcase,  tint: '#E0E7FF', fg: '#1C3053', onPress: () => navigation.navigate('WorkExperience') },
        { key: 'kyc',  label: 'KYC Documents',   icon: CreditCard, tint: '#DCFCE7', fg: '#609138', onPress: openKyc },
      ],
    },
    {
      title: 'Help & Legal',
      items: [
        { key: 'terms',   label: 'Terms & Conditions', icon: FileText,    tint: '#FFE4E6', fg: '#F32C26', onPress: () => comingSoon('Terms & Conditions') },
        { key: 'privacy', label: 'Privacy Policy',     icon: ShieldCheck, tint: '#CFFAFE', fg: '#0788C9', onPress: () => comingSoon('Privacy Policy') },
        { key: 'help',    label: 'Help Center',        icon: HelpCircle,  tint: '#FFEDD5', fg: '#FAA700', onPress: () => navigation.navigate('HelpSupport') },
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
  const allItems = sections.flatMap((s) => s.items);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {/* Header */}
      <MintScreenHeader
        title="My Account"
        navigation={navigation}
        right={(
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
        )}
      />
      <Text style={{ fontSize: rf(12), color: C.muted, textAlign: 'center', marginTop: -rs(4), paddingHorizontal: rs(16) }}>
        Manage your profile, work and preferences
      </Text>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingBottom: rs(16) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.green]} tintColor={C.green} />}
      >
        <View style={{ width: contentW, flex: 1 }}>
          {/* Profile card */}
          <View className="flex-row items-center" style={{ marginTop: rs(10), backgroundColor: C.card, borderRadius: rs(16), padding: rs(10), ...cardShadow }}>
            {/* Read-only summary: editing lives only in the Profile screen. */}
            <View>
              {session?.photoUrl ? (
                <Image source={{ uri: session.photoUrl }} style={{ width: avatar, height: avatar, borderRadius: avatar / 2 }} />
              ) : (
                <View style={{ width: avatar, height: avatar, borderRadius: avatar / 2, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: rf(18), fontWeight: '800', color: '#FFFFFF' }}>{initialsFromName(displayName)}</Text>
                </View>
              )}
            </View>

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
          </View>

          {/* Two cards: account items (first 3) and support items (last 3) */}
          {[
            { meta: { title: 'Account', subtitle: 'Profile, work and documents' }, items: allItems.slice(0, 3) },
            { meta: { title: 'Support', subtitle: 'Help, legal and other information' }, items: allItems.slice(3) },
          ].map((group) => (
            <SectionBlock key={group.meta.title} meta={group.meta}>
              {group.items.map((it, idx) => <MenuRow key={it.key} item={it} last={idx === group.items.length - 1} />)}
            </SectionBlock>
          ))}

          {/* Log out — pinned to the bottom of the screen */}
          <View style={{ flex: 1, minHeight: rs(12) }} />
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
            NearGFix Employee · v{APP_VERSION}
          </Text>
        </View>
      </ScrollView>
      <LogoutSheet visible={logoutOpen} onCancel={() => setLogoutOpen(false)} onConfirm={() => onLogout?.()} />
    </SafeAreaView>
  );
}

// Section heading (title + subtitle + "N Options" pill) above a white card.
function SectionBlock({ meta, count, children }) {
  return (
    <View style={{ marginTop: rs(12) }}>
      <View className="flex-row items-end" style={{ marginBottom: rs(6) }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.ink }}>{meta.title}</Text>
          <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 1 }}>{meta.subtitle}</Text>
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

