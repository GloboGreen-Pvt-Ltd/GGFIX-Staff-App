import React, { useRef, useState } from 'react';
import { View, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Smartphone, Wrench, Tag, ReceiptText, Phone, Send } from 'lucide-react-native';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import {
  EST, EText, cardStyle, EstimateHeader, StepProgress, CustomerCard, SectionRail, DeviceImage, Pressable } from '../components/estimate/EstimateKit';
import { notify } from '../components/confirm';
import { submitPickupRepairEstimate } from '../api/pickups';
import { normalizeDeviceImageUrl } from '../utils/images';
import { useImeiApplies } from '../utils/imeiPolicy';
import { userMessage } from '../utils/userMessages';

function trackingId(booking, params) {
  return params?.trackingId
    || booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

// Backend now persists imei + schedule + device_pin + missing parts + customer
// approval in dedicated repair_bookings columns, and services in
// repair_booking_services. issueSummary stays clean — just the complaint text.

function base64ImageUri(raw) {
  if (!raw) return null;
  const value = String(raw);
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function deviceImageUri(booking, params) {
  const url = normalizeDeviceImageUrl(
    params?.modelImageUrl
      || params?.model?.imageUrl
      || booking?.deviceImageUrl
      || booking?.modelImageUrl
  );
  if (url) return url;
  return base64ImageUri(
    params?.modelImageBase64
      || params?.model?.imageBase64
      || booking?.deviceImageBase64
      || booking?.modelImageBase64
  );
}

const fmtINR = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "30 Oct, 7:55 PM" (Partner Review & Confirm format).
function whenLabel(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

const DIVIDER = { borderTopWidth: 1, borderColor: EST.border };

// Label left (muted), value right — Partner's "Accessories  None" row.
function InfoRow({ label, children }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 7 }}>
      <EText style={{ fontSize: 12, color: EST.muted, width: 110 }}>{label}</EText>
      <EText style={{ flex: 1, fontSize: 12, fontWeight: '700', color: EST.text, textAlign: 'right' }}>{children}</EText>
    </View>
  );
}

