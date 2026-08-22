import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

export function SectionHeader({ title, action, onAction, className, caption }) {
  return (
    <View className={cn('flex-row items-end justify-between px-4 mt-3.5 mb-2', className)}>
      <View className="flex-1 pr-3">
        <Text className="font-extrabold text-text" style={{ fontSize: rf(14) }}>{title}</Text>
        {caption ? (
          <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(10) }}>{caption}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} className="flex-row items-center active:opacity-70">
          <Text className="font-bold text-primary" style={{ fontSize: rf(11) }}>{action}</Text>
          <ChevronRight size={12} color="#00008B" />
        </Pressable>
      ) : null}
    </View>
  );
}
