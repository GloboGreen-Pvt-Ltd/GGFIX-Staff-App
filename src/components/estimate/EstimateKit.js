// Repair Estimate kit — the Partner App's device-picker / booking primitives
// (components/rnr ScreenHeader · Loader · EmptyState · Button · BottomActionBar,
// components/DeviceImage, screens/shared/device/pickerGrid) for the Employee
// App's My Pickups → Repair Estimate screens, so both apps draw the flow the
// same way. Values are the Partner App's literals; colours are the GGFIX
// palette. Only the estimate screens use this file.
import React, { forwardRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Image, Pressable as RNPressable, StyleSheet, Text as RNText, TextInput as RNTextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, ChevronRight, CircleCheck, Inbox, Phone, Search, User, X } from 'lucide-react-native';
import { interFamily } from '../../theme/typography';
import { resolveDeviceImageSource } from '../../utils/images';

// Pressable that resolves a `style={({ pressed }) => …}` function itself.
// On device this app's NativeWind interop drops function styles on the core
// Pressable (borders / fills vanished — Next, Change, back circles), so every
// estimate screen imports Pressable from here instead of react-native.
export function Pressable({ style, children, onPressIn, onPressOut, ...rest }) {
  const [pressed, setPressed] = useState(false);
  return (
    <RNPressable
      {...rest}
      onPressIn={(e) => { setPressed(true); onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); onPressOut?.(e); }}
      style={typeof style === 'function' ? style({ pressed }) : style}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </RNPressable>
  );
}

export const EST = {
  primary: '#035C6C', navy: '#1C3053', blue: '#0788C9', green: '#609138', orange: '#FAA700', red: '#F32C26',
  white: '#FFFFFF', page: '#F3F4F6', border: '#E5E7EB', text: '#111111', muted: '#6B7280', soft: '#E5F3F5',
  placeholder: '#9CA3AF',
};

// ── Type: Inter by weight + the Partner App's font scale (theme/fontScaling) ─
const { width: W0, height: H0 } = Dimensions.get('window');
const FONT_SCALE = Math.min(Math.max((1 + (Math.min(W0, H0) / 392 - 1) * 0.5) * 0.95, 0.82), 1.06);
export const scaleFont = (size) => (typeof size === 'number' && size > 0 ? Math.round(size * FONT_SCALE * 10) / 10 : size);

function typeStyle(style) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontSize == null && flat.fontWeight == null) return style;
  const { fontSize, lineHeight, fontWeight, ...rest } = flat;
  const size = scaleFont(fontSize ?? 13);
  return {
    ...rest,
    fontFamily: rest.fontFamily || interFamily(fontWeight),
    fontSize: size,
    ...(lineHeight != null ? { lineHeight: scaleFont(lineHeight) } : null),
  };
}
export const EText = forwardRef(({ style, ...props }, ref) => (
  <RNText ref={ref} maxFontSizeMultiplier={1.2} {...props} style={typeStyle(style)} />
));
EText.displayName = 'EText';
export const ETextInput = forwardRef(({ style, ...props }, ref) => (
  <RNTextInput ref={ref} maxFontSizeMultiplier={1.2} placeholderTextColor={EST.placeholder} {...props} style={typeStyle(style)} />
));
ETextInput.displayName = 'ETextInput';

// ── Partner rem (theme/remScaling): NativeWind classNames there are in rem,
// 1rem = 14 × the Partner space scale (≈14.3 on a 411pt phone), so "h-9" is
// 2.25rem ≈ 32pt, not 36. Use rem(n) wherever the Partner uses a className.
const SPACE_SCALE = Math.min(Math.max(1 + (Math.min(W0, H0) / 392 - 1) * 0.5, 0.88), 1.14);
export const REM = Math.round(14 * SPACE_SCALE * 100) / 100;
export const rem = (n) => Math.round(n * REM * 10) / 10;

// ── One grid for every device picker (Partner shared/device/pickerGrid) ────
export const PICKER_PAD = 14;
export const PICKER_GAP = 8;
export function pickerColumns(width, dense = false) {
  if (width >= 1000) return dense ? 7 : 6;
  if (width >= 840) return dense ? 6 : 5;
  if (width >= 600) return dense ? 5 : 4;
  if (width >= 400) return dense ? 4 : 3;
  return 3;
}
/** { numColumns, cardWidth, imageSize } — imageSize is square. */
export function pickerMetrics(width, { dense = false, cardPadding = 6, imageRatio = 1 } = {}) {
  const numColumns = pickerColumns(width, dense);
  const cardWidth = Math.floor((width - PICKER_PAD * 2 - PICKER_GAP * (numColumns - 1)) / numColumns);
  const imageSize = Math.max(28, Math.round((cardWidth - cardPadding * 2) * imageRatio));
  return { numColumns, cardWidth, imageSize };
}

