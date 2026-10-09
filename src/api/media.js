import { Image, Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths, UploadType } from 'expo-file-system';
import { MASTER_BASE, MEDIA_UPLOAD_PATH } from './config';
import { getToken } from '../auth/session';

// Phone camera photos are 2–5 MB (and HEIC on iPhones), which the upload
// endpoint rejects — its multipart limit is well below that. Images are
// therefore scaled to at most MAX_IMAGE_EDGE px on the long side and
// re-encoded as JPEG (~200–500 KB) before upload. Any failure here falls back
// to the original file.
const MAX_IMAGE_EDGE = 1600;

function imageSize(uri) {
  return new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

// Never let the optional shrink step hold an upload hostage: if decoding /
// re-encoding hasn't finished in time, upload the original file instead.
const SHRINK_TIMEOUT_MS = 8000;

function shrinkImage(uri) {
  return Promise.race([
    shrinkImageNow(uri),
    new Promise((resolve) => setTimeout(() => resolve(null), SHRINK_TIMEOUT_MS)),
  ]);
}

async function shrinkImageNow(uri) {
  try {
    const { width, height } = await imageSize(uri);
    const ctx = ImageManipulator.manipulate(uri);
    if (Math.max(width, height) > MAX_IMAGE_EDGE) {
      ctx.resize(width >= height ? { width: MAX_IMAGE_EDGE } : { height: MAX_IMAGE_EDGE });
    }
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return out?.uri || null;
  } catch {
    return null;
  }
}

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
const UPLOAD_TIMEOUT_MS = 60000;

const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime', aac: 'audio/aac', mp3: 'audio/mpeg',
  wav: 'audio/wav', '3gp': 'audio/3gpp', caf: 'audio/x-caf', webm: 'audio/webm', pdf: 'application/pdf',
};
function mimeFromName(name) {
  const ext = String(name || '').split('?')[0].split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

// Android pickers can hand back content:// URIs the native uploader can't
// stream. Copy those into the app cache first (file:// works everywhere —
// iOS pickers already return file:// copies).
function toUploadableUri(uri, filename) {
  if (Platform.OS !== 'android' || !String(uri).startsWith('content://')) return uri;
  try {
    const dest = new File(Paths.cache, `${Date.now()}-${filename}`);
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

// Upload one file to the media endpoint; returns { url, key, ... }.
//
// Native uses expo-file-system's File.upload() multipart task instead of JS
// FormData: on the New Architecture (SDK 57) React Native's FormData
// `{ uri, name, type }` file part reaches the server with bytes that fail its
// magic-byte format check, so every upload came back rejected. This is the
// same fix the Partner app ships. Web keeps the browser's own FormData/Blob,
// which is unaffected. `folder` / `slot` travel as multipart form fields.
export async function uploadMedia({ uri, name, type, folder, slot } = {}) {
  if (!uri) throw new Error('No file selected');
  const url = `${String(MASTER_BASE).replace(/\/$/, '')}${MEDIA_UPLOAD_PATH}`;
  let filename = name || String(uri).split('?')[0].split('/').pop() || 'upload.jpg';
  let mime = type && type.includes('/') && !type.endsWith('/*') ? type : mimeFromName(filename);
  if (mime.startsWith('image/')) {
    const small = await shrinkImage(uri);
    if (small) {
      uri = small;
      mime = 'image/jpeg';
      filename = filename.replace(/\.[^.]*$/, '') + '.jpg';
    }
  }
  const parameters = {};
  if (folder) parameters.folder = String(folder);
  if (slot) parameters.slot = String(slot);

  const token = await getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let status;
  let text;
  try {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      const form = new FormData();
      form.append('file', blob, filename);
      Object.entries(parameters).forEach(([k, v]) => form.append(k, v));
      const res = await fetch(url, { method: 'POST', headers, body: form, signal: controller.signal });
      status = res.status;
      text = await res.text();
    } else {
      const file = new File(toUploadableUri(uri, filename));
      const res = await file.upload(url, {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType: mime,
        parameters,
        headers,
        signal: controller.signal,
      });
      status = res.status;
      text = res.body;
    }
  } catch (e) {
    const err = new Error(e?.name === 'AbortError'
      ? 'Upload timed out. Check your connection and try again.'
      : `Could not reach the upload server. ${e?.message || ''}`.trim());
    err.status = 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (status < 200 || status >= 300) {
    // Keep the status visible: a bare "Forbidden"/"Internal Server Error"
    // from the gateway says nothing about which request failed.
    const reason = (json && (json.message || json.error)) || (text && text.length < 200 ? text : '') || 'Upload rejected';
    const err = new Error(`${reason} (HTTP ${status})`);
    err.status = status;
    throw err;
  }
  if (!json?.url && !json?.secure_url) {
    const err = new Error('Upload finished but the server returned no file URL.');
    err.status = status;
    throw err;
  }
  return json;
}
