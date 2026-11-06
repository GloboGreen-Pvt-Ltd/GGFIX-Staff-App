import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  BatteryFull, BatteryLow, BatteryMedium, Check, ChevronDown, ChevronUp, Hand, Images, LayoutGrid, Plus, Smartphone, TriangleAlert, X,
} from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { notify } from '../../components/confirm';
import { getConditionGroups, getConditionOptions, getFunctionalIssues } from '../../api/master';
import { saveSellInspection } from '../../api/pickups';
import { uploadMedia } from '../../api/media';
import { rf } from '../../utils/responsive';
import { SC, SK, SellCard, SellCta, SellLoader, SellPage, goToSellStage, isGone, sellError, useSellPickup } from './sellKit';
import { getFunctionalIssueIcon } from './functionalIssueIcons';

// Device inspection after Compare Details, in three steps on one page:
// 1 Inspection — one pick per condition group (Screen / Display, Touch Glass,
//   Battery / Power …) and any functional issues; 2 Photos — at least 3 photos
//   (upload as soon as taken) and the IMEI; 3 Review & Report — then saved with
//   step 1's comparison (SellPickupController …/inspection). The whole draft is
//   kept on the device per pickup until it is saved.
const FALLBACK_GROUPS = [
  { id: 'SCREEN_DISPLAY', code: 'SCREEN_DISPLAY', name: 'Screen / Display', options: ['No Spot', 'Minor Spot or Particles', 'Major Spot or Particles', 'Multiple Visible Line', 'Discoloration'] },
  { id: 'TOUCH_GLASS', code: 'TOUCH_GLASS', name: 'Touch Glass', options: ['No Defects', '1 or 2 Minor Scratches', 'Heavy Scratches', 'Touch Glass Broken'] },
];
const BATTERY_GROUP = { id: 'BATTERY_POWER', code: 'BATTERY_POWER', name: 'Battery / Power', options: ['Good Battery Health', 'Weak Battery / Fast Drain', 'Battery Dead / Power Issue'] };
const FALLBACK_ISSUES = ['Battery Issue', 'Battery Replaced / Local Market', 'Flashlight Not Working', 'Front Camera Not Working', 'Back Camera Not Working',
  'Camera Glass Broken', 'SIM Slot Broken', 'Network Issue', 'Speaker Not Working', 'Mic Not Working', 'Touch ID / Face ID Not Working',
  'Volume Button Not Working', 'WiFi / Bluetooth Not Working', 'Charging Port Not Working', 'Proximity Sensor Not Working', 'Power Button Not Working',
  'Ear Speaker Low Sound', 'Vibrator Not Working'];
const STEPS = ['Inspection', 'Photos', 'Review & Report'];
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 8;

const isBattery = (g) => /battery|power/i.test(`${g.name} ${g.code}`);
const isClean = (label) => /^(no\b|good|working properly|flawless)|no (damage|defect|spot)/i.test(String(label || '').trim());
const groupIcon = (g) => (isBattery(g) ? BatteryMedium : /touch|glass/i.test(`${g.name} ${g.code}`) ? Hand : Smartphone);
const luhn = (d) => [...d].reverse().reduce((sum, ch, i) => {
  let n = Number(ch);
  if (i % 2) { n *= 2; if (n > 9) n -= 9; }
  return sum + n;
}, 0) % 10 === 0;

function OptionArt({ group, label, on }) {
  const color = on ? SK.teal : SK.navy;
  if (isBattery(group)) {
    const l = String(label).toLowerCase();
    if (/dead|power issue/.test(l)) return <BatteryLow size={28} color={SC.red} strokeWidth={1.7} />;
    if (/weak|drain/.test(l)) return <BatteryMedium size={28} color={SK.amber} strokeWidth={1.7} />;
    return <BatteryFull size={28} color={SC.green} strokeWidth={1.7} />;
  }
  return <Smartphone size={28} color={color} strokeWidth={1.5} />;
}

