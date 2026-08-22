import React, { createContext, useContext } from 'react';

// Carries the navigator-level `onLogout` down so any screen (e.g. the
// Account tab) can trigger a logout without prop-drilling.
export const LogoutContext = createContext(() => {});

export function useLogout() {
  return useContext(LogoutContext);
}
