import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View, ActivityIndicator } from 'react-native';
import { Check, ChevronDown, MessageSquarePlus, Search, X } from 'lucide-react-native';
import { EST, EText, ETextInput, Pressable } from './estimate/EstimateKit';
import {
  getModel, listAllRepairServices, listDeviceCategories, listModelsForBrand,
  listRepairCategories, listRepairServices, listRepairServicesGrouped,
} from '../api/master';
import { IssueTile, groupIconFor, iconFor } from '../screens/PickupDevicesRepairScreen';
import { resolveSpecCategory } from '../utils/imeiPolicy';

// The job's device category (Mobile / Tablet / Laptop …): the ticket's own,
// else its model's, else a category word in the device name. null = unknown.
async function resolveDeviceCategory({ deviceCategoryId, brandId, modelId, deviceName }, all) {
  if (deviceCategoryId) return String(deviceCategoryId);
  if (modelId) {
    const m = await getModel(modelId).catch(() => null);
    if (m?.categoryId) return String(m.categoryId);
  }
  if (brandId && modelId) {
    const list = await listModelsForBrand(brandId).catch(() => []);
    const m = list.find((x) => String(x.id) === String(modelId));
    if (m?.categoryId) return String(m.categoryId);
  }
  const kind = resolveSpecCategory(deviceName);
  const hit = kind ? all.find((c) => resolveSpecCategory(c.code, c.name) === kind) : null;
  return hit ? String(hit.id) : null;
}

const FIRST_TILES = 6;
const TILE_ORDER = [/dead|no power/i, /display|screen/i, /battery/i, /motherboard|mainboard|sub-?board/i, /network/i, /security/i];
const tileRank = (name) => { const i = TILE_ORDER.findIndex((re) => re.test(String(name || ''))); return i === -1 ? TILE_ORDER.length : i; };
const priceNum = (v) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;
const cleanPrice = (v) => String(v || '').replace(/[^0-9]/g, '').slice(0, 7);

export const issuesTotal = (list) => (list || []).reduce((t, i) => t + priceNum(i.price), 0);
// The text sent as the re-estimate's additionalIssue (prices inline when given).
export const issuesText = (list) => (list || []).map((i) => (priceNum(i.price) ? `${i.name} (₹${priceNum(i.price).toLocaleString('en-IN')})` : i.name)).join(', ');
// Per-service technician notes → the re-estimate's technicianNotes (null when none).
export const issuesNotes = (list) => (list || []).filter((i) => String(i.note || '').trim())
  .map((i) => `${i.name}: ${String(i.note).trim()}`).join('\n') || null;

