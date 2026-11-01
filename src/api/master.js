import { MASTER_BASE } from './config';
import { getToken } from '../auth/session';
import { friendlyApiMessage, logDiagnostic } from '../utils/userMessages';

// Master-data-service lives on a different base than the auth/ticket clients,
// so we issue requests against MASTER_BASE directly. Endpoints used by the
// solution-pack form: GET /master/brands, GET /master/brands/{id}/models.
async function masterGet(path, { query } = {}) {
  const base = String(MASTER_BASE).replace(/\/$/, '');
  const url = new URL(path, base + '/');
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }
  const token = await getToken();
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const serverMessage = (json && (json.message || json.error)) || text || '';
    const err = new Error(friendlyApiMessage({ status: res.status, serverMessage, hadToken: !!token }));
    err.status = res.status;
    err.serverMessage = serverMessage;
    err.diagnostic = `GET ${url.pathname} → ${res.status}: ${String(serverMessage).slice(0, 300)}`;
    logDiagnostic(err);
    throw err;
  }
  return json;
}

export async function listBrands() {
  const res = await masterGet('master/brands');
  return Array.isArray(res) ? res : res?.content || [];
}

export async function listModelsForBrand(brandId) {
  if (!brandId) return [];
  const res = await masterGet(`master/brands/${brandId}/models`);
  return Array.isArray(res) ? res : res?.content || [];
}

// "Issue Main Category" radio list is now driven by the admin's
// `master_repair_categories` table (same source the admin's Repair Services
// page reads). Optionally scoped to a device category (e.g. Mobile) when the
// ticket exposes one — falls back to all categories otherwise.
export async function listRepairCategories({ deviceCategoryId } = {}) {
  const res = await masterGet('master/repair-categories', {
    query: deviceCategoryId ? { deviceCategoryId } : undefined,
  });
  return Array.isArray(res) ? res : res?.content || [];
}

// Sub-category dropdown options for a main category: rows from
// `master_repair_services` whose categoryId matches.
export async function listRepairServices({ categoryId, deviceCategoryId } = {}) {
  if (!categoryId && !deviceCategoryId) return [];
  const res = await masterGet('master/repair-services', {
    query: { categoryId, deviceCategoryId },
  });
  return Array.isArray(res) ? res : res?.content || [];
}

// Unfiltered list of every `master_repair_services` row — used by the
// pickup-person Device Services screen which groups all services by
// category client-side. The filtered variant above bails to [] when no
// scope is given, so this dedicated helper avoids accidentally widening
// the result set of existing solution-pack callers.
export async function listAllRepairServices() {
  const res = await masterGet('master/repair-services');
  return Array.isArray(res) ? res : res?.content || [];
}

// Device categories (Mobile, Tablet, ...) — used to scope the repair-category
// radio list when the ticket's brand resolves to one.
export async function listDeviceCategories() {
  const res = await masterGet('master/device-categories');
  return Array.isArray(res) ? res : res?.content || [];
}

// Admin-managed list backing the employee Ticket Detail screen's "Technician
// Work Status" dropdown. activeOnly defaults true so retired options don't
// appear; pass false from the admin UI to see all rows.
export async function listTechnicianWorkStatuses({ activeOnly = true } = {}) {
  const res = await masterGet('master/technician-work-statuses', {
    // Always send the flag explicitly. Omitting it when false let the backend
    // fall back to its active-only default, so passing `false` never actually
    // returned the retired rows. (`false` is a valid query value — the client's
    // query serializer only drops undefined/null/'' , not false.)
    query: { activeOnly },
  });
  return Array.isArray(res) ? res : res?.content || [];
}

// Master data for the pickup-person Repair Estimate flow. The pickup person
// re-confirms what the customer entered (brand → model → color/RAM/storage)
// on the actual device they collected, so each screen needs to list all
// brands / category-filtered brands / models for a brand / RAM / storage.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v); }

export async function listBrandsForCategory(categoryIdOrCode) {
  if (!categoryIdOrCode) return listBrands();
  const path = isUuid(categoryIdOrCode)
    ? `master/categories/${categoryIdOrCode}/brands`
    : `master/categories/by-code/${encodeURIComponent(String(categoryIdOrCode).toUpperCase())}/brands`;
  const res = await masterGet(path).catch(() => []);
  return Array.isArray(res) ? res : res?.content || [];
}

export async function listRamOptions() {
  const res = await masterGet('master/ram-options');
  return Array.isArray(res) ? res : res?.content || [];
}

export async function listStorageOptions() {
  const res = await masterGet('master/storage-options');
  return Array.isArray(res) ? res : res?.content || [];
}

export async function listColors() {
  const res = await masterGet('master/colors');
  return Array.isArray(res) ? res : res?.content || [];
}

// ── Same read-only catalogue calls as the Partner App's api/masterData ─────
const rows = (res) => (Array.isArray(res) ? res : res?.content || res?.data || []);

