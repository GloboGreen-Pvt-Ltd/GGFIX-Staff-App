import React from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from './Typography';
import { Calendar, ChevronLeft, ChevronRight, Cloud, Leaf } from 'lucide-react-native';
import { CalendarModal } from './DatePickerField';
import { rf, rlh, rs } from '../utils/responsive';
import { GradientFill, toneOf } from './JobCardKit';

// Presentation building blocks shared by the mint-styled report screens
// (Leave Report, Assign Pickup): month card, metric card, section card and an
// illustrated empty state. Pure UI — every value and handler comes from the
// calling screen.

export const MINT = {
  deep: '#035C6C',
  primary: '#035C6C',
  bright: '#035C6C',
  mint: '#E5F3F5',
  softMint: '#E5F3F5',
  bg: '#F3F4F6',
  card: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111111',
  muted: '#6B7280',
};

export const mintShadow = {
  shadowColor: '#111111', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

// "This Month" card with the month stepper. `inline` puts the stepper beside
// the title (wide screens); otherwise it drops onto its own row.
// App-wide month bar: calendar icon tile + title on the left, ‹ [Month] › on the right.
export function MonthCard({ title = 'This Month', month, year, onChange, style }) {
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB',
      padding: rs(10), ...mintShadow,
    }, style]}>
      <View style={{ width: rs(30), height: rs(30), borderRadius: rs(15), backgroundColor: MINT.deep, alignItems: 'center', justifyContent: 'center' }}>
        <Calendar size={rs(15)} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <Text style={{ flex: 1, marginHorizontal: rs(8), fontSize: rf(15), fontWeight: '800', color: '#1C3053' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Text>
      <MonthPill compact month={month} year={year} onChange={onChange} />
    </View>
  );
}

