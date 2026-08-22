import { createSlice, createSelector } from '@reduxjs/toolkit';

const initialState = {
  accessToken: null,
  userId: null,
  shopId: null,
  shopSlug: null,
  roles: [],
  email: null,
  fullName: null,
  mobile: null,
  // Populated after HomeScreen fetches /technicians/me. These power the
  // role-based Categories grid (roleLabel is the only reliable signal
  // for Pickup Person vs Technician — see project memory) and the
  // attendance/leave calls keyed by the technician's row id.
  roleLabel: null,
  technicianId: null,
  photoUrl: null,
  // Shop coordinates for the 100m attendance geofence. Populated from
  // /technicians/me (shopLatitude / shopLongitude). Null when the shop has no
  // saved location — in which case the geofence fails open (no lock).
  shopLatitude: null,
  shopLongitude: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(state, action) {
      const s = action.payload || {};
      state.accessToken = s.accessToken ?? null;
      state.userId = s.userId ?? null;
      state.shopId = s.shopId ?? null;
      state.shopSlug = s.shopSlug ?? null;
      state.roles = Array.isArray(s.roles) ? s.roles : [];
      state.email = s.email ?? null;
      state.fullName = s.fullName ?? null;
      state.mobile = s.mobile ?? null;
      state.roleLabel = s.roleLabel ?? state.roleLabel ?? null;
      state.technicianId = s.technicianId ?? state.technicianId ?? null;
      state.photoUrl = s.photoUrl ?? state.photoUrl ?? null;
    },
    mergeTechnicianProfile(state, action) {
      const t = action.payload || {};
      if (t.id) state.technicianId = t.id;
      if (t.roleLabel) state.roleLabel = t.roleLabel;
      // Write whenever /technicians/me carries a value (the `if (t.x)` guard
      // already skips blanks). The old `&& !state.fullName` guard meant an edited
      // name/email/phone never refreshed the display until the next logout.
      if (t.name) state.fullName = t.name;
      if (t.email) state.email = t.email;
      if (t.phone) state.mobile = t.phone;
      if (t.photoUrl) state.photoUrl = t.photoUrl;
      // Duty roster times — drive the "CHECK IN / CHECK OUT" pills on the home
      // header. Stored even when null so a profile update can clear them.
      state.defaultCheckIn = t.defaultCheckIn ?? state.defaultCheckIn ?? null;
      state.defaultCheckOut = t.defaultCheckOut ?? state.defaultCheckOut ?? null;
      // Shop coordinates for the attendance geofence (only /technicians/me
      // carries these). Keep the last known value if a later merge omits them.
      if (t.shopId) state.shopId = t.shopId;
      state.shopLatitude = t.shopLatitude ?? state.shopLatitude ?? null;
      state.shopLongitude = t.shopLongitude ?? state.shopLongitude ?? null;
    },
    clearSession() {
      return initialState;
    },
  },
});

export const { setSession, mergeTechnicianProfile, clearSession } = authSlice.actions;

export const selectSession = (state) => state.auth;
export const selectShopId = (state) => state.auth.shopId;
export const selectUserId = (state) => state.auth.userId;
export const selectRoles = (state) => state.auth.roles;
export const selectAccessToken = (state) => state.auth.accessToken;
export const selectIsLoggedIn = (state) => !!state.auth.accessToken;
export const selectTechnicianId = (state) => state.auth.technicianId;
// Memoized so it returns a STABLE object reference until the coordinates change.
// A plain `(state) => ({...})` selector built a new object on every call, which
// defeats useSelector's reference check (re-render on every dispatch) and trips
// the react-redux "selector returned a different result" dev warning.
export const selectShopLocation = createSelector(
  (state) => state.auth.shopLatitude,
  (state) => state.auth.shopLongitude,
  (latitude, longitude) => ({ latitude, longitude }),
);

export default authSlice.reducer;