// Additional issue / service picker for the Service Re-Estimate request — the
// same category tiles + issue checklist as Devices & Repair (master repair
// services), plus Other Issue for anything not listed. value: [{ id, name, code, price, custom }].
export default function ReEstimateIssuePicker({ value, onChange, deviceCategoryId, brandId, modelId, deviceName, disabled }) {
  const [devCats, setDevCats] = useState([]);
  const [catId, setCatId] = useState(undefined); // undefined = still resolving
  const [catLocked, setCatLocked] = useState(false);
  const [services, setServices] = useState([]);
  const [cats, setCats] = useState([]);
  const [grouped, setGrouped] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [viewAll, setViewAll] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');

  // Resolve the job's device type first, so Mobile / Tablet / Laptop issues never mix.
  useEffect(() => {
    let alive = true;
    (async () => {
      const all = await listDeviceCategories().catch(() => []);
      const id = await resolveDeviceCategory({ deviceCategoryId, brandId, modelId, deviceName }, all);
      if (!alive) return;
      setDevCats(all);
      setCatLocked(!!id);
      // Unknown → the technician picks the device type (Mobile first); never all at once.
      const mobile = all.find((c) => resolveSpecCategory(c.code, c.name) === 'MOBILE');
      setCatId(id || (mobile ? String(mobile.id) : all[0] ? String(all[0].id) : null));
    })();
    return () => { alive = false; };
  }, [deviceCategoryId, brandId, modelId, deviceName]);

  useEffect(() => {
    if (catId === undefined) return undefined;
    let alive = true;
    setLoading(true);
    Promise.all([
      catId ? listRepairServices({ deviceCategoryId: catId }).catch(() => null) : listAllRepairServices().catch(() => null),
      listRepairCategories(catId ? { deviceCategoryId: catId } : {}).catch(() => []),
      catId ? listRepairServicesGrouped(catId).catch(() => []) : Promise.resolve([]),
    ]).then(([s, c, g]) => {
      if (!alive) return;
      setFailed(s === null);
      setServices(Array.isArray(s) ? s : []);
      setCats(Array.isArray(c) ? c : []);
      setGrouped(Array.isArray(g) ? g : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [catId]);

  const groups = useMemo(() => {
    const all = services.filter((s) => s?.id && (!catId || !s.deviceCategoryId || String(s.deviceCategoryId) === catId))
      .map((s) => ({ ...s, id: String(s.id) }));
    const byId = new Map(all.map((s) => [s.id, s]));
    let out = [];
    if (grouped.length) {
      out = grouped.map((g) => ({
        id: String(g.id),
        name: g.name,
        services: (g.issues || []).map((i) => byId.get(String(i.id)) || (i?.id && i?.name ? { ...i, id: String(i.id) } : null)).filter(Boolean),
      })).filter((g) => g.services.length);
    }
    if (!out.length) {
      const catName = Object.fromEntries(cats.map((c) => [c.id, c.name]));
      const byCat = new Map();
      all.forEach((s) => {
        const key = s.categoryId || '__other__';
        if (!byCat.has(key)) byCat.set(key, { id: key, name: catName[key] || 'Other', services: [] });
        byCat.get(key).services.push(s);
      });
      out = [...byCat.values()];
    }
    return out.map((g, i) => ({ g, i })).sort((a, b) => tileRank(a.g.name) - tileRank(b.g.name) || a.i - b.i).map(({ g }) => g);
  }, [services, cats, grouped, catId]);

  const picked = useMemo(() => new Set((value || []).map((i) => String(i.id))), [value]);
  const q = query.trim().toLowerCase();
  const matched = q ? groups.filter((g) => g.name.toLowerCase().includes(q) || g.services.some((s) => String(s.name).toLowerCase().includes(q))) : groups;
  const visible = q || viewAll ? matched : matched.slice(0, FIRST_TILES);
  const sheetGroup = groups.find((g) => g.id === sheet) || null;
  const custom = (value || []).filter((i) => i.custom);

  const toggle = (s) => {
    const id = String(s.id);
    onChange(picked.has(id) ? value.filter((i) => String(i.id) !== id) : [...(value || []), { id, name: s.name, code: s.code || null, price: '' }]);
  };
  const addOther = () => {
    const name = otherText.replace(/\s+/g, ' ').trim();
    setOtherOpen(false);
    setOtherText('');
    if (name && !(value || []).some((i) => i.name.toLowerCase() === name.toLowerCase())) {
      onChange([...(value || []), { id: `custom_${Date.now()}`, name, code: null, price: '', custom: true }]);
    }
  };
  const setPrice = (id, price) => onChange(value.map((i) => (i.id === id ? { ...i, price: cleanPrice(price) } : i)));
  const setNote = (id, note) => onChange(value.map((i) => (i.id === id ? { ...i, note } : i)));
  const total = issuesTotal(value);

  return (
    <View pointerEvents={disabled ? 'none' : 'auto'} style={{ opacity: disabled ? 0.6 : 1 }}>
      {!catLocked && devCats.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {devCats.map((c) => {
            const on = String(c.id) === catId;
            return (
              <Pressable
                key={c.id}
                onPress={() => { setViewAll(false); setCatId(String(c.id)); }}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, marginRight: 8, borderWidth: 1, borderColor: on ? EST.primary : EST.border, backgroundColor: on ? EST.primary : EST.white }}
              >
                <EText style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#FFFFFF' : EST.text }}>{c.name}</EText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: EST.border, backgroundColor: '#F9FAFB', marginBottom: 8 }}>
        <Search size={16} color={EST.muted} />
        <ETextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search issue (e.g. display, battery)"
          autoCorrect={false}
          cursorColor={EST.primary}
          style={{ flex: 1, marginLeft: 8, paddingVertical: 0, fontSize: 13, color: EST.text }}
        />
        {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><X size={15} color={EST.muted} /></Pressable> : null}
      </View>

      {loading ? <ActivityIndicator color={EST.primary} style={{ marginVertical: 14 }} /> : null}
      {!loading && failed ? <EText style={{ fontSize: 12, color: EST.red, marginBottom: 6 }}>Could not load the issue list. Use Other Issue to type it.</EText> : null}
      {!loading && q && matched.length === 0 ? <EText style={{ fontSize: 12, color: EST.muted, marginBottom: 6 }}>No matching issues. Use Other Issue to add it.</EText> : null}

      {!loading ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
          {visible.map((g) => (
            <View key={g.id} style={{ width: '33.33%', padding: 3 }}>
              <IssueTile name={g.name} Icon={groupIconFor(g.name)} picked={g.services.filter((s) => picked.has(String(s.id))).length} onPress={() => setSheet(g.id)} />
            </View>
          ))}
          <View style={{ width: '33.33%', padding: 3 }}>
            <IssueTile name="Other Issue" Icon={MessageSquarePlus} picked={custom.length} onPress={() => { setOtherText(''); setOtherOpen(true); }} />
          </View>
        </View>
      ) : null}
      {!loading && !q && matched.length > FIRST_TILES ? (
        <Pressable onPress={() => setViewAll((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}>
          <EText style={{ fontSize: 12.5, fontWeight: '700', color: EST.primary }}>{viewAll ? 'Show less' : `View All (${matched.length})`}</EText>
          <ChevronDown size={14} color={EST.primary} style={{ marginLeft: 2, transform: [{ rotate: viewAll ? '180deg' : '0deg' }] }} />
        </Pressable>
      ) : null}

      {value?.length ? (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <EText style={{ flex: 1, fontSize: 13, fontWeight: '800', color: EST.text }}>Selected Services ({value.length})</EText>
            <EText style={{ fontSize: 13, fontWeight: '800', color: total ? EST.primary : EST.muted }}>{total ? `₹${total.toLocaleString('en-IN')}` : 'Not Estimated'}</EText>
          </View>
          {value.map((i) => {
            const Icon = i.custom ? MessageSquarePlus : iconFor(i.code, i.name);
            return (
              <View key={i.id} style={{ padding: 8, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: '#C7E6EA', backgroundColor: EST.white }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: EST.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} color={EST.primary} />
                </View>
                <EText numberOfLines={2} style={{ flex: 1, marginHorizontal: 8, fontSize: 12.5, fontWeight: '600', color: EST.text }}>{i.name}</EText>
                <View style={{ width: 86, height: 36, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderRadius: 9, borderWidth: 1, borderColor: EST.border }}>
                  <EText style={{ fontSize: 12.5, fontWeight: '700', color: EST.muted, marginRight: 3 }}>₹</EText>
                  <ETextInput
                    value={i.price}
                    onChangeText={(v) => setPrice(i.id, v)}
                    placeholder="Price"
                    keyboardType="number-pad"
                    cursorColor={EST.primary}
                    style={{ flex: 1, paddingVertical: 0, fontSize: 12.5, fontWeight: '700', color: EST.text }}
                  />
                </View>
                <Pressable onPress={() => onChange(value.filter((x) => x.id !== i.id))} hitSlop={8} style={{ marginLeft: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FDECEB', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={13} color={EST.red} />
                </Pressable>
              </View>
              <ETextInput
                value={i.note || ''}
                onChangeText={(v) => setNote(i.id, v)}
                placeholder="Technician notes (optional)"
                multiline
                maxLength={500}
                cursorColor={EST.primary}
                textAlignVertical="top"
                style={{ marginTop: 8, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: EST.border, backgroundColor: '#F9FAFB', paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: EST.text }}
              />
              </View>
            );
          })}
        </View>
      ) : null}

      <Modal visible={!!sheetGroup} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setSheet(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,17,17,0.45)' }} onPress={() => setSheet(null)} />
          <View style={{ backgroundColor: EST.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: EST.border, marginBottom: 10 }} />
            {sheetGroup ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  {(() => { const G = groupIconFor(sheetGroup.name); return <G size={20} color={EST.text} strokeWidth={1.75} />; })()}
                  <EText numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: EST.text }}>{sheetGroup.name}</EText>
                  <Pressable onPress={() => setSheet(null)} hitSlop={8}><X size={20} color={EST.muted} /></Pressable>
                </View>
                <ScrollView style={{ maxHeight: 420 }}>
                  {sheetGroup.services.map((s) => {
                    const on = picked.has(String(s.id));
                    const SIcon = iconFor(s.code, s.name);
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => toggle(s)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, borderRadius: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? EST.primary : EST.border, backgroundColor: on ? EST.soft : EST.white }}
                      >
                        <SIcon size={19} color={on ? EST.primary : EST.text} strokeWidth={1.75} />
                        <EText numberOfLines={2} style={{ flex: 1, marginLeft: 12, fontSize: 13, fontWeight: on ? '700' : '500', color: EST.text }}>{s.name}</EText>
                        <View style={{ height: 20, width: 20, borderRadius: 6, borderWidth: 1.5, borderColor: on ? EST.primary : EST.placeholder, backgroundColor: on ? EST.primary : EST.white, alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable onPress={() => setSheet(null)} style={{ marginTop: 8, height: 46, borderRadius: 23, backgroundColor: EST.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <EText style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Done</EText>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={otherOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOtherOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,17,17,0.45)' }} onPress={() => setOtherOpen(false)} />
          <View style={{ backgroundColor: EST.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <MessageSquarePlus size={20} color={EST.text} strokeWidth={1.75} />
              <EText style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '800', color: EST.text }}>Other Issue</EText>
              <Pressable onPress={() => setOtherOpen(false)} hitSlop={8}><X size={20} color={EST.muted} /></Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 46, borderRadius: 12, borderWidth: 1, borderColor: EST.border }}>
              <ETextInput
                value={otherText}
                onChangeText={setOtherText}
                autoFocus
                onSubmitEditing={addOther}
                returnKeyType="done"
                maxLength={150}
                placeholder="Describe the issue (e.g. Face ID not working)"
                cursorColor={EST.primary}
                style={{ flex: 1, paddingVertical: 0, fontSize: 13, color: EST.text }}
              />
            </View>
            <Pressable onPress={addOther} style={{ marginTop: 12, height: 46, borderRadius: 23, backgroundColor: EST.primary, alignItems: 'center', justifyContent: 'center' }}>
              <EText style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Add Issue</EText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
