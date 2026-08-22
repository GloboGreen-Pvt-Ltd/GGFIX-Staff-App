import { Linking } from 'react-native';

// Only these schemes may be opened from server-supplied URLs. A solution-pack /
// media record whose `url` is `file:///…`, `intent://…`, `javascript:` or an
// arbitrary app deep-link should NOT be handed to Linking.openURL — that could
// open a local file or fire an unintended intent. Backend-created media should
// always be plain http(s) media.ggfix.in URLs, so anything else is rejected.
const ALLOWED_SCHEMES = ['http:', 'https:'];

export function isSafeExternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  // Reject scheme-relative and obviously non-web values fast.
  const m = /^([a-z][a-z0-9+.-]*:)/i.exec(trimmed);
  if (!m) return false; // no explicit scheme → don't open
  return ALLOWED_SCHEMES.includes(m[1].toLowerCase());
}

// Open a server-supplied URL only if it uses an allowed (web) scheme.
// Returns true if it attempted to open, false if the URL was rejected.
export function openExternalUrl(url) {
  if (!isSafeExternalUrl(url)) return false;
  Linking.openURL(url.trim());
  return true;
}
