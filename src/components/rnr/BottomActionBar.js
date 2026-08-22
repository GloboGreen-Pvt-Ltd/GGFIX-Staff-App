import React from 'react';
import { Pressable, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { Button } from './Button';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

/**
 * Sticky bottom action bar. Supports a price/info column on the left side and
 * a primary CTA button on the right — Swiggy/Zomato style — or a single full
 * width button with a companion chevron.
 */
export function BottomActionBar({
  title = 'Continue',
  onPress,
  loading = false,
  disabled = false,
  variant = 'default',
  className,
  buttonClassName,
  companion = false,
  onCompanionPress,
  priceLabel,
  priceValue,
  priceCaption,
  children,
  insetBottom,
  safeArea = true,
}) {
  const insets = useSafeAreaInsets();
  // Clear the Android system navigation bar. In 3-button mode the bottom inset
  // is ~48dp; in gesture mode it's ~0-24dp. A hardcoded value used to leave the
  // button partly behind the 3-button bar — read the real inset instead so the
  // CTA sits just above the nav buttons in both modes and on every screen size.
  // `insetBottom` stays supported as an explicit override for screens that pass
  // a pre-computed clearance via useBottomBarInset().
  const resolvedBottom = !safeArea
    ? 12
    : insetBottom != null
      ? insetBottom
      : Math.max(insets.bottom, 12) + 6;
  const hasPrice = priceLabel != null || priceValue != null;
  return (
    <View
      className={cn('absolute left-0 right-0 bottom-0 bg-card border-t border-border px-4 pt-3', className)}
      style={{ paddingBottom: resolvedBottom, shadowColor: '#0F172A', shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, elevation: 14 }}
    >
      <View className="flex-row items-center">
        {hasPrice ? (
          <View className="mr-3" style={{ maxWidth: '46%' }}>
            {priceCaption ? <Text className="text-text-muted" style={{ fontSize: rf(11) }} numberOfLines={1}>{priceCaption}</Text> : null}
            <Text className="font-extrabold text-text leading-5" style={{ fontSize: rf(16) }} numberOfLines={1}>{priceValue}</Text>
            {priceLabel ? <Text className="text-text-muted" style={{ fontSize: rf(11) }} numberOfLines={1}>{priceLabel}</Text> : null}
          </View>
        ) : null}
        <View className={cn(hasPrice ? '' : 'flex-1')} style={hasPrice ? { flex: 1 } : null}>
          {children ?? (
            <Button
              variant={variant}
              onPress={onPress}
              loading={loading}
              disabled={disabled}
              className={cn('w-full', buttonClassName)}
              rightIcon={<ChevronRight size={18} color="#fff" />}
            >
              {title}
            </Button>
          )}
        </View>
        {companion ? (
          <Pressable
            onPress={onCompanionPress || onPress}
            disabled={disabled || loading}
            className="ml-3 h-12 w-12 rounded-full bg-card border border-border items-center justify-center active:opacity-80"
            style={{ shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ChevronRight size={18} color="#0F172A" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
