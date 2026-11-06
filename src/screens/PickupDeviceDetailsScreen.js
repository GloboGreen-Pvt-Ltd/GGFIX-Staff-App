import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronRight, Plus, Search, Smartphone, X } from 'lucide-react-native';
import { useHideNativeHeader } from '../components/MintScreenHeader';
import { EText, ETextInput, DeviceImage, rem, Pressable } from '../components/estimate/EstimateKit';
import { resolveDeviceImageSource } from '../utils/images';
import {
  categoryMenuKey, getCategoryMenuImages, getModel, getModelOptions, listBrands, listBrandsForCategory, listDeviceCategories,
  listModelsForBrand, listSeriesForCategoryBrand, parseModelNumbers,
} from '../api/master';

/**
 * Device Details — the Partner App's service-booking Device Details page
 * (screens/owner/service-booking-shop/DeviceDetailsScreen.js) for the pickup
 * person's Repair Estimate: Category → Brand → Series → Model → Color / RAM &
 * Storage on one screen. Each grid folds to a picked card with Change, which
 * reopens it in place, so nothing resets when a Change is backed out of.
 *
 * Employee rules on top of the Partner page: colour and RAM / storage stay
 * required (as the old Color & Storage step), there is no typed "Other" brand
 * / model / RAM / storage (the estimate submits catalogue ids only), and a
 * model's RAM + storage combinations that can't be saved or look malformed
 * (RAM larger than storage) are hidden behind a notice instead of shown.
 */