// White card (Partner tiles / sections).
export const cardStyle = {
  backgroundColor: EST.white, borderRadius: 16, borderWidth: 1, borderColor: EST.border,
  shadowColor: '#111111', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};
// Selected tile / option (teal edge on light teal).
export const selectedStyle = { backgroundColor: EST.soft, borderColor: EST.primary, borderWidth: 1.5, shadowOpacity: 0, elevation: 0 };

// ── Header (Partner rnr/ScreenHeader) ──────────────────────────────────────
export function EstimateHeader({ title, subtitle, onBack, right, sticky = true }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[h.bar, sticky && h.sticky, { paddingTop: insets.top + 8 }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go back" style={({ pressed }) => [h.back, pressed && { opacity: 0.7 }]}>
          <ChevronLeft size={20} color={EST.text} />
        </Pressable>
      ) : <View style={h.slot} />}
      <View style={h.mid}>
        <EText numberOfLines={1} style={h.title}>{title}</EText>
        {subtitle ? <EText numberOfLines={1} style={h.sub}>{subtitle}</EText> : null}
      </View>
      <View style={[h.slot, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}
const h = StyleSheet.create({
  // px-3 pb-2 · h-9 w-9 back / slots · title px-2 · subtitle mt-0.5 (rem units).
  bar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: rem(0.75), paddingBottom: rem(0.5), backgroundColor: EST.white,
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  sticky: { borderBottomWidth: 1, borderBottomColor: EST.border },
  back: { height: rem(2.25), width: rem(2.25), borderRadius: rem(1.125), alignItems: 'center', justifyContent: 'center', backgroundColor: EST.page },
  slot: { height: rem(2.25), minWidth: rem(2.25), justifyContent: 'center' },
  mid: { flex: 1, paddingHorizontal: rem(0.5), alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: EST.text },
  sub: { fontSize: 11, color: EST.muted, marginTop: rem(0.125) },
});

// Header search toggle (Partner pickers: magnifier on the right).
export function HeaderSearchButton({ onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Search" style={{ height: rem(2.5), width: rem(2.5), alignItems: 'center', justifyContent: 'center' }}>
      <Search size={22} color={EST.text} />
    </Pressable>
  );
}

// Inline search field (Partner: grey rounded-xl, magnifier, clear ×).
export function SearchField({ value, onChangeText, placeholder = 'Search', autoFocus, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', borderRadius: rem(0.75), paddingHorizontal: rem(0.75), backgroundColor: EST.page }, style]}>
      <Search size={18} color={EST.placeholder} />
      <ETextInput value={value} onChangeText={onChangeText} placeholder={placeholder} autoFocus={autoFocus} returnKeyType="search"
        autoCorrect={false} style={{ flex: 1, paddingVertical: rem(0.625), marginLeft: rem(0.5), fontSize: 13, color: EST.text }} />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search"><X size={18} color={EST.muted} /></Pressable>
      ) : null}
    </View>
  );
}

// ── Catalog image (Partner components/DeviceImage; RN Image here) ─────────
export function DeviceImage({ url, base64, style, contentFit = 'contain' }) {
  const uri = resolveDeviceImageSource({ url, base64 });
  if (!uri) return null;
  return <Image source={{ uri }} style={style} resizeMode={contentFit === 'cover' ? 'cover' : 'contain'} />;
}

