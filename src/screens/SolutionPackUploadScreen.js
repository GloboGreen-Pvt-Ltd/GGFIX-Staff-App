import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Platform,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  ChevronDown, Plus, X, Image as ImageIcon, Mic, Video as VideoIcon, Play,
} from 'lucide-react-native';

import { createSolutionPack } from '../api/tickets';
import {
  listBrands, listModelsForBrand,
  listRepairCategories, listRepairServices,
} from '../api/master';
import { uploadMedia } from '../api/media';
import { notify } from '../components/confirm';
import { rf } from '../utils/responsive';

// GGFIX palette, same as Ticket Detail.
const C = {
  green: '#09AD2A', greenTint: '#E6F7EA', red: '#F84141',
  ink: '#1E1E1E', muted: '#6E6E6E', faint: '#A3A3A3',
  bg: '#F8F8F8', border: '#ECECEC', line: '#D4D4D4',
};

// "New Issue Solution Pack Upload" screen.
//
// Brand & Model are read directly from the ticket (no dropdowns) — the
// technician is documenting a solution for the device they're already
// working on. Main category + sub-category are driven by the admin's
// master_repair_categories / master_repair_services tables so they stay
// in sync with whatever the shop admin maintains. Images use the native
// picker with cropping disabled.
export default function SolutionPackUploadScreen({ route, navigation }) {
  const { ticketId, defaults } = route.params || {};

  const [brand, setBrand] = useState(null); // { id, name }
  const [model, setModel] = useState(null);

  const [mainCats, setMainCats] = useState([]);       // master_repair_categories rows
  const [subCats, setSubCats] = useState([]);          // master_repair_services rows for selected main
  const [mainCat, setMainCat] = useState(null);        // { id, name }
  const [subCat, setSubCat] = useState(null);          // { id, name }
  const [issueName, setIssueName] = useState('');       // free text, the actual fault

  const [audio, setAudio] = useState(null);
  const [video, setVideo] = useState(null);
  const [images, setImages] = useState([null, null, null]);

  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- Resolve brand/model names from the ticket's IDs ----
  // The parent passes `defaults.brand` / `defaults.model` with at least an id.
  // We try to fill in a human-readable name from the brand/model master list
  // so the read-only labels show "Apple" / "iPhone 14" instead of UUIDs.
  useEffect(() => {
    let active = true;
    (async () => {
      const seed = defaults?.brand || null;
      if (!seed?.id) return;
      if (seed.name) { if (active) setBrand(seed); return; }
      try {
        const all = await listBrands();
        const found = all.find((b) => b.id === seed.id);
        if (active) setBrand({ id: seed.id, name: found?.name || '—' });
      } catch { if (active) setBrand({ id: seed.id, name: '—' }); }
    })();
    return () => { active = false; };
  }, [defaults?.brand?.id, defaults?.brand?.name]);

  useEffect(() => {
    let active = true;
    (async () => {
      const seed = defaults?.model || null;
      if (!seed?.id) return;
      if (seed.name) { if (active) setModel(seed); return; }
      const brandId = defaults?.brand?.id;
      if (!brandId) { if (active) setModel({ id: seed.id, name: '—' }); return; }
      try {
        const all = await listModelsForBrand(brandId);
        const found = all.find((m) => m.id === seed.id);
        if (active) setModel({ id: seed.id, name: found?.name || '—' });
      } catch { if (active) setModel({ id: seed.id, name: '—' }); }
    })();
    return () => { active = false; };
  }, [defaults?.model?.id, defaults?.model?.name, defaults?.brand?.id]);

  // ---- Load main categories (admin-managed list) ----
  useEffect(() => {
    listRepairCategories().then(setMainCats).catch(() => setMainCats([]));
  }, []);

  // ---- Reload sub-categories whenever the main category changes ----
  useEffect(() => {
    if (!mainCat?.id) { setSubCats([]); setSubCat(null); return; }
    listRepairServices({ categoryId: mainCat.id })
      .then((rows) => setSubCats(rows))
      .catch(() => setSubCats([]));
    setSubCat(null);
  }, [mainCat?.id]);

  // ---------- attachment pickers ----------

  const pickFromDocument = useCallback(async (kind) => {
    const mimeMap = { audio: 'audio/*', video: 'video/*' };
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: mimeMap[kind],
      });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a?.uri) return;
      const payload = { uri: a.uri, name: a.name || `${kind}-${Date.now()}`, type: a.mimeType || `${kind}/*` };
      if (kind === 'audio') setAudio(payload);
      else if (kind === 'video') setVideo(payload);
    } catch (e) {
      notify('Could not open files', e?.message || 'Please try again.');
    }
  }, []);

  const pickImage = useCallback(async (index) => {
    try {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Permission required', 'Allow photo library access to attach images.');
        return;
      }
    }
    // allowsEditing:false disables the system crop step. We also omit `aspect`
    // so the image is preserved at its original ratio.
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (res.canceled) return;
    const a = res.assets?.[0];
    if (!a?.uri) return;
    setImages((prev) => {
      const next = [...prev];
      next[index] = { uri: a.uri, name: a.fileName || `image-${index + 1}.jpg`, type: a.mimeType || 'image/jpeg' };
      return next;
    });
    } catch (e) {
      notify('Could not open gallery', e?.message || 'Please try again.');
    }
  }, []);

  // ---------- submit ----------

  const hasFile = !!(audio || video || images.some(Boolean));
  const canSubmit = !!mainCat?.id && hasFile;

  const handleSubmit = async () => {
    if (!mainCat?.id) {
      notify('Select a category', 'Pick the issue main category first.');
      return;
    }
    if (!hasFile) {
      notify('Attach a file', 'Add at least one audio, video or image.');
      return;
    }
    setSubmitting(true);
    try {
      const files = [];
      // Count how many attachments we attempt so a silent upload failure can't
      // create a pack with zero (or partial) files while telling the tech it
      // "uploaded". Every attempted upload must yield a hosted URL.
      let attempted = 0;
      if (audio) {
        attempted += 1;
        const r = await uploadMedia({ ...audio, folder: `tickets/${ticketId}/solution-packs/audio` });
        if (r?.url) files.push({ type: 'audio', url: r.url, name: audio.name });
      }
      if (video) {
        attempted += 1;
        const r = await uploadMedia({ ...video, folder: `tickets/${ticketId}/solution-packs/video` });
        if (r?.url) files.push({ type: 'video', url: r.url, name: video.name });
      }
      for (const img of images) {
        if (!img) continue;
        attempted += 1;
        const r = await uploadMedia({ ...img, folder: `tickets/${ticketId}/solution-packs/images` });
        if (r?.url) files.push({ type: 'image', url: r.url, name: img.name });
      }
      if (files.length < attempted) {
        notify(
          'Upload failed',
          `${attempted - files.length} of ${attempted} file(s) failed to upload. Please check your connection and try again.`,
          { preset: 'error', haptic: 'error' }
        );
        return;
      }
      const title = `${mainCat.name}${subCat ? ` — ${subCat.name}` : ''}`;
      await createSolutionPack(ticketId, {
        packType: 'NEW',
        title,
        description: null,
        fileUrl: files[0]?.url || null,
        fileName: files[0]?.name || null,
        brandId: brand?.id || null,
        modelId: model?.id || null,
        brandName: brand?.name || null,
        modelName: model?.name || defaults?.deviceName || null,
        issueCategory: mainCat.name,
        issueSubcategory: subCat?.name || null,
        issueName: issueName.trim() || null,
        issueCategoryId: mainCat.id,
        issueSubcategoryId: subCat?.id || null,
        filesJson: JSON.stringify(files),
      });
      notify('Solution pack uploaded', 'Saved as a new solution for this ticket.');
      navigation.goBack();
    } catch (e) {
      console.warn('[upload] solution pack failed', e?.status, e?.message);
      notify('Upload failed', e?.message || 'Could not save solution pack');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Brand / Model — read-only, derived from the ticket */}
        <View className="flex-row -mx-1 mb-3">
          <View className="flex-1 px-1">
            <Text className="text-text-muted mb-1" style={{ fontSize: rf(11) }}>Device Brand</Text>
            <ReadonlyField label={brand?.name || (defaults?.brand?.id ? 'Loading…' : '—')} />
          </View>
          <View className="flex-1 px-1">
            <Text className="text-text-muted mb-1" style={{ fontSize: rf(11) }}>Device Model</Text>
            <ReadonlyField label={model?.name || (defaults?.model?.id ? 'Loading…' : (defaults?.deviceName || '—'))} />
          </View>
        </View>

        {/* Main category — radio grid driven by master_repair_categories */}
        <Text className="font-bold text-text mb-2" style={{ fontSize: rf(12) }}>Select Issue Main Category</Text>
        {mainCats.length === 0 ? (
          <Text className="text-text-muted mb-2" style={{ fontSize: rf(11) }}>
            No categories yet — ask the admin to add Repair Categories in the dashboard.
          </Text>
        ) : null}
        <View className="flex-row flex-wrap -mx-1 mb-3">
          {mainCats.map((c) => {
            const selected = mainCat?.id === c.id;
            return (
              <View key={c.id} className="w-1/2 px-1 mb-2">
                <TouchableOpacity
                  onPress={() => setMainCat({ id: c.id, name: c.name })}
                  activeOpacity={0.7}
                  className="flex-row items-center"
                  style={{
                    backgroundColor: selected ? C.greenTint : '#FFFFFF', borderWidth: 1,
                    borderColor: selected ? C.green : C.border, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8,
                  }}
                >
                  <View
                    style={{
                      width: 16, height: 16, borderRadius: 8,
                      borderWidth: 2,
                      borderColor: selected ? C.green : C.line,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} /> : null}
                  </View>
                  <Text className="ml-2 flex-1" style={{ fontSize: rf(12), color: C.ink, fontWeight: selected ? '700' : '500' }} numberOfLines={2}>{c.name}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Sub category — dropdown of master_repair_services rows */}
        <Text className="font-bold text-text mb-2" style={{ fontSize: rf(12) }}>Select Issue Sub Category</Text>
        <DropdownTrigger
          label={subCat?.name || (subCats.length ? 'Select sub-category' : 'Pick a main category first')}
          onPress={() => subCats.length ? setSubPickerOpen(true) : null}
          disabled={!subCats.length}
        />

        {/* Issue name — the specific fault in the technician's own words. The
            two pickers above are catalogue labels; this is what actually went
            wrong, and it is what makes a pack findable later. */}
        <Text className="font-bold text-text mt-4 mb-2" style={{ fontSize: rf(12) }}>Issue Name</Text>
        <TextInput
          value={issueName}
          onChangeText={setIssueName}
          placeholder="e.g. Backlight dead after water damage"
          placeholderTextColor={C.faint}
          maxLength={200}
          style={{
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: rf(12.5),
            color: C.ink,
          }}
        />

        {/* Solution Documents */}
        <Text className="font-bold text-text mt-4 mb-2" style={{ fontSize: rf(13) }}>Solution Documents</Text>

        <AttachmentRow
          icon={<Mic size={15} color={C.green} />}
          label="Audio"
          asset={audio}
          onPick={() => pickFromDocument('audio')}
          onClear={() => setAudio(null)}
          previewIcon={<Play size={18} color="#FFFFFF" />}
        />

        <AttachmentRow
          icon={<VideoIcon size={15} color={C.green} />}
          label="Video"
          asset={video}
          onPick={() => pickFromDocument('video')}
          onClear={() => setVideo(null)}
          previewIcon={<Play size={18} color="#FFFFFF" />}
        />

        <View className="flex-row items-center mt-3 mb-2">
          <ImageIcon size={15} color={C.green} />
          <Text className="font-bold text-text ml-2" style={{ fontSize: rf(13) }}>Images</Text>
        </View>
        <View className="flex-row -mx-1">
          {images.map((img, i) => (
            <View key={i} className="flex-1 px-1">
              <TouchableOpacity
                onPress={() => img ? null : pickImage(i)}
                activeOpacity={img ? 1 : 0.7}
                style={{
                  borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line,
                  backgroundColor: '#FFFFFF', height: 80,
                }}
              >
                {img ? (
                  <View className="w-full h-full">
                    <Image source={{ uri: img.uri }} style={{ width: '100%', height: '100%', borderRadius: 10 }} />
                    <TouchableOpacity
                      onPress={() => setImages((prev) => { const n = [...prev]; n[i] = null; return n; })}
                      hitSlop={8}
                      style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12 }}
                    >
                      <X size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="items-center">
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                      <Plus size={16} color="#FFFFFF" />
                    </View>
                    <Text style={{ fontSize: rf(9.5), color: C.muted, marginTop: 4, fontWeight: '600' }}>Add image</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View className="mt-5">
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            style={{
              backgroundColor: C.green, borderRadius: 12, alignItems: 'center',
              paddingVertical: 11,
              opacity: submitting ? 0.6 : canSubmit ? 1 : 0.75,
            }}
          >
            {submitting
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text className="text-white font-bold" style={{ fontSize: rf(13) }}>Upload Solution Pack</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PickerModal
        visible={subPickerOpen}
        title="Select Sub Category"
        options={subCats.map((s) => ({ key: s.id, label: s.name }))}
        onPick={(opt) => { setSubCat({ id: opt.key, name: opt.label }); setSubPickerOpen(false); }}
        onClose={() => setSubPickerOpen(false)}
      />
    </View>
  );
}

function ReadonlyField({ label }) {
  return (
    <View
      className="px-3 py-2"
      style={{ borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: '#F3F3F3' }}
    >
      <Text className="text-text" style={{ fontSize: rf(12) }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function DropdownTrigger({ label, onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      className="flex-row items-center justify-between px-3 py-2"
      style={{ borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: '#FFFFFF', opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="text-text flex-1" style={{ fontSize: rf(12) }} numberOfLines={1}>{label}</Text>
      <ChevronDown size={14} color={C.ink} />
    </TouchableOpacity>
  );
}

function AttachmentRow({ icon, label, asset, onPick, onClear, previewIcon }) {
  return (
    <View className="mb-2.5">
      <View className="flex-row items-center mb-1">
        {icon}
        <Text className="font-bold text-text ml-2" style={{ fontSize: rf(13) }}>{label}</Text>
      </View>
      {asset ? (
        <View
          className="flex-row items-center rounded-xl px-3 py-2"
          style={{ borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF' }}
        >
          <View
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}
          >
            {previewIcon}
          </View>
          <Text className="text-text ml-3 flex-1" style={{ fontSize: rf(12) }} numberOfLines={1}>{asset.name || 'Attached'}</Text>
          <TouchableOpacity onPress={onClear} hitSlop={6}>
            <X size={14} color={C.muted} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={onPick}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
            borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line, backgroundColor: '#FFFFFF', paddingVertical: 11,
          }}
        >
          <Plus size={16} color={C.green} />
          <Text style={{ fontSize: rf(12), color: C.green, fontWeight: '700', marginLeft: 6 }}>Attach {label.toLowerCase()}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function PickerModal({ visible, title, options, onPick, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View className="bg-card rounded-t-2xl p-4" style={{ maxHeight: '70%' }}>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-extrabold text-text" style={{ fontSize: rf(15) }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={18} color={C.ink} />
            </TouchableOpacity>
          </View>
          {options.length === 0 ? (
            <Text className="text-text-muted text-center py-6" style={{ fontSize: rf(12) }}>No options available</Text>
          ) : (
            <ScrollView>
              {options.map((opt) => (
                <TouchableOpacity
                  key={String(opt.key)}
                  onPress={() => onPick(opt)}
                  className="px-3 py-3"
                  style={{ borderBottomWidth: 1, borderBottomColor: '#F3F3F3' }}
                >
                  <Text className="text-text" style={{ fontSize: rf(13) }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
