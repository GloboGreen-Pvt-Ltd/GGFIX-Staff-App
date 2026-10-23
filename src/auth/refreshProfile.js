import { getMyTechnicianProfile } from '../api/technician';
import { mergeTechnicianProfile } from '../store/authSlice';
import { updateSavedProfile } from './session';

// Folds a GET /technicians/me payload (the record the shop owner edits in the
// Partner app) into redux + the persisted session, so a cold start also shows
// the fresh values (e.g. an owner-updated phone). Never throws.
export async function applyProfileToSession(dispatch, me) {
  if (!me || typeof me !== 'object') return;
  try { dispatch(mergeTechnicianProfile(me)); } catch (_) {}
  const patch = {};
  if (me.name) patch.fullName = me.name;
  if (me.email) patch.email = me.email;
  if (me.phone) patch.mobile = me.phone;
  if (me.photoUrl) patch.photoUrl = me.photoUrl;
  if (me.id) patch.technicianId = me.id;
  if (me.roleLabel) patch.roleLabel = me.roleLabel;
  try { await updateSavedProfile(patch); } catch (_) {}
}

// Re-reads /technicians/me and applies it. Never throws: on any failure the
// last known values stay on screen. Returns the profile or null.
export async function refreshMyProfile(dispatch) {
  let me = null;
  try {
    me = await getMyTechnicianProfile();
  } catch (_) {
    return null;
  }
  if (!me || typeof me !== 'object') return null;
  await applyProfileToSession(dispatch, me);
  return me;
}
