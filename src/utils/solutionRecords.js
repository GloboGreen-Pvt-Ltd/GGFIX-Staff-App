import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { createSolutionPack, listSolutionPacks } from '../api/tickets';
import { uploadMedia } from '../api/media';

// Solution Packs — technician repair records kept on the phone.
//
// A record is autosaved here (AsyncStorage) while it is written and stays
// "Local only" until the existing ticket-scoped solution-pack API confirms it
// (POST /tickets/{id}/solution-packs returns an id) — only then is it
// "Published". The API's own fields carry everything: brand / model /
// category ids + names, the written sections in `description` (TEXT) and the
// photos / voice note / video in `filesJson`. Nothing else is sent.
//
// status: 'draft' (being written) · 'saved' (finished, not on the server) ·
// 'published' (server confirmed, has serverId).

const KEY = 'ggfix.solutionRecords.v1';
const MEDIA_DIR = 'solution-media';

export const RESULTS = [
  { key: 'fixed', label: 'Fixed and tested', short: 'Fixed' },
  { key: 'partial', label: 'Partially fixed', short: 'Partially fixed' },
  { key: 'not_fixed', label: 'Not fixed', short: 'Not fixed' },
];
export const resultOf = (k) => RESULTS.find((r) => r.key === k) || null;

// Photo slots on the evidence step: [key, label, required].
export const SLOTS = [['before', 'Before', true], ['during', 'During', false], ['after', 'After', true]];

