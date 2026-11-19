import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { mergeTechnicianProfile, selectTechnicianId } from '../store/authSlice';
import { getMyTechnicianProfile } from '../api/technician';
import { logProfileDebug } from '../utils/profileDebug';

// Centralizes the "we need the technician.id but it might not be in redux
// yet" dance. HomeScreen normally fetches /technicians/me on mount and
// stores it, but a screen entered via deep link or after a Fast Refresh
// can land before that's happened — so each category screen calls this
// to self-heal.
export function useTechnicianId() {
  const dispatch = useDispatch();
  const id = useSelector(selectTechnicianId);

  useEffect(() => {
    if (id) return;
    let active = true;
    getMyTechnicianProfile()
      .then((me) => { if (active && me) dispatch(mergeTechnicianProfile(me)); })
      .catch(() => {});
    return () => { active = false; };
  }, [id, dispatch]);

  return id;
}

// Same self-healing lookup as useTechnicianId, but also reports whether the
// /technicians/me lookup failed (network error or no technician row), so a
// screen can show "couldn't load" + Retry instead of an endless spinner.
export function useTechnicianIdState() {
  const dispatch = useDispatch();
  const id = useSelector(selectTechnicianId);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (id) return undefined;
    let active = true;
    setFailed(false);
    getMyTechnicianProfile()
      .then((me) => {
        if (!active) return;
        if (me?.id) dispatch(mergeTechnicianProfile(me));
        else { logProfileDebug('technician id lookup: response without id', { endpoint: 'GET /technicians/me' }); setFailed(true); }
      })
      .catch((e) => {
        logProfileDebug('technician id lookup FAILED', { endpoint: 'GET /technicians/me', status: e?.status ?? null, message: e?.message ?? null });
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, [id, dispatch, attempt]);

  return { id, failed: !id && failed, retry: () => setAttempt((n) => n + 1) };
}
