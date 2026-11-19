import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, AppState, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ChevronDown, ChevronUp, CircleAlert, Cloud, CloudOff, Link2, Mic, Plus, Square, Trash2, Video as VideoIcon, X } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { AudioRow, Badge, Btn, Card, DeviceThumb, Input, Label, PickerSheet, SC, SectionTitle, Select, Stepper, fmtWhen } from '../components/SolutionKit';
import { notify } from '../components/confirm';
import { listBrands, listModelsForBrand, listRepairCategories } from '../api/master';
import { Audio } from '../utils/audio';
import { userMessage } from '../utils/userMessages';
import { rf } from '../utils/responsive';
import {
  RESULTS, SLOTS, checkMedia, loadRecords, newRecordId, persistMedia, removeMediaFile, resultOf,
  serverBlocker, step1Missing, step2Missing, submitRecord, upsertRecord,
} from '../utils/solutionRecords';

const AUDIO_MIME = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', '3gp': 'audio/3gpp', caf: 'audio/x-caf', webm: 'audio/webm', wav: 'audio/wav' };

function blankRecord(ticketId, d) {
  return {
    id: newRecordId(), createdAt: Date.now(), status: 'draft', step: 1, ticketId: ticketId || null, jobRef: d?.jobRef || null,
    brand: d?.brand?.id ? { id: d.brand.id, name: d.brand.name || null } : null,
    model: d?.model?.id ? { id: d.model.id, name: d.model.name || null } : null,
    category: null, issue: d?.issue || '', diagnosis: '', solution: '', steps: [], parts: '', result: null, media: [],
  };
}

