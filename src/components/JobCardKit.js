import React, { useEffect, useState } from 'react';
import { View, Text as RNText, StyleSheet, ScrollView, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Laptop, ScanLine, Search, Smartphone } from 'lucide-react-native';
import { rf, rlh, rs } from '../utils/responsive';
import { interFamily } from '../theme/typography';
import { resolveDeviceImageSource } from '../utils/images';
import { listBrands, listModelsForBrand } from '../api/master';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

// The Partner app's Job Report look (header, month bar, gradient status rail,
// picture job card), shared by Job Assign and My Jobs / Job Report.
//
// Sizes are the Partner screen's, measured off its Job Report. The app's
// <Text> snaps every size to 11/14/16/20, which can't hit those values, so the
// kit's text uses RN Text with the Inter family set directly (same rf()
// scaling and OS font-scale cap as everywhere else).

export const KIT = {
  teal: '#035C6C', tealTint: '#E5F3F5', navy: '#1C3053', ink: '#111111',
  muted: '#6B7280', line: '#E5E7EB', white: '#FFFFFF', backBg: '#F1F3F5',
};

// Exact-size text: size / lh are rf()/rlh() base values.
export function KText({ size, weight = '400', color = KIT.ink, lh, style, ...rest }) {
  return (
    <RNText
      {...rest}
      style={[{ fontFamily: interFamily(weight), fontSize: rf(size), color }, lh ? { lineHeight: rlh(lh) } : null, style]}
    />
  );
}

// GGFIX brand palette (colour sheet).
export const BRAND = {
  teal: '#035C6C', navy: '#1C3053', blue: '#0788C9', green: '#609138',
  orange: '#FAA700', red: '#F32C26', white: '#FFFFFF', lightGray: '#F3F4F6', black: '#111111',
};

// Gradient tones for any brand colour: near-white top fading to a light tint.
// depth: how much colour the bottom of the gradient takes (0.16 by default).
export function toneOf(color, depth = 0.16) {
  const n = parseInt(String(color).slice(1), 16);
  const mix = (a) => {
    const ch = (v) => Math.round(255 - (255 - v) * a).toString(16).padStart(2, '0');
    return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
  };
  return { top: mix(0.03), bottom: mix(depth), edge: mix(0.28), color };
}

// Soft vertical gradient filling its parent (put it first inside a card).
export function GradientFill({ tone, radius }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[tone.top, tone.bottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
    />
  );
}

// Rail tile palettes: soft white top fading to the category tint.
export const RAIL_TONES = {
  teal: { top: '#F9FEFF', bottom: '#DDF2F4', color: '#0B6A74' },
  orange: { top: '#FFFDF7', bottom: '#FFF1C9', color: '#F4A300' },
  red: { top: '#FFF9F9', bottom: '#FFD9D9', color: '#FF2D2D' },
  green: { top: '#FBFFF8', bottom: '#DDEFCF', color: '#5E9F2E' },
  blue: { top: '#F7FBFF', bottom: '#D9ECF8', color: '#0788C9' },
};

