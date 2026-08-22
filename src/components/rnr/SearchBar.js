import React from 'react';
import { Pressable, TextInput, View, Text } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { cn } from './cn';

const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search...',
  onPress,
  onClear,
  editable = true,
  className,
  rightAccessory,
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      className={cn(
        'flex-row items-center bg-card rounded-2xl border border-border px-4 py-3',
        className,
      )}
      style={shadow}
    >
      <Search size={18} color="#64748B" />
      {onPress ? (
        <Text className="flex-1 ml-2 text-sm text-text-muted">{placeholder}</Text>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          editable={editable}
          className="flex-1 ml-2 text-sm text-text"
          style={{ paddingVertical: 0 }}
        />
      )}
      {value ? (
        <Pressable onPress={onClear} className="h-6 w-6 items-center justify-center rounded-full bg-background ml-2">
          <X size={14} color="#64748B" />
        </Pressable>
      ) : null}
      {rightAccessory}
    </Wrapper>
  );
}
