// App-wide type scale (Inter). Use `type.*` for new text; existing screens are
// normalised automatically by src/components/Typography.js.
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
export function interFamily(fontWeight) {
  if (fontWeight === 'bold') return FAMILY_BY_WEIGHT[700];
  return FAMILY_BY_WEIGHT[Number(fontWeight) || 400] || FAMILY_BY_WEIGHT[400];
}

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const type = {
  pageHeader: { fontFamily: font.bold, fontSize: 20, lineHeight: 26 },
  sectionHeading: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  subheading: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  body: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: font.medium, fontSize: 11, lineHeight: 15 },
  caption: { fontFamily: font.regular, fontSize: 11, lineHeight: 15 },
};

// Snap any size in the text range onto the scale. Display numerals (> 24,
// e.g. stat counts) keep their size so layouts don't shift.
//
// Everyday text is two sizes app-wide — the Account list row's pair: 14 for a
// title / value / body line, 11 for the subtitle / caption under it. Section
// headings stay 16 and page titles 20. Text typed into an input (`input`)
// never drops below 14, so what the user types stays readable.
export function snapFontSize(size, { input = false } = {}) {
  if (typeof size !== 'number' || size > 24) return size;
  if (size < 12.5) return input ? 14 : 11;
  if (size < 15) return 14;
  if (size < 18) return 16;
  return 20;
}
