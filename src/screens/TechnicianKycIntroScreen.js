import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { rf, rlh } from '../utils/responsive';

// Brand green — matches the tab bar / My Account / My Profile.
// Teal ramp, not three copies of one colour: these feed a 3-stop LinearGradient
// and identical stops render as a flat block. Solid fills elsewhere in the file
// still use the brand #004C40 via GREEN_DARK.
const GREEN = '#005C4E';
const GREEN_DARK = '#004C40';
const GREEN_LIGHT = '#00695C';
const GREEN_SOFT = '#DCFCE7';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const SUBTLE = '#94A3B8';
const BORDER = '#E6EAF1';

const DOCS = [
  { key: 'aadhar', icon: 'id-card-outline', title: 'Aadhar Card', desc: 'Front & back — identity proof', color: '#2563EB', soft: '#EFF6FF' },
  { key: 'pan',    icon: 'card-outline',    title: 'PAN Card',    desc: 'For tax verification',       color: '#A21CAF', soft: '#FDF4FF' },
];

const STEPS = [
  { title: 'Keep documents ready', desc: 'Aadhar (front & back) and your PAN card.' },
  { title: 'Upload clear photos',  desc: 'Make sure every detail is readable.' },
  { title: 'Admin verifies',       desc: 'You’ll be notified once it’s approved.' },
];

function SectionLabel({ text }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionAccent} />
      <Text style={styles.sectionLabel}>{text}</Text>
    </View>
  );
}

export default function TechnicianKycIntroScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Green gradient hero */}
        <LinearGradient
          colors={[GREEN_LIGHT, GREEN, GREEN_DARK]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View pointerEvents="none" style={styles.heroBlobA} />
          <View pointerEvents="none" style={styles.heroBlobB} />
          <View style={styles.heroIconWrap}>
            <Ionicons name="shield-checkmark" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Verify your identity</Text>
          <Text style={styles.heroSubtitle}>
            Complete your KYC to activate your employee account — it only takes a couple of minutes.
          </Text>
          <View style={styles.heroChip}>
            <Ionicons name="time-outline" size={12} color="#FFFFFF" />
            <Text style={styles.heroChipText}>~2 min · Secure & encrypted</Text>
          </View>
        </LinearGradient>

        {/* Documents needed */}
        <SectionLabel text="Documents you'll need" />
        {DOCS.map((doc) => (
          <View key={doc.key} style={styles.docRow}>
            <View style={[styles.docIcon, { backgroundColor: doc.soft }]}>
              <Ionicons name={doc.icon} size={22} color={doc.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docTitle}>{doc.title}</Text>
              <Text style={styles.docDesc}>{doc.desc}</Text>
            </View>
            <View style={styles.reqPill}>
              <Text style={styles.reqPillText}>Required</Text>
            </View>
          </View>
        ))}

        {/* How it works */}
        <SectionLabel text="How it works" />
        <View style={styles.card}>
          {STEPS.map((s, i) => {
            const last = i === STEPS.length - 1;
            return (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepColLeft}>
                  <View style={styles.stepCircle}>
                    <Text style={styles.stepNum}>{i + 1}</Text>
                  </View>
                  {!last ? <View style={styles.stepLine} /> : null}
                </View>
                <View style={[styles.stepBody, last && { paddingBottom: 0 }]}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepDesc}>{s.desc}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Security note */}
        <View style={styles.secureNote}>
          <View style={styles.secureIcon}>
            <Ionicons name="lock-closed" size={13} color={GREEN_DARK} />
          </View>
          <Text style={styles.secureNoteText}>
            Your documents are encrypted and used only for verification.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('TechnicianKycUpload')}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },

  // Hero
  hero: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'flex-start',
    overflow: 'hidden',
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroBlobA: { position: 'absolute', top: -34, right: -26, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroBlobB: { position: 'absolute', bottom: -46, left: -18, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.07)' },
  heroIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroTitle: { fontSize: rf(19), fontWeight: '800', color: '#FFFFFF' },
  heroSubtitle: { fontSize: rf(12.5), color: 'rgba(255,255,255,0.92)', marginTop: 5, lineHeight: rlh(18) },
  heroChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.20)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  heroChipText: { fontSize: rf(11), fontWeight: '700', color: '#FFFFFF' },

  // Section header
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  sectionAccent: { width: 3, height: 15, borderRadius: 2, backgroundColor: GREEN, marginRight: 8 },
  sectionLabel: { fontSize: rf(14), fontWeight: '800', color: TEXT, letterSpacing: 0.2 },

  // Document rows
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 12, marginBottom: 10,
    shadowColor: '#0F172A', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  docIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontSize: rf(14), fontWeight: '800', color: TEXT },
  docDesc: { fontSize: rf(11.5), color: MUTED, marginTop: 2 },
  reqPill: { backgroundColor: GREEN_SOFT, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  reqPillText: { fontSize: rf(10), fontWeight: '800', color: GREEN_DARK },

  // How-it-works stepper
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16,
    shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  stepRow: { flexDirection: 'row' },
  stepColLeft: { width: 30, alignItems: 'center' },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: rf(12), fontWeight: '800', color: '#FFFFFF' },
  stepLine: { width: 2, flex: 1, backgroundColor: GREEN_SOFT, marginTop: 2, borderRadius: 1 },
  stepBody: { flex: 1, paddingLeft: 12, paddingBottom: 18 },
  stepTitle: { fontSize: rf(13.5), fontWeight: '800', color: TEXT },
  stepDesc: { fontSize: rf(11.5), color: MUTED, marginTop: 2, lineHeight: rlh(16) },

  // Security note
  secureNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GREEN_SOFT, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 16,
  },
  secureIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  secureNoteText: { flex: 1, fontSize: rf(11.5), color: GREEN_DARK, fontWeight: '600', lineHeight: rlh(16) },

  // CTA
  button: {
    marginTop: 20,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  buttonText: { fontSize: rf(15), fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
});
