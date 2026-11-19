import React from 'react';
import { Pressable, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import colors from '../theme/colors';

export default function BackButton({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => ({ marginLeft: 6, padding: 2, opacity: pressed ? 0.55 : 1 })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: '#EEF2FF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArrowLeft size={20} color={colors.text} strokeWidth={2} />
      </View>
    </Pressable>
  );
}
