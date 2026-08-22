import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ticketApi } from '../api/client';
import { uploadMedia } from '../api/media';
import { notify } from '../components/confirm';
import { rf, rlh } from '../utils/responsive';

function formatTime(val) {
  if (val == null) return '—';
  if (typeof val === 'string') return val.length >= 5 ? val.substring(0, 5) : val;
  return String(val);
}

function initialsFromName(name) {
  if (!name) return 'T';
  return name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}

function shiftHours(checkIn, checkOut) {
  const a = formatTime(checkIn);
  const b = formatTime(checkOut);
  if (a === '—' || b === '—') return null;
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  if ([ah, am, bh, bm].some((n) => Number.isNaN(n))) return null;
  let mins = (bh * 60 + bm) - (ah * 60 + am);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function TechnicianProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', photoUrl: '', defaultCheckIn: '09:30', defaultCheckOut: '18:30' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ticketApi.get('/technicians/me');
      setProfile(data);
      setForm({
        name: data?.name ?? '',
        phone: data?.phone ?? '',
        email: data?.email ?? '',
        photoUrl: data?.photoUrl ?? '',
        defaultCheckIn: data?.defaultCheckIn != null ? formatTime(data.defaultCheckIn) : '09:30',
        defaultCheckOut: data?.defaultCheckOut != null ? formatTime(data.defaultCheckOut) : '18:30',
      });
    } catch (e) {
      notify('Error', e?.message ?? 'Failed to load profile', { preset: 'error', haptic: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const notifyContactOwner = () => {
    notify(
      'Locked',
      'Your phone number and email can only be changed by the shop owner. Please contact them to update these details.'
    );
  };

  const handlePickPhoto = async () => {
    if (uploadingPhoto) return;
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          notify('Permission required', 'Allow photo library access to update your profile picture.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setUploadingPhoto(true);
      const techId = profile?.id ? `tech-${profile.id}` : 'me';
      const res = await uploadMedia({
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
        folder: `technicians/${techId}/avatar`,
      });
      const url = res?.url || res?.secure_url || null;
      if (!url) throw new Error('Upload returned no URL');
      const updated = await ticketApi.patch('/technicians/me', { body: { photoUrl: url } });
      setProfile(updated);
      setForm((p) => ({ ...p, photoUrl: url }));
    } catch (e) {
      notify('Upload failed', e?.message ?? 'Could not update photo', { preset: 'error', haptic: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      notify('Name required', 'Please enter your name before saving.', { preset: 'error' });
      return;
    }
    setSaving(true);
    try {
      // Only send fields this form actually edits. The duty roster
      // (defaultCheckIn/Out) is owner-managed and has no input here — including
      // it silently rewrote the roster on every save (truncating seconds, or
      // worse, replacing a null roster with the fabricated 09:30/18:30 default).
      const payload = {
        name: form.name.trim(),
        photoUrl: form.photoUrl?.trim() || null,
      };
      const updated = await ticketApi.patch('/technicians/me', { body: payload });
      setProfile(updated);
      setEditing(false);
      notify('Profile updated', 'Your changes have been saved.', { preset: 'done' });
    } catch (e) {
      notify('Error', e?.message ?? 'Failed to save', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.error}>Profile not found. Please log in again.</Text>
      </SafeAreaView>
    );
  }

  const checkIn = formatTime(profile.defaultCheckIn) === '—' ? '09:30' : formatTime(profile.defaultCheckIn);
  const checkOut = formatTime(profile.defaultCheckOut) === '—' ? '18:30' : formatTime(profile.defaultCheckOut);
  const shift = shiftHours(checkIn, checkOut);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header card with gradient-feel banner */}
          <View style={styles.headerCard}>
            <LinearGradient
              colors={[COLORS.primaryLight, COLORS.primary, COLORS.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerBanner}
            />
            <View style={styles.avatarWrap}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handlePickPhoto}
                disabled={uploadingPhoto}
              >
                {profile.photoUrl ? (
                  <Image source={{ uri: profile.photoUrl }} style={styles.avatarLarge} />
                ) : (
                  <View style={styles.avatarLarge}>
                    <Text style={styles.avatarInitials}>{initialsFromName(profile.name)}</Text>
                  </View>
                )}
                <View style={styles.avatarEditBadge}>
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="camera" size={16} color="#FFFFFF" />
                  )}
                </View>
              </TouchableOpacity>
            </View>
            <Text style={styles.name}>{profile.name || 'Technician'}</Text>
            {profile.email ? <Text style={styles.email}>{profile.email}</Text> : null}
            {profile.roleLabel ? (
              <View style={styles.roleBadge}>
                <View style={styles.roleDot} />
                <Text style={styles.roleText}>{profile.roleLabel}</Text>
              </View>
            ) : null}

            {/* Mini stats strip */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="log-in-outline" size={16} color={COLORS.primary} />
                <Text style={styles.statValue}>{checkIn}</Text>
                <Text style={styles.statLabel}>Check-in</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="log-out-outline" size={16} color={COLORS.primary} />
                <Text style={styles.statValue}>{checkOut}</Text>
                <Text style={styles.statLabel}>Check-out</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="time-outline" size={16} color={COLORS.primary} />
                <Text style={styles.statValue}>{shift ?? '—'}</Text>
                <Text style={styles.statLabel}>Shift</Text>
              </View>
            </View>
          </View>

          {editing ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Edit details</Text>

              <Text style={styles.label}>Name</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder="Your name"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              <Text style={styles.label}>Phone</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={notifyContactOwner}>
                <View style={[styles.inputWrap, styles.inputLocked]} pointerEvents="none">
                  <Ionicons name="call-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                  <Text style={[styles.input, styles.inputLockedText]} numberOfLines={1}>
                    {form.phone || '—'}
                  </Text>
                  <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} style={styles.lockIcon} />
                </View>
              </TouchableOpacity>

              <Text style={styles.label}>Email</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={notifyContactOwner}>
                <View style={[styles.inputWrap, styles.inputLocked]} pointerEvents="none">
                  <Ionicons name="mail-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                  <Text style={[styles.input, styles.inputLockedText]} numberOfLines={1}>
                    {form.email || '—'}
                  </Text>
                  <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} style={styles.lockIcon} />
                </View>
              </TouchableOpacity>

              <Text style={styles.lockedHint}>
                Phone and email can only be changed by the shop owner. Tap to learn more.
              </Text>

              <View style={styles.editRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)} disabled={saving}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Personal information</Text>

                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Ionicons name="person-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.infoBody}>
                    <Text style={styles.infoLabel}>Full name</Text>
                    <Text style={styles.infoValue}>{profile.name || '—'}</Text>
                  </View>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Ionicons name="call-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.infoBody}>
                    <Text style={styles.infoLabel}>Phone</Text>
                    <Text style={styles.infoValue}>{profile.phone || '—'}</Text>
                  </View>
                </View>

                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Ionicons name="mail-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.infoBody}>
                    <Text style={styles.infoLabel}>Email</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>{profile.email || '—'}</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)} activeOpacity={0.85}>
                <Ionicons name="pencil" size={18} color="#FFFFFF" />
                <Text style={styles.editBtnText}>Edit profile</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const COLORS = {
  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  // Brand green — matches the bottom tab bar + My Account so the app reads as
  // one product (was navy #00008B before).
  primary: '#004C40',
  primaryDark: '#004C40',
  primaryLight: '#004C40',
  primarySoft: 'rgba(22, 163, 74, 0.10)',
  success: '#004C40',
  successSoft: 'rgba(22, 163, 74, 0.12)',
  inputBg: '#F8FAFC',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  error: { fontSize: rf(14), color: '#DC2626', textAlign: 'center', marginTop: 24 },

  // Header card
  headerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 16,
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  headerBanner: {
    width: '100%',
    height: 64,
    backgroundColor: COLORS.primary,
  },
  avatarWrap: {
    marginTop: -44,
    padding: 4,
    backgroundColor: COLORS.card,
    borderRadius: 60,
  },
  avatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: rf(30), fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.card,
  },
  name: { fontSize: rf(20), fontWeight: '800', color: COLORS.text, marginTop: 12, paddingHorizontal: 16, textAlign: 'center' },
  email: { fontSize: rf(13), color: COLORS.textMuted, marginTop: 4, paddingHorizontal: 16, textAlign: 'center' },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 10,
    gap: 6,
  },
  roleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.success },
  roleText: { fontSize: rf(12), fontWeight: '700', color: COLORS.success },

  // Stats strip
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginTop: 16,
    marginHorizontal: 16,
    alignSelf: 'stretch',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: rf(14), fontWeight: '800', color: COLORS.text, marginTop: 2 },
  statLabel: { fontSize: rf(11), color: COLORS.textMuted, fontWeight: '500' },
  statDivider: { width: 1, height: 32, backgroundColor: COLORS.border },

  // Info card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: rf(13),
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoBody: { flex: 1 },
  infoLabel: { fontSize: rf(12), color: COLORS.textMuted, marginBottom: 2 },
  infoValue: { fontSize: rf(15), color: COLORS.text, fontWeight: '700' },
  infoDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8, marginLeft: 48 },

  // Edit form
  label: { fontSize: rf(12), color: COLORS.textMuted, marginBottom: 6, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  inputIcon: { marginRight: 6 },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: rf(15),
    color: COLORS.text,
  },
  inputLocked: {
    backgroundColor: '#F1F5F9',
    borderStyle: 'dashed',
  },
  inputLockedText: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  lockIcon: { marginLeft: 6 },
  lockedHint: {
    fontSize: rf(12),
    color: COLORS.textMuted,
    marginTop: -4,
    marginBottom: 12,
    lineHeight: rlh(16),
  },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeCol: { flex: 1 },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  editBtnText: { fontSize: rf(15), color: '#FFFFFF', fontWeight: '700' },

  editRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText: { fontSize: rf(15), color: COLORS.text, fontWeight: '600' },
  saveBtn: { flex: 1.4, paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: rf(15), color: '#fff', fontWeight: '700' },
});
