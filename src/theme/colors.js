/**
 * App theme colors. The `tokens` block holds the canonical palette that's
 * mirrored in tailwind.config.js — use those in NativeWind className strings:
 *   <View className="bg-primary" />.
 * The other named exports are kept for screens that still use StyleSheet.
 */
const tokens = {
  primary: '#00008B',
  secondary: '#2563EB',
  background: '#FFFFFF',
  card: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#004C40',
  warning: '#F59E0B',
  danger: '#EF4444',
  error: '#EF4444',
};

export default {
  ...tokens,

  primaryLight: '#1E1EAC',
  backgroundCard: tokens.card,
  inputBg: '#F1F5F9',
  textSecondary: tokens.textMuted,
  headerBg: '#FFFFFF',
  headerText: tokens.text,
  tabBarBg: tokens.card,
  tabBarActive: tokens.primary,
  tabBarInactive: tokens.textMuted,
  backButtonBg: '#F1F5F9',
  backButtonIcon: tokens.text,
};

export { tokens };