function Tick() {
  return (
    <View style={{ position: 'absolute', top: 5, right: 5, height: 18, width: 18, borderRadius: 9, backgroundColor: SC.green, alignItems: 'center', justifyContent: 'center' }}>
      <Check size={11} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}

function Tile({ on, onPress, label, role, children }) {
  return (
    <View style={{ width: '33.333%', padding: 4 }}>
      <Pressable onPress={onPress} accessibilityRole={role} accessibilityState={{ checked: on }} accessibilityLabel={label}
        style={{ minHeight: 88, borderRadius: 12, padding: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? SC.greenSoft : '#FFFFFF', borderWidth: on ? 2 : 1, borderColor: on ? SC.green : SK.line }}>
        {on ? <Tick /> : null}
        {children}
        <Text numberOfLines={3} style={{ fontSize: rf(11.5), fontWeight: on ? '800' : '600', color: SK.ink, textAlign: 'center', marginTop: 6 }}>{label}</Text>
      </Pressable>
    </View>
  );
}

function Section({ title, Icon, open, onToggle, children }) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <SellCard style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: SK.tealSoft }}>
        <Icon size={20} color={SK.teal} />
        <Text style={{ flex: 1, marginLeft: 10, fontSize: rf(14.5), fontWeight: '800', color: SK.ink }}>{title}</Text>
        <Chevron size={20} color={SK.ink} />
      </Pressable>
      {open ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>{children}</View> : null}
    </SellCard>
  );
}

