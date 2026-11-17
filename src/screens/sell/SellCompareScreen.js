import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { CircleCheck, Pencil, Smartphone, TriangleAlert } from 'lucide-react-native';
import { Text, TextInput } from '../../components/Typography';
import { getSellEvaluation, startSellInspection } from '../../api/pickups';
import { deviceLabel, trackingId } from '../../utils/pickups';
import { rf } from '../../utils/responsive';
import { SC, SK, SellCard, SellCta, SellLoader, SellPage, SellStepper, cardShadow, useSellPickup } from './sellKit';

export const CONDITIONS = ['Like New', 'Excellent', 'Good', 'Fair', 'Poor'];
const NO_ISSUE = 'No issue';
const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameIssue = (a, b) => (norm(a) || norm(NO_ISSUE)) === (norm(b) || norm(NO_ISSUE));
const human = (code) => String(code || '').replace(/[_-]+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

// What the customer listed, from their sell answers (SellPickupController …/evaluation).
function listingOf(b, ev) {
  const labels = [...new Set((ev?.conditions || []).map((c) => c?.optionLabel).filter(Boolean))];
  const issues = (ev?.issues || []).map((i) => human(i?.issueCode)).filter(Boolean);
  return {
    brand: b?.brandName || '',
    model: b?.modelName || '',
    storage: b?.storageLabel || '',
    color: ev?.color || b?.color || '',
    condition: labels.join(', ') || ev?.conditionSummary || human(ev?.workingCondition) || '',
    issue: issues.join(', ') || NO_ISSUE,
  };
}

const ROWS = [
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'storage', label: 'Storage' },
  { key: 'color', label: 'Color' },
  { key: 'condition', label: 'Condition' },
  { key: 'issue', label: 'Issue' },
];

