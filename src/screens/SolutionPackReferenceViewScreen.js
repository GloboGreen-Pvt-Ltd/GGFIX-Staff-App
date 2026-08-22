import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Pressable,
  Modal,
} from 'react-native';
import {
  ChevronDown, X, Mic, Video as VideoIcon, Image as ImageIcon, Play, FileText,
} from 'lucide-react-native';

import { searchSolutionPacks } from '../api/tickets';
import {
  listBrands, listModelsForBrand,
  listRepairCategories, listRepairServices,
} from '../api/master';
import { rf } from '../utils/responsive';
import { openExternalUrl } from '../utils/safeLink';
import ImageViewerModal from '../components/ImageViewerModal';

// "Issue Reference Solution Pack View" — read-only browser for the shop's
// solution-pack knowledge base. Filters mirror the upload form so the
// technician can find a matching reference with the same fields they would
// use to upload a new one. Categories come from the admin's master tables.
export default function SolutionPackReferenceViewScreen({ route, navigation }) {
  const { defaults } = route.params || {};

  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [brand, setBrand] = useState(defaults?.brand || null);
  const [model, setModel] = useState(defaults?.model || null);

  const [mainCats, setMainCats] = useState([]);
  const [subCats, setSubCats] = useState([]);
  const [mainCat, setMainCat] = useState(null);
  const [subCat, setSubCat] = useState(null);

  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [subPickerOpen, setSubPickerOpen] = useState(false);

  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listBrands().then(setBrands).catch(() => setBrands([])); }, []);
  useEffect(() => { listRepairCategories().then(setMainCats).catch(() => setMainCats([])); }, []);

  useEffect(() => {
    if (!brand?.id) { setModels([]); return; }
    listModelsForBrand(brand.id).then(setModels).catch(() => setModels([]));
    setModel(null);
  }, [brand?.id]);

  useEffect(() => {
    if (!mainCat?.id) { setSubCats([]); setSubCat(null); return; }
    listRepairServices({ categoryId: mainCat.id })
      .then(setSubCats).catch(() => setSubCats([]));
    setSubCat(null);
  }, [mainCat?.id]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await searchSolutionPacks({
        packType: 'NEW',
        brandId: brand?.id,
        modelId: model?.id,
        issueCategoryId: mainCat?.id,
        issueSubcategoryId: subCat?.id,
      });
      setPacks(Array.isArray(rows) ? rows : []);
    } catch {
      setPacks([]);
    } finally {
      setLoading(false);
    }
  }, [brand?.id, model?.id, mainCat?.id, subCat?.id]);

  useEffect(() => { runSearch(); }, [runSearch]);

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row -mx-1 mb-3">
          <View className="flex-1 px-1">
            <Text className="text-text-muted mb-1" style={{ fontSize: rf(11) }}>Device Brand</Text>
            <DropdownTrigger
              label={brand?.name || 'Any brand'}
              onPress={() => setBrandPickerOpen(true)}
            />
          </View>
          <View className="flex-1 px-1">
            <Text className="text-text-muted mb-1" style={{ fontSize: rf(11) }}>Device Model</Text>
            <DropdownTrigger
              label={model?.name || 'Any model'}
              onPress={() => brand ? setModelPickerOpen(true) : null}
              disabled={!brand}
            />
          </View>
        </View>

        <Text className="font-bold text-text mb-2" style={{ fontSize: rf(12) }}>Select Issue Main Category</Text>
        <View className="flex-row flex-wrap -mx-1 mb-3">
          {mainCats.map((c) => {
            const selected = mainCat?.id === c.id;
            return (
              <View key={c.id} className="w-1/2 px-1 mb-2">
                <Pressable
                  onPress={() => setMainCat(selected ? null : { id: c.id, name: c.name })}
                  className="flex-row items-center"
                >
                  <View
                    style={{
                      width: 16, height: 16, borderRadius: 8,
                      borderWidth: 2,
                      borderColor: selected ? '#1E3A8A' : '#94A3B8',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#1E3A8A' }} /> : null}
                  </View>
                  <Text className="ml-2 text-text" style={{ fontSize: rf(12) }}>{c.name}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Text className="font-bold text-text mb-2" style={{ fontSize: rf(12) }}>Select Issue Sub Category</Text>
        <DropdownTrigger
          label={subCat?.name || (subCats.length ? 'Any sub-category' : 'Pick a main category first')}
          onPress={() => subCats.length ? setSubPickerOpen(true) : null}
          disabled={!subCats.length}
        />

        <View className="flex-row items-center justify-between mt-5 mb-2">
          <Text className="font-bold text-text" style={{ fontSize: rf(13) }}>Solution Document's</Text>
          {loading ? <ActivityIndicator size="small" color="#3B82F6" /> : null}
        </View>

        {packs.length === 0 && !loading ? (
          <Text className="text-text-muted text-center py-6" style={{ fontSize: rf(12) }}>
            No matching solution packs. Adjust the filters above or upload a new pack.
          </Text>
        ) : null}

        {packs.map((p) => (
          <PackCard key={p.id} pack={p} />
        ))}
      </ScrollView>

      <PickerModal
        visible={brandPickerOpen}
        title="Select Brand"
        options={[{ key: '__any__', label: 'Any brand' }, ...brands.map((b) => ({ key: b.id, label: b.name }))]}
        onPick={(opt) => { setBrand(opt.key === '__any__' ? null : { id: opt.key, name: opt.label }); setBrandPickerOpen(false); }}
        onClose={() => setBrandPickerOpen(false)}
      />
      <PickerModal
        visible={modelPickerOpen}
        title="Select Model"
        options={[{ key: '__any__', label: 'Any model' }, ...models.map((m) => ({ key: m.id, label: m.name }))]}
        onPick={(opt) => { setModel(opt.key === '__any__' ? null : { id: opt.key, name: opt.label }); setModelPickerOpen(false); }}
        onClose={() => setModelPickerOpen(false)}
      />
      <PickerModal
        visible={subPickerOpen}
        title="Select Sub Category"
        options={[{ key: '__any__', label: 'Any sub-category' }, ...subCats.map((s) => ({ key: s.id, label: s.name }))]}
        onPick={(opt) => { setSubCat(opt.key === '__any__' ? null : { id: opt.key, name: opt.label }); setSubPickerOpen(false); }}
        onClose={() => setSubPickerOpen(false)}
      />
    </View>
  );
}

function PackCard({ pack }) {
  const files = useMemo(() => {
    let list = [];
    if (pack?.filesJson) {
      try {
        const v = JSON.parse(pack.filesJson);
        if (Array.isArray(v)) list = v;
      } catch { /* fall through to legacy fileUrl */ }
    }
    // Legacy packs carry a single `fileUrl` instead of a `filesJson` array. Fold
    // it in HERE — before audio/video/images are derived — so the image actually
    // renders and "No attachments" only shows when there's genuinely nothing.
    // (Previously this pushed into the array after derivation, so the image was
    // invisible AND the empty note was suppressed → a blank card body.)
    if (list.length === 0 && pack?.fileUrl) {
      list = [{ type: 'image', url: pack.fileUrl, name: pack.fileName }];
    }
    return list;
  }, [pack?.filesJson, pack?.fileUrl, pack?.fileName]);

  const audio = files.find((f) => f.type === 'audio');
  const video = files.find((f) => f.type === 'video');
  const images = files.filter((f) => f.type === 'image');
  // Tapping a thumbnail used to hand the URL to the browser, which drops the
  // technician out of the app mid-repair. Same in-app viewer as the shop app:
  // pinch, double-tap, swipe between the pack's images.
  const [viewerAt, setViewerAt] = useState(-1);

  return (
    <View
      className="bg-card rounded-xl p-3 mb-3"
      style={{ borderWidth: 1, borderColor: '#E2E8F0' }}
    >
      <Text className="font-bold text-text" style={{ fontSize: rf(13) }} numberOfLines={2}>
        {pack.title || 'Solution pack'}
      </Text>
      {pack.issueName ? (
        <Text className="text-text mt-0.5" style={{ fontSize: rf(11.5) }} numberOfLines={2}>
          {pack.issueName}
        </Text>
      ) : null}
      <Text className="text-text-muted mt-1" style={{ fontSize: rf(10) }}>
        {[pack.brandName, pack.modelName].filter(Boolean).join(' • ') || '—'}
      </Text>

      {audio ? (
        <MediaLinkRow icon={<Mic size={14} color="#FFFFFF" />} label="Audio" name={audio.name} url={audio.url} />
      ) : null}
      {video ? (
        <MediaLinkRow icon={<VideoIcon size={14} color="#FFFFFF" />} label="Video" name={video.name} url={video.url} />
      ) : null}
      {images.length > 0 ? (
        <View className="mt-2">
          <View className="flex-row items-center mb-1">
            <ImageIcon size={14} color="#0F172A" />
            <Text className="font-bold text-text ml-2" style={{ fontSize: rf(12) }}>Images</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row">
              {images.map((img, i) => (
                <Pressable key={i} onPress={() => setViewerAt(i)}>
                  <Image
                    source={{ uri: img.url }}
                    style={{ width: 80, height: 90, borderRadius: 8, marginRight: 8 }}
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <ImageViewerModal
            visible={viewerAt >= 0}
            images={images.map((f) => ({ uri: f.url, label: f.name }))}
            index={viewerAt < 0 ? 0 : viewerAt}
            onClose={() => setViewerAt(-1)}
          />
        </View>
      ) : null}

      {files.length === 0 ? (
        <View className="flex-row items-center mt-2">
          <FileText size={14} color="#94A3B8" />
          <Text className="text-text-muted ml-2" style={{ fontSize: rf(11) }}>No attachments</Text>
        </View>
      ) : null}
    </View>
  );
}

function MediaLinkRow({ icon, label, name, url }) {
  return (
    <TouchableOpacity
      onPress={() => openExternalUrl(url)}
      className="flex-row items-center mt-2 rounded-md px-2 py-2"
      style={{ backgroundColor: '#F1F5F9' }}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-text-muted" style={{ fontSize: rf(11) }}>{label}</Text>
        <Text className="text-text" style={{ fontSize: rf(12) }} numberOfLines={1}>{name || 'Tap to play'}</Text>
      </View>
      <Play size={14} color="#3B82F6" />
    </TouchableOpacity>
  );
}

function DropdownTrigger({ label, onPress, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="flex-row items-center justify-between rounded-md bg-card px-3 py-2"
      style={{ borderWidth: 1, borderColor: '#CBD5E1', opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="text-text flex-1" style={{ fontSize: rf(12) }} numberOfLines={1}>{label}</Text>
      <ChevronDown size={14} color="#0F172A" />
    </TouchableOpacity>
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
              <X size={18} color="#0F172A" />
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
                  style={{ borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}
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
