import { useEffect, useState } from 'react';
import { listDeviceCategories, listModelsForBrand } from '../api/master';

/**
 * IMEI applies to mobile phones only — tablets, laptops, smartwatches and audio
 * devices have no IMEI, so their IMEI input / row is skipped. When the category
 * can't be worked out, the old (mobile) behaviour is kept so a phone never
 * silently loses its IMEI step. Mirrors the Partner app's utils/imeiPolicy.js.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Category code / name (any spelling) → 'MOBILE' | 'TABLET' | 'LAPTOP' | 'SMARTWATCH' | 'AUDIO_DEVICE' | null. */
export function resolveSpecCategory(...candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    const key = String(c).trim().toUpperCase();
    if (!key || UUID_RE.test(key)) continue;
    if (key.includes('LAPTOP')) return 'LAPTOP';
    if (key.includes('WATCH')) return 'SMARTWATCH';
    // Before the PHONE check: "Headphones" / "Earphones" contain it.
    if (/AUDIO|HEADPHONE|EARPHONE|EARBUD|SPEAKER|SOUNDBAR/.test(key)) return 'AUDIO_DEVICE';
    if (key.includes('TABLET')) return 'TABLET';
    if (key.includes('MOBILE') || key.includes('PHONE')) return 'MOBILE';
  }
  return null;
}

export function imeiApplies(category) {
  return category == null || category === 'MOBILE';
}

let categoriesPromise = null;
async function categoryFromId(categoryId) {
  if (!categoryId) return null;
  if (!categoriesPromise) {
    categoriesPromise = listDeviceCategories().catch(() => {
      categoriesPromise = null;
      return [];
    });
  }
  const c = ((await categoriesPromise) || []).find((x) => String(x.id) === String(categoryId));
  return c ? resolveSpecCategory(c.code, c.name) : null;
}

async function modelCategoryId(brandId, modelId, model) {
  if (model?.categoryId) return model.categoryId;
  if (!brandId || !modelId) return null;
  const models = await listModelsForBrand(brandId).catch(() => []);
  return models.find((m) => String(m.id) === String(modelId))?.categoryId || null;
}

/**
 * Spec category of booking-flow params (with optional `booking`), or null when
 * unknown. The picked model's category wins over the booking's original one.
 */
export async function resolveRecordCategory(params = {}) {
  const booking = params.booking || {};
  const brandId = params.brandId || params.brand?.id || booking.brandId;
  const modelId = params.modelId || params.model?.id || booking.modelId;
  const fromModel = await categoryFromId(await modelCategoryId(brandId, modelId, params.model));
  if (fromModel) return fromModel;
  const direct = resolveSpecCategory(
    params.deviceCategoryCode, booking.deviceCategoryCode,
    params.deviceCategoryName, booking.deviceCategoryName,
  );
  if (direct) return direct;
  return categoryFromId(params.deviceCategoryId || booking.deviceCategoryId);
}

/** Hook form of imeiApplies(resolveRecordCategory(params)); true until resolved. */
export function useImeiApplies(params) {
  const [category, setCategory] = useState(null);
  const booking = params?.booking;
  const brandId = params?.brandId || params?.brand?.id || booking?.brandId;
  const modelId = params?.modelId || params?.model?.id || booking?.modelId;
  const modelCatId = params?.model?.categoryId;
  const catId = params?.deviceCategoryId || booking?.deviceCategoryId;
  const catCode = params?.deviceCategoryCode || booking?.deviceCategoryCode;
  const catName = params?.deviceCategoryName || booking?.deviceCategoryName;

  useEffect(() => {
    let alive = true;
    resolveRecordCategory({
      brandId,
      modelId,
      model: modelCatId ? { categoryId: modelCatId } : undefined,
      deviceCategoryId: catId,
      deviceCategoryCode: catCode,
      deviceCategoryName: catName,
    }).then((c) => { if (alive) setCategory(c); }, () => {});
    return () => { alive = false; };
  }, [brandId, modelId, modelCatId, catId, catCode, catName]);

  return imeiApplies(category);
}
