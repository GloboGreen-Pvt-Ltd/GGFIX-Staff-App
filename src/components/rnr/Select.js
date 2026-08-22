import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from './cn';

export function Select({ value, options = [], placeholder = 'Select…', onChange, className, displayValue }) {
  const [open, setOpen] = useState(false);
  // Match strictly first, then fall back to string comparison so a numeric
  // `value={3}` still matches an option whose value is the string '3' (common
  // when the value comes from route params or a text input). Without this the
  // control shows the placeholder despite a valid selection.
  const selected = options.find(
    (o) => o.value === value
      || (value != null && o.value != null && String(o.value) === String(value)),
  );
  const label = selected ? selected.label : (displayValue || placeholder);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={cn(
          'bg-card border border-border rounded-xl px-4 py-3 flex-row items-center justify-between',
          className,
        )}
      >
        <Text className={cn('text-base', selected ? 'text-text' : 'text-text-muted')}>{label}</Text>
        <Ionicons name="chevron-down" size={16} color="#64748B" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/50 justify-center px-6" onPress={() => setOpen(false)}>
          <Pressable className="bg-card rounded-2xl max-h-80 overflow-hidden" onPress={(e) => e.stopPropagation()}>
            <ScrollView>
              {options.map((o) => (
                <Pressable
                  key={String(o.value)}
                  onPress={() => { onChange?.(o.value, o); setOpen(false); }}
                  className="px-4 py-3 border-b border-border active:bg-background"
                >
                  <Text className="text-base text-text">{o.label}</Text>
                </Pressable>
              ))}
              {options.length === 0 && (
                <View className="px-4 py-6">
                  <Text className="text-text-muted text-center">No options</Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