function Stepper({ step, onStep }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: SK.line }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const on = step === n;
        const done = step > n;
        return (
          <React.Fragment key={label}>
            {i ? <View style={{ flex: 1, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: done || on ? SK.teal : SK.ring, marginTop: 12, marginHorizontal: 4 }} /> : null}
            <Pressable onPress={() => (done ? onStep(n) : null)} disabled={!done} style={{ alignItems: 'center', minWidth: 70 }} accessibilityLabel={`Step ${n} ${label}`}>
              <View style={{ height: 26, width: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done || on ? SK.teal : '#FFFFFF', borderWidth: 1.5, borderColor: done || on ? SK.teal : SK.ring }}>
                {done ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : <Text style={{ fontSize: rf(12), fontWeight: '800', color: on ? '#FFFFFF' : SK.muted }}>{n}</Text>}
              </View>
              <Text style={{ marginTop: 4, fontSize: rf(11.5), fontWeight: on ? '800' : '600', color: on ? SK.teal : SK.muted }}>{label}</Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

export default function SellInspectionScreen({ navigation, route }) {
  const p = route.params || {};
  const { id, booking } = useSellPickup(route);
  const [step, setStep] = useState(1);
  const [groups, setGroups] = useState(null); // [{ id, code, name, opts: [{ id, label }] }]
  const [issues, setIssues] = useState([]); // [{ id, code, name }]
  const [picks, setPicks] = useState({}); // groupId -> optionId
  const [issueIds, setIssueIds] = useState([]);
  const [closed, setClosed] = useState({});
  const [imei, setImei] = useState('');
  const [photos, setPhotos] = useState([]); // { key, uri, url, busy, failed }
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const seq = useRef(0);
  const restored = useRef(false);
  const draftKey = `sellInspectionDraft:${id}`;

  // Condition groups / functional issues from master data for the device's category (fallback: the phone list).
  useEffect(() => {
    let alive = true;
    (async () => {
      const cat = booking?.categoryId || booking?.device?.categoryId || p.device?.categoryId;
      const list = await getConditionGroups(cat).catch(() => []);
      const base = list.length ? list : FALLBACK_GROUPS;
      const out = [];
      for (const g of base) {
        const fromApi = list.length ? await getConditionOptions(g.id).catch(() => []) : [];
        const opts = fromApi.length ? fromApi.map((o) => ({ id: o.id, label: o.label || o.name })) : (g.options || []).map((o, i) => ({ id: `${g.id}-${i}`, label: o }));
        if (opts.length) out.push({ id: g.id, code: g.code || g.id, name: g.name, opts });
      }
      if (!out.some(isBattery)) out.push({ ...BATTERY_GROUP, opts: BATTERY_GROUP.options.map((o, i) => ({ id: `${BATTERY_GROUP.id}-${i}`, label: o })) });
      const fi = await getFunctionalIssues(cat).catch(() => []);
      if (!alive) return;
      setGroups(out);
      setIssues(fi.length ? fi : FALLBACK_ISSUES.map((n, i) => ({ id: `f${i}`, name: n })));
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save: the draft is kept on the device per pickup, restored on reopen, cleared once saved.
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(draftKey).then((raw) => {
      if (!live || !raw) return;
      const d = JSON.parse(raw);
      if (d.picks) setPicks(d.picks);
      if (Array.isArray(d.issueIds)) setIssueIds(d.issueIds);
      if (d.imei != null) setImei(d.imei);
      if (d.step) setStep(d.step);
      if (Array.isArray(d.photos)) {
        seq.current = d.photos.length;
        setPhotos(d.photos.map((x, i) => ({ key: `d${i}`, uri: x.uri || x.url, url: x.url, busy: false, failed: false })));
      }
    }).catch(() => {}).finally(() => { restored.current = true; });
    return () => { live = false; };
  }, [draftKey]);

  useEffect(() => {
    if (!restored.current) return;
    const t = setTimeout(() => {
      const draft = { step, picks, issueIds, imei, photos: photos.filter((x) => x.url).map((x) => ({ uri: x.uri, url: x.url })) };
      AsyncStorage.setItem(draftKey, JSON.stringify(draft)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [draftKey, step, picks, issueIds, imei, photos]);

  const uploaded = photos.filter((x) => x.url);
  const imeiOk = imei === '' || (/^\d{15}$/.test(imei) && luhn(imei));
  const inspected = !!groups && groups.every((g) => picks[g.id]);
  const photosReady = uploaded.length >= MIN_PHOTOS && !photos.some((x) => x.busy) && imeiOk;
  const chosen = (g) => g.opts.find((o) => o.id === picks[g.id]);
  const pickedIssues = issues.filter((it) => issueIds.includes(it.id));

  const upload = async (item) => {
    try {
      const res = await uploadMedia({ uri: item.uri, name: item.name || 'sell-pickup.jpg', type: item.type || 'image/jpeg', folder: 'sell-pickup', slot: `${id}-${item.key}` });
      const url = res?.url || res?.secure_url;
      setPhotos((all) => all.map((x) => (x.key === item.key ? { ...x, url, busy: false, failed: !url } : x)));
    } catch (e) {
      setPhotos((all) => all.map((x) => (x.key === item.key ? { ...x, busy: false, failed: true } : x)));
      notify('Photo not uploaded', sellError(e, 'Tap the photo to try again.'), { type: 'error' });
    }
  };

  const pick = async (fromCamera) => {
    if (photos.length >= MAX_PHOTOS) return;
    try {
      if (Platform.OS !== 'web') {
        const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          notify('Permission required', `Allow ${fromCamera ? 'camera' : 'photo library'} access to add device photos.`, { type: 'warning' });
          return;
        }
      }
      const opts = { mediaTypes: ['images'], allowsEditing: false, quality: 0.7 };
      const result = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset?.uri) return;
      seq.current += 1;
      const item = { key: String(seq.current), uri: asset.uri, name: asset.fileName, type: asset.mimeType, url: null, busy: true, failed: false };
      setPhotos((all) => [...all, item]);
      upload(item);
    } catch (e) {
      notify('Could not open the camera', sellError(e, 'Please try again.'), { type: 'error' });
    }
  };

  const retry = (item) => {
    setPhotos((all) => all.map((x) => (x.key === item.key ? { ...x, busy: true, failed: false } : x)));
    upload(item);
  };

  const save = async () => {
    if (!inspected || !photosReady || lock.current) return;
    lock.current = true;
    setSaving(true);
    // Same checklist shape as before: ok=false marks a defect for the owner's price review.
    const checks = [
      ...groups.map((g) => {
        const o = chosen(g);
        const clean = isClean(o.label);
        return { key: g.code, label: g.name, result: clean ? 'PASS' : 'FAIL', ok: clean, note: clean ? '' : o.label, value: o.label };
      }),
      ...pickedIssues.map((it) => ({ key: it.code || it.id, label: it.name, result: 'FAIL', ok: false, note: it.name })),
    ];
    if (imei) checks.push({ key: 'imei', label: 'IMEI', result: 'PASS', ok: true, note: '', value: imei });
    try {
      const b = await saveSellInspection(id, {
        compare: p.compare || [],
        condition: p.condition || null,
        issues: p.issue || null,
        checks,
        conditions: groups.map((g) => ({ groupCode: g.code, groupName: g.name, optionId: chosen(g).id, optionLabel: chosen(g).label })),
        functionalIssues: pickedIssues.map((it) => ({ issueId: it.id, issueCode: it.code || null, name: it.name })),
        imei: imei || null,
        photos: uploaded.map((x) => x.url),
      });
      AsyncStorage.removeItem(draftKey).catch(() => {});
      notify('Inspection saved', 'Decide the price next.', { type: 'success' });
      goToSellStage(navigation, { ...booking, ...b });
    } catch (e) {
      if (isGone(e)) {
        notify('Pickup changed', 'This pickup was updated. Showing the latest status.', { type: 'info' });
        navigation.popTo('PickupAssign');
      } else {
        notify('Could not save inspection', sellError(e, 'Please try again.'), { type: 'error' });
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const footer = step === 1 ? <SellCta title="Save & Next" onPress={() => setStep(2)} disabled={!inspected} />
    : step === 2 ? <SellCta title="Save & Next" onPress={() => setStep(3)} disabled={!photosReady} />
      : <SellCta title="Submit Inspection" onPress={save} disabled={!inspected || !photosReady} loading={saving} />;

  return (
    <SellPage title="Device Inspection" subtitle="Verify customer's device condition" navigation={navigation} footer={footer}>
      <Stepper step={step} onStep={setStep} />
      {!groups ? <SellLoader /> : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              {groups.map((g) => (
                <Section key={g.id} title={g.name} Icon={groupIcon(g)} open={!closed[g.id]} onToggle={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))}>
                  {g.opts.map((o) => {
                    const on = picks[g.id] === o.id;
                    return (
                      <Tile key={o.id} on={on} role="radio" label={o.label} onPress={() => setPicks((s) => ({ ...s, [g.id]: o.id }))}>
                        <OptionArt group={g} label={o.label} on={on} />
                      </Tile>
                    );
                  })}
                </Section>
              ))}
              <Section title="Functional Issues" Icon={LayoutGrid} open={!closed.__issues} onToggle={() => setClosed((c) => ({ ...c, __issues: !c.__issues }))}>
                {issues.map((it) => {
                  const on = issueIds.includes(it.id);
                  const Icon = getFunctionalIssueIcon(it.name);
                  return (
                    <Tile key={it.id} on={on} role="checkbox" label={it.name} onPress={() => setIssueIds((s) => (s.includes(it.id) ? s.filter((x) => x !== it.id) : [...s, it.id]))}>
                      <View>
                        <Icon size={26} color={on ? SK.teal : SK.navy} strokeWidth={1.7} />
                        {!on ? <View style={{ position: 'absolute', right: -6, bottom: -3 }}><TriangleAlert size={12} color={SK.amber} fill={SK.amberSoft} strokeWidth={2.2} /></View> : null}
                      </View>
                    </Tile>
                  );
                })}
              </Section>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <SellCard title={`Inspection Photos (Min ${MIN_PHOTOS})`}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {photos.map((x) => (
                    <Pressable key={x.key} onPress={() => (x.failed ? retry(x) : null)} accessibilityLabel={x.failed ? 'Retry photo upload' : 'Device photo'}
                      style={{ height: 70, width: 70, borderRadius: 12, overflow: 'hidden', backgroundColor: SK.tile }}>
                      <Image source={{ uri: x.uri }} style={{ height: 70, width: 70 }} />
                      {x.busy || x.failed ? (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
                          {x.busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: rf(11), fontWeight: '800', color: '#FFFFFF' }}>Retry</Text>}
                        </View>
                      ) : null}
                      {!x.busy ? (
                        <Pressable onPress={() => setPhotos((all) => all.filter((y) => y.key !== x.key))} hitSlop={6} accessibilityLabel="Remove photo"
                          style={{ position: 'absolute', top: 4, right: 4, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={12} color="#FFFFFF" strokeWidth={3} />
                        </Pressable>
                      ) : null}
                    </Pressable>
                  ))}
                  {photos.length < MAX_PHOTOS ? (
                    <>
                      <Pressable onPress={() => pick(true)} accessibilityRole="button" accessibilityLabel="Take photo"
                        style={{ height: 70, width: 70, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: SK.teal, alignItems: 'center', justifyContent: 'center', backgroundColor: SK.tealSoft }}>
                        <Plus size={22} color={SK.teal} />
                        <Text style={{ fontSize: rf(10.5), color: SK.teal, fontWeight: '700' }}>Camera</Text>
                      </Pressable>
                      <Pressable onPress={() => pick(false)} accessibilityRole="button" accessibilityLabel="Choose from gallery"
                        style={{ height: 70, width: 70, borderRadius: 12, borderWidth: 1, borderColor: SK.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
                        <Images size={20} color={SK.muted} />
                        <Text style={{ fontSize: rf(10.5), color: SK.muted, fontWeight: '700' }}>Gallery</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
                <Text style={{ fontSize: rf(11.5), color: uploaded.length >= MIN_PHOTOS ? SC.green : SK.muted, marginTop: 8 }}>
                  {uploaded.length}/{MIN_PHOTOS} photos added{uploaded.length < MIN_PHOTOS ? ' — front, back and any damage' : ''}
                </Text>
              </SellCard>
              <SellCard title="IMEI (optional)">
                <TextInput value={imei} onChangeText={(t) => setImei(t.replace(/\D/g, '').slice(0, 15))} keyboardType="number-pad" maxLength={15}
                  placeholder="15-digit IMEI (dial *#06#)" placeholderTextColor={SK.ring} accessibilityLabel="IMEI"
                  style={{ borderWidth: 1.5, borderColor: imeiOk ? SK.line : SC.red, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: rf(13), color: SK.ink, letterSpacing: 1 }} />
                {!imeiOk ? <Text style={{ marginTop: 4, fontSize: rf(11.5), color: SC.red }}>Enter a valid 15-digit IMEI or leave it empty.</Text> : null}
              </SellCard>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <SellCard title="Condition">
                {groups.map((g) => {
                  const o = chosen(g);
                  const clean = o && isClean(o.label);
                  return (
                    <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: SK.line }}>
                      <Text style={{ flex: 1, fontSize: rf(12.5), color: SK.muted }}>{g.name}</Text>
                      <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: clean ? SC.green : SC.amberInk }}>{o?.label || '—'}</Text>
                    </View>
                  );
                })}
              </SellCard>
              <SellCard title={`Functional Issues (${pickedIssues.length})`}>
                <Text style={{ fontSize: rf(12.5), color: pickedIssues.length ? SK.ink : SC.green, fontWeight: '700' }}>
                  {pickedIssues.length ? pickedIssues.map((it) => it.name).join(', ') : 'No issues found'}
                </Text>
              </SellCard>
              <SellCard title={`Photos (${uploaded.length})`}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {uploaded.map((x) => <Image key={x.key} source={{ uri: x.uri }} style={{ height: 56, width: 56, borderRadius: 10, backgroundColor: SK.tile }} />)}
                </View>
                {imei ? <Text style={{ marginTop: 8, fontSize: rf(12.5), color: SK.ink }}>IMEI: {imei}</Text> : null}
              </SellCard>
            </>
          ) : null}
        </ScrollView>
      )}
    </SellPage>
  );
}
