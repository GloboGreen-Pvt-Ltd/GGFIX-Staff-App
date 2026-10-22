import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, Pressable } from 'react-native';
import { Text } from './Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { CommonActions } from '@react-navigation/native';
import { House, Calendar, Laptop, Truck, User } from 'lucide-react-native';
import { selectSession } from '../store/authSlice';
import { resolveRoleKey } from '../config/categories';
import { rf, rs, isTablet } from '../utils/responsive';

// Same bottom bar as the partner app (docs: "Partner App — Bottom Navbar
// Design"): a floating white pill with a raised teal circle marking the active
// tab. Inactive tabs are icon-only; the active tab shows its icon inside the
// circle and its label below. No blur here (expo-blur isn't in this build), so
// the bar body is the partner app's no-blur fallback: solid white.
//
// Nominal bar height kept as a named export so useBottomBarInset can size the
// clearance for any screen that lays content under a sticky footer. The bar
// itself is a normal flex child in TechnicianNavigator's layout, so most
// screens don't need to pad for it.
export const TAB_BAR_HEIGHT = isTablet ? 74 : 66;

const NAV_TEAL = '#035C6C';                      // active circle fill, active label
const ICON_OFF = '#6B7280';                      // inactive icons
const GLASS_WASH = '#FFFFFF';                    // bar body (no-blur fallback)
const GLASS_OUTLINE = 'rgba(17, 17, 17, 0.08)';  // hairline outer outline
const PAGE_BG = '#F3F4F6';                       // strip behind the pill = screens' page grey

const BAR_H = rs(TAB_BAR_HEIGHT);
const SIDE_MARGIN = rs(isTablet ? 20 : 14);
const MAX_BAR_W = isTablet ? 660 : undefined;
const TAB_HPAD = rs(6);                          // pill inner horizontal padding
const ICON_SIZE = rs(isTablet ? 24 : 22);
const CIRC = rs(isTablet ? 56 : 50);             // active circle diameter
const CIRC_RING = 4;                             // white ring round the circle
const CIRC_ICON = rs(isTablet ? 26 : 24);
const CIRC_TOP = -Math.round(CIRC * 0.38);       // circle rises ~38% above the bar
const LABEL_SIZE = rf(isTablet ? 12 : 11);

// Role-aware tab set. The Tasks/Pickup tile ONLY exists for the two roles that
// actually have that workflow:
//   TECHNICIAN    → "Jobs"   (Laptop) opening TaskReport (Job Report)
//   PICKUP_PERSON → "Pickup" (Truck)  opening PickupAssign
// STAFF has no task/pickup workflow, so they get a clean three-tab bar
// (Home / Attendance / Account) with nothing dangling.
function tabsFor(roleKey) {
  const tabs = [
    { key: 'Home',       label: 'Home',       icon: House,    route: 'Home' },
    { key: 'Attendance', label: 'Attendance', icon: Calendar, route: 'DailyAttendance' },
  ];
  if (roleKey === 'PICKUP_PERSON') {
    tabs.push({ key: 'Tasks', label: 'Pickup', icon: Truck, route: 'PickupAssign' });
  } else if (roleKey === 'TECHNICIAN') {
    tabs.push({ key: 'Tasks', label: 'Jobs', icon: Laptop, route: 'TaskReport' });
  }
  tabs.push({ key: 'Account', label: 'Account', icon: User, route: 'AccountTab' });
  return tabs;
}

export default function BottomTabBar({ active = 'Home', navigation, routeName }) {
  const session = useSelector(selectSession);
  const roleKey = resolveRoleKey(session);
  const insets = useSafeAreaInsets();
  const TABS = useMemo(() => tabsFor(roleKey), [roleKey]);

  const [barW, setBarW] = useState(0);
  const count = TABS.length || 1;
  const slot = barW > 0 ? (barW - TAB_HPAD * 2) / count : 0;

  // Index of the active tab; -1 (e.g. STAFF landing on a Tasks route) falls
  // back to 0 so the circle never sits off-screen.
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.key === active));

  // Seed the animated value at the active index so the circle is already in
  // place on mount. The bar is mounted once around the stack, so a tab change
  // glides the circle across (180 ms, ease-out cubic, no overshoot) and then
  // pulses it 1 → 1.08 → 1 as it lands.
  const anim = useRef(new Animated.Value(activeIndex)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const prevIndex = useRef(activeIndex);
  useEffect(() => {
    if (prevIndex.current === activeIndex) return;
    prevIndex.current = activeIndex;
    Animated.timing(anim, {
      toValue: activeIndex, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 70, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 110, useNativeDriver: true }),
      ]).start();
    });
  }, [activeIndex]);

  const circleX = anim.interpolate({
    inputRange: TABS.map((_, i) => i),
    outputRange: TABS.map((_, i) => TAB_HPAD + i * slot + (slot - CIRC) / 2),
    extrapolate: 'clamp',
  });
  const ActiveIcon = TABS[activeIndex]?.icon;

  return (
    <View
      style={{
        backgroundColor: PAGE_BG, alignItems: 'center',
        paddingTop: rs(8), paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: SIDE_MARGIN,
      }}
    >
      {/* Floating white pill */}
      <View
        onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
        style={{
          width: '100%', maxWidth: MAX_BAR_W,
          flexDirection: 'row', alignItems: 'center',
          height: BAR_H, borderRadius: BAR_H / 2,
          backgroundColor: GLASS_WASH, paddingHorizontal: TAB_HPAD,
          borderWidth: 1, borderColor: GLASS_OUTLINE,
          shadowColor: '#111111', shadowOpacity: 0.10, shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 }, elevation: 8,
        }}
      >
        {TABS.map((t, index) => {
          const Icon = t.icon;
          const isActive = index === activeIndex && active === t.key;
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
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: isActive }}
              // Switch on finger-down, not release — feels instant.
              onPressIn={onPress}
              hitSlop={6}
              style={{ width: slot, height: '100%', alignItems: 'center', justifyContent: 'center' }}
            >
              {isActive ? (
                <Text
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={{ position: 'absolute', bottom: rs(isTablet ? 9 : 8), fontSize: LABEL_SIZE, fontWeight: '800', color: NAV_TEAL }}
                >
                  {t.label}
                </Text>
              ) : (
                <Icon size={ICON_SIZE} color={ICON_OFF} strokeWidth={2} />
              )}
            </Pressable>
          );
        })}

        {/* Raised teal circle — drawn last so it sits above the tabs and rises
            out of the pill; glides between tabs. */}
        {slot > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: CIRC_TOP, left: 0,
              width: CIRC, height: CIRC, borderRadius: CIRC / 2,
              backgroundColor: NAV_TEAL, borderWidth: CIRC_RING, borderColor: '#FFFFFF',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#111111', shadowOpacity: 0.16, shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 }, elevation: 5,
              transform: [{ translateX: circleX }, { scale: pulse }],
            }}
          >
            {ActiveIcon ? <ActiveIcon size={CIRC_ICON} color="#FFFFFF" strokeWidth={2.2} /> : null}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
