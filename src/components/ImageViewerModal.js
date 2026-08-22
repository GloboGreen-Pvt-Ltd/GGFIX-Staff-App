import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  TapGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

/**
 * Full-screen image viewer: two-finger pinch-to-zoom, one-finger pan while
 * zoomed, double-tap to zoom in / reset, and a horizontal swipe (while
 * un-zoomed) to move between images.
 *
 * Ported from the shop app (`ggfix-shop-app/src/components/ImageViewerModal.js`)
 * so a tapped image behaves identically in both apps — same pinch limits, same
 * double-tap step, same swipe threshold. Keep the two in step when either
 * changes.
 *
 * Why gesture-handler's component API driving plain RN `Animated` rather than
 * reanimated: it gives RELIABLE native multi-touch (PanResponder pinch is flaky
 * on Android) with `useNativeDriver`, and no worklets — so it cannot hit the
 * worklets "installTurboModule" crash.
 *
 * Scale is clamped to [MIN_SCALE, MAX_SCALE] and the pan offset to the image
 * bounds. Zoom and position reset for free between images via `key={index}`.
 */
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2;

function ZoomableImage({ uri, size, onSwipe }) {
  const pinchRef = useRef(null);
  const panRef = useRef(null);

  // Rendered scale = committed base * live pinch. Pan uses Animated offset accumulation.
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = useRef(Animated.multiply(baseScale, pinchScale)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const cur = useRef({ scale: 1, x: 0, y: 0 }).current; // committed values (JS side)

  const panLimit = (s) => Math.max(0, (size * s - size) / 2);
  const setOffset = (x, y) => {
    cur.x = x; cur.y = y;
    panX.setOffset(x); panX.setValue(0);
    panY.setOffset(y); panY.setValue(0);
  };

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPinchStateChange = (e) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cur.scale * e.nativeEvent.scale));
      cur.scale = next;
      baseScale.setValue(next);
      pinchScale.setValue(1);
      if (next <= MIN_SCALE + 0.001) setOffset(0, 0);
      else { const l = panLimit(next); setOffset(Math.max(-l, Math.min(l, cur.x)), Math.max(-l, Math.min(l, cur.y))); }
    }
  };

  const onPanEvent = Animated.event([{ nativeEvent: { translationX: panX, translationY: panY } }], { useNativeDriver: true });
  const onPanStateChange = (e) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      const { translationX, translationY } = e.nativeEvent;
      if (cur.scale <= MIN_SCALE + 0.02) {
        setOffset(0, 0); // not zoomed → keep centred
        if (Math.abs(translationX) > 55 && Math.abs(translationX) > Math.abs(translationY)) {
          onSwipe?.(translationX < 0 ? 1 : -1);
        }
        return;
      }
      const l = panLimit(cur.scale);
      setOffset(
        Math.max(-l, Math.min(l, cur.x + translationX)),
        Math.max(-l, Math.min(l, cur.y + translationY)),
      );
    }
  };

  const onDoubleTap = (e) => {
    if (e.nativeEvent.state !== State.ACTIVE) return;
    if (cur.scale > MIN_SCALE + 0.02) { cur.scale = MIN_SCALE; baseScale.setValue(MIN_SCALE); setOffset(0, 0); }
    else { cur.scale = DOUBLE_TAP_SCALE; baseScale.setValue(DOUBLE_TAP_SCALE); }
  };

  return (
    <PanGestureHandler
      ref={panRef}
      minPointers={1}
      maxPointers={1}
      avgTouches
      simultaneousHandlers={pinchRef}
      onGestureEvent={onPanEvent}
      onHandlerStateChange={onPanStateChange}
    >
      <Animated.View collapsable={false} style={{ flex: 1, alignSelf: 'stretch' }}>
        <PinchGestureHandler
          ref={pinchRef}
          simultaneousHandlers={panRef}
          onGestureEvent={onPinchEvent}
          onHandlerStateChange={onPinchStateChange}
        >
          <Animated.View collapsable={false} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <TapGestureHandler numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
              <Animated.View style={{ width: size, height: size, transform: [{ translateX: panX }, { translateY: panY }, { scale }] }}>
                <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" />
              </Animated.View>
            </TapGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      </Animated.View>
    </PanGestureHandler>
  );
}

/**
 * @param {boolean}  visible
 * @param {Array}    images   [{ uri, label }] — the whole set the tap belongs to,
 *                            so swiping moves through its siblings.
 * @param {number}   index    which one was tapped
 * @param {Function} onClose
 */
export default function ImageViewerModal({ visible, images = [], index = 0, onClose }) {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [i, setI] = useState(index);

  // Re-sync when the caller opens the viewer on a different thumbnail. Without
  // this the modal would reopen on whichever image was last swiped to.
  useEffect(() => { if (visible) setI(index); }, [visible, index]);

  const list = Array.isArray(images) ? images.filter((x) => x && x.uri) : [];
  const safeIndex = Math.min(Math.max(i, 0), Math.max(0, list.length - 1));
  const current = list[safeIndex];

  const step = (dir) => {
    if (list.length < 2) return;
    setI((n) => (n + dir + list.length) % list.length);
  };

  return (
    <Modal visible={!!visible && list.length > 0} transparent animationType="fade" onRequestClose={onClose}>
      {/* RN Modal renders in its own window; gesture-handler needs a local root
          here or the pinch/pan handlers never receive touches on Android. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(23, 33, 23, 0.94)' }}>
          <View
            style={{
              paddingTop: insets.top + 8,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' }}>
              {list.length > 1 ? 'Pinch · double-tap · swipe' : 'Pinch · double-tap'}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close image"
              style={{
                height: 42, width: 42, borderRadius: 21,
                backgroundColor: 'rgba(255,255,255,0.16)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {current ? (
              <ZoomableImage
                key={safeIndex}
                uri={current.uri}
                size={screenW - 40}
                onSwipe={step}
              />
            ) : null}
          </View>

          <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 18, alignItems: 'center' }}>
            {current?.label ? (
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }} numberOfLines={2}>
                {current.label}
              </Text>
            ) : null}
            {list.length > 1 ? (
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>
                {safeIndex + 1} / {list.length}
              </Text>
            ) : null}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
