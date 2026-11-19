import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, PixelRatio, View, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from './Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { CommonActions } from '@react-navigation/native';
import { House, Calendar, Laptop, LayoutGrid } from 'lucide-react-native';
import { selectSession } from '../store/authSlice';
import { resolveRoleKey } from '../config/categories';
import { rf, fontScale, isTablet } from '../utils/responsive';
import { resolveFontSize } from '../theme/typography';

// Same bottom bar as the partner app (OwnerNavigator GlassTabBar +
// navigation/tabBarMetrics): a floating white pill, every tab icon + label,
// and a light-red pill behind the active tab (red icon + label) that glides
// to the selected tab. No blur here (expo-blur isn't in this build), so the
// bar body is the partner app's no-blur fallback: solid white.
//
// Nominal bar height kept as a named export so useBottomBarInset can size the
// clearance for any screen that lays content under a sticky footer. The bar
// itself is a normal flex child in TechnicianNavigator's layout, so most
// screens don't need to pad for it.
// Partner values (tabBarMetrics TAB_BAR_HEIGHT_PHONE / _TABLET).
export const TAB_BAR_HEIGHT = isTablet ? 56 : 50;

const ICON_ON = '#F32C26';                       // active icon + label (partner ICON_ON)
const ACTIVE_PILL = '#FEEAE9';                   // active tab's pill — light tint of #F32C26
const SCAN_TEAL = '#035C6C';                     // centre Scan button (partner NAV_TEAL)
const ICON_OFF = '#374151';                      // inactive icon + label (partner ICON_OFF)
const GLASS_WASH = '#FFFFFF';                    // bar body (no-blur fallback)
const GLASS_OUTLINE = '#ECECEC';                 // thin light-grey edge
const PAGE_BG = '#F3F4F6';                       // strip behind the pill = screens' page grey
// Screens drawn on white get a white strip, so the pill floats on the page colour.
const WHITE_PAGE_ROUTES = new Set(['TaskReport', 'TaskAssign', 'MyTasks']);

// Partner sizes: its rs() is width-only (no 0.9 compact factor), so match it.
const ps = (n) => PixelRatio.roundToNearestPixel(n * fontScale);
const BAR_H = ps(TAB_BAR_HEIGHT);
const SIDE_MARGIN = ps(isTablet ? 20 : 14);
const MAX_BAR_W = isTablet ? 660 : undefined;
const PILL_INSET = 5;                            // active pill's gap to the bar edge
const PILL_R = (BAR_H - PILL_INSET * 2) / 2;
const ICON_SIZE = ps(isTablet ? 20 : 18);
const LABEL_SIZE = rf(isTablet ? 11 : 10);
const LABEL_GAP = ps(2);
// Fixed label row sized from what Typography actually renders, so "My Jobs"
// descenders aren't clipped on any phone.
const LABEL_H = Math.ceil(resolveFontSize(LABEL_SIZE, { osScaled: false }) * 1.35);
// Centre Scan button (partner GlassTabBar): a raised teal circle in its own
// slot after the second tab; SCAN_TOP (negative) lifts it above the bar.
const SCAN_AFTER = 1;
const SCAN = ps(isTablet ? 60 : 54);
const SCAN_TOP = (BAR_H - SCAN) / 2 - ps(10);
// Space between the bar and the bottom edge / system nav (partner getTabBarBottomGap).
const bottomGap = (insetBottom) => Math.max(insetBottom, 8) - 2;

// Role-aware tab set: Home / Attendance / My Jobs / More. The My Jobs tile
// ONLY exists for the two roles that actually have a job workflow:
//   TECHNICIAN    → opens TaskReport (Job Report)
//   PICKUP_PERSON → opens PickupAssign (their jobs are pickups)
// STAFF has no task/pickup workflow, so they get a clean three-tab bar
// (Home / Attendance / More) with nothing dangling. "More" (partner grid icon)
// opens the My Account screen; its key stays 'Account'.
function tabsFor(roleKey) {
  const tabs = [
    { key: 'Home',       label: 'Home',       icon: House,    route: 'Home' },
    { key: 'Attendance', label: 'Attendance', icon: Calendar, route: 'DailyAttendance' },
  ];
  if (roleKey === 'PICKUP_PERSON') {
    tabs.push({ key: 'Tasks', label: 'My Jobs', icon: Laptop, route: 'PickupAssign' });
  } else if (roleKey === 'TECHNICIAN') {
    tabs.push({ key: 'Tasks', label: 'My Jobs', icon: Laptop, route: 'TaskReport' });
  }
  tabs.push({ key: 'Account', label: 'More', icon: LayoutGrid, route: 'AccountTab' });
  return tabs;
}