// ── Loading / empty (Partner rnr/Loader · rnr/EmptyState) ─────────────────
export function PickerLoader({ label, inline }) {
  if (inline) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
        <ActivityIndicator color={EST.primary} size="small" />
        {label ? <EText style={{ marginLeft: 8, fontSize: 12, color: EST.muted }}>{label}</EText> : null}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: EST.page, paddingVertical: 40 }}>
      <ActivityIndicator color={EST.primary} size="large" />
      {label ? <EText style={{ marginTop: 12, fontSize: 13, color: EST.muted }}>{label}</EText> : null}
    </View>
  );
}
export function PickerEmpty({ icon, title = 'Nothing here yet', description, actionLabel, onAction }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 56 }}>
      <View style={{ height: 96, width: 96, borderRadius: 48, backgroundColor: EST.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        {icon || <Inbox size={40} color={EST.primary} />}
      </View>
      <EText style={{ fontSize: 15, fontWeight: '800', color: EST.text, textAlign: 'center' }}>{title}</EText>
      {description ? <EText style={{ fontSize: 13, color: EST.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>{description}</EText> : null}
      {actionLabel ? <EButton onPress={onAction} style={{ marginTop: 24, paddingHorizontal: 28 }}>{actionLabel}</EButton> : null}
    </View>
  );
}

// ── Button (Partner rnr/Button) ────────────────────────────────────────────
const BTN_BG = { primary: EST.primary, outline: EST.white, soft: EST.soft, destructive: EST.red, ghost: 'transparent', success: EST.green };
const BTN_FG = { primary: EST.white, outline: EST.primary, soft: EST.primary, destructive: EST.white, ghost: EST.primary, success: EST.white };
const BTN_PAD = { default: { paddingVertical: 10, paddingHorizontal: 20 }, sm: { paddingVertical: 8, paddingHorizontal: 14 }, lg: { paddingVertical: 12, paddingHorizontal: 24 } };
const BTN_RADIUS = { default: 16, sm: 12, lg: 16 };
export function EButton({ children, onPress, variant = 'primary', size = 'default', loading, disabled, leftIcon, rightIcon, style, textStyle }) {
  const flat = variant === 'outline' || variant === 'ghost' || variant === 'soft';
  const shadow = flat ? null : (size === 'sm'
    ? { shadowColor: EST.primary, shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 }
    : { shadowColor: EST.primary, shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 });
  const fg = BTN_FG[variant] || EST.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: BTN_RADIUS[size] || 16,
        backgroundColor: BTN_BG[variant] || EST.primary, minHeight: size === 'sm' ? 38 : 46,
      }, BTN_PAD[size] || BTN_PAD.default, variant === 'outline' && { borderWidth: 1, borderColor: EST.primary }, shadow,
      (disabled && !loading) && { opacity: 0.5 }, pressed && { opacity: 0.85 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : (
        <>
          {leftIcon ? <View style={{ marginRight: 8 }}>{leftIcon}</View> : null}
          <EText numberOfLines={1} style={[{ flexShrink: 1, fontSize: size === 'sm' ? 13 : 16, fontWeight: '700', letterSpacing: 0.3, color: fg }, textStyle]}>{children}</EText>
          {rightIcon ? <View style={{ marginLeft: 8 }}>{rightIcon}</View> : null}
        </>
      )}
    </Pressable>
  );
}

// ── Sticky bottom bar (Partner rnr/BottomActionBar) ────────────────────────
// Absolutely positioned at the screen bottom (the app's tab bar sits below
// the screen, so no system inset is added): give the scroll content
// BOTTOM_BAR_SPACE of bottom padding so the last card clears it.
export const BOTTOM_BAR_SPACE = 104;
export function EstimateBottomBar({ title = 'Continue', onPress, loading, disabled, priceCaption, priceValue, priceLabel, children }) {
  const hasPrice = priceLabel != null || priceValue != null;
  const insets = useSafeAreaInsets(); // clear the Android nav bar (edge-to-edge)
  return (
    <View style={[b.bar, { paddingBottom: 12 + insets.bottom }]}>
      <View style={b.inner}>
        {hasPrice ? (
          <View style={{ marginRight: 12, maxWidth: '46%' }}>
            {priceCaption ? <EText style={b.cap} numberOfLines={1}>{priceCaption}</EText> : null}
            <EText style={b.price} numberOfLines={1}>{priceValue}</EText>
            {priceLabel ? <EText style={b.cap} numberOfLines={1}>{priceLabel}</EText> : null}
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          {children ?? (
            <EButton onPress={onPress} loading={loading} disabled={disabled} rightIcon={<ChevronRight size={18} color="#FFFFFF" />}>{title}</EButton>
          )}
        </View>
      </View>
    </View>
  );
}
const b = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: EST.white, borderTopWidth: 1, borderTopColor: EST.border,
    paddingHorizontal: 16, paddingTop: 12,
    shadowColor: '#111111', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, elevation: 14,
  },
  inner: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 720, alignSelf: 'center' },
  cap: { fontSize: 11, color: EST.muted },
  price: { fontSize: 15, fontWeight: '800', color: EST.text, lineHeight: 20 },
});

