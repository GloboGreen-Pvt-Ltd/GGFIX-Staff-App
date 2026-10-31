import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image, RefreshControl, Modal, Pressable } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Camera,
  Image as ImageIcon,
  LogIn,
  LogOut,
  Clock,
  User,
  Phone,
  Mail,
  ShieldCheck,
  Calendar,
  Pencil,
  Lock,
  X,
  RefreshCw,
  CircleUser,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { ticketApi } from '../api/client';
import { uploadMedia } from '../api/media';
import { notify } from '../components/confirm';
import { rf, rlh, rs, sheetWidth } from '../utils/responsive';
import { logProfileDebug, isShopOwnerSession } from '../utils/profileDebug';
import { applyProfileToSession } from '../auth/refreshProfile';
import { selectSession } from '../store/authSlice';
import { employeeIdFromSession } from '../utils/employeeId';
import MintScreenHeader from '../components/MintScreenHeader';
import { userMessage } from '../utils/userMessages';

function formatTime(val) {
  if (val == null) return '—';
  if (typeof val === 'string') return val.length >= 5 ? val.substring(0, 5) : val;
  return String(val);
}

function initialsFromName(name) {
  if (!name) return 'T';
  return name.trim().charAt(0).toUpperCase() || 'T';
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

// "2026-09-10" -> "10 Sep 2026"
function formatJoinDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

export default function TechnicianProfileScreen() {
  const navigation = useNavigation();
  const session = useSelector(selectSession);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  // Why the profile failed to load ({ status, message }) — shown on screen.
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', photoUrl: '', defaultCheckIn: '09:30', defaultCheckOut: '18:30' });

  const dispatch = useDispatch();
  const [refreshing, setRefreshing] = useState(false);
  // Refs so the focus refetch can't clobber an in-progress edit, and so a
  // late response can't setState after unmount.
  const editingRef = useRef(false);
  editingRef.current = editing;
  const mountedRef = useRef(true);
  React.useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await ticketApi.get('/technicians/me');
      logProfileDebug('profile ok', { endpoint: 'GET /technicians/me', technician: { id: data?.id ?? null, userId: data?.userId ?? null, shopId: data?.shopId ?? null, phone: data?.phone ?? null, roleLabel: data?.roleLabel ?? null } });
      if (!mountedRef.current) return;
      setProfile(data);
      // Owner-managed fields (phone/email) always refresh; the editable ones
      // only when the user isn't mid-edit.
      setForm((prev) => (editingRef.current
        ? { ...prev, phone: data?.phone ?? '', email: data?.email ?? '' }
        : {
          name: data?.name ?? '',
          phone: data?.phone ?? '',
          email: data?.email ?? '',
          photoUrl: data?.photoUrl ?? '',
          defaultCheckIn: data?.defaultCheckIn != null ? formatTime(data.defaultCheckIn) : '09:30',
          defaultCheckOut: data?.defaultCheckOut != null ? formatTime(data.defaultCheckOut) : '18:30',
        }));
      // Keep My Account / Home (redux + persisted session) in step too.
      applyProfileToSession(dispatch, data);
    } catch (e) {
      logProfileDebug('profile FAILED', { endpoint: 'GET /technicians/me', status: e?.status ?? null, message: e?.message ?? null, reason: e?.status === 404 ? 'server has no technician row linked to this login (user_id / shop)' : 'see status' });
      // A failed refresh keeps the last loaded profile on screen; the error
      // view only shows when nothing has loaded yet.
      if (mountedRef.current) setLoadError({ status: e?.status, message: e?.message, owner: isShopOwnerSession() });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [dispatch]);

  // Refetch every time the screen gains focus so an owner edit (e.g. a new
  // phone number from the Partner app) shows up without a re-login.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { if (mountedRef.current) setRefreshing(false); }
  }, [load]);

  const notifyContactOwner = () => {
    notify(
      'Locked',
      'Your phone number and email can only be changed by the shop owner. Please contact them to update these details.'
    );
  };

  // source: 'camera' (take a photo) or 'gallery' (pick from the library).
  const handlePickPhoto = async (source = 'gallery') => {
    setPhotoSheet(false);
    if (uploadingPhoto) return;
    try {
      const useCamera = source === 'camera';
      if (Platform.OS !== 'web') {
        const perm = useCamera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          notify('Permission required', useCamera ? 'Allow camera access to take your profile picture.' : 'Allow photo library access to update your profile picture.');
          return;
        }
      }
      const opts = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
      const result = useCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
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
      if (!url) throw new Error('Upload failed. Please try again.');
      const updated = await ticketApi.patch('/technicians/me', { body: { photoUrl: url } });
      setProfile(updated);
      applyProfileToSession(dispatch, updated);
      setForm((p) => ({ ...p, photoUrl: url }));
      notify('Profile photo updated', '', { type: 'success' });
    } catch (e) {
      notify('Could not update photo', userMessage(e, 'Please try again.'), { type: 'error', haptic: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      notify('Name required', 'Please enter your name before saving.', { type: 'warning' });
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
      applyProfileToSession(dispatch, updated);
      setEditing(false);
      notify('Profile updated', '', { type: 'success' });
    } catch (e) {
      notify('Could not update profile', userMessage(e, 'Please try again.'), { type: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('AccountTab');
  };

  const header = (
    <ScreenHeader onBack={goBack} />
  );

  if (loading && !profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <ProfileLoadError error={loadError} onRetry={load} />
      </SafeAreaView>
    );
  }

  const checkIn = formatTime(profile.defaultCheckIn) === '—' ? '09:30' : formatTime(profile.defaultCheckIn);
  const checkOut = formatTime(profile.defaultCheckOut) === '—' ? '18:30' : formatTime(profile.defaultCheckOut);
  const shift = shiftHours(checkIn, checkOut);
  const employeeId = employeeIdFromSession(session);
  const roleLabel = profile.roleLabel || session?.roleLabel || '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        onBack={goBack}
        right={(
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setEditing((v) => !v)}
            disabled={saving}
            style={styles.editPill}
            accessibilityLabel={editing ? 'Close edit' : 'Edit profile'}
          >
            {editing ? <X size={rs(13)} color={COLORS.primaryDeep} /> : <Pencil size={rs(12)} color={COLORS.primaryDeep} />}
            <Text style={styles.editPillText}>{editing ? 'Close' : 'Edit'}</Text>
          </TouchableOpacity>
        )}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        >
          {/* Profile card */}
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setPhotoSheet(true)} disabled={uploadingPhoto} style={styles.avatarRing}>
                {profile.photoUrl ? (
                  <Image source={{ uri: profile.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarInitial}>{initialsFromName(profile.name)}</Text>
                  </View>
                )}
                {/* Tap the photo to take a new one or pick from the gallery */}
                  <View style={styles.cameraBadge}>
                    {uploadingPhoto ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Camera size={rs(10)} color="#FFFFFF" strokeWidth={2.4} />
                    )}
                  </View>
              </TouchableOpacity>

              <View style={styles.profileInfo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{profile.name || 'Technician'}</Text>
                  {roleLabel !== '—' ? (
                    <View style={styles.rolePill}>
                      <View style={styles.roleDot} />
                      <Text style={styles.rolePillText}>{roleLabel}</Text>
                    </View>
                  ) : null}
                  <View style={styles.empRow}>
                    <Text style={styles.empLabel}>Employee ID</Text>
                    <Text style={styles.empValue}>#{employeeId}</Text>
                  </View>
                </View>
              </View>
            </View>

          </View>

          {/* Shift strip */}
          <View style={styles.card}>
            <View style={styles.statsRow}>
              <StatItem Icon={LogIn} value={checkIn} label="Check-in" />
              <View style={styles.statDivider} />
              <StatItem Icon={LogOut} value={checkOut} label="Check-out" />
              <View style={styles.statDivider} />
              <StatItem Icon={Clock} value={shift ?? '—'} label="Shift Hours" />
            </View>
          </View>

          {/* Personal information */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: rs(2), marginBottom: rs(6), paddingHorizontal: 2 }}>
            <View style={{ width: 3, height: rs(14), borderRadius: 2, backgroundColor: '#035C6C', marginRight: rs(7) }} />
            <Text style={{ fontSize: rf(15), fontWeight: '800', color: '#1C3053' }}>{editing ? 'Edit Details' : 'Personal Information'}</Text>
          </View>
          <View style={styles.card}>

            {editing ? (
              <View>
                <Text style={styles.label}>Full Name</Text>
                <View style={styles.inputWrap}>
                  <User size={rs(16)} color={COLORS.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={form.name}
                    onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <Text style={styles.label}>Phone Number</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={notifyContactOwner}>
                  <View style={[styles.inputWrap, styles.inputLocked]} pointerEvents="none">
                    <Phone size={rs(16)} color={COLORS.textMuted} style={styles.inputIcon} />
                    <Text style={[styles.input, styles.inputLockedText]}>{form.phone || '—'}</Text>
                    <Lock size={rs(13)} color={COLORS.textMuted} style={styles.lockIcon} />
                  </View>
                </TouchableOpacity>

                <Text style={styles.label}>Email Address</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={notifyContactOwner}>
                  <View style={[styles.inputWrap, styles.inputLocked]} pointerEvents="none">
                    <Mail size={rs(16)} color={COLORS.textMuted} style={styles.inputIcon} />
                    <Text style={[styles.input, styles.inputLockedText]}>{form.email || '—'}</Text>
                    <Lock size={rs(13)} color={COLORS.textMuted} style={styles.lockIcon} />
                  </View>
                </TouchableOpacity>

                <Text style={styles.lockedHint}>
                  Phone and email can only be changed by the shop owner. Tap to learn more. Tap the camera on your photo to change it.
                </Text>

                <View style={styles.editRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)} disabled={saving} activeOpacity={0.8}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <InfoRow Icon={User} label="Full Name" value={profile.name || '—'} />
                <InfoRow Icon={Phone} label="Phone Number" value={profile.phone || '—'} />
                <InfoRow Icon={Mail} label="Email Address" value={profile.email || '—'} />
                <InfoRow Icon={ShieldCheck} label="Role" value={roleLabel} />
                <InfoRow Icon={Calendar} label="Joining Date" value={formatJoinDate(profile.dateOfJoin)} last />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Profile photo source picker */}
      <Modal visible={photoSheet} transparent animationType="slide" onRequestClose={() => setPhotoSheet(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPhotoSheet(false)}>
          <View style={[styles.sheet, sheetWidth]} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Profile Photo</Text>
            <TouchableOpacity style={styles.sheetBtn} onPress={() => handlePickPhoto('camera')} activeOpacity={0.8}>
              <View style={[styles.sheetIcon, { backgroundColor: '#035C6C' }]}><Camera size={rs(18)} color="#FFFFFF" strokeWidth={2.2} /></View>
              <Text style={styles.sheetBtnText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetBtn} onPress={() => handlePickPhoto('gallery')} activeOpacity={0.8}>
              <View style={[styles.sheetIcon, { backgroundColor: '#0788C9' }]}><ImageIcon size={rs(18)} color="#FFFFFF" strokeWidth={2.2} /></View>
              <Text style={styles.sheetBtnText}>Choose from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetCancel} onPress={() => setPhotoSheet(false)} activeOpacity={0.8}>
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Shared page header. The back button keeps this screen's own onBack (goBack,
// or AccountTab when there is no history), so it is always shown.
function ScreenHeader({ onBack, right }) {
  return (
    <MintScreenHeader
      title="My Profile"
      navigation={{ canGoBack: () => true, goBack: onBack }}
      right={right}
    />
  );
}

function StatItem({ Icon, value, label }) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statIcon}>
        <Icon size={rs(15)} color="#035C6C" />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
    </View>
  );
}