// ---------------------------------------------------------------------------
// Header: round back · centred title + subtitle · search + scan
// ---------------------------------------------------------------------------
export function JobHeader({ navigation, title, sub, searchOn, onSearch, onScan, right }) {
  return (
    <View style={s.headerBar}>
      <View pointerEvents="none" style={s.headerTitles}>
        <KText size={17} weight="800" color={KIT.ink} numberOfLines={1} style={s.center}>{title}</KText>
        {sub ? <KText size={12} weight="600" color={KIT.muted} numberOfLines={1} style={[s.center, { marginTop: 1 }]}>{sub}</KText> : null}
      </View>
      {navigation.canGoBack() ? (
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back" activeOpacity={0.7} style={s.headerBack}>
          <ArrowLeft size={rs(19)} color={KIT.ink} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : <View style={{ width: rs(34) }} />}
      <View style={{ flex: 1 }} />
      {onSearch ? (
        <TouchableOpacity onPress={onSearch} hitSlop={6} accessibilityLabel="Search jobs" activeOpacity={0.8}
          style={[s.headerBtn, { backgroundColor: searchOn ? KIT.teal : KIT.tealTint }]}>
          <Search size={rs(17)} color={searchOn ? KIT.white : KIT.teal} strokeWidth={2.3} />
        </TouchableOpacity>
      ) : null}
      {onScan ? (
        <TouchableOpacity onPress={onScan} hitSlop={6} accessibilityLabel="Scan job QR code" activeOpacity={0.8}
          style={[s.headerBtn, { backgroundColor: KIT.tealTint }]}>
          <ScanLine size={rs(17)} color={KIT.teal} strokeWidth={2.3} />
        </TouchableOpacity>
      ) : null}
      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Month bar: ‹ month + count ›
// ---------------------------------------------------------------------------
export function MonthBar({ title, sub, onPrev, onNext, disabled }) {
  const dim = disabled ? { opacity: 0.4 } : null;
  return (
    <View style={s.monthCard}>
      <TouchableOpacity onPress={onPrev} disabled={disabled} hitSlop={6} accessibilityLabel="Previous month" activeOpacity={0.8} style={[s.monthBtn, dim]}>
        <ChevronLeft size={rs(14)} color={KIT.white} strokeWidth={2.6} />
      </TouchableOpacity>
      <View style={s.monthMid}>
        <KText size={12.5} weight="800" color={KIT.navy} numberOfLines={1}>{title}</KText>
        {sub ? <KText size={10.5} color={KIT.muted} numberOfLines={1}>{sub}</KText> : null}
      </View>
      <TouchableOpacity onPress={onNext} disabled={disabled} hitSlop={6} accessibilityLabel="Next month" activeOpacity={0.8} style={[s.monthBtn, dim]}>
        <ChevronRight size={rs(14)} color={KIT.white} strokeWidth={2.6} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Status rail: gradient tiles, solid icon circle, white-outlined count badge
// ---------------------------------------------------------------------------
const RAIL_RADIUS = rs(15);

// Gradient tile: solid icon circle (white icon), white count badge with a
// coloured outline, label in the tile colour. `tone` is a RAIL_TONES key or a
// { top, bottom, color } set (see toneOf). compact: the smaller size used in
// stat rows. Without onPress it is a plain (non-tappable) tile.
// sub: a short value line under the label (hours, amounts too long for a badge).
// selectTeal: the selected tile gets a teal border + light-teal gradient
// (LeftVerticalSidebar); otherwise it keeps its own colour, a touch heavier.
// noBorder: only the selected tile is outlined.
// softBorder: unselected tiles get a faint edge in their colour and the
// selected one a 2pt border in its colour (Partner Job Report rail).
// labelSize: the rail's shared label size (useUniformLabel) — set, the label
// no longer shrinks on its own; onLabelWidth reports the room the label has.
export function GradientTile({ icon: Icon, tone, label, count, sub, active, onPress, compact, selectTeal, noBorder, softBorder, plain, style, labelSize, onLabelWidth }) {
  const t = typeof tone === 'string' ? (RAIL_TONES[tone] || RAIL_TONES.teal) : tone;
  const tealSel = selectTeal && active;
  // My Jobs rail (softBorder): a much lighter tint, a touch more on the selected tile.
  const fill = tealSel ? { ...RAIL_TONES.teal, color: KIT.teal }
    : softBorder ? toneOf(t.color, active ? 0.1 : 0.06) : t;
  const radius = compact ? rs(12) : RAIL_RADIUS;
  const disc = compact ? rs(26) : rs(33);
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      {...(onPress ? {
        onPress, activeOpacity: 0.8, accessibilityRole: 'tab', accessibilityState: { selected: !!active },
      } : {})}
      accessibilityLabel={[label, count, sub].filter((x) => x != null && x !== '').join(', ')}
      style={[s.railTile, compact && s.tileCompact, {
        borderRadius: radius,
        // Solid top colour under the gradient so the Android elevation shadow renders.
        backgroundColor: plain ? KIT.white : fill.top,
        // plain (My Jobs): white tile, gray borders; the selected one darker / heavier.
        borderColor: plain ? (active ? '#9CA3AF' : KIT.line) : softBorder && !active ? (fill.edge || toneOf(fill.color).edge) : fill.color,
        // Thin border; the selected filter's is a touch heavier.
        borderWidth: active ? (tealSel ? 1.8 : softBorder ? 2 : 1.6) : (noBorder ? 0 : 1),
        shadowColor: fill.color,
        // My Jobs rail: a soft, light grey shadow behind each tile (Partner reference).
        ...(softBorder ? { shadowColor: '#111111', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 } : null),
      }, style]}
    >
      {plain ? null : <GradientFill tone={fill} radius={radius} />}
      <View>
        <View style={[s.railDisc, { width: disc, height: disc, borderRadius: disc / 2, backgroundColor: t.color }]}>
          <Icon size={compact ? rs(13) : rs(15)} color={KIT.white} strokeWidth={2.5} />
        </View>
        {count != null && count !== '' ? (
          <View style={[s.railBadge, compact && s.badgeCompact, { borderColor: plain ? KIT.line : t.color }]}>
            <KText size={compact ? 9 : 10} weight="800" color={plain ? KIT.ink : t.color} numberOfLines={1}>{typeof count === 'number' && count > 99 ? '99+' : count}</KText>
          </View>
        ) : null}
      </View>
      <KText
        size={labelSize || (compact ? 10 : 11.5)}
        weight="800"
        color={plain ? KIT.ink : t.color}
        numberOfLines={1}
        adjustsFontSizeToFit={!labelSize}
        minimumFontScale={0.7}
        onLayout={onLabelWidth ? (e) => onLabelWidth(e.nativeEvent.layout.width) : undefined}
        style={[s.center, { marginTop: compact ? rs(4) : rs(5), alignSelf: 'stretch' }]}
      >
        {label}
      </KText>
      {sub != null && sub !== '' ? (
        <KText size={compact ? 9.5 : 10.5} weight="700" color={KIT.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
          style={[s.center, { marginTop: 1, alignSelf: 'stretch' }]}>
          {sub}
        </KText>
      ) : null}
    </Wrap>
  );
}

// Sidebar width: ~74 on phones, proportionally wider on tablets. Screens that
// size their content from the window subtract it.
export function useSidebarWidth() {
  const { width } = useWindowDimensions();
  return width >= 600 ? rs(96) : rs(74);
}

// Left vertical sidebar (Partner Job Report): gradient tiles one below the
// other, fixed while the page content beside it scrolls; it scrolls on its own
// when the tiles outgrow the height.
//   items: [{ key, label, icon, tone | color, count?, sub?, onPress? }]
//   A tile is tappable when it has onPress, or when onPick is given and the
//   item isn't `static` (summary-only tiles such as hours or amounts).
// One label size for a whole rail: the largest (up to `base`) at which the
// longest label still fits a tile, so every tile's text is the same size.
// Each label is measured at `base` in a hidden probe; tiles report the room.
const LABEL_BASE = 11.5;
function useUniformLabel(labels, base = LABEL_BASE) {
  const [natural, setNatural] = useState({});
  const [room, setRoom] = useState(0);
  const ready = room > 0 && labels.every((l) => natural[l]);
  const widest = Math.max(0, ...labels.map((l) => natural[l] || 0));
  // 0.96: a little slack so rounding never ends in an ellipsis.
  const size = !ready ? undefined
    : widest <= room * 0.96 ? base : Math.floor(((base * room * 0.96) / widest) * 2) / 2;
  const probe = (
    <View pointerEvents="none" style={s.labelProbe}>
      {labels.map((l) => (
        <KText key={l} size={base} weight="800" numberOfLines={1}
          onLayout={(e) => { const w = e.nativeEvent.layout.width; setNatural((p) => (p[l] === w ? p : { ...p, [l]: w })); }}>
          {l}
        </KText>
      ))}
    </View>
  );
  // The narrowest tile decides (the selected one has a thicker border).
  return { size, probe, onLabelWidth: (w) => setRoom((p) => (p && p <= w ? p : w)) };
}

export function LeftVerticalSidebar({ items, active, onPick }) {
  const width = useSidebarWidth();
  const label = useUniformLabel(items.map((it) => String(it.label)));
  return (
    <>
    {label.probe}
    <ScrollView style={[s.rail, { width }]} contentContainerStyle={s.railContent} showsVerticalScrollIndicator={false}>
      {items.map((it) => {
        const press = it.onPress || (onPick && !it.static ? () => onPick(it.key) : undefined);
        return (
          <GradientTile
            key={it.key}
            icon={it.icon}
            tone={it.tone || toneOf(it.color)}
            label={it.label}
            count={it.count}
            sub={it.sub}
            active={active === it.key}
            softBorder
            plain
            onPress={press}
            labelSize={label.size}
            onLabelWidth={label.onLabelWidth}
          />
        );
      })}
    </ScrollView>
    </>
  );
}

// Sidebar on the left, the page's own (scrolling) content on the right.
export function SidebarLayout({ sidebar, children }) {
  return (
    <View style={s.sideRow}>
      {sidebar}
      <View style={s.sideMain}>{children}</View>
    </View>
  );
}

function RailTile({ item, count, active, onPress, noBorder, softBorder, plain, labelSize, onLabelWidth }) {
  return (
    <GradientTile
      icon={item.icon} tone={item.tone} label={item.label} count={count} active={active} onPress={onPress}
      noBorder={noBorder} softBorder={softBorder} plain={plain} labelSize={labelSize} onLabelWidth={onLabelWidth}
    />
  );
}

// items: [{ key, label, icon, tone }]; counts: { [key]: n }.
// Every rail uses the My Jobs look by default (white tile, grey edge, soft shadow).
export function JobRail({ items, counts, active, onPick, noBorder, softBorder = true, plain = true }) {
  const label = useUniformLabel(items.map((it) => String(it.label)));
  return (
    <>
    {label.probe}
    <ScrollView style={s.rail} contentContainerStyle={s.railContent} showsVerticalScrollIndicator={false}>
      {items.map((it) => (
        <RailTile key={it.key} item={it} count={counts[it.key] ?? 0} active={active === it.key} onPress={() => onPick(it.key)} noBorder={noBorder} softBorder={softBorder} plain={plain}
          labelSize={label.size} onLabelWidth={label.onLabelWidth} />
      ))}
    </ScrollView>
    </>
  );
}

// ---------------------------------------------------------------------------
// Device photo (ticket image → catalogue model image); icon fallback
// ---------------------------------------------------------------------------
const LAPTOP_RE = /(laptop|notebook|macbook|chromebook|thinkpad|ideapad|vivobook|zenbook|xps|inspiron|latitude|vostro|pavilion|elitebook|probook|envy|spectre|omen|aspire|swift|predator|nitro|rog|tuf|legion|yoga|surface\s*(laptop|book)|galaxy\s*book|matebook|gram)/i;

// brandId → Promise<models[]>, shared by every card so each brand is fetched once.
const modelsByBrand = new Map();
const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
// One catalogue brands list, for rows that carry brand / model names but no ids (sell pickups).
let brandsList = null;
function brandIdByName(name) {
  if (!brandsList) brandsList = listBrands().catch(() => { brandsList = null; return []; });
  return brandsList.then((all) => (all || []).find((b) => norm(b.name) === norm(name))?.id || null);
}
function modelImageFor(ticket) {
  const byIds = !!(ticket?.brandId && ticket?.modelId);
  if (!byIds && !(ticket?.brandName && ticket?.modelName)) return Promise.resolve(null);
  return (byIds ? Promise.resolve(ticket.brandId) : brandIdByName(ticket.brandName)).then((brandId) => {
    if (!brandId) return null;
    if (!modelsByBrand.has(brandId)) {
      modelsByBrand.set(brandId, listModelsForBrand(brandId).catch(() => {
        modelsByBrand.delete(brandId);
        return [];
      }));
    }
    return modelsByBrand.get(brandId).then((models) => {
      const list = models || [];
      const want = norm(ticket.modelName);
      const full = norm(`${ticket.brandName} ${ticket.modelName}`);
      // By id; else the exact name (catalogue names may carry the brand: "Apple iPhone 11 Pro"),
      // else one ending with it, else the longest catalogue name inside it.
      const m = byIds ? list.find((x) => x.id === ticket.modelId)
        : list.find((x) => norm(x.name) === want || norm(x.name) === full)
          || list.find((x) => norm(x.name).endsWith(` ${want}`))
          || list.filter((x) => x.name && full.includes(norm(x.name))).sort((a, b) => b.name.length - a.name.length)[0];
      return resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 });
    });
  });
}

// Default device picture when the card has no image (e.g. a pickup not yet accepted).
function DefaultDeviceArt({ laptop, tone }) {
  return laptop ? (
    <Svg width="100%" height="100%" viewBox="0 0 100 70" preserveAspectRatio="xMidYMid meet">
      <Defs><SvgGradient id="lapScreen" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#E5F3F5" /><Stop offset="1" stopColor="#FFFFFF" /></SvgGradient></Defs>
      <Rect x="14" y="6" width="72" height="48" rx="5" fill={tone} />
      <Rect x="18" y="10" width="64" height="40" rx="2.5" fill="url(#lapScreen)" />
      <Rect x="26" y="18" width="22" height="4" rx="2" fill={tone} opacity="0.25" />
      <Rect x="26" y="26" width="40" height="4" rx="2" fill={tone} opacity="0.15" />
      <Path d="M6 58 H94 L88 64 H12 Z" fill={tone} opacity="0.85" />
    </Svg>
  ) : (
    <Svg width="100%" height="100%" viewBox="0 0 60 100" preserveAspectRatio="xMidYMid meet">
      <Defs><SvgGradient id="phoneScreen" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#E5F3F5" /><Stop offset="1" stopColor="#FFFFFF" /></SvgGradient></Defs>
      <Rect x="8" y="2" width="44" height="96" rx="10" fill={tone} />
      <Rect x="12" y="9" width="36" height="82" rx="6" fill="url(#phoneScreen)" />
      <Rect x="24" y="4.5" width="12" height="2.4" rx="1.2" fill="#FFFFFF" opacity="0.6" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <Rect key={`${r}${c}`} x={16 + c * 10} y={18 + r * 11} width="7" height="7" rx="2" fill={tone} opacity={0.12 + ((r + c) % 3) * 0.06} />
      )))}
      <Rect x="16" y="78" width="28" height="5" rx="2.5" fill={tone} opacity="0.2" />
    </Svg>
  );
}

