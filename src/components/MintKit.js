import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, Cloud, Leaf } from 'lucide-react-native';
import { rf, rlh, rs } from '../utils/responsive';

// Presentation building blocks shared by the mint-styled report screens
// (Leave Report, Assign Pickup): month card, metric card, section card and an
// illustrated empty state. Pure UI — every value and handler comes from the
// calling screen.

export const MINT = {
  deep: '#09AD2A',
  primary: '#09AD2A',
  bright: '#09AD2A',
  mint: '#E6F7EA',
  softMint: '#F3FBF4',
  bg: '#F8F8F8',
  card: '#FFFFFF',
  border: '#ECECEC',
  text: '#1E1E1E',
  muted: '#6E6E6E',
};

export const mintShadow = {
  shadowColor: '#1E1E1E', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

// Soft decorative blob tucked into a card's bottom-right corner. The parent
// must clip (overflow: 'hidden').
function Wave({ color, size }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: -size * 0.35, bottom: -size * 0.55 }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.55 }} />
    </View>
  );
}

// "This Month" card with the month stepper. `inline` puts the stepper beside
// the title (wide screens); otherwise it drops onto its own row.
export function MonthCard({ title = 'This Month', subtitle, monthLabel, onPrev, onNext, inline }) {
  const cal = rs(32);
  const stepper = (
    <View style={{
      flexDirection: 'row', alignItems: 'center', alignSelf: inline ? 'center' : 'stretch',
      marginTop: inline ? 0 : rs(8), borderWidth: 1.5, borderColor: '#CFEFD6', borderRadius: 999,
      backgroundColor: '#FFFFFF', paddingLeft: rs(6),
    }}>
      <TouchableOpacity onPress={onPrev} hitSlop={6} style={{ padding: rs(6) }} accessibilityLabel="Previous month">
        <ChevronLeft size={rs(18)} color={MINT.deep} strokeWidth={2.6} />
      </TouchableOpacity>
      <Text style={{ flex: inline ? 0 : 1, textAlign: 'center', fontSize: rf(12.5), fontWeight: '700', color: MINT.deep, marginHorizontal: rs(4) }} numberOfLines={1}>
        {monthLabel}
      </Text>
      <TouchableOpacity onPress={onNext} hitSlop={6} style={{ padding: rs(6) }} accessibilityLabel="Next month">
        <ChevronRight size={rs(18)} color={MINT.deep} strokeWidth={2.6} />
      </TouchableOpacity>
      <View style={{ width: cal, height: cal, borderRadius: cal / 2, backgroundColor: MINT.deep, alignItems: 'center', justifyContent: 'center', marginLeft: rs(4) }}>
        <Calendar size={rs(15)} color="#FFFFFF" strokeWidth={2.2} />
      </View>
    </View>
  );
  return (
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: '#ECECEC',
      paddingVertical: rs(8), paddingHorizontal: rs(12), overflow: 'hidden', ...mintShadow,
    }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: -rs(40), bottom: -rs(70), width: rs(150), height: rs(110), borderRadius: rs(75), backgroundColor: '#EEF9F0' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, marginRight: inline ? rs(10) : 0 }}>
          <Text style={{ fontSize: rf(16), fontWeight: '800', color: MINT.text }} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: rf(11), color: MINT.muted, marginTop: 1 }} numberOfLines={2}>{subtitle}</Text>
          ) : null}
        </View>
        {inline ? stepper : null}
      </View>
      {inline ? null : stepper}
    </View>
  );
}