// Step 1 of the device inspection: the customer's listing beside what the
// pickup person finds. Brand / model / storage start as the listing (tap to
// correct); condition is chosen, issues typed. Nothing is saved here — the
// Inspection step saves both together.
export default function SellCompareScreen({ navigation, route }) {
  const { id, booking } = useSellPickup(route);
  const [listing, setListing] = useState(null);
  const [actual, setActual] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    let live = true;
    startSellInspection(id).catch(() => {}); // timeline only: never blocks the inspection
    getSellEvaluation(id).catch(() => null).then((ev) => {
      if (!live) return;
      const l = listingOf(booking, ev);
      const saved = Object.fromEntries((ev?.pickupInspection?.compare || []).map((r) => [r.key, r.actual]));
      setListing({ ...l, photos: Array.isArray(ev?.photos) ? ev.photos : [] });
      setActual({
        brand: saved.brand ?? l.brand,
        model: saved.model ?? l.model,
        storage: saved.storage ?? l.storage,
        color: saved.color ?? l.color,
        condition: CONDITIONS.includes(saved.condition) ? saved.condition : null,
        issue: saved.issue && !sameIssue(saved.issue, NO_ISSUE) ? saved.issue : '',
      });
    });
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!listing || !actual) {
    return <SellPage title="Device Inspection" navigation={navigation}><SellStepper step={1} /><SellLoader /></SellPage>;
  }

  const shown = (k) => (k === 'issue' ? (actual.issue.trim() || NO_ISSUE) : actual[k] || '—');
  const matches = (k) => (k === 'issue' ? sameIssue(actual.issue, listing.issue) : norm(actual[k]) === norm(listing[k]));
  const ready = !!actual.condition && ['brand', 'model'].every((k) => String(actual[k] || '').trim());
  const next = () => navigation.navigate('SellInspection', {
    bookingId: id,
    booking,
    compare: ROWS.map((r) => ({ key: r.key, label: r.label, listing: listing[r.key] || '—', actual: shown(r.key), match: matches(r.key) })),
    condition: actual.condition,
    issue: actual.issue.trim(),
  });
  const img = booking?.frontImageUrl;

  return (
    <SellPage
      title="Device Inspection"
      navigation={navigation}
      footer={<SellCta title="Continue to Inspection" onPress={next} disabled={!ready} />}
    >
      <SellStepper step={1} />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: SK.line, padding: 12, ...cardShadow }}>
          {img ? <Image source={{ uri: img }} style={{ height: 56, width: 56, borderRadius: 12, backgroundColor: SK.tile }} resizeMode="contain" /> : (
            <View style={{ height: 56, width: 56, borderRadius: 12, backgroundColor: SK.tealSoft, alignItems: 'center', justifyContent: 'center' }}><Smartphone size={24} color={SK.teal} /></View>
          )}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: rf(16), fontWeight: '800', color: SK.ink }} numberOfLines={2}>{deviceLabel(booking)}</Text>
            <Text style={{ fontSize: rf(12), color: SK.muted, marginTop: 2 }}>{trackingId(booking)}</Text>
          </View>
        </View>

        {listing.photos.length ? (
          <SellCard title="Customer Photos (From Listing)">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {listing.photos.map((u) => (
                <Image key={u} source={{ uri: u }} accessibilityLabel="Customer photo" style={{ height: 72, width: 72, borderRadius: 12, backgroundColor: SK.tile }} />
              ))}
            </ScrollView>
          </SellCard>
        ) : null}

        <SellCard style={{ padding: 0, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, padding: 10, backgroundColor: SK.tile }}>
              <Text style={{ fontSize: rf(12), fontWeight: '800', color: SK.navy }}>Customer Details</Text>
              <Text style={{ fontSize: rf(11), color: SK.muted }}>(From Listing)</Text>
            </View>
            <View style={{ flex: 1, padding: 10, backgroundColor: SK.tealSoft }}>
              <Text style={{ fontSize: rf(12), fontWeight: '800', color: SK.teal }}>Your Inspection</Text>
              <Text style={{ fontSize: rf(11), color: SK.teal }}>(Actual)</Text>
            </View>
          </View>
          {ROWS.map((r) => {
            const ok = matches(r.key);
            const editable = r.key !== 'condition';
            const open = editing === r.key;
            return (
              <View key={r.key} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: SK.line }}>
                <View style={{ flex: 1, padding: 10 }}>
                  <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: SK.ink }}>{r.label}</Text>
                  <Text style={{ fontSize: rf(12.5), color: SK.muted, marginTop: 2 }}>{listing[r.key] || '—'}</Text>
                </View>
                <Pressable
                  onPress={() => (editable ? setEditing(open ? null : r.key) : null)}
                  accessibilityRole={editable ? 'button' : undefined}
                  accessibilityLabel={`${r.label}: ${shown(r.key)}`}
                  style={{ flex: 1, padding: 10, flexDirection: 'row', alignItems: 'flex-start' }}
                >
                  {r.key === 'condition' && !actual.condition ? <View style={{ height: 18, width: 18 }} />
                    : ok ? <CircleCheck size={18} color={SC.green} /> : <TriangleAlert size={18} color={SK.amber} />}
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    {open ? (
                      <TextInput
                        value={actual[r.key]}
                        onChangeText={(t) => setActual((a) => ({ ...a, [r.key]: t }))}
                        onBlur={() => setEditing(null)}
                        autoFocus
                        placeholder={r.key === 'issue' ? 'e.g. Display scratches' : listing[r.key]}
                        placeholderTextColor={SK.ring}
                        maxLength={r.key === 'issue' ? 120 : 60}
                        style={{ fontSize: rf(12.5), color: SK.ink, borderBottomWidth: 1.5, borderBottomColor: SK.teal, paddingVertical: 2 }}
                      />
                    ) : (
                      <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: r.key === 'condition' && !actual.condition ? SK.muted : SK.ink }}>
                        {r.key === 'condition' && !actual.condition ? 'Choose below' : shown(r.key)}
                      </Text>
                    )}
                  </View>
                  {editable && !open ? <Pencil size={13} color={SK.muted} style={{ marginLeft: 4, marginTop: 2 }} /> : null}
                </Pressable>
              </View>
            );
          })}
        </SellCard>

        <SellCard title="Actual Condition">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CONDITIONS.map((c) => {
              const on = actual.condition === c;
              return (
                <Pressable key={c} onPress={() => setActual((a) => ({ ...a, condition: c }))} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: on ? 2 : 1, borderColor: on ? SK.teal : SK.line, backgroundColor: on ? SK.tealSoft : '#FFFFFF' }}>
                  <Text style={{ fontSize: rf(13), fontWeight: on ? '800' : '600', color: on ? SK.teal : SK.ink }}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontSize: rf(11.5), color: SK.muted, marginTop: 10 }}>Tap Brand, Model, Storage or Issue above to correct what differs on the device.</Text>
        </SellCard>
      </ScrollView>
    </SellPage>
  );
}