export function DevicePhoto({ ticket, tone = KIT.teal }) {
  const hay = [ticket?.deviceDisplayName, ticket?.brandName, ticket?.modelName].filter(Boolean).join(' ');
  const DevIcon = LAPTOP_RE.test(hay) ? Laptop : Smartphone;
  const direct = resolveDeviceImageSource({
    url: ticket.deviceImageUrl || ticket.modelImageUrl,
    base64: ticket.deviceImageBase64 || ticket.modelImageBase64,
  });
  const [src, setSrc] = useState(direct);
  const [failed, setFailed] = useState(false);
  // Follow the data: a card first drawn without an image (preview row, a
  // timed-out load) or with one that failed picks up the image once a
  // refresh brings it — the card stays mounted under the same key.
  useEffect(() => {
    setFailed(false);
    if (direct) { setSrc(direct); return undefined; }
    setSrc(null);
    let alive = true;
    modelImageFor(ticket).then((x) => { if (alive) setSrc(x); });
    return () => { alive = false; };
  }, [ticket.id, ticket.brandId, ticket.modelId, ticket.brandName, ticket.modelName, direct]);
  return src && !failed
    ? <Image source={{ uri: src }} style={s.picImg} resizeMode="contain" onError={() => setFailed(true)} />
    : <View style={s.picImg}><DefaultDeviceArt laptop={DevIcon === Laptop} tone={tone} /></View>;
}

