import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  className,
  showChevron = true,
  destructive = false,
  iconBg = 'bg-primary/10',
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      className={cn('flex-row items-center bg-card px-4 py-3 active:opacity-80', className)}
    >
      {icon ? (
        <View className={cn('h-10 w-10 rounded-full items-center justify-center mr-3', iconBg)}>
          {icon}
        </View>
      ) : null}
      <View className="flex-1 pr-2">
        <Text style={{ fontSize: rf(14) }} className={cn('font-bold', destructive ? 'text-danger' : 'text-text')} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(12) }} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
      {showChevron && onPress ? <ChevronRight size={18} color="#94A3B8" /> : null}
    </Wrapper>
  );
}
