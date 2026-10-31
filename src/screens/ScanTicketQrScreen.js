import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, Linking, Platform, KeyboardAvoidingView } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ChevronLeft,
  ScanLine,
  RotateCcw,
  AlertTriangle,
  Camera as CameraIcon,
  Keyboard as KeyboardIcon,
  Search,
} from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { ticketApi } from '../api/client';
import { listMyTickets } from '../api/tickets';
import { selectTechnicianId } from '../store/authSlice';
import { ticketRef } from '../utils/ticketRef';
import { rf, rs } from '../utils/responsive';
import MintScreenHeader from '../components/MintScreenHeader';

// App brand theme (same greens as Home / reports).
const GREEN = '#035C6C';
const GREEN_TINT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve whatever the QR encodes (a trackingId like "GG-1234" or a raw ticket
// UUID) to a ticket. Same rule the shop scanner uses: try a direct id fetch when
// it looks like a UUID, then fall back to the shop ticket search (matches on
// trackingId). Both paths are scoped to the technician's shop server-side.
// QR / typed input → bare code: drops "#", whitespace, and takes the last
// path segment or ?id= / ?ticketId= / ?trackingId= when the QR holds a URL.
function normalizeCode(raw) {
  let v = String(raw || '').trim();
  if (!v) return '';
  try {
    if (/^https?:\/\//i.test(v)) {
      const u = new URL(v);
      v = u.searchParams.get('ticketId') || u.searchParams.get('trackingId') || u.searchParams.get('id')
        || u.pathname.split('/').filter(Boolean).pop() || v;
    }
    v = decodeURIComponent(v);
  } catch (_) { /* not a URL / bad escape */ }
  return v.replace(/^#/, '').replace(/\s+/g, '').trim();
}

// → { ticket, assignedToMe } or null. Only a ticket assigned to this employee
// may be opened: first the employee's own assigned list; failing that, the
// shop-wide lookups run only to tell "someone else's job" apart from "no such
// ticket" (and to catch an own job past the list's page), with the assignee
// checked against this employee's technician id. No id → treated as not mine.
async function resolveTicket(raw, myTechId) {
  const value = normalizeCode(raw);
  if (!value) return null;
  const lc = value.toLowerCase();

  // 1. The technician's own assigned tickets — matches trackingId, the
  //    on-screen "#CSPEN…" reference (also for tickets without a trackingId) and id.
  const mine = await listMyTickets({ page: 0, size: 200 }).catch(() => null);
  const myList = Array.isArray(mine?.content) ? mine.content : Array.isArray(mine) ? mine : [];
  const own = myList.find((t) => String(t.trackingId || '').toLowerCase() === lc
    || ticketRef(t).replace(/^#/, '').toLowerCase() === lc
    || String(t.id || '').toLowerCase() === lc);
  if (own) return { ticket: own, assignedToMe: true };

  const found = await (async () => {
    if (UUID_RE.test(value)) {
      const byId = await ticketApi.get(`/tickets/${encodeURIComponent(value)}`).catch(() => null);
      if (byId) return byId;
    }
    const page = await ticketApi.get('/tickets', { query: { q: value, size: 5 } }).catch(() => null);
    const list = Array.isArray(page?.content) ? page.content : Array.isArray(page) ? page : [];
    if (list.length) {
      const exact = list.find((t) => String(t.trackingId || '').toLowerCase() === lc);
      return exact || list[0];
    }
    // Last resort — some deployments encode the id even without dashes.
    if (!UUID_RE.test(value)) return ticketApi.get(`/tickets/${value}`).catch(() => null);
    return null;
  })();
  if (!found) return null;
  const assignedToMe = !!myTechId && String(found.assignedTechnicianId || '') === String(myTechId);
  return { ticket: found, assignedToMe };
}

export default function ScanTicketQrScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(null); // holds the scanned value on miss
  // The scanned value when it's a real job assigned to someone else.
  const [notMine, setNotMine] = useState(null);
  const myTechId = useSelector(selectTechnicianId);
  const handlingRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const reset = () => {
    handlingRef.current = false;
    setScanned(false);
    setLoading(false);
    setNotFound(null);
    setNotMine(null);
  };

  const [manualOpen, setManualOpen] = useState(Platform.OS === 'web');
  const [manualCode, setManualCode] = useState('');

  const handleBarcode = async ({ data }) => {
    if (handlingRef.current || scanned) return;
    handlingRef.current = true;
    setScanned(true);
    setLoading(true);
    try {
      const hit = await resolveTicket(data, myTechId);
      if (hit?.ticket?.id && hit.assignedToMe) {
        // Open the ticket the technician just scanned. `replace` keeps the
        // scanner out of the back stack, so Back from the ticket returns Home.
        navigation.replace('TechnicianTicketDetail', { ticketId: hit.ticket.id });
        return;
      }
      if (hit?.ticket?.id) {
        setNotMine(String(data || '').trim() || 'this job');
        return;
      }
      setNotFound(String(data || '').trim() || 'this code');
    } catch (_) {
      setNotFound(String(data || '').trim() || 'this code');
    } finally {
      setLoading(false);
    }
  };

  // ── Camera permission gates ─────────────────────────────────────────────
  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background">
        <View className="pt-12 bg-card border-b border-border">
          <MintScreenHeader title="Scan Ticket QR" navigation={navigation} />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-16 w-16 rounded-full items-center justify-center mb-4" style={{ backgroundColor: GREEN_TINT }}>
            <CameraIcon size={28} color={GREEN} />
          </View>
          <Text className="text-text font-extrabold text-center" style={{ fontSize: rf(16) }}>Camera access needed</Text>
          <Text className="text-text-muted text-center mt-2 leading-5" style={{ fontSize: rf(12.5) }}>
            We need your camera to scan the ticket QR slip and open the job.
          </Text>
          <View className="flex-row mt-6">
            <Pressable onPress={() => navigation.goBack()} className="px-5 py-3 rounded-xl bg-card border border-border mr-2">
              <Text className="text-text font-bold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings?.())}
              className="px-5 py-3 rounded-xl"
              style={{ backgroundColor: GREEN }}
            >
              <Text className="text-white font-bold">{permission.canAskAgain ? 'Grant Camera' : 'Open Settings'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const showSheet = scanned; // sheet covers loading / not-found

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'datamatrix', 'code128'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
      />

      {/* Header overlay */}
      <View className="absolute left-0 right-0 top-0 pt-12 px-4 pb-3 flex-row items-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          className="rounded-full items-center justify-center bg-white/15"
          style={{ width: rs(42), height: rs(42), borderRadius: rs(21) }}
        >
          <ChevronLeft size={rs(22)} color="#fff" strokeWidth={2.4} />
        </Pressable>
        <Text
          className="flex-1 text-center text-white font-extrabold"
          style={{ fontSize: rf(18), fontWeight: '800', marginHorizontal: rs(8) }}
          numberOfLines={1}
        >
          Scan Ticket QR
        </Text>
        <View style={{ width: rs(42) }} />
      </View>

      {/* Frame + brackets (hidden once a result sheet is up) */}
      {!showSheet ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View style={{ width: 250, height: 250 }}>
            {[0, 1, 2, 3].map((i) => {
              const borders = {
                borderTopWidth: i < 2 ? 4 : 0,
                borderBottomWidth: i >= 2 ? 4 : 0,
                borderLeftWidth: i % 2 === 0 ? 4 : 0,
                borderRightWidth: i % 2 === 1 ? 4 : 0,
              };
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    top: i < 2 ? 0 : null,
                    bottom: i >= 2 ? 0 : null,
                    left: i % 2 === 0 ? 0 : null,
                    right: i % 2 === 1 ? 0 : null,
                    width: 40, height: 40, borderColor: GREEN, ...borders,
                  }}
                />
              );
            })}
          </View>
          <View className="flex-row items-center mt-6 px-4 py-2 rounded-full" style={{ backgroundColor: 'rgba(3,92,108,0.85)' }}>
            <ScanLine size={15} color="#fff" />
            <Text className="text-white font-extrabold ml-1.5" style={{ fontSize: rf(13) }}>Align the ticket QR inside the frame</Text>
          </View>
        </View>
      ) : null}

      {/* Manual entry — fallback when the QR is damaged (and the only option on web). */}
      {!showSheet ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="absolute left-0 right-0 bottom-0" style={{ padding: 16, paddingBottom: 28 }}>
          {manualOpen ? (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14 }}>
              <Text className="font-extrabold" style={{ fontSize: rf(16), fontWeight: '800', color: INK }}>Enter Ticket ID</Text>
              <Text style={{ fontSize: rf(12), color: MUTED, marginTop: 2 }}>The code printed under the QR, e.g. CSPEN5490162</Text>
              <View className="flex-row items-center mt-3">
                <TextInput
                  value={manualCode}
                  onChangeText={setManualCode}
                  placeholder="Ticket ID"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => manualCode.trim() && handleBarcode({ data: manualCode })}
                  style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: rf(14), color: INK }}
                />
                <Pressable
                  onPress={() => manualCode.trim() && handleBarcode({ data: manualCode })}
                  className="ml-2 rounded-xl items-center justify-center"
                  style={{ backgroundColor: GREEN, width: 46, height: 46, opacity: manualCode.trim() ? 1 : 0.5 }}
                >
                  <Search size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setManualOpen(true)} className="self-center flex-row items-center rounded-full px-5 py-3" style={{ backgroundColor: '#FFFFFF' }}>
              <KeyboardIcon size={16} color={GREEN} />
              <Text className="font-extrabold ml-2" style={{ fontSize: rf(13), color: GREEN }}>Type Ticket ID</Text>
            </Pressable>
          )}
        </KeyboardAvoidingView>
      ) : null}

      {/* Loading / not-found bottom sheet */}
      {showSheet ? (
        <View className="absolute left-0 right-0 bottom-0" style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 28 }}>
          {loading ? (
            <View className="items-center justify-center py-10">
              <ActivityIndicator size="large" color={GREEN} />
              <Text className="text-gray-500 font-semibold mt-3" style={{ fontSize: rf(12.5) }}>Looking up ticket…</Text>
            </View>
          ) : (
            <View className="items-center px-6 py-8">
              <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#FEE2E2' }}>
                <AlertTriangle size={26} color="#F32C26" />
              </View>
              {notMine ? (
                <>
                  <Text className="text-gray-900 font-extrabold text-center" style={{ fontSize: rf(15) }}>Not assigned to you</Text>
                  <Text className="text-gray-500 text-center mt-1.5 leading-5" style={{ fontSize: rf(12) }}>
                    <Text className="font-extrabold text-gray-700">{notMine}</Text> is assigned to another employee. You can only open jobs assigned to you.
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-gray-900 font-extrabold text-center" style={{ fontSize: rf(15) }}>No ticket found</Text>
                  <Text className="text-gray-500 text-center mt-1.5 leading-5" style={{ fontSize: rf(12) }}>
                    Couldn't match <Text className="font-extrabold text-gray-700">{notFound}</Text> to a ticket in this shop. Make sure it's a NearGFix QR slip.
                  </Text>
                </>
              )}
              <Pressable onPress={reset} className="mt-5 rounded-2xl py-3.5 px-8 flex-row items-center justify-center active:opacity-90" style={{ backgroundColor: GREEN }}>
                <RotateCcw size={16} color="#fff" />
                <Text className="text-white font-extrabold ml-2" style={{ fontSize: rf(14) }}>Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
