import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, History, Radio, RotateCw,
} from 'lucide-react-native';
import { getTicket, listTicketEvents } from '../api/tickets';
import {
  ServiceHistoryTimeline,
  getCurrentPhaseLabel,
} from './common/serviceHistoryPhases';
import { rf } from '../utils/responsive';

// Screen palette — GGFIX green / red on light neutrals, the same set the
// restyled Home and Ticket Detail screens use.
const GREEN = '#09AD2A';
const GREEN_TINT = '#E6F7EA';
const RED = '#F84141';
const INK = '#1E1E1E';
const MUTED = '#6E6E6E';
const BG = '#F8F8F8';
const BORDER = '#ECECEC';

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
        style={{ width: 26, height: 26, backgroundColor: GREEN_TINT }}
      >
        <Icon size={13} color={GREEN} />
      </View>
      <Text
        className="font-extrabold tracking-widest"
        style={{ fontSize: rf(10.5), letterSpacing: 1.2, color: INK }}
      >
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
    setError(failure
      ? `${failure.message || 'Failed to load history'}${failure.status ? ` (HTTP ${failure.status})` : ''}`
      : null);
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
          paddingTop: insets.top + 6,
          paddingBottom: 10,
          paddingHorizontal: 14,
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="rounded-full items-center justify-center mr-3"
            style={{ width: 38, height: 38, backgroundColor: '#F3FBF4', borderWidth: 1, borderColor: '#E1F3E5' }}
          >
            <ChevronLeft size={21} color={INK} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text
            className="flex-1 font-extrabold"
            style={{ fontSize: rf(16), color: INK }}
            numberOfLines={1}
          >
            Service History
          </Text>
          <View
            className="px-2.5 py-1 rounded-full"
            style={{ maxWidth: 180, backgroundColor: GREEN_TINT }}
          >
            <Text className="font-extrabold" style={{ fontSize: rf(10.5) }} numberOfLines={1}>
              <Text style={{ color: INK }}>#{tid.prefix}</Text>
              <Text style={{ color: GREEN }}>{tid.digits}</Text>
            </Text>
          </View>
        </View>
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
                style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F3F3F3' }}
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
              <SectionHeader icon={History} label="SERVICE TIMELINE" />
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