// Metric tile: coloured icon tile, label and a big count. `inline` puts the
// label beside the icon (wide tiles); otherwise it sits under it.
export function MetricCard({ width, icon: Icon, label, value, tint, inline }) {
  const tile = rs(30);
  return (
    <View style={{
      width, backgroundColor: tint.bg, borderRadius: rs(14), borderWidth: 1, borderColor: tint.border,
      padding: rs(8), overflow: 'hidden', minHeight: rs(78), ...mintShadow,
    }}>
      <Wave color={tint.wave} size={Math.max(rs(70), width * 0.7)} />
      <View style={{ flexDirection: inline ? 'row' : 'column', alignItems: inline ? 'center' : 'flex-start' }}>
        <View style={{ width: tile, height: tile, borderRadius: rs(9), backgroundColor: tint.tile, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={rs(15)} color={tint.icon} strokeWidth={2.4} />
        </View>
        <Text
          style={{ fontSize: rf(11.5), color: MINT.text, fontWeight: '500', marginLeft: inline ? rs(8) : 0, marginTop: inline ? 0 : rs(6), flexShrink: 1 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: rf(21), fontWeight: '800', color: MINT.text, marginTop: rs(2) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

// White section card with the vertical green accent bar and a bold title.
export function SectionCard({ title, children, style, compact }) {
  return (
    <View style={[{
      backgroundColor: MINT.card, borderRadius: rs(16), borderWidth: 1, borderColor: MINT.border,
      padding: rs(compact ? 9 : 11), ...mintShadow,
    }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: rs(compact ? 6 : 8) }}>
        <View style={{ width: rs(3), height: rs(15), borderRadius: 2, backgroundColor: MINT.primary, marginRight: rs(8) }} />
        <Text style={{ fontSize: rf(compact ? 14 : 15), fontWeight: '800', color: MINT.text }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// Wide hero card: icon disc, title + subtitle, and an optional `art` node on
// the right (decorative only).
export function HeroCard({ icon: Icon, title, subtitle, art }) {
  const disc = rs(48);
  return (
    <View style={{
      backgroundColor: '#F3FBF4', borderRadius: rs(16), borderWidth: 1, borderColor: '#ECECEC',
      padding: rs(12), overflow: 'hidden', flexDirection: 'row', alignItems: 'center', ...mintShadow,
    }}>
      <View pointerEvents="none" style={{ position: 'absolute', right: -rs(30), bottom: -rs(60), width: rs(200), height: rs(140), borderRadius: rs(100), backgroundColor: '#EEF9F0' }} />
      <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: MINT.mint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(23)} color={MINT.deep} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, marginLeft: rs(14), marginRight: art ? rs(8) : 0 }}>
        <Text style={{ fontSize: rf(16), fontWeight: '800', color: MINT.text }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: rf(11.5), color: MINT.muted, marginTop: 2, lineHeight: rlh(15) }} numberOfLines={3}>{subtitle}</Text> : null}
      </View>
      {art || null}
    </View>
  );
}

// Compact centred stepper pill: ‹ [calendar + label] ›
export function CenterStepper({ label, onPrev, onNext, prevLabel = 'Previous', nextLabel = 'Next' }) {
  return (
    <View style={{
      alignSelf: 'center', flexDirection: 'row', alignItems: 'center', marginTop: rs(14),
      backgroundColor: '#FFFFFF', borderRadius: 999, borderWidth: 1, borderColor: MINT.border,
      paddingHorizontal: rs(6), paddingVertical: rs(4), ...mintShadow,
    }}>
      <TouchableOpacity onPress={onPrev} hitSlop={6} style={{ padding: rs(8) }} accessibilityLabel={prevLabel}>
        <ChevronLeft size={rs(18)} color={MINT.deep} strokeWidth={2.6} />
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(8), backgroundColor: MINT.softMint, borderRadius: 999, paddingHorizontal: rs(14), paddingVertical: rs(6) }}>
        <Calendar size={rs(15)} color={MINT.deep} strokeWidth={2.2} />
        <Text style={{ fontSize: rf(13), fontWeight: '700', color: MINT.text }} numberOfLines={1}>{label}</Text>
      </View>
      <TouchableOpacity onPress={onNext} hitSlop={6} style={{ padding: rs(8) }} accessibilityLabel={nextLabel}>
        <ChevronRight size={rs(18)} color={MINT.deep} strokeWidth={2.6} />
      </TouchableOpacity>
    </View>
  );
}

// Illustrated empty state built from icons: a main icon on a mint disc with a
// small accent icon, soft cloud + leaf props, and the message below. Optional
// `title` adds a bold heading; optional `action` ({ label, onPress, busy,
// icon }) adds a green button wired to a handler the screen already owns.
export function EmptyState({ icon: Icon, accent: Accent, text, title, action, compact }) {
  const disc = rs(compact ? 60 : 84);
  return (
    <View style={{ backgroundColor: '#F8F8F8', borderRadius: rs(18), paddingVertical: rs(compact ? 12 : 20), paddingHorizontal: rs(12), alignItems: 'center' }}>
      <View style={{ width: rs(compact ? 170 : 200), height: disc + rs(8), alignItems: 'center', justifyContent: 'center' }}>
        <Cloud size={rs(compact ? 26 : 34)} color="#DDEEE0" fill="#EEF6EF" style={{ position: 'absolute', left: rs(8), top: rs(compact ? 12 : 18) }} />
        <Leaf size={rs(compact ? 24 : 30)} color="#CFEFD6" fill="#E6F7EA" style={{ position: 'absolute', right: rs(18), bottom: rs(4) }} />
        <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: '#E6F7EA', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={rs(compact ? 30 : 40)} color="#6CC981" strokeWidth={1.8} />
        </View>
        {Accent ? (
          <View style={{ position: 'absolute', right: rs(compact ? 40 : 44), top: rs(compact ? 2 : 4) }}>
            <Accent size={rs(compact ? 20 : 26)} color={MINT.bright} strokeWidth={2} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', bottom: 0, width: rs(compact ? 120 : 150), height: rs(compact ? 5 : 6), borderRadius: rs(3), backgroundColor: '#EDEDED' }} />
      </View>
      {title ? (
        <Text style={{ fontSize: rf(16), fontWeight: '800', color: MINT.text, marginTop: rs(12), textAlign: 'center' }}>{title}</Text>
      ) : null}
      <Text style={{ fontSize: rf(compact ? 13 : 14), color: MINT.muted, marginTop: title ? rs(4) : rs(compact ? 8 : 12), textAlign: 'center', lineHeight: rlh(compact ? 18 : 19) }}>{text}</Text>
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          disabled={action.busy}
          activeOpacity={0.85}
          style={{
            marginTop: rs(14), flexDirection: 'row', alignItems: 'center', gap: rs(8),
            backgroundColor: MINT.primary, borderRadius: 999, paddingHorizontal: rs(22), height: rs(38),
            opacity: action.busy ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: rf(13), fontWeight: '700' }}>{action.label}</Text>
          {action.busy
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : action.icon ? <action.icon size={rs(16)} color="#FFFFFF" strokeWidth={2.4} /> : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
