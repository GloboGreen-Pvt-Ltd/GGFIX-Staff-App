import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { MAX_APP_WIDTH } from '../utils/responsive';

// Wide screens (iPad, Android tablets, any tablet held in landscape): every
// screen renders in one centred column MAX_APP_WIDTH wide, so headers, cards
// and lists keep a phone-to-small-tablet line length instead of stretching
// across the display. The gutters either side use a slightly darker page grey
// with a hairline edge, so the column reads as the app surface.
//
// Phones (and tablets narrower than the column) render edge to edge exactly
// as before. Screens that size themselves from useWindowDimensions already cap
// their own content at 720 (MAX_CONTENT_WIDTH), so they fit inside the column.
// Modals render outside this frame; they cap themselves with `sheetWidth`.
export default function TabletFrame({ children }) {
  const { width } = useWindowDimensions();
  if (width <= MAX_APP_WIDTH) return children;
  return (
    <View style={{ flex: 1, backgroundColor: '#E5E7EB', alignItems: 'center' }}>
      <View
        style={{
          flex: 1, width: MAX_APP_WIDTH, overflow: 'hidden', backgroundColor: '#F3F4F6',
          borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#D1D5DB',
        }}
      >
        {children}
      </View>
    </View>
  );
}
