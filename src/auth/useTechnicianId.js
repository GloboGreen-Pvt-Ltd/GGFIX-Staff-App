import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { mergeTechnicianProfile, selectTechnicianId } from '../store/authSlice';
import { getMyTechnicianProfile } from '../api/technician';

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