// Metric tile: coloured icon tile, label and a big count. `inline` puts the
// label beside the icon (wide tiles); otherwise it sits under it.
export function MetricCard({ width, icon, label, value, tint }) {
  return <View style={{ width }}><StatIconCard icon={icon} color={tint?.icon || PALETTE.teal} label={label} value={value} /></View>;
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
        <Text style={{ fontSize: rf(16), fontWeight: '800', color: '#1C3053' }}>{title}</Text>
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
      backgroundColor: '#E5F3F5', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB',
      padding: rs(12), overflow: 'hidden', flexDirection: 'row', alignItems: 'center', ...mintShadow,
    }}>
      <View pointerEvents="none" style={{ position: 'absolute', right: -rs(30), bottom: -rs(60), width: rs(200), height: rs(140), borderRadius: rs(100), backgroundColor: '#E5F3F5' }} />
      <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: MINT.mint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(23)} color={MINT.deep} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, marginLeft: rs(14), marginRight: art ? rs(8) : 0 }}>
        <Text style={{ fontSize: rf(16), fontWeight: '800', color: '#1C3053' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: rf(12), color: '#6B7280', marginTop: 2, lineHeight: rlh(16) }} numberOfLines={3}>{subtitle}</Text> : null}
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
    <View style={{ backgroundColor: '#F3F4F6', borderRadius: rs(18), paddingVertical: rs(compact ? 12 : 20), paddingHorizontal: rs(12), alignItems: 'center' }}>
      <View style={{ width: rs(compact ? 170 : 200), height: disc + rs(8), alignItems: 'center', justifyContent: 'center' }}>
        <Cloud size={rs(compact ? 26 : 34)} color="#E5F3F5" fill="#EEF6EF" style={{ position: 'absolute', left: rs(8), top: rs(compact ? 12 : 18) }} />
        <Leaf size={rs(compact ? 24 : 30)} color="#E5F3F5" fill="#E5F3F5" style={{ position: 'absolute', right: rs(18), bottom: rs(4) }} />
        <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={rs(compact ? 30 : 40)} color="#035C6C" strokeWidth={1.8} />
        </View>
        {Accent ? (
          <View style={{ position: 'absolute', right: rs(compact ? 40 : 44), top: rs(compact ? 2 : 4) }}>
            <Accent size={rs(compact ? 20 : 26)} color={MINT.bright} strokeWidth={2} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', bottom: 0, width: rs(compact ? 120 : 150), height: rs(compact ? 5 : 6), borderRadius: rs(3), backgroundColor: '#E5E7EB' }} />
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

// Brand palette (employee app).
export const PALETTE = {
  teal: '#035C6C', navy: '#1C3053', blue: '#0788C9', green: '#609138',
  orange: '#FAA700', red: '#F32C26', gray: '#6B7280', light: '#F3F4F6', text: '#111111',
};

// Icon-tile colours across the app (count tiles, KPI cards) — the brand
// palette, one meaning per colour: teal = total / all, blue = in progress /
// assigned, orange = pending / waiting / late, red = rejected / absent /
// alerts, green = completed / approved / present, navy = anything else.
// TILE_CYCLE is the order for rows that just need neighbours to differ.
export const TILE_TONES = {
  teal: '#035C6C', navy: '#1C3053', blue: '#0788C9',
  green: '#609138', orange: '#FAA700', red: '#F32C26',
};
export const TILE_CYCLE = [TILE_TONES.teal, TILE_TONES.blue, TILE_TONES.green, TILE_TONES.orange, TILE_TONES.red, TILE_TONES.navy];

// Filled glyph for a tile's icon slot (lucide only ships outline icons):
// wraps an @expo/vector-icons set + name as a component taking the same
// size / color props a lucide icon does (strokeWidth is ignored).
export const solidGlyph = (Set, name) => function SolidGlyph({ size, color }) {
  return <Set name={name} size={size} color={color} />;
};

// Icon tile, style A: solid colour circle + white icon, count badge top-right, label below.
// compact: smaller count badge, ring and label for a tighter tile row.
export function BadgeIconTile({ icon: Icon, color, label, count, active, loading, onPress, size = rs(46), badgeRed, compact }) {
  const n = Number(count) || 0;
  // Badge sized from its text (rf, not the compact rs scale) so the number
  // always fits and reads clearly — single digits stay round, longer values
  // like "60.9" widen the pill instead of spilling over the icon.
  const badge = Math.round(rf(compact ? 17 : 20));
  const body = (
    <View style={{ alignItems: 'center', minWidth: 0 }}>
      <View style={{ padding: rs(compact ? 2 : 3), borderRadius: 999, borderWidth: compact ? 1.5 : 2, borderColor: active ? color : 'transparent' }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Icon size={size * 0.44} color="#FFFFFF" strokeWidth={2.2} />}
        </View>
        {count != null && !loading ? (
          <View style={{
            position: 'absolute', top: -Math.round(badge * 0.3), right: -Math.round(badge * 0.45), minWidth: badge, height: badge, borderRadius: badge / 2,
            paddingHorizontal: Math.round(badge * 0.22),
            backgroundColor: badgeRed ? PALETTE.red : '#FFFFFF', borderWidth: 1.5, borderColor: badgeRed ? '#FFFFFF' : color, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#111111', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
          }}>
            <Text
              style={{ fontSize: rf(compact ? 10 : 11), lineHeight: rf(compact ? 12 : 13.5), fontWeight: '800', color: badgeRed ? '#FFFFFF' : color, includeFontPadding: false, textAlignVertical: 'center' }}
              numberOfLines={1}
            >
              {n > 99 ? '99+' : String(count)}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Fixed size (no auto-shrink) so every label in a row reads the same; long ones wrap. */}
      <Text style={{ fontSize: rf(compact ? 10 : 11), lineHeight: rf(compact ? 12.5 : 14), fontWeight: '700', color: active ? color : PALETTE.text, marginTop: rs(compact ? 3 : 5), textAlign: 'center', paddingHorizontal: 2 }} numberOfLines={compact ? 1 : 2}>{label}</Text>
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${label}: ${count ?? ''}`}>{body}</TouchableOpacity>
  ) : <View style={{ flex: 1 }}>{body}</View>;
}

// Icon card, style B: tinted card, solid circle icon left, big coloured value right, label below.
// compact: smaller disc, value and label with tighter padding.
// Partner gradient look: soft white top fading to a light tint of `color`,
// thin border in the colour, solid icon circle, value and label in the colour.
export function StatIconCard({ icon: Icon, color, label, value, active, onPress, style, compact }) {
  const disc = rs(compact ? 26 : 34);
  const tone = toneOf(color);
  const radius = rs(compact ? 12 : 14);
  const body = (
    <View style={[{
      borderRadius: radius, borderWidth: active ? 1.6 : 1, borderColor: tone.color, backgroundColor: tone.top,
      paddingVertical: rs(compact ? 5 : 8), paddingHorizontal: rs(compact ? 7 : 10),
      shadowColor: tone.color, shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 1,
    }, style]}>
      <GradientFill tone={tone} radius={radius} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={rs(compact ? 13 : 16)} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <Text style={{ flex: 1, textAlign: 'right', fontSize: rf(compact ? 16 : 20), fontWeight: '800', color, marginLeft: rs(6) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{String(value)}</Text>
      </View>
      <Text style={{ fontSize: rf(compact ? 10.5 : 11.5), fontWeight: '700', color, marginTop: rs(compact ? 3 : 6), textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>{body}</TouchableOpacity> : body;
}

// Month navigation (Partner Job Report style): white pill, solid teal ‹ ›
// that step a month, and the month in navy — tap it to pick any month/year.
// `month` is 1-based; onChange(month, year).
// compact: smaller arrows and text, no calendar glyph — fits beside a title.
export function MonthPill({ month, year, onChange, compact }) {
  const [open, setOpen] = React.useState(false);
  const label = `${MONTH_NAMES[month - 1]?.slice(0, 3) || ''} ${year}`;
  const step = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    onChange?.(d.getMonth() + 1, d.getFullYear());
  };
  const a = compact ? rs(20) : rs(24);
  const arrow = { width: a, height: a, borderRadius: a / 2, backgroundColor: MINT.deep, alignItems: 'center', justifyContent: 'center' };
  return (
    <>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#FFFFFF', borderRadius: 999,
        borderWidth: 1, borderColor: '#E5E7EB', padding: compact ? rs(2) : rs(3), flexShrink: 0,
      }}>
        <TouchableOpacity onPress={() => step(-1)} hitSlop={6} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Previous month" style={arrow}>
          <ChevronLeft size={compact ? rs(12) : rs(14)} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Select month, ${label}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: rs(4), paddingHorizontal: compact ? rs(2) : rs(4), minHeight: a }}>
          {compact ? null : <Calendar size={rs(12)} color="#1C3053" strokeWidth={2.2} />}
          <Text style={{ fontSize: compact ? rf(11) : rf(12.5), fontWeight: '800', color: '#1C3053' }} numberOfLines={1}>{label}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => step(1)} hitSlop={6} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Next month" style={arrow}>
          <ChevronRight size={compact ? rs(12) : rs(14)} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>
      </View>
      <CalendarModal
        visible={open}
        monthOnly
        title="Select month"
        initial={`${year}-${String(month).padStart(2, '0')}-01`}
        onCancel={() => setOpen(false)}
        onSave={(iso) => { setOpen(false); if (iso) onChange?.(Number(iso.slice(5, 7)), Number(iso.slice(0, 4))); }}
      />
    </>
  );
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
