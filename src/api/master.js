import { MASTER_BASE } from './config';
import { getToken } from '../auth/session';

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
    const err = new Error((json && (json.message || json.error)) || text || `HTTP ${res.status}`);
    err.status = res.status;
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
