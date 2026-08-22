import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '../components/BottomTabBar';

/**
 * Inset-aware bottom clearance for scrollable content that sits under a sticky
 * element (the absolute BottomTabBar or a BottomActionBar). Returns
 * `Math.max(insets.bottom, 12) + extra` as a plain number for use in
 * `contentContainerStyle.paddingBottom`.
 *
 * The system nav-bar inset is bigger in 3-button mode (~48dp) than in gesture
 * mode (~0-24dp), so deriving the clearance from the real inset keeps the last
 * row/card visible in BOTH modes instead of clipping behind the nav bar.
 *
 *   extra ≈ TAB_BAR_HEIGHT + a little breathing room → clears the bottom tab bar
 *   extra ≈ 96 → clears a full BottomActionBar (button + chrome)
 */
export function useBottomBarInset(extra = 24) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12) + extra;
}

/** Clearance for content laid out under the four-button BottomTabBar. */
export function useTabBarInset(extra = 16) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12) + TAB_BAR_HEIGHT + extra;
}
