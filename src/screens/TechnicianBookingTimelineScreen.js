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

const BRAND_GREEN_DARK = '#004C40';

const cardShadow = {
  borderWidth: 1,
  borderColor: '#E2E8E2',
  shadowColor: '#172117',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
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
    <View className="flex-row items-center mb-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2"
        style={{ backgroundColor: '#E6F7E3' }}
      >
        <Icon size={14} color={BRAND_GREEN_DARK} />
      </View>
      <Text
        className="font-extrabold tracking-widest text-gray-900"
        style={{ fontSize: rf(11), letterSpacing: 1.2 }}
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
    try {
      const [t, ev] = await Promise.all([
        getTicket(ticketId).catch(() => null),
        listTicketEvents(ticketId).catch(() => []),
      ]);
      setTicket(t);
      setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));
      setError(null);
    } catch (e) {
      setError(e?.message || 'Failed to load history');
    }
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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#F0F8EF' }}>
        <ActivityIndicator color={BRAND_GREEN_DARK} />
        <Text className="text-text-muted mt-2" style={{ fontSize: rf(12) }}>Loading history…</Text>
      </View>
    );
  }

  const currentLabel = getCurrentPhaseLabel(events, ticket?.status);
  const tid = splitTrackingId(ticket?.trackingId || ticketId);

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F8EF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* White header (slim — replaces the old green gradient hero) */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: '#EFF5EE' }}
          >
            <ChevronLeft size={22} color="#172117" />
          </TouchableOpacity>
          <Text
            className="flex-1 text-text font-extrabold"
            style={{ fontSize: rf(17) }}
            numberOfLines={1}
          >
            Service History
          </Text>
          <View
            className="px-2.5 py-1 rounded-full"
            style={{ maxWidth: 180, backgroundColor: '#E6F7E3' }}
          >
            <Text className="font-extrabold" style={{ fontSize: rf(11) }} numberOfLines={1}>
              <Text style={{ color: '#172117' }}>#{tid.prefix}</Text>
              <Text style={{ color: BRAND_GREEN_DARK }}>{tid.digits}</Text>
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BRAND_GREEN_DARK}
            colors={[BRAND_GREEN_DARK]}
          />
        }
      >
        <View style={{ width: contentW, alignSelf: 'center' }}>
          {/* Current status card */}
          <View className="px-4" style={{ marginTop: 12 }}>
            <View className="bg-white rounded-2xl p-4" style={cardShadow}>
              <View className="flex-row items-center">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Radio size={20} color={BRAND_GREEN_DARK} />
                </View>
                <View className="flex-1">
                  <Text
                    className="uppercase font-bold text-gray-400"
                    style={{ fontSize: rf(10.5), letterSpacing: 0.7 }}
                  >
                    Current Status
                  </Text>
                  <Text className="font-extrabold text-gray-900 mt-0.5" style={{ fontSize: rf(15) }}>
                    {currentLabel || 'Booking Placed'}
                  </Text>
                </View>
                <View
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Text className="font-extrabold" style={{ fontSize: rf(13), color: BRAND_GREEN_DARK }}>
                    {events.length}
                  </Text>
                </View>
              </View>
              <View
                className="mt-3 pt-3 flex-row items-center"
                style={{ borderTopWidth: 1, borderTopColor: '#EFF5EE' }}
              >
                <RotateCw size={11} color="#8FA08F" />
                <Text className="ml-1.5 text-gray-500" style={{ fontSize: rf(10.5) }}>
                  {events.length} event{events.length === 1 ? '' : 's'} • Updated live • Pull to refresh
                </Text>
              </View>
            </View>
          </View>

          {error ? (
            <View className="px-4 mt-4">
              <View
                className="rounded-2xl px-4 py-3"
                style={{ backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' }}
              >
                <Text className="font-semibold" style={{ fontSize: rf(12.5), color: '#B91C1C' }}>
                  {error}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Timeline */}
          <View className="px-4" style={{ marginTop: 12 }}>
            <View className="bg-white rounded-2xl p-4" style={cardShadow}>
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
