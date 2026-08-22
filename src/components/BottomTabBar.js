import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Home, Calendar, Laptop, Truck, User } from 'lucide-react-native';
import colors from '../theme/colors';
import { selectSession } from '../store/authSlice';
import { resolveRoleKey } from '../config/categories';
import { rf } from '../utils/responsive';

// Nominal bar height kept as a named export so useBottomBarInset can size the
// clearance for any screen that lays content under a sticky footer. The bar
// itself is a normal flex child in TechnicianNavigator's screenLayout, so most
// screens don't need to pad for it.
export const TAB_BAR_HEIGHT = 78;

// Brand green — mirrors the customer + shop apps so the three apps share one
// bottom-bar language: white floating capsule, a green-soft pill that sits
// behind the active tab, and green active icon/label.
const TAB_GREEN = '#004C40';
const TAB_GREEN_DARK = '#004C40';
const TAB_GREEN_SOFT = '#DCFCE7';
const TAB_INACTIVE = '#94A3B8';

const TAB_HPAD = 6;       // capsule inner horizontal padding
const TAB_PILL_INSET = 8; // gap between a slot edge and the pill

// Role-aware tab set. The Tasks/Pickup tile ONLY exists for the two roles that
// actually have that workflow:
//   TECHNICIAN    → "Tasks"  (Laptop) opening TaskAssign
//   PICKUP_PERSON → "Pickup" (Truck)  opening PickupAssign
// STAFF has no task/pickup workflow, so they get a clean three-tab bar
// (Home / Attendance / Account) with nothing dangling.
function tabsFor(roleKey) {
  const tabs = [
    { key: 'Home',       label: 'Home',       icon: Home,     route: 'Home' },
    { key: 'Attendance', label: 'Attendance', icon: Calendar, route: 'DailyAttendance' },
  ];
  if (roleKey === 'PICKUP_PERSON') {
    tabs.push({ key: 'Tasks', label: 'Pickup', icon: Truck, route: 'PickupAssign' });
  } else if (roleKey === 'TECHNICIAN') {
    tabs.push({ key: 'Tasks', label: 'Tasks', icon: Laptop, route: 'TaskAssign' });
  }
  tabs.push({ key: 'Account', label: 'Account', icon: User, route: 'AccountTab' });
  return tabs;
}

export default function BottomTabBar({ active = 'Home', navigation }) {
  const session = useSelector(selectSession);
  const roleKey = resolveRoleKey(session);
  const insets = useSafeAreaInsets();
  const TABS = useMemo(() => tabsFor(roleKey), [roleKey]);

  const [barW, setBarW] = useState(0);
  const count = TABS.length || 1;
  const slot = barW > 0 ? (barW - TAB_HPAD * 2) / count : 0;

  // Index of the active tab; -1 (e.g. STAFF landing on a Tasks route) falls
  // back to 0 so the pill never sits off-screen.
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.key === active));

  // Seed the animated value at the active index so the pill is already in place
  // on mount (this bar re-mounts per screen via screenLayout — a spring from 0
  // every navigation would read as jank). It still animates for the rare
  // in-screen active change.
  const anim = useRef(new Animated.Value(activeIndex)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: activeIndex, useNativeDriver: true, friction: 14, tension: 120 }).start();
  }, [activeIndex, slot]);

  const translateX = anim.interpolate({
    inputRange: TABS.map((_, i) => i),
    outputRange: TABS.map((_, i) => TAB_HPAD + i * slot + TAB_PILL_INSET),
    extrapolate: 'clamp',
  });

  return (
    <View style={{ backgroundColor: colors.background, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 14 }}>
      {/* Floating rounded white capsule */}
      <View
        onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: '#FFFFFF', borderRadius: 30,
          paddingHorizontal: TAB_HPAD, height: 62,
          borderWidth: 1, borderColor: 'rgba(15, 23, 42, 0.06)',
          shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 }, elevation: 12,
        }}
      >
        {/* Sliding green pill behind the active tab */}
        {slot > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 8, left: 0,
              width: slot - TAB_PILL_INSET * 2, height: 46, borderRadius: 18,
              backgroundColor: TAB_GREEN_SOFT,
              borderWidth: 1, borderColor: 'rgba(22, 163, 74, 0.14)',
              transform: [{ translateX }],
            }}
          />
        ) : null}

        {TABS.map((t, index) => {
          const Icon = t.icon;
          const isActive = index === activeIndex && active === t.key;
          const onPress = () => {
            if (isActive) return;
            navigation.navigate(t.route);
          };
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              accessibilityState={isActive ? { selected: true } : {}}
              onPress={onPress}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ width: slot, height: 46, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon size={rf(21)} color={isActive ? TAB_GREEN_DARK : TAB_INACTIVE} strokeWidth={2} />
              <Text
                numberOfLines={1}
                allowFontScaling={false}
                style={{ fontSize: rf(10.5), marginTop: 3, color: isActive ? TAB_GREEN_DARK : TAB_INACTIVE, fontWeight: isActive ? '800' : '600' }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
