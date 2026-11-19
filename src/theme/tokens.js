// One import for the Employee App design tokens: brand colours, type scale
// and shared UI metrics. Sizes are design px — wrap them in rs() (spacing) or
// let Typography scale them (text). Partner app values win where they exist.
import { tokens as colorTokens } from './colors';

export { type, TYPE_SIZE, font } from './typography';

export const brand = {
  teal: '#035C6C',
  navy: '#1C3053',
  blue: '#0788C9',
  green: '#609138',
  orange: '#FAA700',
  red: '#F32C26',
  white: '#FFFFFF',
  lightGray: '#F3F4F6',
  black: '#111111',
  muted: colorTokens.textMuted,
  border: colorTokens.border,
};

export const UI = {
  iconCircle: 48,
  iconGlyph: 24,
  iconLabelGap: 6,
  buttonHeight: 46,
  cardRadius: 16,   // Partner rnr Card
  cardPadding: 12,
  headerButton: 36, // Partner PageHeader round buttons
};
