import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  History, Radio, RotateCw,
} from 'lucide-react-native';
import MintScreenHeader from '../components/MintScreenHeader';
import { getTicket, listTicketEvents } from '../api/tickets';
import {
  ServiceHistoryTimeline,
  getCurrentPhaseLabel,
} from './common/serviceHistoryPhases';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

// Screen palette — NearGFix green / red on light neutrals, the same set the
// restyled Home and Ticket Detail screens use.
const GREEN = '#035C6C';
const GREEN_TINT = '#E5F3F5';
const RED = '#F32C26';
const INK = '#111111';
const MUTED = '#6B7280';
const BG = '#F3F4F6';
const BORDER = '#E5E7EB';

const cardShadow = {
  borderWidth: 1,
  borderColor: BORDER,
  shadowColor: INK,
  shadowOpacity: 0.04,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
};

// Splits a tracking id into its letter prefix and trailing digits so the header
// pill can render the digits in brand green (e.g. #CSPEN·7626488).
function splitTrackingId(id) {
  const s = String(id ?? '').replace(/^#/, '');
  const m = s.match(/^(\D*)(\d.*)$/);
  return m ? { prefix: m[1], digits: m[2] } : { prefix: s, digits: '' };
}

// Mirrors ggfix-shop-app/src/screens/owner/AllBooking/BookingTimelineScreen.js
// (slim white header, current-status card, staged timeline) so the technician's
// "History" button off the Assign Task screen lands on the same screen the shop
// owner and customer see. The canonical row list lives in
// screens/common/serviceHistoryPhases.
function SectionHeader({ icon: Icon, label }) {
  return (
    <View className="flex-row items-center" style={{ marginBottom: 10 }}>
      <View
        className="rounded-full items-center justify-center mr-2"
        style={{ width: rs(32), height: rs(32), backgroundColor: GREEN_TINT }}
      >
        <Icon size={rs(18)} color={GREEN} />
      </View>
      <Text style={{ fontSize: rf(16), fontWeight: '800', color: INK }}>
        {label}
      </Text>
    </View>
  );
}

export default function TechnicianBookingTimelineScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const contentW = Math.min(winW, 760);
  const ticketId = route?.params?.ticketId;
  const [ticket, setTicket] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    // Each half fails independently; a failed poll keeps the last good data
    // instead of blanking the rail, and the error banner says what happened.
    let failure = null;
    const [t, ev] = await Promise.all([
      getTicket(ticketId).catch((e) => { failure = e; return undefined; }),
      listTicketEvents(ticketId).catch((e) => { failure = e; return undefined; }),
    ]);
    if (t !== undefined) setTicket(t);
    if (ev !== undefined) setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));
    setError(failure ? userMessage(failure, 'Could not load history') : null);
  }, [ticketId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => { await load(); if (active) setLoading(false); })();
    timer.current = setInterval(load, 10000);
    return () => { active = false; if (timer.current) clearInterval(timer.current); };
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: BG }}>
        <ActivityIndicator color={GREEN} />
        <Text className="mt-2" style={{ fontSize: rf(12), color: MUTED }}>Loading history…</Text>
      </View>
    );
  }

  const currentLabel = getCurrentPhaseLabel(events, ticket?.status);
  const tid = splitTrackingId(ticket?.trackingId || ticketId);

  return (
    <View className="flex-1" style={{ backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Slim white header: back button, title, ticket id pill */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top,
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
        }}
      >
        <MintScreenHeader
          title="Service History"
          navigation={navigation}
          right={(
            <View
              className="px-2.5 py-1 rounded-full"
              style={{ maxWidth: 180, backgroundColor: GREEN_TINT }}
            >
              <Text className="font-extrabold" style={{ fontSize: rf(10.5) }} numberOfLines={1}>
                <Text style={{ color: INK }}>#{tid.prefix}</Text>
                <Text style={{ color: GREEN }}>{tid.digits}</Text>
              </Text>
            </View>
          )}
        />
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GREEN}
            colors={[GREEN]}
          />
        }
      >
        <View style={{ width: contentW, alignSelf: 'center' }}>
          {/* Current status card */}
          <View style={{ paddingHorizontal: 12, marginTop: 10 }}>
            <View className="bg-white" style={[{ borderRadius: 14, padding: 12 }, cardShadow]}>
              <View className="flex-row items-center">
                <View
                  className="rounded-full items-center justify-center mr-2.5"
                  style={{ width: 38, height: 38, backgroundColor: GREEN_TINT }}
                >
                  <Radio size={17} color={GREEN} />
                </View>
                <View className="flex-1">
                  <Text
                    className="uppercase font-bold"
                    style={{ fontSize: rf(9.5), letterSpacing: 0.7, color: '#A3A3A3' }}
                  >
                    Current Status
                  </Text>
                  <Text className="font-extrabold mt-0.5" style={{ fontSize: rf(14), color: INK }}>
                    {currentLabel || 'Booking Placed'}
                  </Text>
                </View>
                <View
                  className="rounded-full items-center justify-center"
                  style={{ width: 28, height: 28, backgroundColor: GREEN_TINT }}
                >
                  <Text className="font-extrabold" style={{ fontSize: rf(12), color: GREEN }}>
                    {events.length}
                  </Text>
                </View>
              </View>
              <View
                className="flex-row items-center"
                style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}
              >
                <RotateCw size={11} color="#A3A3A3" />
                <Text className="ml-1.5" style={{ fontSize: rf(10), color: MUTED }}>
                  {events.length} event{events.length === 1 ? '' : 's'} • Updated live • Pull to refresh
                </Text>
              </View>
            </View>
          </View>

          {error ? (
            <View style={{ paddingHorizontal: 12, marginTop: 10 }}>
              <View
                className="px-3 py-2.5"
                style={{ borderRadius: 12, backgroundColor: '#FEECEC', borderWidth: 1, borderColor: '#FBD0D0' }}
              >
                <Text className="font-semibold" style={{ fontSize: rf(12), color: RED }}>
                  {error}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Timeline */}
          <View style={{ paddingHorizontal: 12, marginTop: 10 }}>
            <View className="bg-white" style={[{ borderRadius: 14, padding: 12 }, cardShadow]}>
              <SectionHeader icon={History} label="Service Timeline" />
              <ServiceHistoryTimeline
                events={events}
                status={ticket?.status}
                phaseFilter="SERVICE"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
