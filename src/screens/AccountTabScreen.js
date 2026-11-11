import React, { useCallback, useState } from 'react';
import { View, Pressable, TouchableOpacity, ScrollView, Image, RefreshControl, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  User as UserIcon,
  Briefcase,
  BookOpen,
  CreditCard,
  FileText,
  ShieldCheck,
  HelpCircle,
  LogOut,
  BriefcaseBusiness,
  IdCard,
  Bell,
  Phone,
  Camera,
  ChevronRight,
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
import { rs } from '../utils/responsive';
import LogoutSheet from '../components/LogoutSheet';

// Partner app My Account palette (brand sheet, Oct 2026).
const C = {
  green: '#035C6C',      // brand teal: header, key actions
  greenDark: '#02414C',  // header gradient end
  red: '#F32C26',
  yellow: '#FAA700',
  navy: '#1C3053',
  blue: '#0788C9',
  leaf: '#609138',
  ink: '#111111',
  bg: '#F3F4F6',
  greenTint: '#E5F3F5',
  card: '#FFFFFF',
  divider: '#F1F3F5',
  muted: '#6B7280',
  faint: '#A3A3A3',
};

const MAX_CONTENT_WIDTH = 720;
const APP_VERSION = Constants.expoConfig?.version || '1.0';
const ICON_STROKE = 2;
const cardShadow = {
  shadowColor: C.navy, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
};

// Solid glyphs (lucide is outline-only), with the same size/color props.
const ion = (name) => ({ size, color }) => <Ionicons name={name} size={size} color={color} />;
const mci = (name) => ({ size, color }) => <MaterialCommunityIcons name={name} size={size} color={color} />;

// Presentation only, keyed by the existing item keys: solid icon tile colour,
// icon, and row subtitle. Handlers stay in the sections list below.
const ITEM_LOOK = {
  profile:  { icon: ion('person'),        bg: C.green,  fg: '#FFFFFF', sub: 'View and manage your profile information' },
  work:     { icon: ion('briefcase'),     bg: C.yellow, fg: '#FFFFFF', sub: 'Your work experience details' },
  kyc:      { icon: ion('document-text'), bg: C.blue,   fg: '#FFFFFF', sub: 'Manage your KYC documents' },
  terms:    { icon: mci('script-text'),   bg: C.navy,   fg: '#FFFFFF', sub: 'Read our terms and conditions' },
  privacy:  { icon: mci('shield-check'),  bg: C.leaf,   fg: '#FFFFFF', sub: 'Learn about your privacy' },
  help:     { icon: ion('headset'),       bg: C.yellow, fg: '#FFFFFF', sub: "We're here to help" },
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
        { key: 'packs', label: 'Solution Packs', icon: BookOpen,   tint: '#E6F2F4', fg: '#035C6C', onPress: () => navigation.navigate('SolutionPacks') },
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
  const avatar = rs(64);
  const isFocused = useIsFocused();
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'));
  // Same order as the reference: Account, Work, Security, then Support.
  const allItems = sections.flatMap((s) => s.items);
  const lightText = 'rgba(255,255,255,0.88)';
  const lightIcon = 'rgba(255,255,255,0.8)';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Light icons over the teal header — only while this screen is on top. */}
      {isFocused ? <StatusBar style="light" /> : null}

      {/* Teal header: title bar + profile, one block (partner My Account). */}
      <LinearGradient
        colors={[C.green, C.greenDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderBottomLeftRadius: rs(26), borderBottomRightRadius: rs(26) }}
      >
        <SafeAreaView edges={['top']}>
          <View style={{ width: contentW, alignSelf: 'center', paddingTop: rs(6), paddingBottom: rs(18) }}>
            <View className="flex-row items-center">
              <HeaderButton label="Back" onPress={goBack}>
                <Ionicons name="chevron-back" size={19} color="#FFFFFF" />
              </HeaderButton>
              <View style={{ flex: 1, alignItems: 'center', marginHorizontal: rs(8) }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>My Account</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: rs(2) }} numberOfLines={1}>
                  Manage your profile, work and preferences
                </Text>
              </View>
              {/* Red dot on the bell — same unread count Home shows. */}
              <HeaderButton label="Notifications" onPress={() => navigation.navigate('Notifications')}>
                <Bell size={16} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                {unreadNotifs > 0 ? (
                  <View style={{ position: 'absolute', top: rs(7), right: rs(8), width: rs(8), height: rs(8), borderRadius: rs(5), backgroundColor: C.red, borderWidth: 1.5, borderColor: '#FFFFFF' }} />
                ) : null}
              </HeaderButton>
            </View>

            {/* Profile — read-only summary; the avatar opens Profile, where editing lives. */}
            <View className="flex-row items-center" style={{ marginTop: rs(18) }}>
              <Pressable onPress={openProfile} accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={4}>
                <View
                  style={{
                    width: avatar, height: avatar, borderRadius: avatar / 2, overflow: 'hidden',
                    backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 3, borderColor: '#FFFFFF',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {session?.photoUrl ? (
                    <Image source={{ uri: session.photoUrl }} style={{ width: avatar, height: avatar }} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 19, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 }}>{initialsFromName(displayName)}</Text>
                  )}
                </View>
                <View
                  style={{
                    position: 'absolute', right: -rs(2), bottom: -rs(2), width: rs(22), height: rs(22), borderRadius: rs(11),
                    backgroundColor: C.yellow, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Camera size={11} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                </View>
              </Pressable>

              <View style={{ flex: 1, minWidth: 0, marginLeft: rs(14) }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFFFFF' }} numberOfLines={1}>{displayName}</Text>
                {roleLabel ? (
                  <View className="flex-row" style={{ marginTop: rs(5) }}>
                    <View className="flex-row items-center" style={{ backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(3) }}>
                      <BriefcaseBusiness size={10} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF', marginLeft: rs(3), letterSpacing: 0.5 }} numberOfLines={1}>
                        {roleLabel.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {session?.mobile ? (
                  <View className="flex-row items-center" style={{ marginTop: rs(6) }}>
                    <Phone size={11} color={lightIcon} strokeWidth={ICON_STROKE} />
                    <Text style={{ fontSize: 12, color: lightText, marginLeft: rs(6) }} numberOfLines={1}>{session.mobile}</Text>
                  </View>
                ) : null}
                <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
                  <IdCard size={11} color={lightIcon} strokeWidth={ICON_STROKE} />
                  <Text style={{ fontSize: 12, color: lightText, marginLeft: rs(6) }} numberOfLines={1}>ID {employeeId}</Text>
                </View>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingTop: rs(4), paddingBottom: rs(16) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.green]} tintColor={C.green} />}
      >
        <View style={{ width: contentW }}>
          {/* Two cards: account items (first 3) and support items (last 3) */}
          {[
            { meta: { title: 'Account', subtitle: 'Profile, work and documents' }, items: allItems.slice(0, 3), showCount: true },
            { meta: { title: 'Support', subtitle: 'Help, legal and other information' }, items: allItems.slice(3) },
          ].map((group) => (
            <SectionBlock key={group.meta.title} meta={group.meta} count={group.showCount ? group.items.length : null}>
              {group.items.map((it, idx) => <MenuRow key={it.key} item={it} last={idx === group.items.length - 1} />)}
            </SectionBlock>
          ))}

          {/* Children fn, not a style fn — NativeWind drops style={({ pressed }) => …}. */}
          <Pressable onPress={handleLogout} accessibilityRole="button" accessibilityLabel="Log out" hitSlop={4} style={{ marginTop: rs(18) }}>
            {({ pressed }) => (
              <View
                className="flex-row items-center justify-center"
                style={{ height: rs(50), borderRadius: rs(14), borderWidth: 1.5, borderColor: C.red, backgroundColor: pressed ? '#FDE1DF' : C.card }}
              >
                <LogOut size={17} color={C.red} strokeWidth={ICON_STROKE} />
                <Text style={{ marginLeft: rs(8), fontSize: 14, fontWeight: '800', color: C.red }}>Log out</Text>
              </View>
            )}
          </Pressable>

          <Text style={{ textAlign: 'center', marginTop: rs(10), fontSize: 11, fontWeight: '600', color: C.faint }}>
            NearGFix Employee · v{APP_VERSION}
          </Text>
        </View>
      </ScrollView>
      <LogoutSheet visible={logoutOpen} onCancel={() => setLogoutOpen(false)} onConfirm={() => onLogout?.()} />
    </View>
  );
}

// Translucent round button on the teal header (back / notifications).
function HeaderButton({ label, onPress, children }) {
  const size = rs(36);
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.7}
      style={{
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

// Section heading (title + subtitle + "N Options" pill) above a white card.
function SectionBlock({ meta, count, children }) {
  return (
    <View>
      <View className="flex-row items-end" style={{ marginTop: rs(18), marginBottom: rs(8), paddingHorizontal: rs(2) }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: C.navy }}>{meta.title}</Text>
          <Text style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{meta.subtitle}</Text>
        </View>
        {count ? (
          <View style={{ backgroundColor: C.greenTint, borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(3) }}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.green }}>{count} {count === 1 ? 'Option' : 'Options'}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ backgroundColor: C.card, borderRadius: rs(18), paddingHorizontal: rs(12), ...cardShadow }}>
        {children}
      </View>
    </View>
  );
}

// One menu row: [solid brand tile + white glyph] Title / subtitle  ›, with a
// thin divider under every row except the card's last. Uses the item's own onPress.
function MenuRow({ item, last }) {
  const look = ITEM_LOOK[item.key] || { icon: item.icon, bg: C.green, fg: '#FFFFFF' };
  const Icon = look.icon;
  return (
    <TouchableOpacity
      onPress={item.onPress}
      accessibilityRole="button"
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', minHeight: rs(62), paddingVertical: rs(10),
        borderBottomWidth: last ? 0 : 1, borderBottomColor: C.divider,
      }}
    >
      <View style={{ width: rs(40), height: rs(40), borderRadius: rs(12), backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center', marginRight: rs(12) }}>
        <Icon size={19} color={look.fg} strokeWidth={ICON_STROKE} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.ink }} numberOfLines={1}>{item.label}</Text>
        {look.sub ? <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }} numberOfLines={1}>{look.sub}</Text> : null}
      </View>
      <ChevronRight size={17} color="#9CA3AF" strokeWidth={ICON_STROKE} />
    </TouchableOpacity>
  );
}