export default function PickupServiceBookingDevicesListScreen({ navigation, route }) {
  useHideNativeHeader(navigation);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colStyle = width >= 600 ? { width: Math.min(width - 32, 720), alignSelf: 'center' } : null;
  const params = route?.params || {};
  const booking = params.booking || null;
  const bookingId = params.bookingId || booking?.id;
  const services = params.services || [];
  const photos = params.devicePhotos || {};
  const total = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const imageUri = deviceImageUri(booking, params);
  const colorText = params.color || booking?.color || null;
  const brand = params?.brandName || params?.brand?.name || booking?.brandName;
  const model = params?.modelName || params?.model?.name || booking?.modelName;
  const specLine = [
    params?.ramLabel || booking?.ramLabel, params?.storageLabel || booking?.storageLabel, colorText,
  ].filter(Boolean).join(' · ');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  // IMEI is mobile-only; an unknown category keeps the old behaviour.
  const showImei = useImeiApplies(params);

  const submit = async () => {
    if (inFlight.current) return;
    if (!bookingId) { notify('Missing', 'Booking is required', { type: 'warning' }); return; }
    if (!services.length) { notify('Missing services', 'Select at least one repair service.', { type: 'warning' }); return; }
    inFlight.current = true;
    setSubmitting(true);
    try {
      // Translate the multi-step flow's locally-shaped state into the keys
      // submitPickupRepairEstimate actually reads on the backend. Key names
      // that don't match (devicePin vs lock.value, customerApproval vs
      // customerApproved, missingDamageParts vs missingParts of partName
      // shape) silently fall through the COALESCE and leave those columns
      // NULL on repair_bookings — which is what caused the owner-side
      // "View Details" to render PIN / missing parts / approval as blank.
      const devicePin = params.lock && params.lock.type && params.lock.type !== 'NONE'
        ? (params.lock.value || null)
        : null;
      const missingPartsCsv = Array.isArray(params.missingParts)
        ? params.missingParts
            .map((p) => {
              const name = p?.partName || p?.name || p?.label;
              if (!name) return null;
              const flags = [];
              if (p?.missing) flags.push('missing');
              if (p?.damage) flags.push('damaged');
              return flags.length ? `${name} (${flags.join(', ')})` : name;
            })
            .filter(Boolean)
            // Records are newline-separated, NOT comma-separated: a part flagged
            // both missing and damaged renders as "Display (missing, damaged)",
            // and a comma record-separator would split that token on the inner
            // comma, corrupting the flag on the "Edit Estimate" round-trip.
            .join('\n')
        : null;
      const customerApprovalValue = params.customerApproved == null
        ? null
        : (params.customerApproved ? 'DONE' : 'PENDING');

      const body = {
        estimatedRepairValue: total,
        frontImageUrl: photos.front || null,
        backImageUrl: photos.back || null,
        videoUrl: photos.video || null,
        // A typed (Other) brand / model has no id to save, so it leads the summary.
        issueSummary: [params.customDevice ? `Device (not in list): ${params.customDevice}` : '', params.complaint ? params.complaint.trim() : '']
          .filter(Boolean).join('\n') || null,
        // Pickup-person-confirmed device taxonomy. Backend persists these
        // onto repair_bookings (brand_id / model_id / ram_option_id /
        // storage_option_id / color) so subsequent screens — and the
        // customer's MyOrders view — show the corrected device.
        brandId: params.brandId || params.brand?.id || null,
        modelId: params.modelId || params.model?.id || null,
        ramOptionId: params.ramOptionId || null,
        storageOptionId: params.storageOptionId || null,
        color: colorText,
        // Repair-services list — backend DELETE-then-INSERTs repair_booking_services
        // from this array (see PickupBookingController.submitRepairEstimate).
        services,
        imei: showImei ? (params.imei || null) : null,
        // Schedule + device-condition fields — match the names backend reads.
        estimatedReadyAt: params.estimatedReadyIso || null,
        estimatedDeliveryAt: params.estimatedDeliveryIso || null,
        // estimated_duration_hours column is read back by PickupEstimateDetail
        // ("Estimated Approximate Time, NHr"); it was collected in the wizard
        // but previously dropped here, leaving the column NULL.
        estimatedDurationHours: params.durationHours || null,
        devicePin,
        missingDamageParts: missingPartsCsv,
        customerApproval: customerApprovalValue,
      };
      await submitPickupRepairEstimate(bookingId, body);
      notify('Estimate submitted', 'Repair estimate saved for this booking.', { type: 'success' });
      // Return to the pickup list (was popToTop → Home, which stranded the
      // pickup person and forced them to re-navigate Tasks → Pickup).
      navigation.navigate('PickupAssign');
    } catch (e) {
      notify('Could not submit estimate', userMessage(e, 'Please try again.'), { type: 'error' });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const missingParts = Array.isArray(params.missingParts) ? params.missingParts : [];
  const hasLock = !!(params.lock?.type && params.lock.type !== 'NONE');
  const modelNumber = params.model?.modelNumber || params.modelNumber || booking?.modelNumber || null;
  const fullSpec = [specLine, modelNumber].filter(Boolean).join(' · ');
  const phone = booking?.customerMobile || booking?.customerPhone || null;
  const bookedLabel = whenLabel(new Date());
  const etaLabel = params.estimatedAt || whenLabel(params.estimatedReadyIso);
  const infoShown = (showImei && params.imei) || hasLock || missingParts.length > 0;
  const colWrap = [{ maxWidth: 720, width: '100%', alignSelf: 'center' }, colStyle];

  return (
    <View style={{ flex: 1, backgroundColor: EST.page }}>
      <EstimateHeader title="Review & Confirm" subtitle="Check the device, services and details" onBack={() => navigation.goBack()} />
      <View style={{ backgroundColor: EST.white, borderBottomWidth: 1, borderBottomColor: EST.border }}>
        <View style={colWrap}><StepProgress active={2} /></View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 170 }}
      >
        <View style={colWrap}>
          <CustomerCard name={booking?.customerName} phone={phone} badge={trackingId(booking, params)} />

          <SectionRail
            icon={ReceiptText}
            title="DEVICE BOOKED"
            right={(
              <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: EST.soft }}>
                <EText style={{ fontSize: 10, fontWeight: '800', color: EST.primary }}>1 Device</EText>
              </View>
            )}
          />

          <View style={[cardStyle, { overflow: 'hidden' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, paddingBottom: 8 }}>
              <View style={{ height: 50, width: 46, borderRadius: 12, marginRight: 10, backgroundColor: EST.white, borderWidth: 1, borderColor: EST.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                {imageUri ? (
                  <DeviceImage url={imageUri} style={{ width: 38, height: 44 }} />
                ) : (
                  <Smartphone size={21} color={EST.primary} strokeWidth={2} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <EText style={{ fontSize: 13, fontWeight: '800', color: EST.text }} numberOfLines={1}>
                  {brand ? `${brand} · ` : ''}{model || 'Device'}
                </EText>
                {fullSpec ? <EText style={{ fontSize: 11, color: EST.muted, marginTop: 1 }} numberOfLines={2}>{fullSpec}</EText> : null}
              </View>
            </View>

            {services.length > 0 ? (
              <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
                <View style={[DIVIDER, { marginBottom: 8 }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ width: 20, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                    <Wrench size={14} color={EST.primary} strokeWidth={2} />
                  </View>
                  <EText style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: EST.text }}>REPAIR SERVICES</EText>
                </View>
                {services.map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: i === services.length - 1 ? 0 : 7 }}>
                    <View style={{ height: 20, width: 20, borderRadius: 7, marginRight: 8, backgroundColor: EST.soft, alignItems: 'center', justifyContent: 'center' }}>
                      <EText style={{ fontSize: 10, fontWeight: '800', color: EST.primary }}>{i + 1}</EText>
                    </View>
                    <EText style={{ flex: 1, fontSize: 12, fontWeight: '600', color: EST.text }} numberOfLines={1}>{s.serviceName}</EText>
                    <EText style={{ fontSize: 12, fontWeight: '800', color: EST.text, marginLeft: 8 }}>₹{fmtINR(s.price)}</EText>
                  </View>
                ))}

                {infoShown ? (
                  <View style={[DIVIDER, { marginTop: 8, paddingBottom: 1 }]}>
                    {showImei && params.imei ? <InfoRow label="IMEI">{params.imei}</InfoRow> : null}
                    {hasLock ? <InfoRow label="Device Security">{params.lock.type}</InfoRow> : null}
                    {missingParts.length > 0 ? (
                      <InfoRow label="Missing / Damaged Parts">
                        {missingParts.map((p) => {
                          const name = p?.partName || p?.name || p?.label;
                          const flags = [p?.missing ? 'Missing' : null, p?.damage ? 'Damaged' : null].filter(Boolean).join(', ');
                          return flags ? `${name} (${flags})` : name;
                        }).filter(Boolean).join('\n')}
                      </InfoRow>
                    ) : null}
                  </View>
                ) : null}

                <View style={[DIVIDER, { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8 }]}>
                  <View style={{ width: 20, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                    <Tag size={14} color={EST.primary} strokeWidth={2} />
                  </View>
                  <EText style={{ flex: 1, fontSize: 12, fontWeight: '800', color: EST.text }}>Estimated Repair Price</EText>
                  <EText style={{ fontSize: 13, fontWeight: '800', color: EST.primary }}>₹{fmtINR(total)}</EText>
                </View>
              </View>
            ) : null}
          </View>

          <SectionRail icon={ReceiptText} title="BILL SUMMARY" />
          <View style={[cardStyle, { padding: 12 }]}>
            {phone ? (
              <View style={{ marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderColor: EST.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Phone size={12} color={EST.primary} strokeWidth={2} />
                  <EText style={{ flex: 1, marginLeft: 6, fontSize: 12, color: EST.muted }}>Mobile</EText>
                  <EText style={{ fontSize: 12, fontWeight: '700', color: EST.text }}>{phone}</EText>
                </View>
              </View>
            ) : null}
            <View style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <EText style={{ flex: 1, fontSize: 13, fontWeight: '800', color: EST.text }} numberOfLines={1}>{model || 'Device'}</EText>
                <EText style={{ fontSize: 13, fontWeight: '800', color: EST.text }}>₹{fmtINR(total)}</EText>
              </View>
              {services.map((s, j) => (
                <View key={j} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <EText style={{ flex: 1, fontSize: 11.5, color: EST.muted }} numberOfLines={1}>• {s.serviceName}</EText>
                  <EText style={{ fontSize: 11.5, color: EST.muted }}>₹{fmtINR(s.price)}</EText>
                </View>
              ))}
              <View style={{ marginTop: 4 }}>
                {bookedLabel ? <EText style={{ fontSize: 11, color: EST.muted }}>Booking Time: <EText style={{ fontWeight: '700', color: EST.text }}>{bookedLabel}</EText></EText> : null}
                {etaLabel ? <EText style={{ fontSize: 11, color: EST.muted, marginTop: 1 }}>Estimated Time: <EText style={{ fontWeight: '700', color: EST.text }}>{etaLabel}</EText></EText> : null}
              </View>
            </View>
            <View style={{ borderTopWidth: 1, borderColor: EST.border, borderStyle: 'dashed', marginBottom: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <EText style={{ flex: 1, fontSize: 13, fontWeight: '800', color: EST.text }}>Grand Total</EText>
              <EText style={{ fontSize: 17, fontWeight: '800', color: EST.primary }}>₹{fmtINR(total)}</EText>
            </View>
            <EText style={{ fontSize: 11, color: EST.muted, marginTop: 5 }}>
              Final amount may vary slightly based on parts availability.
            </EText>
          </View>
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 4, paddingHorizontal: 16 }}>
        <View style={colWrap}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
            backgroundColor: EST.primary, shadowColor: EST.primary, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
          }}>
            <View style={{ flex: 1 }}>
              <EText style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>GRAND TOTAL · 1 DEVICE</EText>
              <EText style={{ color: EST.white, fontSize: 17, fontWeight: '800', marginTop: 1 }}>₹{fmtINR(total)}</EText>
            </View>
            <Pressable
              onPress={submit}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting, busy: submitting }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9,
                backgroundColor: EST.white, opacity: pressed || submitting ? 0.8 : 1,
              })}
            >
              {submitting ? (
                <ActivityIndicator color={EST.primary} />
              ) : (
                <>
                  <EText style={{ fontSize: 13, fontWeight: '800', color: EST.primary }}>Submit Estimate</EText>
                  <Send size={15} color={EST.primary} strokeWidth={2} style={{ marginLeft: 6 }} />
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
