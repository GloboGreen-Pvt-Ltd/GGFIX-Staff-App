// App-wide type scale (Inter). Use `type.*` for new text; existing screens are
// normalised automatically by src/components/Typography.js.
import { PixelRatio } from 'react-native';
import { isLoaded as isFontLoaded } from 'expo-font';
import { fontScale, osCorrection } from '../utils/responsive';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
} from '@expo-google-fonts/inter';

export const fontAssets = {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
};

// fontWeight → Inter face. Android ignores fontWeight on custom fonts, so the
// weight is expressed through the family name instead.
const FAMILY_BY_WEIGHT = {
  100: 'Inter_400Regular', 200: 'Inter_400Regular', 300: 'Inter_400Regular', 400: 'Inter_400Regular',
  500: 'Inter_500Medium', 600: 'Inter_600SemiBold', 700: 'Inter_700Bold', 800: 'Inter_800ExtraBold', 900: 'Inter_900Black',
};
// null when that Inter face isn't loaded (font load failed / timed out in
// App.js) — callers then fall back to the system font with its fontWeight.
// Loaded faces are remembered; a miss (which asks the native side) is
// re-checked at most once a second, since this runs on every Text render.
const seenFaces = new Set();
let lastMissAt = 0;
export function interFamily(fontWeight) {
  const family = fontWeight === 'bold' ? FAMILY_BY_WEIGHT[700] : (FAMILY_BY_WEIGHT[Number(fontWeight) || 400] || FAMILY_BY_WEIGHT[400]);
  if (seenFaces.has(family)) return family;
  if (Date.now() - lastMissAt < 1000) return null;
  try {
    if (isFontLoaded(family)) { seenFaces.add(family); return family; }
  } catch {
    return family;
  }
  lastMissAt = Date.now();
  return null;
}

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
};

// Design sizes (px at the 375dp guideline). Partner app values win where the
// GGFIX sheet differs: PageHeader title 17 ExtraBold / subtitle 11, rnr Button
// text 16 bold.
export const TYPE_SIZE = {
  pageHeader: 17,
  headerSubtitle: 11,
  sectionHeading: 16,
  cardTitle: 14,
  body: 13,
  caption: 12,
  secondary: 11,
  button: 16,
  display: 20,
};

export const type = {
  pageHeader: { fontFamily: font.extrabold, fontSize: TYPE_SIZE.pageHeader, lineHeight: 22 },
  headerSubtitle: { fontFamily: font.regular, fontSize: TYPE_SIZE.headerSubtitle, lineHeight: 15 },
  sectionHeading: { fontFamily: font.semibold, fontSize: TYPE_SIZE.sectionHeading, lineHeight: 22 },
  cardTitle: { fontFamily: font.semibold, fontSize: TYPE_SIZE.cardTitle, lineHeight: 20 },
  subheading: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  body: { fontFamily: font.regular, fontSize: TYPE_SIZE.body, lineHeight: 18 },
  button: { fontFamily: font.bold, fontSize: TYPE_SIZE.button, lineHeight: 20 },
  label: { fontFamily: font.medium, fontSize: 11, lineHeight: 15 },
  caption: { fontFamily: font.regular, fontSize: TYPE_SIZE.secondary, lineHeight: 15 },
};

// Snap a DESIGN size onto the scale: 11 secondary, 12 caption, 13 body,
// 14 card title / row, 16 section heading, 17 page header, 20 display.
// Display numerals (> 24, e.g. stat counts) keep their size so layouts don't
// shift. Text typed into an input (`input`) never drops below 14.
export function snapFontSize(size, { input = false } = {}) {
  if (typeof size !== 'number' || size > 24) return size;
  let s;
  if (size < 11.5) s = 11;
  else if (size < 12.5) s = 12;
  else if (size < 13.5) s = 13;
  else if (size < 15) s = 14;
  else if (size < 16.5) s = 16;
  else if (size < 18.5) s = 17;
  else s = 20;
  return input ? Math.max(s, 14) : s;
}

// Rendered text never drops below this, before the OS font setting.
const MIN_TEXT = 11;

/**
 * The fontSize to hand RN for a size written as rf(n) (most screens) or a
 * plain n: undo rf's width + OS factors to get the design size, snap THAT,
 * then re-apply them. Snapping the already-scaled size turned a 14 into 11 on
 * small phones and 16 on wide ones. `osScaled: false` is for text with
 * allowFontScaling={false}, which RN won't multiply by the OS setting.
 */
export function resolveFontSize(size, { input = false, osScaled = true } = {}) {
  if (typeof size !== 'number') return size;
  const k = fontScale * osCorrection;
  const design = size / k;
  if (design > 24) return size;
  const px = Math.max(snapFontSize(design, { input }) * fontScale, MIN_TEXT) * (osScaled ? osCorrection : 1);
  return PixelRatio.roundToNearestPixel(px);
}
