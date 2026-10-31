import React, { useCallback, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, X, RotateCcw, CircleCheck, NotebookPen } from 'lucide-react-native';
import { Text, TextInput } from '../components/Typography';
import MintScreenHeader from '../components/MintScreenHeader';
import { notify } from '../components/confirm';
import { uploadMedia } from '../api/media';
import { getStaffTask, addStaffTaskEvidence } from '../api/staffTasks';
import { fmtStamp } from '../utils/staffTasks';
import { rf, rs } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

const MAX_NEW_PHOTOS = 6;

// Add Update / Upload Proof: camera or gallery photos plus a note, saved to
// the shared task. Each photo uploads as soon as it's picked (progress and a
// retry per photo); Save only sends hosted URLs, once.
export default function TaskUpdateScreen({ navigation, route }) {
  const taskId = route?.params?.taskId;
  const [task, setTask] = useState(null);
  const [slots, setSlots] = useState([]); // { key, uri, url?, state: 'uploading'|'done'|'failed' }
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const noteRef = useRef(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    getStaffTask(taskId).then((t) => { if (alive) setTask(t); }).catch(() => {});
    return () => { alive = false; };
  }, [taskId]));

  const upload = useCallback(async (slot) => {
    setSlots((prev) => prev.map((x) => (x.key === slot.key ? { ...x, state: 'uploading' } : x)));
    try {
      const res = await uploadMedia({ uri: slot.uri, name: slot.name, type: slot.type, folder: `staff-tasks/${taskId}` });
      const url = res?.url || res?.secure_url;
      if (!url) throw new Error('Upload failed. Please try again.');
      setSlots((prev) => prev.map((x) => (x.key === slot.key ? { ...x, url, state: 'done' } : x)));
    } catch {
      setSlots((prev) => prev.map((x) => (x.key === slot.key ? { ...x, state: 'failed' } : x)));
    }
  }, [taskId]);

  const pick = async (fromCamera) => {
    if (slots.length >= MAX_NEW_PHOTOS) { notify('Limit reached', `Add up to ${MAX_NEW_PHOTOS} photos per update.`); return; }
    try {
      if (Platform.OS !== 'web') {
        const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { notify('Permission needed', fromCamera ? 'Allow camera access to take a photo.' : 'Allow photo access to pick an image.'); return; }
      }
      const opts = { mediaTypes: ['images'], quality: 0.7 };
      const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const slot = { key: `${Date.now()}-${Math.random()}`, uri: a.uri, name: a.fileName || `task-${Date.now()}.jpg`, type: a.mimeType || 'image/jpeg', state: 'uploading' };
      setSlots((prev) => [...prev, slot]);
      upload(slot);
    } catch (e) {
      notify('Could not add photo', 'Please try again.', { type: 'error' });
    }
  };

  const uploading = slots.some((x) => x.state === 'uploading');
  const failed = slots.some((x) => x.state === 'failed');
  const ready = slots.filter((x) => x.state === 'done');
  const canSave = !saving && !uploading && !failed && (ready.length > 0 || note.trim());

  const save = async () => {
    if (!canSave || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      await addStaffTaskEvidence(taskId, { photos: ready.map((x) => x.url), note: note.trim() });
      notify(ready.length ? 'Proof uploaded' : 'Update saved', 'The shop can now see it.', { type: 'success' });
      navigation.goBack();
    } catch (e) {
      // Keep the picked photos and the note so nothing has to be redone.
      notify('Could not save update', userMessage(e, 'Please try again.'), { type: 'error' });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const existing = (Array.isArray(task?.evidence) ? task.evidence : []);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <MintScreenHeader title="Add Update" navigation={navigation} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {task ? <Text style={s.taskTitle} numberOfLines={2}>{task.title}</Text> : null}

        {/* Photo · Gallery · Note (design) */}
        <View style={s.tabs}>
          {[
            { key: 'photo', label: 'Photo', Icon: Camera, onPress: () => pick(true) },
            { key: 'gallery', label: 'Gallery', Icon: ImagePlus, onPress: () => pick(false) },
            { key: 'note', label: 'Note', Icon: NotebookPen, onPress: () => noteRef.current?.focus?.() },
          ].map((t, i) => (
            <TouchableOpacity key={t.key} onPress={t.onPress} style={[s.tab, i === 0 && s.tabOn]} accessibilityRole="button" accessibilityLabel={t.label}>
              <View style={[s.tabIcon, i === 0 && { backgroundColor: '#035C6C' }]}><t.Icon size={rs(15)} color={i === 0 ? '#FFFFFF' : '#6B7280'} strokeWidth={2.3} /></View>
              <Text style={[s.tabText, i === 0 && { color: '#035C6C' }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Photos{task?.requiresProof ? <Text style={{ color: '#F32C26' }}> * required to complete</Text> : <Text style={s.small}> (optional)</Text>}</Text>
          {!slots.length ? <Text style={s.small}>Take a photo or pick one from the gallery.</Text> : null}
          {slots.length ? (
            <View style={s.grid}>
              {slots.map((x) => (
                <View key={x.key} style={s.thumbWrap}>
                  <Image source={{ uri: x.uri }} style={s.thumb} />
                  {x.state === 'uploading' ? <View style={s.overlay}><ActivityIndicator color="#FFFFFF" /></View> : null}
                  {x.state === 'failed' ? (
                    <TouchableOpacity onPress={() => upload(x)} style={[s.overlay, { backgroundColor: 'rgba(243,44,38,0.75)' }]} accessibilityLabel="Retry upload">
                      <RotateCcw size={rs(18)} color="#FFFFFF" /><Text style={s.overlayText}>Retry</Text>
                    </TouchableOpacity>
                  ) : null}
                  {x.state === 'done' ? <View style={s.doneTick}><CircleCheck size={rs(14)} color="#FFFFFF" /></View> : null}
                  <TouchableOpacity onPress={() => setSlots((prev) => prev.filter((y) => y.key !== x.key))} style={s.remove} hitSlop={6} accessibilityLabel="Remove photo">
                    <X size={rs(11)} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
          {failed ? <Text style={[s.small, { color: '#F32C26', marginTop: rs(6) }]}>A photo failed to upload — tap it to retry or remove it.</Text> : null}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Add Note (Optional)</Text>
          <TextInput ref={noteRef} value={note} onChangeText={setNote} multiline placeholder="e.g. Parcel handed over to bus operator. Tracking number: …" placeholderTextColor="#9CA3AF" style={s.input} editable={!saving} />
        </View>

        {existing.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Already uploaded</Text>
            <View style={s.grid}>
              {existing.filter((e) => e.url).map((e) => <Image key={e.id || e.url} source={{ uri: e.url }} style={s.thumb} />)}
            </View>
            {existing.filter((e) => e.note).map((e) => (
              <Text key={`n-${e.id}`} style={[s.body, { marginTop: rs(4) }]}>• {e.note} <Text style={s.small}>{fmtStamp(e.uploadedAt)}</Text></Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={s.bar}>
        <TouchableOpacity onPress={save} disabled={!canSave} style={[s.saveBtn, !canSave && { opacity: 0.5 }]} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.saveText}>{uploading ? 'Uploading…' : 'Save Update'}</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: rs(12), paddingBottom: rs(24) },
  taskTitle: { fontSize: rf(14), fontWeight: '800', color: '#1C3053', marginBottom: rs(8) },
  card: { backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#E5E7EB', padding: rs(10), marginBottom: rs(8) },
  cardTitle: { fontSize: rf(13), fontWeight: '800', color: '#1C3053', marginBottom: rs(6) },
  small: { fontSize: rf(11), color: '#6B7280', fontWeight: '400' },
  body: { fontSize: rf(12.5), color: '#111111' },
  tabs: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#E5E7EB', padding: rs(4), marginBottom: rs(8) },
  tab: { flex: 1, alignItems: 'center', gap: rs(3), paddingVertical: rs(6), borderRadius: rs(10) },
  tabOn: { backgroundColor: '#E5F3F5' },
  tabIcon: { width: rs(30), height: rs(30), borderRadius: rs(15), backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: rf(11.5), fontWeight: '700', color: '#6B7280' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6), marginTop: rs(8) },
  thumbWrap: { width: rs(74), height: rs(74) },
  thumb: { width: rs(74), height: rs(74), borderRadius: rs(10), backgroundColor: '#F3F4F6' },
  overlay: { ...StyleSheet.absoluteFillObject, borderRadius: rs(10), backgroundColor: 'rgba(17,17,17,0.45)', alignItems: 'center', justifyContent: 'center' },
  overlayText: { fontSize: rf(10), color: '#FFFFFF', fontWeight: '800' },
  doneTick: { position: 'absolute', bottom: rs(4), left: rs(4), backgroundColor: '#609138', borderRadius: 999, padding: 1 },
  remove: { position: 'absolute', top: rs(3), right: rs(3), backgroundColor: 'rgba(17,17,17,0.7)', borderRadius: 999, padding: rs(3) },
  input: { minHeight: rs(70), borderWidth: 1, borderColor: '#E5E7EB', borderRadius: rs(10), padding: rs(9), fontSize: rf(12.5), color: '#111111', textAlignVertical: 'top', backgroundColor: '#F9FAFB' },
  bar: { padding: rs(10), backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  saveBtn: { minHeight: rs(44), borderRadius: rs(12), backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: rf(13.5), fontWeight: '800', color: '#FFFFFF' },
});