const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const INK = '#111111';
const MUTED = '#6B7280';
const PLACEHOLDER = '#9CA3AF';
const BORDER = '#E5E7EB';
const PAGE_BG = '#F3F4F6';
const RED = '#F32C26';
const ORANGE = '#FAA700';
const INPUT_H = 46;
const FIELD_BOX = { borderWidth: 1, borderColor: BORDER, borderRadius: 12, backgroundColor: '#FFFFFF' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID_RE.test(String(v || ''));

const CATEGORY_ORDER = ['mobile', 'smartphone', 'tablet', 'laptop', 'smartwatch', 'audiodevice', 'audio'];
const catRank = (c) => Math.min(...[categoryMenuKey(c?.name), categoryMenuKey(c?.code)].map((k) => {
  const at = CATEGORY_ORDER.indexOf(k);
  return at === -1 ? CATEGORY_ORDER.length : at;
}));
// A hair under 100/cols so pixel rounding never wraps the last tile.
const tilePct = (cols) => `${(100 / cols) - 0.1}%`;

const SWATCHES = {
  black: '#111111', white: '#F3F4F6', silver: '#D6D9DE', gold: '#F2D58A', rose: '#F4C6CC', blue: '#3B82F6',
  red: '#E53935', green: '#357D89', purple: '#8B5CF6', pink: '#F48FB1', graphite: '#4B4B4B', midnight: '#1E2A44',
  starlight: '#F5EBD8', orange: '#F59E3B', yellow: '#F3BF23', grey: '#9CA3AF', gray: '#9CA3AF', titanium: '#B8B3AA',
};
const swatchFor = (name) => {
  const n = String(name || '').toLowerCase();
  const key = Object.keys(SWATCHES).find((k) => n.includes(k));
  return key ? SWATCHES[key] : '#D1D5DB';
};
const titleCase = (v) => String(v || '').toLowerCase().replace(/(^|[\s\-/(])([a-z0-9])/g, (_, s, c) => s + c.toUpperCase());

// "8 GB" → 8, "1 TB" → 1024 (null when unreadable).
function gbOf(label) {
  const m = String(label || '').match(/([\d.]+)\s*(tb|gb|mb)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = String(m[2] || 'gb').toLowerCase();
  return unit === 'tb' ? n * 1024 : unit === 'mb' ? n / 1024 : n;
}
// A catalogue RAM + storage combination the estimate can save and that reads
// right: both ids are real master options, each option is the size the
// model's own label says ("32 GB + 2 GB" must not resolve to a 2 TB option),
// and RAM is not larger than storage. Anything else is hidden, not shown.
function variantProblem(v) {
  if (!isUuid(v.storageOptionId) || (!v.storageOnly && !isUuid(v.ramOptionId))) return 'unsupported';
  const [ramPart = '', stoPart = ''] = v.storageOnly ? ['', v.label] : String(v.label || '').split('+').map((x) => x.trim());
  const same = (a, b) => a != null && b != null && Math.abs(a - b) < 0.01;
  if (!same(gbOf(stoPart), gbOf(v.storageLabel))) return 'mismatch';
  if (!v.storageOnly) {
    if (!same(gbOf(ramPart), gbOf(v.ramLabel))) return 'mismatch';
    if (gbOf(ramPart) > gbOf(stoPart)) return 'malformed';
  }
  return null;
}
// Master RAM / storage options that are one size each (the lists also carry
// combined entries such as "6 GB + 128 GB", which aren't a single option).
const singleSize = (o) => o?.id && !String(o.label || '').includes('+') && gbOf(o.label) != null;

export default function PickupDeviceDetailsScreen({ navigation, route }) {
  useHideNativeHeader(navigation);
  const params = route?.params || {};
  const booking = params.booking || {};
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const catCols = winW >= 600 ? 6 : 4;
  const catImg = winW >= 600 ? 48 : 44;
  const brandCols = winW >= 600 ? 8 : 4;
  const modelCols = winW >= 600 ? 5 : 3;
  const optCols = winW >= 900 ? 6 : winW >= 600 ? 5 : 3;
  const seriesCols = winW >= 600 ? 6 : 4;

  // One-shot prefill: what the wizard already holds, else the booking's own device.
  const pick = (key, bookingKey = key) => (params[key] !== undefined ? params[key] : booking[bookingKey]);
  const prefill = useRef({
    brandId: pick('brandId') || null,
    modelId: pick('modelId') || null,
    color: pick('color') || '',
    ramOptionId: pick('ramOptionId') || null,
    storageOptionId: pick('storageOptionId') || null,
    ramLabel: pick('ramLabel') || null,
    storageLabel: pick('storageLabel') || null,
    modelNumber: params.modelNumber || booking.modelNumber || null,
  });
  // The saved device (Edit Estimate): its summary shows straight away while
  // the category → brand → model lookups load; the looked-up model takes over
  // once it resolves, and any manual pick drops it.
  const seed = useRef({
    brandName: pick('brandName') || null,
    modelName: pick('modelName') || null,
    color: String(pick('color') || '').trim(),
    storage: [pick('ramLabel'), pick('storageLabel')].filter(Boolean).join(' / '),
    image: resolveDeviceImageSource({
      url: pick('modelImageUrl') || booking.deviceImageUrl,
      base64: pick('modelImageBase64') || booking.deviceImageBase64,
    }),
  }).current;
  const [seedOn, setSeedOn] = useState(!!seed.modelName);
  // Saved with names only, no catalogue ids (e.g. a device-purchase pickup):
  // the brand + model are looked up by name below, then pre-selected the same way.
  const [byName, setByName] = useState(!prefill.current.modelId && !!seed.brandName && !!seed.modelName);

  // ── Category ──────────────────────────────────────────────────────────────
  const [cats, setCats] = useState([]);
  const [catImages, setCatImages] = useState({});
  const [catsLoading, setCatsLoading] = useState(true);
  const initialCat = params.categoryId || params.deviceCategoryId || booking.deviceCategoryId || null;
  const [catId, setCatId] = useState(initialCat);
  const [catListOpen, setCatListOpen] = useState(!initialCat && !prefill.current.modelId && !byName);
  // ── Brand / series / model ────────────────────────────────────────────────
  const [brands, setBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brand, setBrand] = useState(null);
  const [models, setModels] = useState([]);
  const [series, setSeries] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [seriesId, setSeriesId] = useState('');
  const [q, setQ] = useState('');
  const [model, setModel] = useState(null);
  const [brandListOpen, setBrandListOpen] = useState(true);
  const [modelListOpen, setModelListOpen] = useState(true);
  const [modelLimit, setModelLimit] = useState(24);
  // ── Variant ───────────────────────────────────────────────────────────────
  const [options, setOptions] = useState(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [modelNumber, setModelNumber] = useState(null);
  const [color, setColor] = useState('');
  const [variantId, setVariantId] = useState(null);
  const [ram, setRam] = useState(null);
  const [storage, setStorage] = useState(null);
  const [savedVariantBad, setSavedVariantBad] = useState(null); // label of an invalid saved pair
  const [masterOpen, setMasterOpen] = useState(false); // standard RAM / storage lists unfolded
  const [typeSheet, setTypeSheet] = useState(null);
  useEffect(() => { if (model) setSeedOn(false); }, [model]);

  useEffect(() => {
    let alive = true;
    Promise.all([listDeviceCategories().catch(() => []), getCategoryMenuImages('REPAIR', { includeInactive: true })])
      .then(([list, images]) => {
        if (!alive) return;
        setCats((Array.isArray(list) ? list : [])
          .filter((c) => c?.id && c.isActive !== false)
          .map((c, i) => ({ c, i }))
          .sort((a, b) => catRank(a.c) - catRank(b.c) || a.i - b.i)
          .map(({ c }) => c));
        setCatImages(images || {});
      })
      .finally(() => { if (alive) setCatsLoading(false); });
    return () => { alive = false; };
  }, []);

  // The booking carries no category: read it off the booking's model.
  useEffect(() => {
    if (catId || !prefill.current.modelId) return undefined;
    let alive = true;
    getModel(prefill.current.modelId)
      .then((m) => { if (alive && m?.categoryId) { setCatId(m.categoryId); setCatListOpen(false); } else if (alive) setCatListOpen(true); })
      .catch(() => { if (alive) setCatListOpen(true); });
    return () => { alive = false; };
  }, [catId]);

  // Names only: find the catalogue brand, then its model (stored either bare
  // or with the brand in front), and seed their ids + the model's category so
  // the chain below pre-selects them. Not found → the normal pickers.
  useEffect(() => {
    if (!byName) return undefined;
    let alive = true;
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    (async () => {
      const brands = await listBrands().catch(() => []);
      const b = brands.find((x) => norm(x.name) === norm(seed.brandName));
      const models = b ? await listModelsForBrand(b.id).catch(() => []) : [];
      const want = norm(seed.modelName);
      const m = (Array.isArray(models) ? models : []).find((x) => norm(x.name) === want || norm(`${b.name} ${x.name}`) === want);
      if (!alive) return;
      if (b && m) {
        prefill.current = { ...prefill.current, brandId: b.id, modelId: m.id };
        if (m.categoryId) setCatId(m.categoryId);
        else setCatListOpen(true);
      } else {
        setCatListOpen(true);
      }
      setByName(false);
    })();
    return () => { alive = false; };
  }, []);

  // New category → its brands; everything below starts again.
  useEffect(() => {
    setBrand(null); setBrands([]); setBrandListOpen(true);
    if (!catId) return undefined;
    let alive = true;
    setBrandsLoading(true);
    listBrandsForCategory(catId)
      .then((list) => {
        if (!alive) return;
        const arr = Array.isArray(list) ? list : [];
        setBrands(arr);
        const want = prefill.current.brandId;
        if (want) {
          prefill.current.brandId = null;
          const b = arr.find((x) => String(x.id) === String(want));
          if (b) { setBrand(b); setBrandListOpen(false); } else prefill.current.modelId = null;
        }
      })
      .catch(() => { if (alive) setBrands([]); })
      .finally(() => { if (alive) setBrandsLoading(false); });
    return () => { alive = false; };
  }, [catId]);

  // New brand → its models + series (same category filter as the Partner).
  useEffect(() => {
    setModel(null); setModels([]); setSeries([]); setSeriesId(''); setQ(''); setModelListOpen(true); setModelLimit(24);
    if (!brand?.id) return undefined;
    let alive = true;
    setModelsLoading(true);
    Promise.all([listModelsForBrand(brand.id).catch(() => []), listSeriesForCategoryBrand(catId, brand.id).catch(() => [])])
      .then(([ms, ss]) => {
        if (!alive) return;
        let list = Array.isArray(ms) ? ms : [];
        if (isUuid(catId)) list = list.filter((m) => !m.categoryId || m.categoryId === catId);
        setModels(list);
        setSeries(Array.isArray(ss) ? ss : []);
        const want = prefill.current.modelId;
        if (want) {
          prefill.current.modelId = null;
          const m = list.find((x) => String(x.id) === String(want));
          if (m) { setModel(m); setModelListOpen(false); }
        }
      })
      .finally(() => { if (alive) setModelsLoading(false); });
    return () => { alive = false; };
  }, [brand, catId]);

  // New model → its configured colours / variants / model numbers.
  useEffect(() => {
    setOptions(null); setColor(''); setVariantId(null); setRam(null); setStorage(null); setSavedVariantBad(null); setMasterOpen(false);
    setModelNumber(model?.id ? (parseModelNumbers(model.modelNumber)[0] || null) : null);
    if (!model?.id) return undefined;
    let alive = true;
    setOptionsLoading(true);
    getModelOptions(model.id)
      .then((o) => {
        if (!alive) return;
        setOptions(o);
        const nums = o.modelNumbers?.length ? o.modelNumbers : parseModelNumbers(model.modelNumber);
        setModelNumber((prev) => (prev && nums.includes(prev) ? prev : (nums[0] || null)));
        const pf = prefill.current;
        if (pf.color || pf.ramOptionId || pf.storageOptionId || pf.modelNumber || pf.ramLabel || pf.storageLabel) {
          prefill.current = { ...pf, color: '', ramOptionId: null, storageOptionId: null, modelNumber: null, ramLabel: null, storageLabel: null };
          if (pf.color) {
            const c = [...(o.colors || []), ...(o.allColors || [])].find((x) => String(x.name || '').toLowerCase() === String(pf.color).toLowerCase());
            setColor(c ? c.name : pf.color);
          }
          const good = (o.specs || []).filter((v) => !variantProblem(v));
          // By saved ids, else (names-only booking) by the saved RAM / storage sizes.
          const v = pf.ramOptionId || pf.storageOptionId
            ? good.find((x) => (x.ramOptionId || null) === (pf.ramOptionId || null) && (x.storageOptionId || null) === (pf.storageOptionId || null))
            : pf.storageLabel || pf.ramLabel
            ? good.find((x) => (!pf.storageLabel || gbOf(x.storageLabel) === gbOf(pf.storageLabel)) && (!pf.ramLabel || gbOf(x.ramLabel) === gbOf(pf.ramLabel)))
            : null;
          if (v) setVariantId(v.id);
          else if (pf.ramOptionId || pf.storageOptionId) {
            const r = gbOf(pf.ramLabel);
            const s = gbOf(pf.storageLabel);
            const malformed = r != null && s != null && r > s;
            // Master-list values are trusted only when the model lists no
            // variants of its own (a saved pair from an invalid list isn't).
            const singles = (list, id) => (list || []).some((x) => x.id === id && singleSize(x));
            const usable = (o.specs || []).length === 0 && !malformed
              && singles(o.allStorages, pf.storageOptionId) && (!pf.ramOptionId || singles(o.allRams, pf.ramOptionId));
            if (usable) { if (pf.ramOptionId) setRam(pf.ramOptionId); setStorage(pf.storageOptionId); }
            else setSavedVariantBad([pf.ramLabel, pf.storageLabel].filter(Boolean).join(' + ') || 'saved value');
          }
          if (pf.modelNumber && nums.includes(pf.modelNumber)) setModelNumber(pf.modelNumber);
        }
      })
      .catch(() => { if (alive) setOptions({ colors: [], specs: [], allColors: [], allRams: [], allStorages: [], modelNumbers: [] }); })
      .finally(() => { if (alive) setOptionsLoading(false); });
    return () => { alive = false; };
  }, [model]);

  const category = cats.find((c) => c.id === catId) || null;
  const seriesWithModels = useMemo(() => {
    const ids = new Set(models.map((m) => m.seriesId).filter(Boolean));
    return series.filter((s) => ids.has(s.id));
  }, [series, models]);
  const listModels = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) return models.filter((m) => String(m.name || '').toLowerCase().includes(needle));
    return seriesId ? models.filter((m) => m.seriesId === seriesId) : models;
  }, [models, seriesId, q]);

  const colorsList = options ? (options.colors?.length ? options.colors : options.allColors || []) : [];
  const allVariants = options?.specs || [];
  const variants = allVariants.filter((v) => !variantProblem(v));
  const hiddenVariants = allVariants.length - variants.length;
  const useMasterLists = !!options && variants.length === 0;
  const storageOnly = variants.length > 0 && variants.every((v) => v.storageOnly);
  const modelNumbers = options?.modelNumbers?.length ? options.modelNumbers : parseModelNumbers(model?.modelNumber);
  const pickedVariant = variants.find((v) => v.id === variantId);

  const catImageFor = (c) => (c ? catImages[categoryMenuKey(c.name)] || catImages[categoryMenuKey(c.code)] || c.imageUrl || null : null);
  const modelImage = model?.id ? resolveDeviceImageSource({ url: model.imageUrl, base64: model.imageBase64 }) : null;
  const seriesName = model?.seriesId ? series.find((s) => s.id === model.seriesId)?.name : null;
  const ramLabelOf = (id) => (id ? options?.allRams?.find((x) => x.id === id)?.label : undefined);
  const storageLabelOf = (id) => (id ? options?.allStorages?.find((x) => x.id === id)?.label : undefined);
  const colorSwatch = (name) => colorsList.find((c) => c.name === name)?.hexCode || swatchFor(name);
  const masterPairBad = useMasterLists && ram && storage && (gbOf(ramLabelOf(ram)) || 0) > (gbOf(storageLabelOf(storage)) || 0);

  // Colour and RAM / storage are optional, as on the Partner page: the
  // estimate keeps the booking's saved value for anything left empty
  // (the server COALESCEs). Only a RAM larger than storage blocks Next.
  // An Other (typed) brand / model has no catalogue id; it rides on the issue
  // summary as a "Device (not in list)" line (bookings store ids only).
  const ready = !!category && !!(brand?.id || brand?.custom) && !!(model?.id || model?.custom) && !optionsLoading && !masterPairBad;
  const missingHint = masterPairBad ? 'RAM can’t be larger than storage.' : '';

  const pickModel = (m) => {
    setSeedOn(false);
    setModel(m);
    if (m?.seriesId) setSeriesId((cur) => (cur && cur !== m.seriesId ? '' : cur));
    setQ('');
    setModelListOpen(false);
  };

  const onNext = () => {
    if (!ready) return;
    const variant = pickedVariant;
    if (params.sellInspection) {
      // Device purchase: on to the customer's selling pages (Screening →
      // Screen → Functional → Accessories & Warranty), with the customer's
      // answers (sellEval) as the pre-selection.
      navigation.navigate('SellInspectScreening', {
        bookingId: params.bookingId,
        booking,
        device: {
          categoryId: category.id,
          categoryCode: category.code || null,
          brandId: brand.id || null,
          brandName: brand.name,
          modelId: model.id || null,
          modelName: model.name,
          ramOptionId: variant ? (variant.ramOptionId || null) : (ram || null),
          ramLabel: variant ? (variant.ramLabel || null) : (ramLabelOf(ram) || null),
          storageOptionId: variant ? variant.storageOptionId : storage,
          storageLabel: variant ? variant.storageLabel : (storageLabelOf(storage) || null),
          color: color.trim() || null,
          modelNumber: modelNumber || null,
        },
        workingCondition: params.sellEval?.workingCondition || null,
        editHints: params.sellEval || null,
      });
      return;
    }
    navigation.navigate('PickupDevicesRepair', {
      ...params,
      returnTo: undefined,
      categoryId: category.id,
      categoryName: category.name,
      deviceCategoryId: category.id,
      brandId: brand.id || null,
      brandName: brand.name,
      brand,
      seriesId: model.seriesId || undefined,
      seriesName: seriesName || undefined,
      modelId: model.id || null,
      modelName: model.name,
      model,
      customDevice: brand.custom || model.custom ? `${brand.name} ${model.name}` : undefined,
      modelNumber: modelNumber || undefined,
      modelImageUrl: model.imageUrl || modelImage || null,
      modelImageBase64: model.imageBase64 || null,
      color: color.trim(),
      ramOptionId: variant ? (variant.ramOptionId || null) : (ram || null),
      ramLabel: variant ? (variant.ramLabel || null) : (ramLabelOf(ram) || null),
      storageOptionId: variant ? variant.storageOptionId : storage,
      storageLabel: variant ? variant.storageLabel : (storageLabelOf(storage) || null),
    });
  };

  const seeded = seedOn && !model;
  const crumbs = seeded ? [seed.brandName, seed.modelName].filter(Boolean) : [brand?.name, seriesName, model?.name].filter(Boolean);
  const summaryColor = seeded ? seed.color : color.trim();
  const summaryStorage = seeded ? seed.storage : pickedVariant ? pickedVariant.label
    : [ramLabelOf(ram), storageLabelOf(storage)].filter(Boolean).join(' / ');
  const summaryImage = seeded ? seed.image : modelImage;
  const customerName = params.customer?.name || params.customerName || booking.customerName;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Header — Partner Device Details strip. */}
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go back"
            style={({ pressed }) => ({ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE_BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1, paddingHorizontal: 8 }}>
            <EText style={{ textAlign: 'center', color: INK, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>Device Details</EText>
            <EText style={{ textAlign: 'center', fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>
              {customerName ? `Device for ${customerName}` : 'Select the customer’s device'}
            </EText>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 24, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 760 }}>
            {/* Category */}
            <Field label="Category">
              {category && !catListOpen ? (
                <PickedCard image={catImageFor(category)} title={category.name} onChange={() => setCatListOpen(true)} />
              ) : catsLoading || (!catId && (prefill.current.modelId || byName) && !catListOpen) ? (
                <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {cats.map((c) => {
                    const on = c.id === catId;
                    const img = catImageFor(c);
                    return (
                      <View key={c.id} style={{ width: tilePct(catCols), padding: 4 }}>
                        <Pressable
                          onPress={() => { if (!on) { setSeedOn(false); setCatId(c.id); } setCatListOpen(false); }}
                          accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={c.name}
                          style={({ pressed }) => ({
                            minHeight: 96, paddingHorizontal: 6, paddingVertical: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                            borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : BORDER, backgroundColor: on ? MINT : '#FFFFFF', opacity: pressed ? 0.8 : 1,
                          })}
                        >
                          {on ? <TickBadge size={18} top={6} /> : null}
                          {img ? <DeviceImage url={img} style={{ width: catImg, height: catImg }} /> : <Smartphone size={28} color={INK} strokeWidth={1.75} />}
                          <EText style={{ marginTop: 8, fontSize: 12, lineHeight: 15, fontWeight: on ? '700' : '500', color: INK, textAlign: 'center' }}
                            numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {c.name}
                          </EText>
                        </Pressable>
                      </View>
                    );
                  })}
                  {!cats.length ? <EText style={{ fontSize: 12, color: MUTED, padding: 4 }}>Categories could not be loaded. Go back and try again.</EText> : null}
                </View>
              )}
            </Field>

            {/* Brand */}
            {category ? (
              <Field label="Brand">
                {brand && !brandListOpen ? (
                  <PickedCard image={brand.custom ? null : resolveDeviceImageSource({ url: brand.imageUrl, base64: brand.imageBase64 })} title={brand.name}
                    subtitle={brand.custom ? 'Not in list' : null} onChange={() => setBrandListOpen(true)} />
                ) : brandsLoading ? (
                  <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                    {brands.map((b) => (
                      <View key={b.id} style={{ width: tilePct(brandCols), padding: 4 }}>
                        <GridTile
                          label={b.name}
                          image={resolveDeviceImageSource({ url: b.imageUrl, base64: b.imageBase64 })}
                          imageSize={44}
                          imageWidth="100%"
                          compact
                          padH={2}
                          on={brand?.id === b.id}
                          onPress={() => { if (brand?.id !== b.id) { setSeedOn(false); setBrand(b); } setBrandListOpen(false); }}
                        />
                      </View>
                    ))}
                    {/* Other — a brand that isn't in the catalogue, typed (Partner's Other Brand). */}
                    <View style={{ width: tilePct(brandCols), padding: 4 }}>
                      <GridTile
                        label={brand?.custom ? brand.name : 'Other'}
                        icon={Plus}
                        imageSize={44}
                        compact
                        padH={2}
                        on={!!brand?.custom}
                        onPress={() => setTypeSheet({
                          title: 'Other Brand',
                          placeholder: 'Type the brand name',
                          initial: brand?.custom ? brand.name : '',
                          onDone: (name) => { setSeedOn(false); setBrand({ id: null, name, custom: true }); setBrandListOpen(false); },
                        })}
                      />
                    </View>
                  </View>
                )}
              </Field>
            ) : null}

            {/* Model */}
            {brand ? (
              <Field label="Model">
                {model && !modelListOpen ? (
                  <PickedCard image={modelImage} imageSize={44} title={model.name} subtitle={model.custom ? 'Not in list' : seriesName} onChange={() => setModelListOpen(true)} />
                ) : modelsLoading ? (
                  <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
                ) : (
                  <>
                    {models.length ? (
                      <View style={{ ...FIELD_BOX, flexDirection: 'row', alignItems: 'center', paddingHorizontal: rem(0.75), height: INPUT_H, marginBottom: 10 }}>
                        <Search size={18} color={MUTED} />
                        <ETextInput
                          value={q}
                          onChangeText={(v) => { setQ(v); setModelLimit(24); }}
                          placeholder="Search model"
                          placeholderTextColor={PLACEHOLDER}
                          cursorColor={ACCENT}
                          returnKeyType="search"
                          style={{ flex: 1, marginLeft: rem(0.5), paddingVertical: 0, fontSize: 13, color: INK }}
                        />
                        {q ? <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search"><X size={16} color={MUTED} /></Pressable> : null}
                      </View>
                    ) : null}

                    {seriesWithModels.length && !q.trim() ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 6 }}>
                        {[{ id: '', name: 'All' }, ...seriesWithModels].map((sr) => (
                          <View key={sr.id || 'all'} style={{ width: tilePct(seriesCols), padding: 4 }}>
                            <OptionTile label={sr.name} on={seriesId === sr.id} onPress={() => { setSeriesId(sr.id); setModelLimit(24); }} />
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                      {listModels.slice(0, modelLimit).map((m) => (
                        <View key={m.id} style={{ width: tilePct(modelCols), padding: 4 }}>
                          <GridTile
                            label={m.name}
                            image={resolveDeviceImageSource({ url: m.imageUrl, base64: m.imageBase64 })}
                            imageSize={60}
                            imageWidth={64}
                            padH={2}
                            labelSize={13}
                            fallbackIcon={Smartphone}
                            on={model?.id === m.id}
                            onPress={() => pickModel(m)}
                          />
                        </View>
                      ))}
                      {/* Other — a model that isn't in the catalogue (the only choice for an Other brand). */}
                      <View style={{ width: tilePct(modelCols), padding: 4 }}>
                        <GridTile
                          label={model?.custom ? model.name : 'Other'}
                          icon={Plus}
                          imageSize={60}
                          padH={2}
                          labelSize={13}
                          on={!!model?.custom}
                          onPress={() => setTypeSheet({
                            title: 'Other Model',
                            placeholder: 'Type the model name',
                            initial: model?.custom ? model.name : '',
                            onDone: (name) => pickModel({ id: null, name, custom: true }),
                          })}
                        />
                      </View>
                    </View>

                    {listModels.length > modelLimit ? (
                      <Pressable onPress={() => setModelLimit((n) => n + 24)} accessibilityRole="button"
                        style={({ pressed }) => ({ marginTop: 8, height: 40, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                        <EText style={{ fontSize: 13, fontWeight: '700', color: ACCENT }}>Show more models ({listModels.length - modelLimit})</EText>
                      </Pressable>
                    ) : null}
                    {!models.length && !brand.custom ? <EText style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>No models are listed for this brand yet — tap Other to type it.</EText> : null}
                    {q.trim() && models.length && !listModels.length ? (
                      <EText style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>No model matches “{q.trim()}”.</EText>
                    ) : null}
                  </>
                )}
              </Field>
            ) : null}

            {/* Variant: model number, colour, RAM & storage */}
            {model ? (
              optionsLoading ? (
                <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
              ) : (
                <>
                  {modelNumbers.length > 1 ? (
                    <Field label="Model Number">
                      <FoldGrid valueLabel={modelNumber || ''} cols={optCols}
                        options={modelNumbers.map((n) => ({ key: n, label: n }))} selected={modelNumber} onSelect={(k) => setModelNumber(k)} />
                    </Field>
                  ) : null}

                  <Field label="Color" optional>
                    <FoldGrid
                      valueLabel={color ? titleCase(color) : ''}
                      valueSwatch={color ? colorSwatch(color) : null}
                      cols={optCols}
                      options={colorsList.map((c) => ({ key: c.name, label: titleCase(c.name), swatch: c.hexCode || swatchFor(c.name) }))}
                      selected={color}
                      onSelect={(k) => setColor(color === k ? '' : k)}
                      other={{
                        value: color && !colorsList.some((c) => c.name === color) ? titleCase(color) : '',
                        onPress: () => setTypeSheet({ title: 'Other Color', placeholder: 'Type the colour, e.g. Sea Green', onDone: (t) => setColor(t) }),
                      }}
                    />
                  </Field>

                  {/* One notice: what's wrong with the catalogue / saved value. */}
                  {hiddenVariants > 0 && !variants.length ? (
                    <Notice text={`This model’s catalogue RAM & storage (${allVariants.map((v) => `“${v.label}”`).join(', ')}) is invalid, so choose from the standard RAM and storage options.`} />
                  ) : hiddenVariants > 0 ? (
                    <Notice text={`${hiddenVariants} RAM & storage option${hiddenVariants === 1 ? '' : 's'} for this model ${hiddenVariants === 1 ? 'has' : 'have'} invalid catalogue data and ${hiddenVariants === 1 ? 'is' : 'are'} hidden.${savedVariantBad ? ` The saved ${savedVariantBad} needs choosing again.` : ''}`} />
                  ) : savedVariantBad ? (
                    <Notice text={`The RAM & storage saved on this booking (${savedVariantBad}) isn’t one of this model’s options. Choose it again.`} />
                  ) : null}

                  {model.custom ? null : !useMasterLists ? (
                    <Field label={storageOnly ? 'Storage' : 'RAM & Storage'} optional>
                      <FoldGrid valueLabel={pickedVariant?.label || ''} cols={optCols}
                        options={variants.map((v) => ({ key: v.id, label: v.label }))}
                        selected={variantId} onSelect={(k) => setVariantId(variantId === k ? null : k)} />
                    </Field>
                  ) : !masterOpen && !ram && !storage ? (
                    // Optional and nothing picked: one folded row, like the Partner's.
                    <Field label="RAM & Storage" optional>
                      <View style={{ ...FIELD_BOX, flexDirection: 'row', alignItems: 'center', minHeight: INPUT_H, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <EText style={{ flex: 1, fontSize: 14, color: MUTED }} numberOfLines={1}>Not selected</EText>
                        <Pressable onPress={() => setMasterOpen(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Select RAM and storage"
                          style={({ pressed }) => ({ paddingHorizontal: 12, height: 30, borderRadius: 999, borderWidth: 1, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                          <EText style={{ fontSize: 12, fontWeight: '700', color: ACCENT }}>Select</EText>
                        </Pressable>
                      </View>
                    </Field>
                  ) : (
                    <>
                      <Field label="RAM" optional>
                        <FoldGrid valueLabel={ramLabelOf(ram) || ''} cols={optCols}
                          options={(options?.allRams || []).filter(singleSize).map((x) => ({ key: x.id, label: x.label }))}
                          selected={ram} onSelect={(k) => setRam(ram === k ? null : k)} />
                      </Field>
                      <Field label="Storage" optional>
                        <FoldGrid valueLabel={storageLabelOf(storage) || ''} cols={optCols}
                          options={(options?.allStorages || []).filter(singleSize).map((x) => ({ key: x.id, label: x.label }))}
                          selected={storage} onSelect={(k) => setStorage(storage === k ? null : k)} />
                      </Field>
                      {masterPairBad ? <Notice text="RAM can’t be larger than storage. Check both values." /> : null}
                    </>
                  )}
                </>
              )
            ) : null}

            {/* Select Device summary */}
            {crumbs.length ? (
              <View style={{ marginTop: 4, borderRadius: 14, backgroundColor: PAGE_BG, padding: 12 }}>
                <EText style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 10 }}>Select Device</EText>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 64, height: 76, borderRadius: 10, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                    {summaryImage ? <DeviceImage url={summaryImage} style={{ width: 56, height: 68 }} /> : <Smartphone size={28} color={ACCENT} />}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                      {crumbs.map((c, i) => (
                        <View key={`${c}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
                          <EText style={{ fontSize: 13, fontWeight: i === crumbs.length - 1 ? '800' : '500', color: INK }}>{c}</EText>
                          {i < crumbs.length - 1 ? <ChevronRight size={14} color={MUTED} style={{ marginHorizontal: 4 }} /> : null}
                        </View>
                      ))}
                    </View>
                    {summaryColor ? <SummaryLine label="Color" value={titleCase(summaryColor)} /> : null}
                    {summaryStorage ? <SummaryLine label="Storage" value={summaryStorage} /> : null}
                    {modelNumber ? <SummaryLine label="Model Number" value={modelNumber} /> : null}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Next (the header arrow goes back). No tab bar on this flow, so
          it clears the Android navigation bar itself (edge-to-edge). */}
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 + insets.bottom, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#FFFFFF', alignItems: 'center' }}>
        <Pressable onPress={onNext} disabled={!ready} accessibilityRole="button" accessibilityLabel="Next" accessibilityState={{ disabled: !ready }}
          style={({ pressed }) => ({ width: '100%', maxWidth: 760, height: 48, borderRadius: 12, backgroundColor: ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: !ready ? 0.45 : pressed ? 0.85 : 1 })}>
          <EText style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Next</EText>
          <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.25} style={{ marginLeft: 8 }} />
        </Pressable>
        {!ready && missingHint ? <EText style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>{missingHint}</EText> : null}
      </View>

      <TypeSheet config={typeSheet} onClose={() => setTypeSheet(null)} />
    </View>
  );
}

function Field({ label, required, optional, children }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <EText style={{ fontSize: 14, fontWeight: '700', color: INK, marginBottom: 8 }}>
        {label}
        {required ? <EText style={{ color: RED }}> *</EText> : null}
        {optional ? <EText style={{ fontWeight: '400', color: MUTED }}> (Optional)</EText> : null}
      </EText>
      {children}
    </View>
  );
}

function TickBadge({ size = 16, top = 5 }) {
  return (
    <View style={{ position: 'absolute', top, right: top, height: size, width: size, borderRadius: size / 2, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
      <Check size={size === 18 ? 11 : 10} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}

// Brand / model tile — art (or an icon / initial) over a two-line name.
function GridTile({ label, image, imageSize = 40, imageWidth, compact, padH, labelSize, icon: Icon, fallbackIcon: Fallback, on, onPress }) {
  const small = compact ?? imageSize <= 36;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: small ? 78 : 112, paddingHorizontal: padH ?? (small ? 3 : 6), paddingVertical: small ? 8 : 10, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : BORDER, backgroundColor: on ? MINT : '#FFFFFF', opacity: pressed ? 0.8 : 1,
      })}
    >
      {on ? <TickBadge /> : null}
      {image ? (
        <DeviceImage url={image} style={{ width: imageWidth ?? imageSize, height: imageSize }} />
      ) : Icon ? (
        <View style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={Math.round(imageSize * 0.55)} color={ACCENT} strokeWidth={2.25} />
        </View>
      ) : Fallback ? (
        <Fallback size={Math.round(imageSize * 0.6)} color={INK} strokeWidth={1.5} />
      ) : (
        <View style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2, backgroundColor: PAGE_BG, alignItems: 'center', justifyContent: 'center' }}>
          <EText style={{ fontSize: Math.round(imageSize * 0.45), fontWeight: '800', color: INK }}>{String(label || '?').trim().charAt(0).toUpperCase()}</EText>
        </View>
      )}
      <EText
        style={{ marginTop: 6, fontSize: labelSize ?? (small ? 10.5 : 12), lineHeight: labelSize ? labelSize + 3 : (small ? 13 : 15), fontWeight: on ? '700' : '500', color: INK, textAlign: 'center' }}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </EText>
    </Pressable>
  );
}

// Folded Category / Brand / Model: art, name, Change.
function PickedCard({ image, imageSize = 36, title, subtitle, onChange }) {
  return (
    <View style={{ ...FIELD_BOX, flexDirection: 'row', alignItems: 'center', padding: 10 }}>
      <View style={{ width: imageSize + 8, height: imageSize + 8, borderRadius: 10, backgroundColor: PAGE_BG, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {image ? <DeviceImage url={image} style={{ width: imageSize, height: imageSize }} /> : (
          <EText style={{ fontSize: Math.round(imageSize * 0.45), fontWeight: '800', color: INK }}>{String(title || '?').trim().charAt(0).toUpperCase()}</EText>
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
        <EText style={{ fontSize: 14, fontWeight: '700', color: INK }} numberOfLines={2}>{title}</EText>
        {subtitle ? <EText style={{ fontSize: 12, color: MUTED, marginTop: 1 }} numberOfLines={1}>{subtitle}</EText> : null}
      </View>
      <ChangeButton label={title} onPress={onChange} height={32} />
    </View>
  );
}

function ChangeButton({ label, onPress, height }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Change ${label}`}
      style={({ pressed }) => ({ paddingHorizontal: 12, height, borderRadius: 999, borderWidth: 1, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <EText style={{ fontSize: 12, fontWeight: '700', color: ACCENT }}>Change</EText>
    </Pressable>
  );
}

function SummaryLine({ label, value }) {
  return (
    <EText style={{ marginTop: 4, fontSize: 12, color: MUTED }} numberOfLines={1}>
      {label}: <EText style={{ fontWeight: '700', color: INK }}>{value}</EText>
    </EText>
  );
}

function Notice({ text }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 10, marginBottom: 12, backgroundColor: `${ORANGE}1A`, borderWidth: 1, borderColor: `${ORANGE}55` }}>
      <AlertTriangle size={14} color={ORANGE} style={{ marginTop: 1 }} />
      <EText style={{ flex: 1, fontSize: 12, color: INK, lineHeight: 17 }}>{text}</EText>
    </View>
  );
}

// An option grid that folds to its picked value (swatch + label + Change).
function FoldGrid({ valueLabel, valueSwatch, ...grid }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [valueLabel]);
  if (valueLabel && !editing) {
    return (
      <View style={{ ...FIELD_BOX, flexDirection: 'row', alignItems: 'center', minHeight: INPUT_H, paddingHorizontal: 12, paddingVertical: 6 }}>
        {valueSwatch ? (
          <View style={{ height: 18, width: 18, borderRadius: 9, backgroundColor: valueSwatch, borderWidth: 1, borderColor: 'rgba(17, 17, 17,0.15)', marginRight: 10 }} />
        ) : null}
        <EText style={{ flex: 1, fontSize: 14, fontWeight: '700', color: INK }} numberOfLines={1}>{valueLabel}</EText>
        <ChangeButton label={valueLabel} onPress={() => setEditing(true)} height={30} />
      </View>
    );
  }
  return <OptionGrid {...grid} />;
}

function OptionGrid({ options, selected, onSelect, cols = 3, other }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {options.map((o) => (
        <View key={o.key} style={{ width: tilePct(cols), padding: 4 }}>
          <OptionTile label={o.label} swatch={o.swatch} on={selected === o.key} onPress={() => onSelect(o.key)} />
        </View>
      ))}
      {other ? (
        <View style={{ width: tilePct(cols), padding: 4 }}>
          <OptionTile label={other.value || 'Other'} icon={Plus} on={!!other.value} onPress={other.onPress} />
        </View>
      ) : null}
      {!options.length && !other ? <EText style={{ fontSize: 12, color: MUTED, padding: 4 }}>No options listed for this model.</EText> : null}
    </View>
  );
}

function OptionTile({ label, swatch, icon: Icon, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: 46, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : BORDER, backgroundColor: on ? MINT : '#FFFFFF', opacity: pressed ? 0.8 : 1,
      })}
    >
      {swatch ? (
        <View style={{ height: 16, width: 16, borderRadius: 8, backgroundColor: swatch, borderWidth: 1, borderColor: 'rgba(17, 17, 17,0.15)', marginRight: 6 }} />
      ) : Icon ? (
        <Icon size={15} color={ACCENT} strokeWidth={2.5} style={{ marginRight: 4 }} />
      ) : null}
      <EText style={{ flexShrink: 1, fontSize: 12, lineHeight: 15, fontWeight: on ? '800' : '600', color: on ? ACCENT : INK, textAlign: 'center' }}
        numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </EText>
    </Pressable>
  );
}

// Typed colour: Done / ✕ / closing uses what was typed (blank → nothing).
function TypeSheet({ config, onClose }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  useEffect(() => { setText(config?.initial || ''); }, [config]);
  const finish = () => {
    const t = text.trim();
    if (t && config?.onDone) config.onDone(t);
    onClose();
  };
  return (
    <Modal visible={!!config} transparent animationType="slide" onRequestClose={finish}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', justifyContent: 'flex-end', alignItems: 'center' }} onPress={finish}>
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 520, backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: insets.bottom + 16 }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER, marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <EText style={{ flex: 1, fontSize: 15, fontWeight: '800', color: INK }}>{config?.title || ''}</EText>
              <Pressable onPress={finish} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close"><X size={20} color={MUTED} /></Pressable>
            </View>
            <View style={{ ...FIELD_BOX, height: INPUT_H, paddingHorizontal: 12, justifyContent: 'center' }}>
              <ETextInput value={text} onChangeText={setText} autoFocus placeholder={config?.placeholder || ''} placeholderTextColor={PLACEHOLDER}
                cursorColor={ACCENT} returnKeyType="done" onSubmitEditing={finish} style={{ paddingVertical: 0, fontSize: 14, color: INK }} />
            </View>
            <EText style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Press Done to use this colour.</EText>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
