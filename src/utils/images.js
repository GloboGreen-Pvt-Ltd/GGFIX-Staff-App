// React Native's Android <Image> can't decode AVIF or HEIC, but the master
// catalogue (master_models.image_url) stores Cloudinary uploads as .avif —
// so the device hero stays a blank gray box on Android even though the URL
// resolves. Run every device-image URL through this normalizer before
// handing it to <Image source={{ uri }} /> to force Cloudinary to transcode
// to a format that's safe on both platforms.
//
// Strategy:
//  - Cloudinary URLs (res.cloudinary.com/.../upload/...) → inject `f_jpg`
//    into the transformation segment so the CDN returns JPEG bytes.
//  - Non-Cloudinary AVIF/HEIC → return as-is; iOS handles them, Android
//    will still fail but at least we don't break working URLs.
//  - base64 / data: URIs → return unchanged.
//  - null / undefined → return null so the caller can render the placeholder.

const CLOUDINARY_HOST = 'res.cloudinary.com';
const UNSUPPORTED_EXT = /\.(avif|heic|heif)(\?.*)?$/i;

export function normalizeDeviceImageUrl(url) {
  if (!url) return null;
  const s = String(url);
  if (s.startsWith('data:')) return s;
  if (!s.includes(CLOUDINARY_HOST)) return s;
  // Only rewrite when the asset is in an Android-unsafe format. Idempotent:
  // if `f_jpg` is already in the transformation, we leave the URL alone.
  if (!UNSUPPORTED_EXT.test(s)) return s;
  if (/\/upload\/[^/]*f_(jpg|png|webp|auto)/i.test(s)) return s;
  return s.replace('/upload/', '/upload/f_jpg/');
}

// Render-time helper that also accepts a base64 fallback. Use this when a
// component has both a URL and a base64 column available (master models do).
export function resolveDeviceImageSource({ url, base64 } = {}) {
  const normalized = normalizeDeviceImageUrl(url);
  if (normalized) return normalized;
  if (!base64) return null;
  const value = String(base64);
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}
