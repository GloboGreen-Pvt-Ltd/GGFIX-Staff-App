import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, PanResponder, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Button, Dialog, DialogHeader } from '../components/rnr';
import { rf } from '../utils/responsive';
import { useSecureScreen } from '../utils/secureScreen';

const CELL = 80;
const PAD_SIZE = CELL * 3;
const HIT_R = 32;
const DOT_VISUAL = 16;

function dotCenter(idx) {
  const i = idx - 1;
  const row = Math.floor(i / 3);
  const col = i % 3;
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

function PatternPad({ value, onChange }) {
  const initial = (value || '').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 9);
  const [path, setPath] = useState(initial);
  const [current, setCurrent] = useState(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const findHit = (x, y) => {
    for (let i = 1; i <= 9; i++) {
      const c = dotCenter(i);
      const dx = x - c.x; const dy = y - c.y;
      if (dx * dx + dy * dy < HIT_R * HIT_R) return i;
    }
    return null;
  };

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrent({ x: locationX, y: locationY });
      const hit = findHit(locationX, locationY);
      const next = hit ? [hit] : [];
      pathRef.current = next;
      setPath(next);
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      setCurrent({ x: locationX, y: locationY });
      const hit = findHit(locationX, locationY);
      if (hit && !pathRef.current.includes(hit)) {
        const next = [...pathRef.current, hit];
        pathRef.current = next;
        setPath(next);
      }
    },
    onPanResponderRelease: () => {
      setCurrent(null);
      onChange(pathRef.current.join(','));
    },
    onPanResponderTerminate: () => {
      setCurrent(null);
      onChange(pathRef.current.join(','));
    },
  })).current;

  return (
    <View
      {...responder.panHandlers}
      style={{ width: PAD_SIZE, height: PAD_SIZE }}
    >
      <Svg style={StyleSheet.absoluteFill} width={PAD_SIZE} height={PAD_SIZE}>
        {path.map((dot, idx) => {
          if (idx === 0) return null;
          const a = dotCenter(path[idx - 1]);
          const b = dotCenter(dot);
          return <Line key={`l${idx}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#00008B" strokeWidth={2} />;
        })}
        {path.length > 0 && current ? (() => {
          const last = dotCenter(path[path.length - 1]);
          return <Line x1={last.x} y1={last.y} x2={current.x} y2={current.y} stroke="#00008B" strokeWidth={2} opacity={0.4} />;
        })() : null}
      </Svg>
      {Array.from({ length: 9 }, (_, i) => i + 1).map((dot) => {
        const c = dotCenter(dot);
        const active = path.includes(dot);
        return (
          <View
            key={dot}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: c.x - DOT_VISUAL,
              top: c.y - DOT_VISUAL,
              width: DOT_VISUAL * 2,
              height: DOT_VISUAL * 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{
              width: active ? 22 : DOT_VISUAL,
              height: active ? 22 : DOT_VISUAL,
              borderRadius: 11,
              backgroundColor: active ? '#00008B' : '#0F172A',
              opacity: active ? 1 : 0.7,
            }} />
          </View>
        );
      })}
    </View>
  );
}

export default function PickupDeviceSecurityScreen({ navigation, route }) {
  useSecureScreen(); // block screenshots of the customer's device unlock secret
  const insets = useSafeAreaInsets();
  const params = route?.params || {};
  const initialLock = (params.prefillLock && params.prefillLock.type)
    ? { type: params.prefillLock.type, value: params.prefillLock.value || '' }
    : { type: 'NONE', value: '' };
  const [open, setOpen] = useState(null);
  const [pattern, setPattern] = useState(initialLock.type === 'PATTERN' ? initialLock.value : '');
  const [pin, setPin] = useState(initialLock.type === 'PIN' ? initialLock.value : '');
  const [password, setPassword] = useState(initialLock.type === 'PASSWORD' ? initialLock.value : '');
  const [lock, setLock] = useState(initialLock);

  const onSelect = (type) => {
    if (type === 'NONE') { setLock({ type: 'NONE', value: '' }); return; }
    setOpen(type.toLowerCase());
  };

  const saveLock = (type, value) => {
    setLock({ type, value });
    setOpen(null);
  };

  const next = () => navigation.navigate('PickupDeviceMissingParts', { ...params, lock });

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pt-4 pb-32">
        <Text className="text-text-muted text-xs px-1 mb-2 pt-1">Modify password</Text>

        {[
          { key: 'PIN', label: 'Numeric', desc: 'Enter 4 or 6 digits.', icon: 'keypad-outline' },
          { key: 'PASSWORD', label: 'Alphanumeric', desc: 'Enter 4–16 letters and digits.', icon: 'create-outline' },
          { key: 'PATTERN', label: 'Pattern', desc: 'Connect at least 4 dots.', icon: 'apps-outline' },
        ].map((opt) => {
          const active = lock.type === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onSelect(opt.key)}
              className={`bg-card rounded-2xl px-4 py-4 mb-3 flex-row items-center border-2 ${active ? 'border-primary' : 'border-transparent'} active:opacity-80`}
            >
              <View className={`w-12 h-12 rounded-xl items-center justify-center mr-3 ${active ? 'bg-primary/15' : 'bg-primary/10'}`}>
                <Ionicons name={opt.icon} size={22} color="#00008B" />
              </View>
              <View className="flex-1">
                <Text className="text-text font-extrabold" style={{ fontSize: rf(15) }}>{opt.label}</Text>
                <Text className={`text-xs mt-0.5 ${active ? 'text-primary font-bold' : 'text-text-muted'}`}>
                  {active ? 'In use' : opt.desc}
                </Text>
              </View>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => onSelect('NONE')}
          className={`bg-card rounded-2xl px-4 py-4 mb-3 flex-row items-center border-2 ${lock.type === 'NONE' ? 'border-primary' : 'border-transparent'} active:opacity-80`}
        >
          <View className={`w-12 h-12 rounded-xl items-center justify-center mr-3 ${lock.type === 'NONE' ? 'bg-primary/15' : 'bg-primary/10'}`}>
            <Ionicons name="lock-open-outline" size={22} color="#00008B" />
          </View>
          <View className="flex-1">
            <Text className="text-text font-extrabold" style={{ fontSize: rf(15) }}>None</Text>
            <Text className={`text-xs mt-0.5 ${lock.type === 'NONE' ? 'text-primary font-bold' : 'text-text-muted'}`}>
              {lock.type === 'NONE' ? 'In use' : 'No screen lock'}
            </Text>
          </View>
        </Pressable>

      </ScrollView>

      <View className="absolute left-0 right-0 bottom-0 p-4 bg-card border-t border-border" style={{ paddingBottom: Math.max(insets.bottom, 12) + 10, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
        <Button
          rightIcon={<Ionicons name="chevron-forward" size={18} color="#fff" />}
          onPress={next}
        >
          Next
        </Button>
      </View>

      <Dialog open={open === 'pattern'} onClose={() => setOpen(null)}>
        <View className="self-center w-full" style={{ maxWidth: 360 }}>
          <DialogHeader onClose={() => setOpen(null)} />
          <View className="items-center pt-1">
            <View className="bg-text rounded-2xl p-3 mb-3">
              <Ionicons name="lock-closed" size={22} color="#fff" />
            </View>
            <Text className="font-extrabold text-text" style={{ fontSize: rf(17) }}>Draw Lock Screen Pattern</Text>
            <Text className="text-text-muted mt-1 mb-4" style={{ fontSize: rf(11) }}>Connect at least 4 dots</Text>
            <View className="bg-background rounded-3xl p-3">
              <PatternPad value={pattern} onChange={setPattern} />
            </View>
            <View className="flex-row items-center mt-3 w-full">
              <Text className="text-xs text-text-muted flex-1" numberOfLines={1}>
                {pattern ? `Pattern: ${pattern}` : ' '}
              </Text>
              {pattern ? (
                <Pressable onPress={() => setPattern('')} className="active:opacity-70 px-2 py-1">
                  <Text className="text-xs text-danger font-bold">Reset</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Button
            className="bg-success mt-4"
            rightIcon={<Ionicons name="save-outline" size={18} color="#fff" />}
            onPress={() => saveLock('PATTERN', pattern)}
            disabled={pattern.split(',').filter(Boolean).length < 4}
          >
            Save
          </Button>
        </View>
      </Dialog>

      <Dialog open={open === 'pin'} onClose={() => setOpen(null)}>
        <View className="self-center w-full" style={{ maxWidth: 360 }}>
          <DialogHeader onClose={() => setOpen(null)} />
          <View className="items-center pt-1">
            <View className="bg-text rounded-2xl p-3 mb-3">
              <Ionicons name="lock-closed" size={22} color="#fff" />
            </View>
            <Text className="font-extrabold text-text mb-2" style={{ fontSize: rf(17) }}>Enter for Device PIN</Text>
            <View className="flex-row mb-5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  className={`mx-1 rounded-full ${pin.length > i ? 'bg-primary' : 'bg-text-muted/40'}`}
                  style={{ width: pin.length > i ? 10 : 8, height: pin.length > i ? 10 : 8 }}
                />
              ))}
            </View>
            <View className="flex-row flex-wrap justify-center" style={{ width: 240 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <Pressable
                  key={n}
                  className="w-1/3 items-center py-1.5 active:opacity-60"
                  onPress={() => setPin((p) => (p + String(n)).slice(0, 6))}
                >
                  <View className="bg-background border border-border w-14 h-14 rounded-full items-center justify-center">
                    <Text className="font-extrabold text-text" style={{ fontSize: rf(18) }}>{n}</Text>
                  </View>
                </Pressable>
              ))}
              <View className="w-1/3" />
              <Pressable
                className="w-1/3 items-center py-1.5 active:opacity-60"
                onPress={() => setPin((p) => (p + '0').slice(0, 6))}
              >
                <View className="bg-background border border-border w-14 h-14 rounded-full items-center justify-center">
                  <Text className="font-extrabold text-text" style={{ fontSize: rf(18) }}>0</Text>
                </View>
              </Pressable>
              <Pressable
                className="w-1/3 items-center py-1.5 active:opacity-60"
                onPress={() => setPin((p) => p.slice(0, -1))}
              >
                <View className="w-14 h-14 items-center justify-center">
                  <Ionicons name="backspace-outline" size={22} color="#0F172A" />
                </View>
              </Pressable>
            </View>
            <Text className="text-xs text-text-muted mt-4 self-start">PIN Number</Text>
            <TextInput
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="numeric"
              maxLength={6}
              placeholder="Enter PIN"
              placeholderTextColor="#94A3B8"
              className="bg-background border border-border rounded-xl px-4 py-3 mt-1 w-full text-text text-center font-bold" style={{ fontSize: rf(16) }}
            />
          </View>
          <Button
            className="bg-success mt-4"
            rightIcon={<Ionicons name="save-outline" size={18} color="#fff" />}
            onPress={() => saveLock('PIN', pin)}
            disabled={pin.length !== 4 && pin.length !== 6}
          >
            Save
          </Button>
        </View>
      </Dialog>

      <Dialog open={open === 'password'} onClose={() => setOpen(null)}>
        <View className="self-center w-full" style={{ maxWidth: 360 }}>
          <DialogHeader onClose={() => setOpen(null)} />
          <View className="items-center pt-1">
            <View className="bg-text rounded-2xl p-3 mb-3">
              <Ionicons name="lock-closed" size={22} color="#fff" />
            </View>
            <Text className="font-extrabold text-text" style={{ fontSize: rf(17) }}>Enter for Device Password</Text>
            <Text className="text-text-muted mt-1 mb-4" style={{ fontSize: rf(11) }}>Enter 4–16 letters and digits</Text>
            <Text className="text-xs text-text-muted self-start">Password</Text>
            <TextInput
              className="bg-background border border-border rounded-xl px-4 py-3 mt-1 w-full text-text"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password"
              placeholderTextColor="#94A3B8"
              maxLength={16}
            />
          </View>
          <Button
            className="bg-success mt-4"
            rightIcon={<Ionicons name="save-outline" size={18} color="#fff" />}
            onPress={() => saveLock('PASSWORD', password)}
            disabled={password.length < 4}
          >
            Save
          </Button>
        </View>
      </Dialog>
    </View>
  );
}