export function newRecordId() {
  return `sr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- storage (one JSON array; writes are serialised so none is lost) ----
let chain = Promise.resolve();
function queue(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function readAll() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  let v;
  try { v = JSON.parse(raw); } catch { throw new Error('Saved repair records on this phone are damaged and could not be read.'); }
  return Array.isArray(v) ? v : [];
}

export const loadRecords = () => queue(readAll);

export function upsertRecord(rec) {
  return queue(async () => {
    const list = await readAll();
    const next = { ...rec, updatedAt: Date.now() };
    const i = list.findIndex((r) => r.id === rec.id);
    if (i >= 0) list[i] = next; else list.unshift(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
    return next;
  });
}

export function deleteRecord(id) {
  return queue(async () => {
    const list = await readAll();
    const gone = list.find((r) => r.id === id);
    await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((r) => r.id !== id)));
    (gone?.media || []).forEach((m) => removeMediaFile(m.localUri));
  });
}

// ---- media files: picker / recorder output lives in the cache (the OS may
// clear it), so each file is copied into the app's document folder. ----
export function persistMedia(uri, name) {
  if (Platform.OS === 'web') return uri;
  const dir = new Directory(Paths.document, MEDIA_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const safe = String(name || 'file').replace(/[^\w.-]/g, '_');
  const dest = new File(dir, `${Date.now()}-${safe}`);
  new File(uri).copy(dest);
  return dest.uri;
}

export function mediaExists(uri) {
  if (!uri) return false;
  if (Platform.OS === 'web' || !/^file:/i.test(uri)) return true;
  try { return new File(uri).exists; } catch { return false; }
}

export function removeMediaFile(uri) {
  if (!uri || Platform.OS === 'web' || !String(uri).includes(`/${MEDIA_DIR}/`)) return;
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* best effort */ }
}

// Flags media whose local file could not be recovered (and was never uploaded).
export function checkMedia(rec) {
  return { ...rec, media: (rec.media || []).map((m) => ({ ...m, missing: !m.url && !mediaExists(m.localUri) })) };
}

// ---- written sections <-> the API's description text ----
const SECTIONS = [
  ['fault', 'Fault / Problem'], ['diagnosis', 'Diagnosis / Root Cause'], ['solution', 'Repair Solution'],
  ['steps', 'Repair Steps'], ['parts', 'Parts Used'], ['result', 'Testing Result'],
];

export function buildDescription(r) {
  const val = {
    fault: r.issue,
    diagnosis: r.diagnosis,
    solution: r.solution,
    steps: (r.steps || []).map((s) => String(s).trim()).filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n'),
    parts: r.parts,
    result: resultOf(r.result)?.label,
  };
  return SECTIONS
    .map(([k, label]) => (String(val[k] || '').trim() ? `${label}:\n${String(val[k]).trim()}` : null))
    .filter(Boolean).join('\n\n');
}

export function parseDescription(text) {
  const out = {};
  const free = [];
  let cur = null;
  String(text || '').split('\n').forEach((line) => {
    const hit = SECTIONS.find(([, label]) => line.trim().toLowerCase() === `${label.toLowerCase()}:`);
    if (hit) { cur = hit[0]; out[cur] = []; return; }
    (cur ? out[cur] : free).push(line);
  });
  const txt = (a) => (a || []).join('\n').trim();
  const resultText = txt(out.result);
  return {
    fault: txt(out.fault) || txt(free),
    diagnosis: txt(out.diagnosis),
    solution: txt(out.solution),
    parts: txt(out.parts),
    steps: txt(out.steps).split('\n').map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean),
    result: RESULTS.find((x) => x.label.toLowerCase() === resultText.toLowerCase())?.key || null,
    resultText,
  };
}

// Files of a server pack (filesJson, or the legacy single fileUrl).
export function packFiles(pack) {
  let list = [];
  if (pack?.filesJson) {
    try { const v = JSON.parse(pack.filesJson); if (Array.isArray(v)) list = v; } catch { /* legacy */ }
  }
  if (!list.length && pack?.fileUrl) list = [{ type: 'image', url: pack.fileUrl, name: pack.fileName }];
  return list.filter((f) => f && f.url);
}

export const slotOfName = (name) => (/^(before|during|after)\b/i.exec(String(name || ''))?.[1] || '').toLowerCase() || null;

// ---- validation ----
export function step1Missing(r) {
  const m = [];
  if (!r?.brand?.name) m.push('Brand');
  if (!r?.model?.name) m.push('Model');
  if (!r?.category?.id) m.push('Repair Category');
  if (!String(r?.issue || '').trim()) m.push('Issue / Problem');
  return m;
}

export function step2Missing(r) {
  const m = [];
  const has = (slot) => (r?.media || []).some((x) => x.slot === slot && !x.missing);
  if (!String(r?.diagnosis || '').trim()) m.push('Diagnosis / Root Cause');
  if (!String(r?.solution || '').trim()) m.push('Repair Solution');
  if (!(r?.steps || []).some((s) => String(s).trim())) m.push('Repair Steps');
  if (!has('before')) m.push('Before photo');
  if (!has('after')) m.push('After photo');
  if (!r?.result) m.push('Testing Result');
  return m;
}

export const titleOf = (r) => String(r?.issue || '').trim().split('\n')[0].slice(0, 120);

// Why this record cannot go to the server as it is (null when it can).
export function serverBlocker(r) {
  if (!r?.ticketId) return 'Not linked to a job. The server only accepts solution packs on a job, so this record stays on this phone.';
  const lost = (r.media || []).filter((m) => !m.url && m.missing).length;
  if (lost) return `${lost} media file(s) could not be recovered on this phone. Re-add them before submitting.`;
  return null;
}

// Upload media, then create the pack. Every hosted URL and the attempt time are
// saved as they happen, so a retry never re-uploads and never double-creates.
export async function submitRecord(rec, onProgress) {
  let r = { ...rec, media: [...(rec.media || [])] };
  const save = async (patch) => { r = await upsertRecord({ ...r, ...patch }); onProgress?.(r); return r; };

  for (let i = 0; i < r.media.length; i += 1) {
    const m = r.media[i];
    if (m.url) continue;
    const folder = `tickets/${r.ticketId}/solution-packs/${m.kind === 'image' ? 'images' : m.kind}`;
    const res = await uploadMedia({ uri: m.localUri, name: m.name, type: m.type, folder });
    const url = res?.url || res?.secure_url;
    await save({ media: r.media.map((x, j) => (j === i ? { ...x, url } : x)) });
  }

  const title = titleOf(r);
  const description = buildDescription(r);
  const files = r.media.map((m) => ({ type: m.kind, url: m.url, name: m.name }));

  // An earlier attempt may have reached the server before its reply was lost.
  if (r.submitAttemptAt) {
    try {
      const rows = await listSolutionPacks(r.ticketId, { packType: 'NEW' });
      const hit = (Array.isArray(rows) ? rows : []).find((p) => p.title === title && (p.description || '') === description);
      if (hit?.id) return save({ status: 'published', serverId: hit.id, publishedAt: Date.now(), lastError: null });
    } catch { /* fall through to create */ }
  }
  await save({ submitAttemptAt: Date.now() });

  const res = await createSolutionPack(r.ticketId, {
    packType: 'NEW',
    title,
    description,
    fileUrl: files[0]?.url || null,
    fileName: files[0]?.name || null,
    brandId: r.brand?.id || null,
    modelId: r.model?.id || null,
    brandName: r.brand?.name || null,
    modelName: r.model?.name || null,
    issueCategory: r.category?.name || null,
    issueSubcategory: null,
    issueCategoryId: r.category?.id || null,
    issueSubcategoryId: null,
    filesJson: JSON.stringify(files),
  });
  if (!res?.id) throw new Error('The server did not confirm this record.');
  return save({ status: 'published', serverId: res.id, publishedAt: Date.now(), lastError: null });
}