// ── Booking steps (Partner service-booking-shop/BookingSteps StepProgress) ──
// Customer → Devices → Confirm; `active` is the current step's index. For a
// pickup the customer comes from the booking, so Devices pages pass 1.
const BOOKING_STEPS = ['Customer', 'Devices', 'Confirm'];
export function StepProgress({ active = 0 }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8, backgroundColor: EST.white }}>
      {BOOKING_STEPS.map((label, i) => {
        const on = i === active;
        const done = i < active;
        return (
          <React.Fragment key={label}>
            {i > 0 ? <View style={{ flex: 1, height: 2, borderRadius: 1, marginHorizontal: 6, backgroundColor: done || on ? EST.primary : EST.border }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on || done ? EST.primary : EST.white, borderWidth: 1.5, borderColor: on || done ? EST.primary : EST.border,
              }}>
                {done ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : (
                  <EText style={{ fontSize: 10.5, fontWeight: '800', color: on ? EST.white : EST.muted }}>{i + 1}</EText>
                )}
              </View>
              <EText style={{ marginLeft: 5, fontSize: 12, fontWeight: on ? '800' : '600', color: on || done ? EST.primary : EST.muted }}>{label}</EText>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Customer summary card (Partner Review & Confirm / Devices & Repair) ────
// Mint card: white icon tile, name, phone, and a pill on the right (`badge`).
export function CustomerCard({ name, phone, badge, onPress, compact }) {
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap onPress={onPress} style={{
      borderRadius: 16, backgroundColor: compact ? EST.white : EST.soft, borderWidth: 1, borderColor: compact ? EST.border : '#C7E6EA',
      paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center',
    }}>
      {compact ? (
        <View style={{ height: 36, width: 36, borderRadius: 18, marginRight: 10, backgroundColor: EST.soft, alignItems: 'center', justifyContent: 'center' }}>
          <User size={17} color={EST.primary} strokeWidth={2} />
        </View>
      ) : (
        <View style={{ height: 46, width: 46, borderRadius: 23, marginRight: 12, backgroundColor: EST.primary, alignItems: 'center', justifyContent: 'center' }}>
          <EText style={{ fontSize: 17, fontWeight: '800', color: EST.white }}>{String(name || 'C').trim().charAt(0).toUpperCase()}</EText>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {compact ? <EText style={{ fontSize: 11, color: EST.muted }}>Customer</EText> : null}
        <EText style={{ fontSize: 15, fontWeight: '800', color: EST.text }} numberOfLines={1}>
          {name || 'Customer'}{compact && phone ? <EText style={{ fontSize: 13, fontWeight: '500', color: EST.muted }}>{`  ·  ${phone}`}</EText> : null}
        </EText>
        {!compact && phone ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Phone size={11} color={EST.muted} strokeWidth={2} />
            <EText style={{ fontSize: 11, color: EST.muted, marginLeft: 4 }}>{phone}</EText>
          </View>
        ) : null}
      </View>
      {badge ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: EST.white, borderWidth: compact ? 1 : 0, borderColor: EST.border }}>
          <CircleCheck size={11} color={EST.primary} strokeWidth={2} />
          <EText style={{ fontSize: 10, fontWeight: '800', color: EST.primary, marginLeft: 3 }} numberOfLines={1}>{badge}</EText>
        </View>
      ) : null}
    </Wrap>
  );
}

// Section rail: small teal icon, spaced uppercase title, optional right slot.
export function SectionRail({ icon: Icon, title, right, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', paddingTop: 14, paddingBottom: 6 }, style]}>
      {Icon ? <Icon size={14} color={EST.primary} strokeWidth={2} /> : null}
      <EText style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: EST.text, marginLeft: Icon ? 6 : 0 }}>{title}</EText>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

// Selected check badge (top-right of a selected tile).
export function SelectedBadge({ size = 18, top = 6, right = 6 }) {
  return (
    <View style={{ position: 'absolute', top, right, height: size, width: size, borderRadius: size / 2, backgroundColor: EST.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Check size={Math.round(size * 0.6)} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}
