import { Platform } from 'react-native';
import { MASTER_BASE, MEDIA_UPLOAD_PATH } from './config';
import { getToken } from '../auth/session';

// The upload endpoint lives on master-data-service (port 8091). It takes a
// MultipartFile and returns { url, key, source, contentType, bytes }. The
// technician detail screen calls this for each photo + each solution
// pack file, then stores the returned URL on the ticket.
//
// Its public path differs between a direct service origin and the TLS edge —
// MEDIA_UPLOAD_PATH picks the right one; never spell it here.
//
// Everything is stored on S3 (bucket ggfix-media-1762) behind media.ggfix.in.
// The backend slugifies `folder` into a SINGLE key segment, so a folder with
// slashes collapses to one dash-joined directory; `slot` names the file, and the
// backend appends 8 hex chars to defeat CDN caching. Technician device images
// therefore land at media.ggfix.in/tech-dev-img/<slot>-<id>.<ext>.
export async function uploadMedia({ uri, name, type, folder, slot } = {}) {
  const base = String(MASTER_BASE).replace(/\/$/, '');
  const query = [
    folder ? `folder=${encodeURIComponent(folder)}` : null,
    slot ? `slot=${encodeURIComponent(slot)}` : null,
  ].filter(Boolean).join('&');
  const url = query ? `${base}${MEDIA_UPLOAD_PATH}?${query}` : `${base}${MEDIA_UPLOAD_PATH}`;
  const form = new FormData();
  const filename = name || 'upload.jpg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, filename);
  } else {
    form.append('file', { uri, name: filename, type: type || 'image/jpeg' });
  }
  const token = await getToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
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