// Upload New — Details → Steps & Evidence → Review & Save. The record is
// autosaved on this phone 1 s after the last change (and on leave /
// background) and restored on reopen; it reaches the server only on Submit.
export default function SolutionPackUploadScreen({ route, navigation }) {
  const { ticketId: jobTicketId, defaults, recordId } = route.params || {};
  const insets = useSafeAreaInsets();
  const [rec, setRec] = useState(null);
  const [restored, setRestored] = useState(null);
  const [save, setSave] = useState({ kind: 'idle' });
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [cats, setCats] = useState([]);
  const [picker, setPicker] = useState(null);
  const [stepText, setStepText] = useState('');
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState({});
  const recRef = useRef(null);
  const dirty = useRef(false);
  const timer = useRef(null);
  const leaving = useRef(false);
  const recorder = useRef(null);
  const scroll = useRef(null);

  // ---- load: the record asked for, else this job's unfinished one (no duplicates), else a new one ----
  useEffect(() => {
    let alive = true;
    (async () => {
      let found = null;
      try {
        const list = await loadRecords();
        found = recordId ? list.find((r) => r.id === recordId)
          : jobTicketId ? list.filter((r) => r.ticketId === jobTicketId && r.status !== 'published').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] : null;
      } catch (e) {
        if (alive) setSave({ kind: 'error', message: e?.message || 'Could not read saved records.' });
      }
      if (!alive) return;
      if (found) { const r = checkMedia(found); setRec(r); setRestored(r); } else setRec(blankRecord(jobTicketId, defaults));
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { listBrands().then(setBrands).catch(() => setBrands([])); }, []);
  useEffect(() => { listRepairCategories().then(setCats).catch(() => setCats([])); }, []);
  useEffect(() => {
    if (!rec?.brand?.id) { setModels([]); return; }
    listModelsForBrand(rec.brand.id).then(setModels).catch(() => setModels([]));
  }, [rec?.brand?.id]);
  // Job defaults may carry ids only — fill names from the catalogue (not an edit).
  useEffect(() => {
    if (!rec) return;
    const b = !rec.brand?.name && rec.brand?.id ? brands.find((x) => x.id === rec.brand.id) : null;
    const m = !rec.model?.name && rec.model?.id ? models.find((x) => x.id === rec.model.id) : null;
    if (b || m) setRec((r) => ({ ...r, ...(b ? { brand: { id: b.id, name: b.name } } : {}), ...(m ? { model: { id: m.id, name: m.name } } : {}) }));
  }, [brands, models, rec?.brand?.id, rec?.model?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- autosave ----
  const persist = useCallback(async () => {
    clearTimeout(timer.current);
    const r = recRef.current;
    if (!r || !dirty.current || r.status === 'published') return r;
    dirty.current = false;
    setSave({ kind: 'saving' });
    try {
      const s = await upsertRecord(r);
      setSave({ kind: 'saved', at: s.updatedAt });
      return s;
    } catch (e) {
      dirty.current = true;
      setSave({ kind: 'error', message: e?.message || 'Storage error' });
      throw e;
    }
  }, []);

  useEffect(() => {
    recRef.current = rec;
    if (!rec || !dirty.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { persist().catch(() => {}); }, 1000);
  }, [rec, persist]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') persist().catch(() => {}); });
    return () => {
      sub.remove();
      persist().catch(() => {});
      recorder.current?.stopAndUnloadAsync?.().catch(() => {});
    };
  }, [persist]);

  const update = useCallback((patch, keepStatus) => {
    dirty.current = true;
    setRec((r) => {
      const n = { ...r, ...(typeof patch === 'function' ? patch(r) : patch) };
      if (!keepStatus && n.status === 'saved') n.status = 'draft';
      return n;
    });
  }, []);

  const goStep = useCallback((n) => {
    update({ step: n }, true);
    scroll.current?.scrollTo?.({ y: 0, animated: false });
  }, [update]);

  // Back from step 2/3 returns to the previous step; from step 1 it leaves to the job.
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (leaving.current) return;
    const r = recRef.current;
    if (r && r.step > 1 && r.status !== 'published' && ['GO_BACK', 'POP'].includes(e.data?.action?.type)) {
      e.preventDefault();
      goStep(r.step - 1);
      return;
    }
    persist().catch(() => {});
  }), [navigation, goStep, persist]);

  useEffect(() => {
    navigation.setOptions({ title: rec?.step === 3 ? 'Review & Save' : 'Upload New' });
  }, [navigation, rec?.step]);

  const leave = () => { leaving.current = true; navigation.goBack(); };

  // ---- media ----
  const addMedia = (asset, kind, slot) => {
    const ext = (String(asset.name || asset.uri).split('?')[0].split('.').pop() || '').toLowerCase();
    const name = kind === 'image' ? `${slot}-${Date.now()}.${ext || 'jpg'}` : kind === 'audio' ? `voice-note.${ext || 'm4a'}` : `video-${Date.now()}.${ext || 'mp4'}`;
    let localUri = asset.uri;
    try {
      localUri = persistMedia(asset.uri, name);
    } catch {
      notify('Could not keep the file on this phone', 'It is attached for now, but may be lost if the app is closed. Try adding it again.', { type: 'error' });
    }
    const type = asset.mimeType || (kind === 'audio' ? AUDIO_MIME[ext] || 'audio/mp4' : kind === 'video' ? 'video/mp4' : 'image/jpeg');
    update((r) => {
      const old = r.media.filter((m) => (slot ? m.slot === slot : m.kind === kind));
      old.forEach((m) => removeMediaFile(m.localUri));
      return { media: [...r.media.filter((m) => !old.includes(m)), { id: newRecordId(), kind, slot: slot || null, localUri, name, type }] };
    });
  };

  const removeMedia = (m) => {
    update((r) => ({ media: r.media.filter((x) => x.id !== m.id) }));
    removeMediaFile(m.localUri);
  };

  const chooseSource = (title) => (Platform.OS === 'web' ? Promise.resolve('library') : new Promise((res) => {
    Alert.alert(title, '', [
      { text: 'Camera', onPress: () => res('camera') },
      { text: 'Gallery', onPress: () => res('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => res(null) },
    ], { cancelable: true, onDismiss: () => res(null) });
  }));

  const pickAsset = async (kind) => {
    try {
      const src = await chooseSource(kind === 'images' ? 'Add photo' : 'Add video');
      if (!src) return null;
      const perm = src === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { notify('Permission required', `Allow ${src === 'camera' ? 'camera' : 'photo library'} access to attach files.`, { type: 'warning' }); return null; }
      const opts = { mediaTypes: [kind], allowsEditing: false, quality: 0.8, videoMaxDuration: 120 };
      const res = src === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      return res.canceled ? null : res.assets?.[0] || null;
    } catch {
      notify('Could not open the picker', 'Please try again.', { type: 'error' });
      return null;
    }
  };

  const addPhoto = async (slot) => { const a = await pickAsset('images'); if (a?.uri) addMedia({ ...a, name: a.fileName }, 'image', slot); };
  const addVideo = async () => { const a = await pickAsset('videos'); if (a?.uri) addMedia({ ...a, name: a.fileName }, 'video'); };

  const toggleVoice = async () => {
    if (recording) {
      setRecording(false);
      const r = recorder.current;
      recorder.current = null;
      try {
        await r?.stopAndUnloadAsync();
        const uri = r?.getURI();
        if (uri) addMedia({ uri, name: uri.split('/').pop() }, 'audio');
      } catch { notify('Could not save the voice note', 'Please try again.', { type: 'error' }); }
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { notify('Microphone needed', 'Allow microphone access to record a voice note.', { type: 'warning' }); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const r = new Audio.Recording();
      await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await r.startAsync();
      recorder.current = r;
      setRecording(true);
    } catch { notify('Could not start recording', 'Please try again.', { type: 'error' }); }
  };

  // ---- steps / actions ----
  const addStep = () => {
    const t = stepText.replace(/\s+/g, ' ').trim();
    if (!t) return;
    update((r) => ({ steps: [...r.steps, t] }));
    setStepText('');
  };

  const next = () => {
    const miss = rec.step === 1 ? step1Missing(rec) : step2Missing(rec);
    if (miss.length) { notify('Fill the required fields', miss.join(', '), { type: 'warning' }); return; }
    goStep(rec.step + 1);
  };

  const pickStep = (n) => {
    if (n === rec.step) return undefined;
    if (n < rec.step) return goStep(n);
    if (n === 2 && !step1Missing(rec).length) return goStep(2);
    if (n === 3 && !step1Missing(rec).length && !step2Missing(rec).length) return goStep(3);
    return next();
  };

  const saveDraft = async () => {
    dirty.current = true;
    try {
      await persist();
      notify('Draft saved', 'Saved on this phone only (Local only).', { type: 'success' });
      leave();
    } catch (e) {
      notify('Could not save on this phone', e?.message || 'Storage error', { type: 'error' });
    }
  };

  const submit = async () => {
    if (submitting) return;
    const miss = [...step1Missing(rec), ...step2Missing(rec)];
    if (miss.length) { notify('Fill the required fields', miss.join(', '), { type: 'warning' }); return; }
    const block = serverBlocker(rec);
    if (block) {
      const r = { ...recRef.current, status: 'saved', lastError: block };
      recRef.current = r; setRec(r); dirty.current = true;
      try { await persist(); } catch (e) { notify('Could not save on this phone', e?.message || 'Storage error', { type: 'error' }); return; }
      notify('Saved on this phone only', block, { type: 'warning' });
      leave();
      return;
    }
    setSubmitting(true);
    try {
      await persist();
      await submitRecord(recRef.current, (r) => { recRef.current = r; setRec(r); });
      notify('Published', 'The server confirmed your solution. It now shows in View Reference.', { type: 'success' });
      leave();
    } catch (e) {
      const msg = userMessage(e, 'Could not reach the server.');
      const r = { ...recRef.current, status: 'saved', lastError: `Not submitted: ${msg}` };
      recRef.current = r; setRec(r);
      try { await upsertRecord(r); } catch { /* storage error shown below */ }
      notify('Not submitted', `${msg} Your record is kept on this phone — retry from My Repair Records.`, { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!rec) return <View style={{ flex: 1, backgroundColor: SC.bg }}><ActivityIndicator color={SC.green} style={{ marginTop: 30 }} /></View>;

  if (rec.status === 'published') {
    return (
      <View style={{ flex: 1, backgroundColor: SC.bg, padding: 20 }}>
        <Text style={{ textAlign: 'center', color: SC.muted }}>This record is already published and cannot be edited.</Text>
        <Btn label="View record" style={{ flex: 0, marginTop: 16 }} onPress={() => navigation.replace('SolutionPackDetails', { recordId: rec.id })} />
      </View>
    );
  }

  const lost = rec.media.filter((m) => m.missing && !m.url).length;
  const blocker = serverBlocker(rec);
  const sheet = {
    brand: { title: 'Select Brand', options: brands.map((b) => ({ key: b.id, label: b.name })), set: (v) => update({ brand: v, model: null }) },
    model: { title: 'Select Model', options: models.map((m) => ({ key: m.id, label: m.name })), set: (v) => update({ model: v }) },
    cat: { title: 'Repair Category', options: cats.map((c) => ({ key: c.id, label: c.name })), set: (v) => update({ category: v }) },
  }[picker];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: SC.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stepper step={rec.step} onPick={pickStep} />
      <SaveLine save={save} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 14, paddingTop: 6, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        {restored && restored.id === rec.id ? (
          <Note tone="teal" text={`Draft restored · last saved ${fmtWhen(restored.updatedAt)}`} onClose={() => setRestored(null)} />
        ) : null}
        {lost ? <Note tone="red" text={`${lost} media file(s) could not be recovered on this phone. Please add them again.`} /> : null}

        {rec.step === 1 ? (
          <>
            <SectionTitle>Device & Issue Details</SectionTitle>
            <Label required>Brand</Label>
            <Select value={rec.brand?.name} placeholder={rec.brand?.id ? 'Loading…' : 'Select brand'} onPress={() => setPicker('brand')} />
            <Label required>Model</Label>
            <Select value={rec.model?.name} placeholder={rec.model?.id ? 'Loading…' : 'Select model'} onPress={() => setPicker('model')} disabled={!rec.brand?.id} />
            <Label required>Repair Category</Label>
            <Select value={rec.category?.name} placeholder={cats.length ? 'Select category' : 'Loading categories…'} onPress={() => setPicker('cat')} />
            <Label required>Issue / Problem</Label>
            <Input multiline value={rec.issue} onChangeText={(v) => update({ issue: v })} placeholder="e.g. Battery not charging" maxLength={2000} />
            <View style={{ flexDirection: 'row', backgroundColor: SC.tint, borderRadius: 12, padding: 12, marginTop: 14 }}>
              {rec.ticketId ? <Link2 size={18} color={SC.green} /> : <CloudOff size={18} color={SC.warn} />}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: rf(13), fontWeight: '800', color: SC.green }}>{rec.ticketId ? `From Job: ${rec.jobRef || 'this job'}` : 'Not linked to a job'}</Text>
                <Text style={{ fontSize: rf(11.5), color: SC.muted, marginTop: 2 }}>
                  {rec.ticketId ? 'Device and issue are pre-filled from this job.' : 'This record will be saved on this phone only. Open Upload New from a job to publish it.'}
                </Text>
              </View>
            </View>
          </>
        ) : null}

        {rec.step === 2 ? (
          <>
            <SectionTitle>Repair Information</SectionTitle>
            <Label required>Diagnosis / Root Cause</Label>
            <Input multiline value={rec.diagnosis} onChangeText={(v) => update({ diagnosis: v })} placeholder="What caused the fault?" maxLength={2000} />
            <Label required>Repair Solution</Label>
            <Input multiline value={rec.solution} onChangeText={(v) => update({ solution: v })} placeholder="How did you fix it?" maxLength={2000} />
            <Label required>Repair Steps</Label>
            {rec.steps.map((s, i) => (
              <View key={`${i}-${s}`} style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: SC.border, borderRadius: 10, padding: 9, marginBottom: 6 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: SC.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontSize: rf(11), fontWeight: '800' }}>{i + 1}</Text>
                </View>
                <Text style={{ flex: 1, marginLeft: 10, fontSize: rf(13), color: SC.ink }}>{s}</Text>
                <TouchableOpacity hitSlop={8} onPress={() => update((r) => ({ steps: r.steps.filter((_, j) => j !== i) }))}>
                  <Trash2 size={17} color={SC.ink} />
                </TouchableOpacity>
              </View>
            ))}
            <Input value={stepText} onChangeText={setStepText} placeholder={`Step ${rec.steps.length + 1} — e.g. Opened back cover`} onSubmitEditing={addStep} returnKeyType="done" blurOnSubmit={false} maxLength={300} />
            <TouchableOpacity onPress={addStep} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: SC.tint, borderRadius: 12, paddingVertical: 10, marginTop: 8 }}>
              <Plus size={17} color={SC.green} />
              <Text style={{ marginLeft: 6, fontSize: rf(13.5), fontWeight: '800', color: SC.green }}>Add Step</Text>
            </TouchableOpacity>

            <SectionTitle style={{ marginTop: 18 }}>Repair Evidence</SectionTitle>
            <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
              {SLOTS.map(([slot, label, req]) => {
                const m = rec.media.find((x) => x.slot === slot);
                return (
                  <View key={slot} style={{ flex: 1, paddingHorizontal: 4 }}>
                    <TouchableOpacity
                      onPress={() => addPhoto(slot)}
                      activeOpacity={0.8}
                      style={{ height: 86, borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderStyle: m && !m.missing ? 'solid' : 'dashed', borderColor: m?.missing ? SC.red : SC.border, alignItems: 'center', justifyContent: 'center', backgroundColor: SC.soft }}
                    >
                      {m && !m.missing ? <Image source={{ uri: m.localUri || m.url }} style={{ width: '100%', height: '100%' }} />
                        : <><Plus size={20} color={m?.missing ? SC.red : SC.green} /><Text style={{ fontSize: rf(10), color: m?.missing ? SC.red : SC.muted, marginTop: 2 }}>{m?.missing ? 'Re-add' : 'Add photo'}</Text></>}
                    </TouchableOpacity>
                    {m ? (
                      <TouchableOpacity onPress={() => removeMedia(m)} hitSlop={8} style={{ position: 'absolute', top: -6, right: 0, backgroundColor: SC.bg, borderRadius: 11, borderWidth: 1, borderColor: SC.border, padding: 2 }}>
                        <X size={13} color={SC.ink} />
                      </TouchableOpacity>
                    ) : null}
                    <Text style={{ textAlign: 'center', fontSize: rf(12), fontWeight: '700', color: SC.ink, marginTop: 4 }}>
                      {label}{req ? <Text style={{ color: SC.red }}> *</Text> : null}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 12, marginHorizontal: -4 }}>
              <MediaTile icon={recording ? Square : Mic} label={recording ? 'Stop Recording' : 'Add Voice Note'} active={recording} onPress={toggleVoice} />
              <MediaTile icon={VideoIcon} label="Add Video" onPress={addVideo} />
            </View>
            {rec.media.filter((m) => m.kind === 'audio').map((m) => (
              m.missing ? <Note key={m.id} tone="red" text="Voice note could not be recovered — record it again." onClose={() => removeMedia(m)} />
                : <AudioRow key={m.id} uri={m.localUri || m.url} label="Voice note" onRemove={() => removeMedia(m)} />
            ))}
            {rec.media.filter((m) => m.kind === 'video').map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: m.missing ? '#FEE2E2' : SC.soft, borderRadius: 10, padding: 8, marginTop: 8 }}>
                <VideoIcon size={18} color={m.missing ? SC.red : SC.green} />
                <Text style={{ flex: 1, marginLeft: 10, fontSize: rf(12.5), color: m.missing ? SC.red : SC.ink }} numberOfLines={1}>{m.missing ? 'Video could not be recovered — add it again' : 'Video attached'}</Text>
                <TouchableOpacity onPress={() => removeMedia(m)} hitSlop={8}><X size={16} color={SC.muted} /></TouchableOpacity>
              </View>
            ))}

            <Label optional>Parts Used</Label>
            <Input value={rec.parts} onChangeText={(v) => update({ parts: v })} placeholder="e.g. Battery connector" maxLength={500} />
            <Label required>Testing Result</Label>
            <View style={{ borderWidth: 1, borderColor: SC.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 }}>
              {RESULTS.map((o) => {
                const on = rec.result === o.key;
                return (
                  <TouchableOpacity key={o.key} onPress={() => update({ result: o.key })} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: on ? SC.green : SC.faint, alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SC.green }} /> : null}
                    </View>
                    <Text style={{ marginLeft: 10, fontSize: rf(13), color: SC.ink }}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {rec.step === 3 ? (
          <>
            <Text style={{ fontSize: rf(16), fontWeight: '800', color: SC.ink, marginBottom: 10 }}>Review Your Repair Record</Text>
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <DeviceThumb brand={rec.brand} model={rec.model} size={50} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: rf(14.5), fontWeight: '800', color: SC.ink }} numberOfLines={1}>{[rec.brand?.name, rec.model?.name].filter(Boolean).join(' ')}</Text>
                <Text style={{ fontSize: rf(12.5), color: SC.ink, marginTop: 2 }} numberOfLines={2}>{String(rec.issue).split('\n')[0]}</Text>
                <Text style={{ fontSize: rf(11.5), color: SC.muted, marginTop: 4 }}>Category : {rec.category?.name || '—'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: rf(11.5), color: SC.muted, marginRight: 6 }}>Result :</Text>
                  {resultOf(rec.result) ? <Badge label={resultOf(rec.result).label} tone={rec.result === 'fixed' ? 'ok' : 'warn'} /> : <Text style={{ fontSize: rf(11.5) }}>—</Text>}
                </View>
              </View>
            </Card>
            {[
              ['fault', 'Fault / Problem', rec.issue],
              ['diag', 'Diagnosis / Root Cause', rec.diagnosis],
              ['sol', 'Repair Solution', rec.solution],
              ['steps', `Repair Steps (${rec.steps.length})`, rec.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')],
              ['parts', 'Parts Used', rec.parts],
            ].map(([k, label, text]) => (
              <View key={k} style={{ borderBottomWidth: 1, borderBottomColor: SC.border }}>
                <TouchableOpacity onPress={() => setOpen((o) => ({ ...o, [k]: !o[k] }))} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11 }}>
                  <Text style={{ flex: 1, fontSize: rf(13.5), fontWeight: '700', color: SC.green }}>{label}</Text>
                  {open[k] ? <ChevronUp size={17} color={SC.ink} /> : <ChevronDown size={17} color={SC.ink} />}
                </TouchableOpacity>
                {open[k] ? <Text style={{ fontSize: rf(12.5), color: '#374151', paddingBottom: 10, lineHeight: rf(18) }}>{String(text || '').trim() || 'Not added'}</Text> : null}
              </View>
            ))}
            <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: SC.green, marginTop: 12, marginBottom: 8 }}>Media ({rec.media.length})</Text>
            <View style={{ flexDirection: 'row' }}>
              {rec.media.filter((m) => m.kind === 'image').slice(0, 3).map((m) => (
                <Image key={m.id} source={{ uri: m.localUri || m.url }} style={{ width: 62, height: 62, borderRadius: 10, marginRight: 8, backgroundColor: SC.soft }} />
              ))}
              {rec.media.length > 3 ? (
                <View style={{ width: 62, height: 62, borderRadius: 10, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>+{rec.media.length - 3}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: blocker ? SC.warnTint : SC.tint, borderRadius: 12, padding: 12, marginTop: 14 }}>
              {blocker ? <CircleAlert size={18} color={SC.warn} /> : <Cloud size={18} color={SC.green} />}
              <Text style={{ flex: 1, marginLeft: 10, fontSize: rf(12), color: blocker ? SC.warn : SC.green }}>
                {blocker || 'Currently Local only. Submit uploads the media and saves this record to the shop server; it shows as Published only after the server confirms.'}
              </Text>
            </View>
            {rec.lastError ? <Text style={{ fontSize: rf(11.5), color: SC.warn, marginTop: 8 }}>{rec.lastError}</Text> : null}
          </>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10), borderTopWidth: 1, borderTopColor: SC.border, backgroundColor: SC.bg }}>
        {rec.step === 1 ? <Btn label="Next" onPress={next} /> : (
          <>
            <Btn outline label="Save Draft" onPress={saveDraft} disabled={submitting} style={{ marginRight: 10 }} />
            {rec.step === 2 ? <Btn label="Next" onPress={next} />
              : <Btn label={blocker ? 'Save on Phone' : 'Submit for Review'} onPress={submit} loading={submitting} />}
          </>
        )}
      </View>

      <PickerSheet
        visible={!!sheet}
        title={sheet?.title}
        options={sheet?.options || []}
        onPick={(o) => { sheet.set({ id: o.key, name: o.label }); setPicker(null); }}
        onClose={() => setPicker(null)}
      />
    </KeyboardAvoidingView>
  );
}