// ---------------------------------------------------------------------------
// Picture job card
// ---------------------------------------------------------------------------
// Left: status tab · device photo · VIEW. A full-height rule. Right: ticket
// number, device (wraps), then `lines` (only the ones with a value), date |
// time, and an optional phase pill or `footer` (e.g. Accept / Reject).
//   lines: [{ icon?, text }] — no icon renders as a plain muted line (customer).
// compact: smaller picture column and 12px detail lines (My Pickups cards).
export function JobPictureCard({
  ticket, tab, tabColor, refText, model, lines = [], date, time, pill, footer, onPress, onLongPress, compact = false, statusLine, statusColor, statusRight, bottomPill,
}) {
  const shown = lines.filter((l) => l && l.text);
  const fs = compact ? 12 : 12.5;
  const lh = compact ? 16.5 : 17.5;
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.9} style={[s.card, statusLine ? { flexDirection: 'column' } : null]}>
    {/* statusLine: full-width bottom row from the card's left edge (Partner Jobs card). */}
    <View style={statusLine ? { flexDirection: 'row' } : { flexDirection: 'row', flex: 1 }}>
      <View style={[s.picCol, compact && s.picColCompact]}>
        <View style={[s.tab, { backgroundColor: tabColor }]}>
          <KText size={11} weight="800" color={KIT.white} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{tab}</KText>
        </View>
        <View style={[s.picBox, compact && s.picBoxCompact]}>
          <DevicePhoto ticket={ticket} tone={tabColor} />
        </View>
        {/* No VIEW button: the whole card opens the job. */}
      </View>
      <View style={s.rule} />

      <View style={s.info}>
        <KText size={11.5} weight="800" color={KIT.teal} lh={15.5} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{refText}</KText>
        <KText size={12.5} weight="800" color={KIT.ink} lh={17} style={{ marginTop: rs(1) }}>{model}</KText>
        {shown.map((l, i) => {
          const Icon = l.icon;
          return Icon ? (
            <View key={i} style={s.line}>
              <Icon size={rs(13)} color={KIT.muted} strokeWidth={2} />
              <KText size={fs} color={KIT.muted} lh={lh} numberOfLines={1} style={s.flex}>{l.text}</KText>
            </View>
          ) : (
            <KText key={i} size={fs} color={KIT.muted} lh={lh} numberOfLines={1} style={s.lineTop}>{l.text}</KText>
          );
        })}
        {date || time ? (
          <View style={s.dateRow}>
            <KText size={fs} color={KIT.muted} lh={lh} numberOfLines={time ? 1 : 2} style={s.shrink}>{date}</KText>
            <KText size={fs} color={KIT.muted} lh={lh} numberOfLines={1} style={s.shrink}>{time}</KText>
          </View>
        ) : null}
        {pill ? (
          <TouchableOpacity onPress={pill.onPress || onPress} activeOpacity={0.8} accessibilityLabel={`${pill.text}, open job`} style={s.pill}>
            <Clock size={rs(13)} color={KIT.teal} strokeWidth={2.3} />
            <KText size={fs} weight="700" color={KIT.teal} numberOfLines={2} style={{ flexShrink: 1 }}>{pill.text}</KText>
            <ChevronRight size={rs(14)} color={KIT.teal} strokeWidth={2.4} />
          </TouchableOpacity>
        ) : null}
        {footer}
      </View>
    </View>
    {statusLine ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: KIT.line, paddingHorizontal: rs(12), paddingVertical: rs(6) }}>
        <KText size={11.5} weight="700" color={statusColor || KIT.teal} numberOfLines={1} style={{ flex: 1 }}>{statusLine}</KText>
        {statusRight}
      </View>
    ) : null}
    {/* bottomPill: full-width action on its own line under the status row. */}
    {bottomPill ? (
      <TouchableOpacity onPress={bottomPill.onPress || onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={bottomPill.text}
        style={[s.pill, { alignSelf: 'stretch', justifyContent: 'center', marginTop: 0, marginHorizontal: rs(10), marginBottom: rs(10) }]}>
        <Clock size={rs(13)} color={KIT.teal} strokeWidth={2.3} />
        <KText size={12.5} weight="700" color={KIT.teal} numberOfLines={1}>{bottomPill.text}</KText>
        <ChevronRight size={rs(14)} color={KIT.teal} strokeWidth={2.4} />
      </TouchableOpacity>
    ) : null}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles (rs()/rf() base values of the Partner screen's dimensions)
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  center: { textAlign: 'center' },
  flex: { flex: 1 },

  headerBar: {
    flexDirection: 'row', alignItems: 'center', gap: rs(9), backgroundColor: KIT.white,
    paddingHorizontal: rs(13), paddingTop: rs(7), paddingBottom: rs(10), borderBottomWidth: 1, borderBottomColor: KIT.line,
  },
  headerTitles: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(96) },
  headerBack: { width: rs(34), height: rs(34), borderRadius: rs(17), backgroundColor: KIT.backBg, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center' },

  monthCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: KIT.white, borderRadius: rs(12),
    borderWidth: 1, borderColor: KIT.line, paddingVertical: rs(5), paddingHorizontal: rs(6), marginBottom: rs(8),
  },
  monthBtn: { width: rs(24), height: rs(24), borderRadius: rs(12), backgroundColor: KIT.teal, alignItems: 'center', justifyContent: 'center' },
  monthMid: { flex: 1, alignItems: 'center', paddingHorizontal: rs(6) },

  rail: { width: rs(74), flexGrow: 0, backgroundColor: KIT.white, borderRightWidth: 1, borderRightColor: KIT.line },
  // Off-screen, unconstrained: each label laid out at its natural width.
  labelProbe: { position: 'absolute', top: 0, left: -2000, width: 1500, opacity: 0, alignItems: 'flex-start' },
  sideRow: { flex: 1, flexDirection: 'row' },
  sideMain: { flex: 1, minWidth: 0 },
  railContent: { paddingHorizontal: rs(5), paddingTop: rs(10), paddingBottom: rs(20), gap: rs(9) },
  railTile: {
    alignItems: 'center', borderRadius: RAIL_RADIUS, paddingTop: rs(11), paddingBottom: rs(9), paddingHorizontal: rs(3),
    shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  railDisc: { width: rs(33), height: rs(33), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center' },
  tileCompact: { paddingTop: rs(8), paddingBottom: rs(6), paddingHorizontal: rs(2), elevation: 1 },
  badgeCompact: { top: -rs(4), right: -rs(10), minWidth: rs(16), height: rs(15), paddingHorizontal: rs(3), borderRadius: rs(8) },
  railBadge: {
    position: 'absolute', top: -rs(5), right: -rs(11), minWidth: rs(18), height: rs(18), paddingHorizontal: rs(4),
    borderRadius: rs(9), alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: KIT.white,
  },

  card: {
    flexDirection: 'row', backgroundColor: KIT.white, borderRadius: rs(16), borderWidth: 1, borderColor: KIT.line,
    marginBottom: rs(12), shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  picCol: { width: '39%', maxWidth: rs(132), paddingBottom: rs(8) },
  // Corner tab hugging the card's top-left, sized to its text.
  tab: {
    alignSelf: 'flex-start', maxWidth: '96%', paddingVertical: rs(3), paddingHorizontal: rs(8),
    borderTopLeftRadius: rs(15), borderBottomRightRadius: rs(11),
  },
  // Grows with the card; the photo fills it (contained, never cropped).
  picBox: { flex: 1, minHeight: rs(76), marginTop: rs(5), paddingHorizontal: rs(10), alignItems: 'center', justifyContent: 'center' },
  picColCompact: { width: '30%', maxWidth: rs(104) },
  picBoxCompact: { minHeight: rs(58), paddingHorizontal: rs(8) },
  picImg: { flex: 1, alignSelf: 'stretch', width: undefined, height: undefined },
  viewPill: {
    alignSelf: 'flex-end', marginRight: rs(9), marginTop: rs(5), paddingHorizontal: rs(13), paddingVertical: rs(2),
    borderWidth: 1.5, borderColor: KIT.teal, borderRadius: 999, backgroundColor: KIT.white,
  },
  rule: { width: 1, backgroundColor: KIT.line },
  info: { flex: 1, minWidth: 0, paddingTop: rs(10), paddingBottom: rs(9), paddingHorizontal: rs(10) },
  line: { flexDirection: 'row', alignItems: 'center', gap: rs(5), marginTop: rs(2) },
  lineTop: { marginTop: rs(2) },
  // Date left, time right; a long time (e.g. a 10:30 AM - 11:05 AM range)
  // drops to its own line instead of running past the card edge.
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: rs(6), marginTop: rs(2) },
  shrink: { flexShrink: 1 },
  pill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: rs(5),
    backgroundColor: KIT.tealTint, borderRadius: rs(9), paddingVertical: rs(4), paddingHorizontal: rs(8), marginTop: rs(5),
  },
});
