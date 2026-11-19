import React from 'react';
import { View } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rf } from '../utils/responsive';
import MintScreenHeader from '../components/MintScreenHeader';

export default function AttendanceTabScreen({ navigation }) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <MintScreenHeader title="Attendance" navigation={navigation} />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-text-muted text-center" style={{ fontSize: rf(13) }}>
          Tap a date to view your check-in/check-out history.
        </Text>
      </View>
    </SafeAreaView>
  );
}
