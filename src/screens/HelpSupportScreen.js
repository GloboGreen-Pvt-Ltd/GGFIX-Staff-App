import React from 'react';
import { View, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { ChevronRight, Headset, Phone, MessageCircle, Mail } from 'lucide-react-native';
import MintScreenHeader from '../components/MintScreenHeader';
import { selectSession } from '../store/authSlice';
import { employeeIdFromSession } from '../utils/employeeId';
import { notify } from '../components/confirm';
import { rf, rs } from '../utils/responsive';

// Support contact details shown on this screen.
const SUPPORT_PHONE = '+918124123452';
const SUPPORT_PHONE_LABEL = '+91 81241 23452';
const SUPPORT_EMAIL = 'support@neargfix.com';

const C = {
  green: '#035C6C',
  ink: '#111111',
  bg: '#F3F4F6',
  card: '#FFFFFF',
  border: '#E5E7EB',
  muted: '#6B7280',
  greenTint: '#E5F3F5',
};

export default function HelpSupportScreen({ navigation }) {
  const session = useSelector(selectSession);
  const name = session?.fullName || 'Employee';
  const employeeId = employeeIdFromSession(session);
  const shopId = session?.shopId || '—';
  // Prefilled so support knows who's writing without asking.
  const intro = `Hi NearGFix team, I need help.\n\nName: ${name}\nEmployee ID: ${employeeId || '—'}\nShop ID: ${shopId}\n\n`;

  const open = async (url, fallback) => {
    try {
      await Linking.openURL(url);
    } catch {
      if (fallback) {
        try { await Linking.openURL(fallback); return; } catch { /* fall through */ }
      }
      notify('Could not open', 'No app available to handle this action.', { type: 'error' });
    }
  };

  const comingSoon = (label) => notify(label, 'This section is coming soon.', { type: 'info' });

  const call = () => open(`tel:${SUPPORT_PHONE}`);
  const whatsapp = () => {
    const text = encodeURIComponent(intro);
    const num = SUPPORT_PHONE.replace('+', '');
    open(`whatsapp://send?phone=${num}&text=${text}`, `https://wa.me/${num}?text=${text}`);
  };
  const email = () => open(
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Support request — ${name}`)}&body=${encodeURIComponent(intro)}`,
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {/* Header */}
      <MintScreenHeader title="Help & Support" navigation={navigation} />
      <Text style={{ fontSize: rf(12), color: C.muted, textAlign: 'center', marginTop: -rs(4), marginBottom: rs(4), paddingHorizontal: rs(16) }}>
        Talk to the NearGFix team
      </Text>

      <ScrollView contentContainerStyle={{ padding: rs(16), paddingTop: rs(6), paddingBottom: rs(32) }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View className="flex-row" style={{ backgroundColor: C.greenTint, borderRadius: rs(16), padding: rs(14), borderWidth: 1, borderColor: '#E5F3F5' }}>
          <View style={{ width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
            <Headset size={rs(20)} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, marginLeft: rs(12) }}>
            <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.ink }}>Need help with your work?</Text>
            <Text style={{ fontSize: rf(12), color: C.muted, marginTop: rs(3), lineHeight: rf(18) }}>
              Call, WhatsApp or email us — we'll get back to you as soon as possible.
            </Text>
          </View>
        </View>

        <SectionTitle title="Contact Us" subtitle="Choose how you'd like to reach us" />
        <Card>
          <Row icon={Phone} bg="#609138" title="Call Us" sub={SUPPORT_PHONE_LABEL} onPress={call} />
          <Row icon={MessageCircle} bg="#25D366" title="WhatsApp" sub={SUPPORT_PHONE_LABEL} onPress={whatsapp} />
          <Row icon={Mail} bg="#FAA700" title="Email" sub={SUPPORT_EMAIL} onPress={email} last />
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <View style={{ marginTop: rs(20), marginBottom: rs(8) }}>
      <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.ink }}>{title}</Text>
      <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 1 }}>{subtitle}</Text>
    </View>
  );
}

function Card({ children }) {
  return (
    <View style={{
      backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: C.border,
      shadowColor: C.ink, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
    }}>
      {children}
    </View>
  );
}

function Row({ icon: Icon, bg, title, sub, onPress, last }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={title}
      className="flex-row items-center" style={{ paddingHorizontal: rs(14), paddingVertical: rs(13) }}>
      <View style={{ width: rs(38), height: rs(38), borderRadius: rs(10), backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(19)} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, marginLeft: rs(12) }}>
        <Text style={{ fontSize: rf(14.5), fontWeight: '700', color: C.ink }}>{title}</Text>
        <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
      </View>
      <ChevronRight size={rs(18)} color={C.muted} />
      {!last ? <View style={{ position: 'absolute', left: rs(14), right: rs(14), bottom: 0, height: 1, backgroundColor: C.border }} /> : null}
    </TouchableOpacity>
  );
}
