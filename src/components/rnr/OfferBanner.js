import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

const palettes = {
  primary: ['#00008B', '#2563EB'],
  emerald: ['#004C40', '#00695C'],   // teal now; key name kept so callers don't break
  amber: ['#F59E0B', '#FB923C'],
  rose: ['#EC4899', '#F43F5E'],
  violet: ['#1E1EAC', '#A855F7'],
};

export function OfferBanner({
  title,
  subtitle,
  cta,
  onPress,
  palette = 'primary',
  badge,
  className,
}) {
  const colors = palettes[palette] || palettes.primary;
  return (
    <Pressable
      onPress={onPress}
      className={cn('rounded-2xl overflow-hidden', className)}
      style={{
        shadowColor: colors[0],
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18 }}>
        {badge ? (
          <View className="self-start bg-white/20 rounded-full px-2.5 py-1 mb-2">
            <Text className="font-bold text-white tracking-widest" style={{ fontSize: rf(10) }}>{badge}</Text>
          </View>
        ) : null}
        <Text className="text-white font-extrabold leading-7" style={{ fontSize: rf(20) }}>{title}</Text>
        {subtitle ? (
          <Text className="text-white/85 mt-1 leading-5" style={{ fontSize: rf(13) }}>{subtitle}</Text>
        ) : null}
        {cta ? (
          <View className="flex-row items-center mt-3 bg-white/15 self-start rounded-full px-3 py-1.5">
            <Text className="text-white font-bold mr-1" style={{ fontSize: rf(12) }}>{cta}</Text>
            <ArrowRight size={14} color="#fff" />
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}
