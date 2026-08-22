import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ChevronLeft,
  ScanLine,
  RotateCcw,
  AlertTriangle,
  Camera as CameraIcon,
} from 'lucide-react-native';
import { ticketApi } from '../api/client';
import { rf } from '../utils/responsive';

const GREEN = '#004C40';
const GREEN_DARK = '#004C40';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve whatever the QR encodes (a trackingId like "GG-1234" or a raw ticket
// UUID) to a ticket. Same rule the shop scanner uses: try a direct id fetch when
// it looks like a UUID, then fall back to the shop ticket search (matches on
// trackingId). Both paths are scoped to the technician's shop server-side.
async function resolveTicket(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (UUID_RE.test(value)) {
    const byId = await ticketApi.get(`/tickets/${encodeURIComponent(value)}`).catch(() => null);
    if (byId) return byId;
  }

  const page = await ticketApi.get('/tickets', { query: { q: value, size: 5 } }).catch(() => null);
  const list = Array.isArray(page?.content) ? page.content : Array.isArray(page) ? page : [];
  if (list.length) {
    const exact = list.find((t) => String(t.trackingId || '').toLowerCase() === value.toLowerCase());
    return exact || list[0];
  }

  // Last resort — some deployments encode the id even without dashes.
  if (!UUID_RE.test(value)) {
    const byRaw = await ticketApi.get(`/tickets/${value}`).catch(() => null);
    if (byRaw) return byRaw;
  }
  return null;
}

export default function ScanTicketQrScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(null); // holds the scanned value on miss
  const handlingRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const reset = () => {
    handlingRef.current = false;
    setScanned(false);
    setLoading(false);
    setNotFound(null);
  };

  const handleBarcode = async ({ data }) => {
    if (handlingRef.current || scanned) return;
    handlingRef.current = true;
    setScanned(true);
    setLoading(true);
    try {
      const t = await resolveTicket(data);
      if (t?.id) {
        // Open the ticket the technician just scanned. `replace` keeps the
        // scanner out of the back stack, so Back from the ticket returns Home.
        navigation.replace('TechnicianTicketDetail', { ticketId: t.id });
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
        <View className="pt-12 px-4 pb-3 flex-row items-center bg-card border-b border-border">
          <Pressable onPress={() => navigation.goBack()} className="w-10 h-10 rounded-full items-center justify-center bg-background border border-border mr-3">
            <ChevronLeft size={22} color="#0F172A" />
          </Pressable>
          <Text className="text-text font-extrabold" style={{ fontSize: rf(16) }}>Scan Ticket QR</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-16 w-16 rounded-full bg-warning/15 items-center justify-center mb-4">
            <CameraIcon size={28} color="#F59E0B" />
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
      <View className="absolute left-0 right-0 top-0 pt-12 px-4 pb-3 flex-row items-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <Pressable onPress={() => navigation.goBack()} className="w-10 h-10 rounded-full items-center justify-center bg-white/15 mr-3">
          <ChevronLeft size={22} color="#fff" />
        </Pressable>
        <Text className="text-white font-extrabold" style={{ fontSize: rf(16) }}>Scan Ticket QR</Text>
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
          <View className="flex-row items-center mt-6">
            <ScanLine size={15} color="#fff" />
            <Text className="text-white font-extrabold ml-1.5" style={{ fontSize: rf(13) }}>Align the ticket QR inside the frame</Text>
          </View>
        </View>
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
                <AlertTriangle size={26} color="#B91C1C" />
              </View>
              <Text className="text-gray-900 font-extrabold text-center" style={{ fontSize: rf(15) }}>No ticket found</Text>
              <Text className="text-gray-500 text-center mt-1.5 leading-5" style={{ fontSize: rf(12) }}>
                Couldn't match <Text className="font-extrabold text-gray-700">{notFound}</Text> to a ticket in this shop. Make sure it's a GGFix QR slip.
              </Text>
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
