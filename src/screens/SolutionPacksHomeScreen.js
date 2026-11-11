import React from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { BookOpen, ChevronRight, CloudUpload, Folder, Lightbulb, Search } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { SC } from '../components/SolutionKit';
import { rf } from '../utils/responsive';

// Solution Packs home — View Reference, Upload New, My Repair Records.
export default function SolutionPacksHomeScreen({ navigation, route }) {
  const params = route.params || {};
  return (
    <ScrollView style={{ flex: 1, backgroundColor: SC.bg }} contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <View style={{ backgroundColor: SC.tint, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: rf(19), fontWeight: '800', color: SC.ink }}>Solution Packs</Text>
          <Text style={{ fontSize: rf(12), color: SC.muted, marginTop: 3 }}>Repair Knowledge & Work Records</Text>
        </View>
        <BookOpen size={38} color={SC.green} />
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SolutionPackReferenceView', params)}
          style={{ flex: 1, marginRight: 6, backgroundColor: SC.bg, borderWidth: 1, borderColor: SC.border, borderRadius: 16, padding: 14, minHeight: 140 }}
        >
          <Search size={30} color={SC.green} />
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: SC.green, marginTop: 10 }}>View Reference</Text>
          <Text style={{ fontSize: rf(11.5), color: SC.muted, marginTop: 4 }}>Find previous repair solutions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SolutionPackUpload', params)}
          style={{ flex: 1, marginLeft: 6, backgroundColor: SC.green, borderRadius: 16, padding: 14, minHeight: 140 }}
        >
          <CloudUpload size={30} color="#FFFFFF" />
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: '#FFFFFF', marginTop: 10 }}>Upload New</Text>
          <Text style={{ fontSize: rf(11.5), color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Record your repair work</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SolutionPackRecords')}
        style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: SC.border, borderRadius: 16, padding: 14, marginBottom: 12 }}
      >
        <Folder size={28} color={SC.green} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: rf(14.5), fontWeight: '800', color: SC.ink }}>My Repair Records</Text>
          <Text style={{ fontSize: rf(11.5), color: SC.muted, marginTop: 2 }}>Your uploaded solutions, drafts and status</Text>
        </View>
        <ChevronRight size={18} color={SC.ink} />
      </TouchableOpacity>

      <View style={{ backgroundColor: SC.tint, borderRadius: 16, padding: 14, flexDirection: 'row' }}>
        <Lightbulb size={22} color="#F59E0B" />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontSize: rf(13), fontWeight: '800', color: SC.ink }}>What is Solution Packs?</Text>
          <Text style={{ fontSize: rf(11.5), color: SC.muted, marginTop: 4, lineHeight: rf(16) }}>
            Record your repair work with steps, photos and results, and refer to past solutions for similar issues.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