export default function BottomTabBar({ active = 'Home', navigation, routeName }) {
  const session = useSelector(selectSession);
  const roleKey = resolveRoleKey(session);
  const insets = useSafeAreaInsets();
  const TABS = useMemo(() => tabsFor(roleKey), [roleKey]);

  // Hide while the keyboard is up so the bar never rides above it (Android
  // adjustResize) or covers a focused input.
  const [kbVisible, setKbVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKbVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Same roles as Home's header scan icon: STAFF has no assigned jobs to scan.
  const showScan = roleKey !== 'STAFF';
  const [barW, setBarW] = useState(0);
  const count = TABS.length || 1;
  const slotCount = count + (showScan ? 1 : 0);
  const slot = barW > 0 ? barW / slotCount : 0;
  // Slot a tab sits in (the tabs after the scan slot move one along).
  const slotOf = (i) => i + (showScan && i > SCAN_AFTER ? 1 : 0);

  // Index of the active tab; a route whose tab this role doesn't have (e.g.
  // STAFF on a Tasks route) falls back to Home, so the pill and the
  // highlighted tab always agree.
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.key === active));

  // Seed the animated value at the active index so the pill is already in
  // place on mount. The bar is mounted once around the stack, so a tab change
  // glides the pill across (180 ms, ease-out cubic, no overshoot).
  const anim = useRef(new Animated.Value(activeIndex)).current;
  const prevIndex = useRef(activeIndex);
  useEffect(() => {
    if (prevIndex.current === activeIndex) return;
    prevIndex.current = activeIndex;
    Animated.timing(anim, {
      toValue: activeIndex, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [activeIndex]);

  // A one-tab bar can't interpolate over a single point — pin it instead.
  const pillX = count > 1
    ? anim.interpolate({
      inputRange: TABS.map((_, i) => i),
      outputRange: TABS.map((_, i) => slotOf(i) * slot),
      extrapolate: 'clamp',
    })
    : 0;

  if (kbVisible) return null;

  return (
    <View
      style={{
        backgroundColor: WHITE_PAGE_ROUTES.has(routeName) ? '#FFFFFF' : PAGE_BG, alignItems: 'center',
        // Room above the pill for its shadow — and for the raised Scan button,
        // so it never covers the screen's last row.
        paddingTop: showScan ? Math.max(ps(6), -SCAN_TOP + ps(2)) : ps(6),
        paddingBottom: bottomGap(insets.bottom), paddingHorizontal: SIDE_MARGIN,
      }}
    >
      {/* Outline + soft shadow live on this wrapper; the white glass inside clips. */}
      <View
        style={{
          width: '100%', maxWidth: MAX_BAR_W, alignSelf: 'center',
          borderRadius: BAR_H / 2, borderWidth: 1, borderColor: GLASS_OUTLINE,
          // Soft, even light shadow round the bar (elevation needs a background on Android).
          backgroundColor: '#FFFFFF',
          shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        }}
      >
        <View
          onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
          style={{ flexDirection: 'row', height: BAR_H, borderRadius: BAR_H / 2, overflow: 'hidden' }}
        >
          {/* White wash + top sheen — the glass body and its highlight. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_WASH }]} />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: BAR_H * 0.55 }}
          />

          {/* Active pill (partner ACTIVE_PILL), behind the tabs, gliding to the selected one. */}
          {slot > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute', top: PILL_INSET, left: PILL_INSET,
                width: slot - PILL_INSET * 2, height: BAR_H - PILL_INSET * 2, borderRadius: PILL_R,
                backgroundColor: ACTIVE_PILL, transform: [{ translateX: pillX }],
              }}
            />
          ) : null}

          {TABS.map((t, index) => {
            const Icon = t.icon;
            const isActive = index === activeIndex;
            const onPress = () => {
              // Only a no-op when already on the tab's own screen (a drill-down
              // under the same tab still jumps to the tab root).
              if (isActive && routeName === t.route) return;
              // Tabs never stack: the history is always [Home] or [Home, tab], so Back
              // from any tab (or the Android back button) lands straight on Home.
              navigation.dispatch(CommonActions.reset({
                index: t.route === 'Home' ? 0 : 1,
                routes: t.route === 'Home' ? [{ name: 'Home' }] : [{ name: 'Home' }, { name: t.route }],
              }));
            };
            return (
              <React.Fragment key={t.key}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: isActive }}
                // Switch on finger-down, not release — feels instant.
                onPressIn={onPress}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={onPress}
                hitSlop={6}
                style={{ flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', padding: PILL_INSET }}
              >
                {/* Active: bolder red outline; inactive: thin dark grey (partner TabBarItem). */}
                <Icon size={ICON_SIZE} color={isActive ? ICON_ON : ICON_OFF} strokeWidth={isActive ? 2.4 : 1.75} />
                <View style={{ height: LABEL_H, marginTop: LABEL_GAP, justifyContent: 'center' }}>
                  <Text
                    numberOfLines={1}
                    allowFontScaling={false}
                    style={{ fontSize: LABEL_SIZE, fontWeight: isActive ? '700' : '500', color: isActive ? ICON_ON : ICON_OFF }}
                  >
                    {t.label}
                  </Text>
                </View>
              </Pressable>
              {/* Empty slot — the raised Scan button sits over it. */}
              {showScan && index === SCAN_AFTER ? <View style={{ flex: 1 }} /> : null}
              </React.Fragment>
            );
          })}
        </View>

        {/* Job scan (partner PhonePe-style): raised teal circle over the middle
            slot, outside the bar's clip so it rises above it. The scanner
            opens only jobs assigned to this employee (ScanTicketQrScreen). */}
        {showScan ? (
          <Pressable
            onPress={() => navigation.navigate('ScanTicketQr')}
            accessibilityRole="button"
            accessibilityLabel="Scan job QR code"
            hitSlop={6}
            style={{
              position: 'absolute', top: SCAN_TOP,
              left: `${((SCAN_AFTER + 1.5) / slotCount) * 100}%`, marginLeft: -SCAN / 2,
              width: SCAN, height: SCAN, borderRadius: SCAN / 2,
              backgroundColor: SCAN_TEAL, borderWidth: ps(3), borderColor: '#FFFFFF',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#111111', shadowOpacity: 0.18, shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 }, elevation: 8,
            }}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={ps(isTablet ? 28 : 26)} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