function InfoRow({ Icon, label, value, onPress, last }) {
  const body = (
    <View style={[styles.infoRow, !last && styles.infoRowDivider]}>
      <View style={styles.infoIcon}>
        <Icon size={rs(15)} color="#035C6C" />
      </View>
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      {body}
    </TouchableOpacity>
  );
}

// Explains why the profile couldn't load, from the server's status (no raw server text).
function ProfileLoadError({ error, onRetry }) {
  const status = error?.status;
  let title = "Couldn't load your profile";
  let body = 'Something went wrong while loading your details. Please try again.';
  if (status === 404 && error?.owner) {
    title = "This is the shop owner's login";
    body = "Owner accounts don't have an employee profile, so there is nothing to show here. Sign in with the employee's own mobile number — or, to use the Staff App yourself, add yourself as an employee in the NearGFix Partner app with your mobile number.";
  } else if (status === 404) {
    title = 'No employee profile yet';
    body = 'Your login works, but no employee profile is linked to it. Ask your shop owner to add you as staff in the NearGFix owner app using this same mobile number. Your details will then appear here and you can edit your name and photo.';
  } else if (status === 401 || status === 403) {
    title = 'Profile not available for this login';
    body = 'This account is not set up as a staff / technician profile for the shop, or the session has expired. Log out and log in again. If it still shows, ask your shop owner to add you as staff with this mobile number.';
  } else if (status === 0) {
    title = "Can't reach the server";
    body = 'Check your internet connection and try again.';
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 18 }]}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEECEC', alignItems: 'center', justifyContent: 'center' }}>
          <CircleUser size={28} color="#F32C26" />
        </View>
        <Text style={{ fontSize: rf(16), fontWeight: '800', color: COLORS.text, marginTop: 12, textAlign: 'center' }}>{title}</Text>
        <Text style={{ fontSize: rf(13), lineHeight: rlh(19), color: COLORS.textMuted, marginTop: 8, textAlign: 'center' }}>{body}</Text>
        <TouchableOpacity
          onPress={onRetry}
          activeOpacity={0.85}
          style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: 22, height: 40 }}
        >
          <RefreshCw size={16} color="#FFFFFF" />
          <Text style={{ fontSize: rf(13.5), fontWeight: '700', color: '#FFFFFF', marginLeft: 8 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const COLORS = {
  background: '#E9EDF0',
  card: '#FAFBFC',
  border: '#DDE3E7',
  text: '#111111',
  textMuted: '#6B7280',
  primary: '#035C6C',
  primaryDeep: '#035C6C',
  primarySoft: '#E5F3F5',
  inputBg: '#F3F4F6',
  headerBtn: '#EEF0F3',
};

const AVATAR = rs(66);

const styles = StyleSheet.create({
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: rs(18), paddingBottom: rs(24), gap: rs(10) },
  sheetTitle: { fontSize: rf(16), fontWeight: '800', color: '#1C3053', marginBottom: rs(4) },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', gap: rs(12), padding: rs(12), borderRadius: rs(14), backgroundColor: '#F3F4F6' },
  sheetIcon: { width: rs(36), height: rs(36), borderRadius: rs(18), alignItems: 'center', justifyContent: 'center' },
  sheetBtnText: { fontSize: rf(14), fontWeight: '700', color: '#111111' },
  sheetCancel: { alignItems: 'center', paddingVertical: rs(12), borderRadius: rs(14), borderWidth: 1, borderColor: '#E5E7EB' },
  sheetCancelText: { fontSize: rf(14), fontWeight: '700', color: '#F32C26' },
  safe: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24 },

  // Cards
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#111111',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // Profile row
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatarRing: { width: rs(62), height: rs(62), borderRadius: rs(31), borderWidth: 2, borderColor: '#FAA700', alignItems: 'center', justifyContent: 'center', marginRight: rs(12), backgroundColor: '#FFFFFF' },
  avatar: { width: rs(54), height: rs(54), borderRadius: rs(27), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarInitial: { fontSize: rf(20), fontWeight: '800', color: '#035C6C' },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: rs(19),
    height: rs(19),
    borderRadius: rs(10),
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  profileInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: rf(16), fontWeight: '800', color: '#111111' },
  rolePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#E5F3F5', borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(2), marginTop: rs(4) },
  roleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#609138', marginRight: 5 },
  rolePillText: { fontSize: rf(11), fontWeight: '700', color: '#035C6C' },
  empRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: rs(5) },
  empLabel: { fontSize: rf(11), color: '#6B7280', marginRight: 8 },
  empValue: { fontSize: rf(13), color: '#111111', fontWeight: '800' },

  // Stats strip
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  statIcon: { width: rs(30), height: rs(30), borderRadius: rs(8), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', marginBottom: rs(4) },
  statValue: { fontSize: rf(14), fontWeight: '800', color: '#111111' },
  statLabel: { fontSize: rf(11), color: '#6B7280', marginTop: 0 },
  statDivider: { width: 1, alignSelf: 'stretch', marginVertical: rs(6), backgroundColor: '#E5E7EB' },

  // Personal info
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { flex: 1, fontSize: rf(16), fontWeight: '800', color: COLORS.text, marginRight: 8 },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  editPillText: { fontSize: rf(12), fontWeight: '700', color: COLORS.primaryDeep, marginLeft: 5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: rs(7) },
  infoRowDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoIcon: { width: rs(30), height: rs(30), borderRadius: rs(8), backgroundColor: '#E5F3F5', alignItems: 'center', justifyContent: 'center', marginRight: rs(10) },
  infoBody: { flex: 1, marginRight: 6 },
  infoLabel: { fontSize: rf(11), color: '#6B7280', marginBottom: 1 },
  infoValue: { fontSize: rf(13.5), color: '#111111', fontWeight: '700' },

  // Edit form
  label: { fontSize: rf(11), color: COLORS.textMuted, marginBottom: 4, marginTop: 6, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  inputIcon: { marginRight: 6 },
  input: { flex: 1, paddingVertical: 8, fontSize: rf(13), color: COLORS.text },
  inputLocked: { backgroundColor: '#F3F4F6', borderStyle: 'dashed' },
  inputLockedText: { color: COLORS.textMuted, fontWeight: '600' },
  lockIcon: { marginLeft: 6 },
  lockedHint: { fontSize: rf(11), color: COLORS.textMuted, marginTop: 6, marginBottom: 10, lineHeight: rlh(15) },
  editRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.inputBg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText: { fontSize: rf(13.5), color: COLORS.text, fontWeight: '600' },
  saveBtn: { flex: 1.4, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: rf(13.5), color: '#fff', fontWeight: '700' },
});