function SaveLine({ save }) {
  const t = save.kind === 'saving' ? 'Saving on this phone…'
    : save.kind === 'saved' ? `Autosaved on this phone · ${fmtWhen(save.at)} · Local only`
      : save.kind === 'error' ? `Could not save on this phone: ${save.message}` : 'Autosaves on this phone as you type · Local only';
  return (
    <Text style={{ fontSize: rf(10.5), textAlign: 'center', color: save.kind === 'error' ? '#B91C1C' : SC.muted, paddingHorizontal: 14, marginBottom: 4 }} numberOfLines={2}>{t}</Text>
  );
}

function Note({ text, tone, onClose }) {
  const red = tone === 'red';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: red ? '#FEE2E2' : SC.tint, borderRadius: 10, padding: 10, marginBottom: 10, marginTop: 6 }}>
      <Text style={{ flex: 1, fontSize: rf(12), color: red ? '#B91C1C' : SC.green }}>{text}</Text>
      {onClose ? <TouchableOpacity onPress={onClose} hitSlop={8}><X size={15} color={red ? '#B91C1C' : SC.green} /></TouchableOpacity> : null}
    </View>
  );
}

function MediaTile({ icon: Icon, label, onPress, active }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 4 }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ backgroundColor: active ? '#FEE2E2' : SC.tint, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
        <Icon size={22} color={active ? SC.red : SC.green} />
        <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: active ? SC.red : SC.green, marginTop: 4 }}>{label}</Text>
        <Text style={{ fontSize: rf(10.5), color: SC.muted }}>(Optional)</Text>
      </TouchableOpacity>
    </View>
  );
}