/** Series of a brand within a device category ([] when none / unknown). */
export async function listSeriesForCategoryBrand(categoryIdOrCode, brandId) {
  if (!categoryIdOrCode || !brandId) return [];
  const path = isUuid(categoryIdOrCode)
    ? `master/categories/${categoryIdOrCode}/brands/${brandId}/series`
    : `master/categories/by-code/${encodeURIComponent(String(categoryIdOrCode).toUpperCase())}/brands/${brandId}/series`;
  return rows(await masterGet(path).catch(() => []));
}

export async function listModelsForSeries(seriesId) {
  if (!seriesId) return [];
  return rows(await masterGet(`master/series/${seriesId}/models`).catch(() => []));
}

export async function getModel(modelId) {
  if (!modelId) return null;
  return masterGet(`master/models/${modelId}`);
}

/** "SM-S921B / SM-S921E" or ["…"] → unique codes. */
export function parseModelNumbers(mn) {
  const raw = Array.isArray(mn) ? mn.map((x) => String(x).trim()) : String(mn || '').split(/[/,;]+/).map((x) => x.trim());
  return [...new Set(raw.filter(Boolean))];
}

/**
 * A model's configured options (Partner getModelOptions): its own colours and
 * RAM+storage combinations from GET /master/models/{id}. Colours get a swatch
 * from the global palette by name; each "8 GB + 128 GB" label resolves to the
 * real RAM / storage option ids when those sizes exist. The full master lists
 * come back too, for a model with nothing configured yet.
 */
export async function getModelOptions(modelId) {
  const [allColors, allRams, allStorages, model] = await Promise.all([
    listColors().catch(() => []),
    listRamOptions().catch(() => []),
    listStorageOptions().catch(() => []),
    modelId ? getModel(modelId).catch(() => null) : Promise.resolve(null),
  ]);
  const colorByName = new Map(allColors.map((c) => [String(c.name).toLowerCase(), c]));
  const colors = [];
  const seenColor = new Set();
  (Array.isArray(model?.colors) ? model.colors : []).forEach((name) => {
    const key = String(name || '').toLowerCase();
    if (!key || seenColor.has(key)) return;
    seenColor.add(key);
    const hit = colorByName.get(key);
    colors.push({ id: hit?.id || name, name, hexCode: hit?.hexCode });
  });
  const specs = [];
  const seenSpec = new Set();
  (Array.isArray(model?.ramStorage) ? model.ramStorage : []).forEach((rawLabel) => {
    const label = String(rawLabel || '').trim();
    if (!label || seenSpec.has(label)) return;
    seenSpec.add(label);
    if (label.includes('+')) {
      const [ramPart = '', stoPart = ''] = label.split('+').map((x) => x.trim());
      const ramOpt = allRams.find((r) => r.valueGb === parseInt(ramPart, 10));
      const stoOpt = allStorages.find((st) => st.valueGb === parseInt(stoPart, 10));
      specs.push({
        id: label, storageOnly: false, label,
        ramOptionId: ramOpt?.id || `ram:${ramPart}`, storageOptionId: stoOpt?.id || `sto:${stoPart}`,
        ramLabel: ramOpt?.label || ramPart, storageLabel: stoOpt?.label || stoPart,
      });
    } else {
      const stoOpt = allStorages.find((st) => st.valueGb === parseInt(label, 10));
      specs.push({
        id: label, storageOnly: true, label,
        ramOptionId: null, storageOptionId: stoOpt?.id || `sto:${label}`, ramLabel: null, storageLabel: stoOpt?.label || label,
      });
    }
  });
  return {
    model, colors, specs, allColors, allRams, allStorages,
    modelNumbers: parseModelNumbers(model?.modelNumber), otherNumbers: parseModelNumbers(model?.otherNumber),
    categoryId: model?.categoryId || null,
  };
}

/**
 * Key that lines a Category Menu row up with a device category by name (Partner
 * categoryMenuKey): drops a "Buy / Sell / Repair" prefix, punctuation and a
 * plural ending, so "Repair Mobiles" meets "Mobile".
 */
export function categoryMenuKey(name) {
  return String(name || '').toLowerCase().replace(/^\s*(buy|sell|repair)\s+/, '').replace(/[^a-z0-9]/g, '').replace(/(es|s)$/, '');
}

/** { categoryMenuKey: imageUrl } from the admin Category Menu (tile art). Never rejects. */
export async function getCategoryMenuImages(categoryType, { includeInactive = false } = {}) {
  const list = rows(await masterGet('master/category-menu', { query: { categoryType } }).catch(() => []));
  const out = {};
  list
    .filter((m) => m && (includeInactive || m.isActive === true) && m.imageUrl && String(m.imageUrl).trim())
    .sort((a, b) => Number(a.isActive === true) - Number(b.isActive === true))
    .forEach((m) => { out[categoryMenuKey(m.menuName)] = String(m.imageUrl).trim(); });
  return out;
}

/** Repair services grouped by repair category for a device category. */
export async function listRepairServicesGrouped(deviceCategoryId) {
  if (!deviceCategoryId) return [];
  return rows(await masterGet('master/repair-services/grouped', { query: { deviceCategoryId } }).catch(() => []));
}
