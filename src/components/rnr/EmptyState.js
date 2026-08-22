import React from 'react';
import { Text, View } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { cn } from './cn';
import { Button } from './Button';
import { rf } from '../../utils/responsive';

export function EmptyState({
  icon,
  title = 'Nothing here yet',
  description,
  actionLabel,
  onAction,
  className,
}) {
  return (
    <View className={cn('items-center justify-center px-8 py-12', className)}>
      <View className="h-20 w-20 rounded-full bg-primary/10 items-center justify-center mb-4">
        {icon || <Inbox size={32} color="#00008B" />}
      </View>
      <Text className="font-extrabold text-text text-center" style={{ fontSize: rf(16) }}>{title}</Text>
      {description ? (
        <Text className="text-text-muted text-center mt-1" style={{ fontSize: rf(13) }}>{description}</Text>
      ) : null}
      {actionLabel ? (
        <Button onPress={onAction} className="mt-5">{actionLabel}</Button>
      ) : null}
    </View>
  );
}
