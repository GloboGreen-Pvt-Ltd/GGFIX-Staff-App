import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { rf } from '../utils/responsive';

export default function TasksTabScreen({ navigation }) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-extrabold text-text" style={{ fontSize: rf(20) }}>Tasks</Text>
        <Text className="text-text-muted mt-2 text-center" style={{ fontSize: rf(13) }}>
          Jump straight into your assigned tickets.
        </Text>
        <Pressable
          onPress={() => navigation.navigate('TaskAssign')}
          className="mt-4 bg-primary rounded-xl px-6 py-3"
        >
          <Text className="text-white font-bold">Open My Tickets</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
