import Constants from 'expo-constants';
import { Platform } from 'react-native';

function normalizeHost(value) {
  if (!value || typeof value !== 'string') return null;
  let raw = value.trim();
  if (!raw) return null;
  raw = raw.replace(/^exp:\/\//i, '').replace(/^https?:\/\//i, '');
  raw = raw.split('/')[0];
  raw = raw.split(':')[0];
  if (!raw || raw === '[object Object]') return null;
  return raw;
}

function expoDevHost() {
  return normalizeHost(Constants.expoConfig?.hostUri)
    || normalizeHost(Constants.manifest2?.extra?.expoClient?.hostUri)
    || normalizeHost(Constants.manifest?.debuggerHost)
    || normalizeHost(Constants.linkingUri);
}

const explicitHost = normalizeHost(process.env.EXPO_PUBLIC_API_HOST)
  || normalizeHost(Constants.expoConfig?.extra?.API_HOST);

const host = explicitHost
  || (Platform.OS === 'web' ? 'localhost' : expoDevHost())
  || 'localhost';

function baseUrl(port) {
  return `http://${host}:${port}/`;
}

// Prefer an explicit per-service base from .env (EXPO_PUBLIC_*_BASE). Falls back
// to the detected host + fixed port. Trailing slash normalized for new URL().
function svc(envValue, port) {
  const v = typeof envValue === 'string' ? envValue.trim() : '';
  if (v) return v.endsWith('/') ? v : `${v}/`;
  return baseUrl(port);
}

export const AUTH_BASE       = svc(process.env.EXPO_PUBLIC_AUTH_BASE, 8081);
export const TICKET_BASE     = svc(process.env.EXPO_PUBLIC_TICKET_BASE, 8082);
export const USER_BASE       = svc(process.env.EXPO_PUBLIC_USER_BASE, 8083);
export const SHOP_BASE       = svc(process.env.EXPO_PUBLIC_SHOP_BASE, 8084);
export const TECHNICIAN_BASE = svc(process.env.EXPO_PUBLIC_TECHNICIAN_BASE, 8085);
// Bare origin — call sites spell `/master/…` themselves (see api/master.js). A
// deploy variable that still carries the old `/master` suffix is tolerated:
// leaving it on would double the segment and 404 every catalogue read.
export const MASTER_BASE     = svc(process.env.EXPO_PUBLIC_MASTER_DATA_BASE, 8091)
  .replace(/\/master\/$/, '/');
export const ORDER_BASE      = svc(process.env.EXPO_PUBLIC_ORDER_BASE, 8092);

// The upload endpoint is @RequestMapping("/media") on master-data-service, so
// talking to the service DIRECTLY (LAN dev, http://host:8091) it is /media/upload.
// Through the TLS edge there is no `location /media/` block — nginx only exposes
// it beneath the master prefix (/master/media/ -> :8091/media/). Posting to
// api.ggfix.in/media/upload gets nginx's own 404/405, which carries no
// Access-Control-Allow-Origin, so a browser reports it as a CORS error rather
// than as the routing miss it is. A direct origin always names a port; the edge
// is plain 443.
const isDirectServiceOrigin = (base) => /:\d+\/?$/.test(base);

export const MEDIA_UPLOAD_PATH = isDirectServiceOrigin(MASTER_BASE)
  ? '/media/upload'
  : '/master/media/upload';
