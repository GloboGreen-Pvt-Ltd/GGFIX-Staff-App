/**
 * App theme colors. The `tokens` block holds the canonical palette that's
 * mirrored in tailwind.config.js — use those in NativeWind className strings:
 *   <View className="bg-primary" />.
 * The other named exports are kept for screens that still use StyleSheet.
 */
// Brand palette (Near G Fix):
//   primary  Teal        #035C6C  primary buttons, header, key UI
//   navy     Navy        #1C3053  headings, navigation, important text
//   blue     Bright Blue #0788C9  links, secondary buttons, interactive icons
//   success  Green       #609138  success, in stock, positive states
//   warning  Orange      #FAA700  offers, CTAs, highlights
//   danger   Red         #F32C26  sale badges, discounts, alerts
//   card     White       #FFFFFF  page background, cards, content
//   surface  Light Gray  #F3F4F6  section backgrounds, borders, dividers
//   text     Black       #111111  body text, icons, high contrast
const tokens = {
  primary: '#035C6C',
  secondary: '#0788C9',
  navy: '#1C3053',
  blue: '#0788C9',
  background: '#FFFFFF',
  card: '#FFFFFF',
  surface: '#F3F4F6',
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
