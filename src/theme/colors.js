/**
 * App theme colors. The `tokens` block holds the canonical palette that's
 * mirrored in tailwind.config.js — use those in NativeWind className strings:
 *   <View className="bg-primary" />.
 * The other named exports are kept for screens that still use StyleSheet.
 */
const tokens = {
  primary: '#035C6C',
  secondary: '#035C6C',
  background: '#FFFFFF',
  card: '#FFFFFF',
  text: '#111111',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  success: '#609138',
  warning: '#FAA700',
  danger: '#F32C26',
  error: '#F32C26',
};

export default {
  ...tokens,

  primaryLight: '#035C6C',
  backgroundCard: tokens.card,
  inputBg: '#F3F4F6',
  textSecondary: tokens.textMuted,
  headerBg: '#FFFFFF',
  headerText: tokens.text,
  tabBarBg: tokens.card,
  tabBarActive: tokens.primary,
  tabBarInactive: tokens.textMuted,
  backButtonBg: '#F3F4F6',
  backButtonIcon: tokens.text,
};

export { tokens };
