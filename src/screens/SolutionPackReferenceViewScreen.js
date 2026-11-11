import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ChevronRight, Image as ImageIcon, Mic, Search, Video as VideoIcon } from 'lucide-react-native';
import { Text, TextInput } from '../components/Typography';
import { Badge, Card, DeviceThumb, PickerSheet, SC, Select } from '../components/SolutionKit';
import { searchSolutionPacks } from '../api/tickets';
import { listBrands, listModelsForBrand, listRepairCategories } from '../api/master';
import { packFiles, parseDescription, resultOf } from '../utils/solutionRecords';
import { userMessage } from '../utils/userMessages';
import { rf } from '../utils/responsive';

// View Reference — search the shop's saved solution packs (existing
// /solution-packs/search). Brand / Model / Category filter on the server; the
// search box narrows the loaded results by model, issue or solution text.
export default function SolutionPackReferenceViewScreen({ route, navigation }) {
  const { defaults } = route.params || {};
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [cats, setCats] = useState([]);
  const [brand, setBrand] = useState(defaults?.brand?.id ? defaults.brand : null);
  const [model, setModel] = useState(defaults?.model?.id ? defaults.model : null);
  const [cat, setCat] = useState(null);
  const [picker, setPicker] = useState(null);
  const [q, setQ] = useState('');
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { listBrands().then(setBrands).catch(() => setBrands([])); }, []);
  useEffect(() => { listRepairCategories().then(setCats).catch(() => setCats([])); }, []);
  useEffect(() => {
    if (!brand?.id) { setModels([]); return; }
    listModelsForBrand(brand.id).then(setModels).catch(() => setModels([]));
  }, [brand?.id]);
  // Job defaults may carry ids without names — fill the chip labels.
  useEffect(() => {
    if (brand?.id && !brand.name) { const b = brands.find((x) => x.id === brand.id); if (b) setBrand({ id: b.id, name: b.name }); }
  }, [brands, brand]);
  useEffect(() => {
    if (model?.id && !model.name) { const m = models.find((x) => x.id === model.id); if (m) setModel({ id: m.id, name: m.name }); }
  }, [models, model]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await searchSolutionPacks({ packType: 'NEW', brandId: brand?.id, modelId: model?.id, issueCategoryId: cat?.id });
      setPacks(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (e) {
      setPacks([]);
      setError(userMessage(e, 'Could not load references. Check your connection.'));
    } finally {
      setLoading(false);
    }
  }, [brand?.id, model?.id, cat?.id]);
  useEffect(() => { runSearch(); }, [runSearch]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return packs;
    return packs.filter((p) => [p.brandName, p.modelName, p.title, p.issueCategory, p.issueSubcategory, p.description]
      .filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [packs, q]);

  const sheet = {
    brand: { title: 'Select Brand', options: brands.map((b) => ({ key: b.id, label: b.name })), set: (v) => { setBrand(v); setModel(null); } },
    model: { title: 'Select Model', options: models.map((m) => ({ key: m.id, label: m.name })), set: setModel },
    cat: { title: 'Select Category', options: cats.map((c) => ({ key: c.id, label: c.name })), set: setCat },
  }[picker];

  return (
    <View style={{ flex: 1, backgroundColor: SC.bg }}>
      <View style={{ padding: 12, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: SC.soft, borderRadius: 22, paddingHorizontal: 12, borderWidth: 1, borderColor: SC.border }}>
          <Search size={16} color={SC.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search model, issue or solution..." placeholderTextColor={SC.faint} style={{ flex: 1, paddingVertical: 9, marginLeft: 8, fontSize: rf(13), color: SC.ink }} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <View style={{ flex: 1, marginRight: 6 }}><Select compact value={brand?.name} placeholder="Brand" onPress={() => setPicker('brand')} /></View>
          <View style={{ flex: 1, marginRight: 6 }}><Select compact value={model?.name} placeholder="Model" onPress={() => setPicker('model')} disabled={!brand} /></View>
          <View style={{ flex: 1.2 }}><Select compact value={cat?.name} placeholder="Category" onPress={() => setPicker('cat')} /></View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <Text style={{ flex: 1, fontSize: rf(13), fontWeight: '800', color: SC.ink }}>{shown.length} Solution{shown.length === 1 ? '' : 's'} Found</Text>
          {loading ? <ActivityIndicator size="small" color={SC.green} /> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 6, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <TouchableOpacity onPress={runSearch} style={{ paddingVertical: 20 }}>
            <Text style={{ textAlign: 'center', color: '#B91C1C', fontSize: rf(12.5) }}>{error}</Text>
            <Text style={{ textAlign: 'center', color: SC.green, fontWeight: '700', marginTop: 6 }}>Tap to retry</Text>
          </TouchableOpacity>
        ) : null}
        {!error && !loading && shown.length === 0 ? (
          <Text style={{ textAlign: 'center', color: SC.muted, fontSize: rf(12.5), paddingVertical: 24 }}>
            No matching solutions. Change the filters or upload a new one.
          </Text>
        ) : null}
        {shown.map((p) => <ReferenceCard key={p.id} pack={p} onPress={() => navigation.navigate('SolutionPackDetails', { pack: p })} />)}
      </ScrollView>
      <PickerSheet
        visible={!!sheet}
        title={sheet?.title}
        options={sheet ? [{ key: '__any__', label: 'Any' }, ...sheet.options] : []}
        onPick={(o) => { sheet.set(o.key === '__any__' ? null : { id: o.key, name: o.label }); setPicker(null); }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

export function ReferenceCard({ pack, onPress }) {
  const files = packFiles(pack);
  const photos = files.filter((f) => f.type === 'image').length;
  const videos = files.filter((f) => f.type === 'video').length;
  const audios = files.filter((f) => f.type === 'audio').length;
  const result = resultOf(parseDescription(pack.description).result);
  const meta = [[photos, 'Photo', ImageIcon], [videos, 'Video', VideoIcon], [audios, 'Voice note', Mic]].filter(([n]) => n > 0);
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
      <DeviceThumb brand={{ id: pack.brandId, name: pack.brandName }} model={{ id: pack.modelId, name: pack.modelName }} size={46} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: rf(14.5), fontWeight: '800', color: SC.ink }} numberOfLines={1}>
            {[pack.brandName, pack.modelName].filter(Boolean).join(' ') || 'Device'}
          </Text>
          {result ? <Badge label={result.short} tone={result.key === 'fixed' ? 'ok' : 'warn'} /> : null}
        </View>
        <Text style={{ fontSize: rf(12.5), color: SC.ink, marginTop: 2 }} numberOfLines={1}>{pack.title || 'Solution pack'}</Text>
        {pack.issueCategory ? (
          <Text style={{ fontSize: rf(11), color: SC.muted, marginTop: 1 }} numberOfLines={1}>
            {[pack.issueCategory, pack.issueSubcategory].filter(Boolean).join(' / ')}
          </Text>
        ) : null}
        {meta.length ? (
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            {meta.map(([n, label, Icon]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}>
                <Icon size={13} color={SC.muted} />
                <Text style={{ fontSize: rf(11), color: SC.muted, marginLeft: 4 }}>{n} {label}{n > 1 ? 's' : ''}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <ChevronRight size={18} color={SC.ink} style={{ marginLeft: 6 }} />
    </Card>
  );
}
