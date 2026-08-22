import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rf } from '../utils/responsive';

export default function AttendanceTabScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-extrabold text-text" style={{ fontSize: rf(20) }}>Attendance</Text>
        <Text className="text-text-muted mt-2 text-center" style={{ fontSize: rf(13) }}>
          Tap a date to view your check-in/check-out history.
        </Text>
      </View>
    </SafeAreaView>
  );
}
