import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { Text } from '../components/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarCheck, Phone, ShieldCheck, Truck,
} from 'lucide-react-native';
import { interFamily } from '../theme/typography';
import { Skyline } from '../components/BootSplash';
import { mpinLogin } from '../api/auth';
import { AUTH_BASE } from '../api/config';
import { rf, rlh, rs } from '../utils/responsive';
import { normalizeIndianMobile } from '../utils/mobile';
import { logProfileDebug } from '../utils/profileDebug';
import { notify } from '../components/confirm';
import { userMessage } from '../utils/userMessages';

/**
 * Employee sign-in: registered mobile number → 6-digit Login MPIN set by the
 * shop owner in the Partner App. No OTP, password or self-registration.
 * Two steps live in this one screen because RootNavigator mounts a single
 * "Login" screen while logged out.
 *
 *   POST /auth/employee/mpin-login { mobile, mpin } — server enforces
 *   account/shop status and a 5-try / 15-minute lockout.
 */

const OTP_LENGTH = 6; // MPIN length
const MOBILE_DIGITS = 10;

// Server reason codes → clear, non-revealing messages.
function mpinErrorText(e) {
  if (e?.code === 'DEVICE_APPROVAL_REQUIRED') return e.message;
  const m = String(e?.serverMessage || e?.message || '');
  if (/disabled|inactive/i.test(m)) return m;
  const left = m.match(/WRONG_PIN:(\d+)/);
  if (left) return `Incorrect MPIN. ${left[1]} attempt${left[1] === '1' ? '' : 's'} left.`;
  if (/PIN_LOCKED/.test(m)) return 'Too many wrong attempts. Try again after 15 minutes.';
  if (/MPIN_NOT_SET/.test(m)) return 'MPIN not set. Ask your shop owner to set your Login MPIN.';
  if (/inactive/i.test(m)) return m;
  if (e?.status === 400 || e?.status === 401) return 'Invalid mobile number or MPIN.';
  return null;
}

export default function LoginScreen({ onLogin }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('MOBILE'); // MOBILE | OTP (= MPIN step)
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState(''); // MPIN digits
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const shownError = error;
  const otpRef = useRef(null);
  // Guards the auto-submit that fires when the 6th digit lands, so a slow
  // request can't be double-sent by another keystroke (or by paste + tap).
  const verifyingRef = useRef(false);

  /**
   * Only surface internal host/URL topology (AUTH_BASE, tried URL) in dev
   * builds — leaking the backend IP/port map to end users aids attackers and
   * adds nothing for them. Production shows a generic, non-revealing message.
   */
  const describeError = (e, fallback) => {
    if (__DEV__ && /localhost|127\.0\.0\.1/.test(String(e?.diagnostic || ''))) {
      return `Can't reach server (trying localhost). Current AUTH_BASE: ${AUTH_BASE}. Restart Expo with EXPO_PUBLIC_API_HOST=YOUR_PC_IP.`;
    }
    return userMessage(e, fallback);
  };
  // Mobile step: validate locally only (no OTP, no account-existence probe).
  const sendOtp = () => {
    setError(null);
    const normalized = normalizeIndianMobile(mobile);
    if (!normalized) {
      setError(`Enter your ${MOBILE_DIGITS}-digit mobile number`);
      return;
    }
    if (normalized !== mobile) setMobile(normalized);
    setStep('OTP');
  };

  const onOtpChange = (t) => {
    const digits = (t || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(digits);
    if (error) setError(null);
    if (digits.length === OTP_LENGTH) verify(digits);
  };

  const verify = async (code) => {
    const entered = (code ?? otp).trim();
    setError(null);
    if (entered.length !== OTP_LENGTH) {
      setError(`Enter your ${OTP_LENGTH}-digit MPIN`);
      return;
    }
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setError(null);
    try {
      setLoading(true);
      const data = await mpinLogin(mobile, entered);
      logProfileDebug('login ok', {
        enteredMobile: mobile,
        loginResponse: {
          userId: data?.userId ?? null,
          shopId: data?.shopId ?? null,
          roles: data?.roles ?? null,
          roleLabel: data?.roleLabel ?? null,
          mobile: data?.mobile ?? null,
          email: data?.email ?? null,
          technicianId: data?.technicianId ?? null,
          keys: data ? Object.keys(data) : [],
        },
      });
      notify('Logged in successfully', '', { type: 'success' });
      onLogin(data);
    } catch (e) {
      const text = mpinErrorText(e) || describeError(e, 'Authentication failed');
      setError(text);
      notify(text, '', { type: 'error' });
      // Wrong MPIN → wipe the boxes and re-focus so the retry is one action.
      // A network/server failure keeps the digits.
      if (e?.status === 401 || e?.status === 403) {
        setOtp('');
        otpRef.current?.focus();
      }
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  };

  const backToMobile = () => {
    setStep('MOBILE');
    setError(null);
  };

  const { width: winW, height: winH } = useWindowDimensions();
  const isMobileStep = step === 'MOBILE';
  // Both steps are laid out on the 941px-wide brand mockup grid: scaled to the
  // screen width (capped for tablets) and shrunk further on short screens so
  // the whole page fits; spare height on tall screens goes to flexible gaps.
  const availH = winH - insets.bottom - Math.max(0, insets.top - rs(24));
  const k = Math.min(Math.min(winW, 520) / LOGIN_DW, availH / (isMobileStep ? LOGIN_DH : OTP_DH));
  // Pushes the content below a tall status bar / notch.
  const shift = Math.max(0, insets.top + rs(4) - 66 * k);

  // Keyboard open: bring the mobile / OTP field above it (edge-to-edge Android
  // doesn't resize the window, so the page has to shrink and scroll itself).
  const scrollRef = useRef(null);
  useEffect(() => {
    const sub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    });
    return () => sub.remove();
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior="padding"
    >
      <StatusBar style="light" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingBottom: insets.bottom + 30 * k }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={false}
        showsVerticalScrollIndicator={false}
      >
        <Skyline width={winW} height={230 * k} />
        <LoginBowl width={winW} k={k} shift={shift} />
        {isMobileStep ? (
          <MobileStep
            mobile={mobile}
            setMobile={setMobile}
            loading={loading}
            error={shownError}
            onSubmit={sendOtp}
            k={k}
            shift={shift}
          />
        ) : (
          <OtpStep
            mobile={mobile}
            otp={otp}
            otpRef={otpRef}
            onOtpChange={onOtpChange}
            onSubmit={() => verify()}
            onBack={backToMobile}
            loading={loading}
            error={shownError}
            k={k}
            shift={shift}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------ brand layout */

const LOGIN_DW = 941; // mockup width both steps are measured on
const LOGIN_DH = 1580; // design height of the mobile step (fit-to-screen)
const OTP_DH = 1480; // design height of the MPIN step

// Inter by weight (exact sizes — skips the shared type-scale snapping).
const lf = (w) => {
  const f = interFamily(w);
  return f ? { fontFamily: f } : { fontWeight: String(w) };
};

// Text style on the mockup grid: design px × k, no OS font scaling.
const textOn = (k) => (size, weight, color, extra) => ({
  ...lf(weight), fontSize: size * k, lineHeight: size * 1.3 * k, color, includeFontPadding: false, ...extra,
});

// Flexible gap: at least `min` design px, grows to share spare screen height.
function Gap({ k, min }) {
  return <View style={{ flexGrow: 1, minHeight: min * k }} />;
}

// Blue header bowl with the lime swoosh under its right edge.
function LoginBowl({ width, k, shift }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width }}>
      {shift > 0 ? <View style={{ height: shift, backgroundColor: '#025D89' }} /> : null}
      <Svg width={width} height={260 * k} viewBox="0 0 941 260" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="lhdr" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#025D89" />
            <Stop offset="0.5" stopColor="#03779D" />
            <Stop offset="1" stopColor="#006692" />
          </SvgGradient>
          <SvgGradient id="llime" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#85C648" />
            <Stop offset="1" stopColor="#BDE739" />
          </SvgGradient>
        </Defs>
        <Path d="M0 0 H941 V104 C820 170 600 248 400 248 C240 248 100 200 0 62 Z" fill="url(#llime)" />
        <Path d="M0 0 H941 V64 C800 170 560 240 400 240 C240 240 100 190 0 60 Z" fill="url(#lhdr)" />
      </Svg>
    </View>
  );
}

// Logo tile, wordmark, byline and app chip — shared by both steps.
function BrandBlock({ k, t, shift }) {
  return (
    <>
      <View style={[lx.tile, { marginTop: 66 * k + shift, width: 196 * k, height: 196 * k, borderRadius: 40 * k }]}>
        <Image source={require('../../assets/splash-tile.png')} style={{ width: '100%', height: '100%', borderRadius: 40 * k }} resizeMode="cover" />
      </View>
      <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(78, 900, '#014755', { letterSpacing: -1.5 * k, lineHeight: 90 * k }), { marginTop: 10 * k, maxWidth: 520 * k }]}>
        NEAR G <RNText style={{ color: '#00BEBC' }}>FIX</RNText>
      </RNText>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[lx.rule, { width: 70 * k }]} />
        <RNText allowFontScaling={false} numberOfLines={1} style={[t(23, 700, '#01414C', { letterSpacing: 5 * k }), { marginHorizontal: 16 * k }]}>BY GLOBO GREEN</RNText>
        <View style={[lx.rule, { width: 70 * k }]} />
      </View>
      <LinearGradient colors={['#035C6C', '#035C6C']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ marginTop: 16 * k, width: 377 * k, height: 56 * k, borderRadius: 28 * k, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <BriefcaseBusiness size={34 * k} color="#FFFFFF" strokeWidth={2.2} />
        <RNText allowFontScaling={false} numberOfLines={1} style={[t(27, 800, '#FFFFFF', { letterSpacing: 2.5 * k }), { marginLeft: 22 * k }]}>EMPLOYEE APP</RNText>
      </LinearGradient>
    </>
  );
}

// Teal pill CTA with a right arrow (LOGIN on both steps).
function CtaButton({ k, t, label, loading, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={label} activeOpacity={0.9}
      style={[lx.cta, { marginTop: 30 * k, height: 85 * k, borderRadius: 43 * k }, loading && { opacity: 0.75 }]}>
      <LinearGradient colors={['#035C6C', '#035C6C', '#035C6C']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ flex: 1, borderRadius: 43 * k, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : (
          <>
            <RNText allowFontScaling={false} style={t(32, 800, '#FFFFFF', { letterSpacing: 5 * k })}>{label}</RNText>
            <ArrowRight size={36 * k} color="#FFFFFF" strokeWidth={2.4} style={{ marginLeft: 20 * k }} />
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ step 1 */

function MobileStep({ mobile, setMobile, loading, error, onSubmit, k, shift }) {
  const t = textOn(k);
  const strong = { ...lf(800), color: '#035C6C' };
  return (
    <View style={{ width: LOGIN_DW * k, alignItems: 'center', flexGrow: 1 }}>
      <BrandBlock k={k} t={t} shift={shift} />

      {/* Hero art + heading */}
      <Gap k={k} min={4} />
      <Image source={require('../../assets/login-hero.png')} style={{ width: 436 * k, height: 296 * k }} resizeMode="contain" />
      <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(46, 900, '#0A0B0B', { letterSpacing: -0.6 * k, lineHeight: 58 * k }), { maxWidth: 860 * k }]}>
        Login with <RNText style={{ color: '#035C6C' }}>mobile number</RNText>
      </RNText>
      <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(28, 400, '#5C677A'), { marginTop: 2 * k, maxWidth: 860 * k }]}>
        Welcome to NearGFix Employee App
      </RNText>

      {/* Login card */}
      <Gap k={k} min={26} />
      <View style={[lx.card, { width: 748 * k, borderRadius: 40 * k, paddingHorizontal: 38 * k, paddingTop: 24 * k, paddingBottom: 28 * k }]}>
        <RNText allowFontScaling={false} style={[t(27, 500, '#5E6B7A'), { marginLeft: 6 * k }]}>Mobile number</RNText>
        <View style={[lx.input, { marginTop: 10 * k, height: 80 * k, borderRadius: 22 * k, paddingHorizontal: 30 * k }]}>
          <Phone size={34 * k} color="#5C697B" strokeWidth={1.8} />
          <View style={{ width: 1.5, height: 40 * k, backgroundColor: '#DDE2E7', marginHorizontal: 22 * k }} />
          <RNTextInput
            value={mobile}
            onChangeText={(v) => setMobile(v.replace(/[^\d+]/g, '').slice(0, 13))}
            placeholder="9876543210"
            placeholderTextColor="#A3A3A3"
            keyboardType="number-pad"
            maxLength={16}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            allowFontScaling={false}
            accessibilityLabel="Mobile number"
            style={{ flex: 1, ...lf(700), fontSize: 34 * k, color: '#000000', padding: 0, letterSpacing: 1 * k }}
          />
        </View>

        <ErrorBox msg={error} />

        <CtaButton k={k} t={t} label="LOGIN" loading={loading} onPress={onSubmit} />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 30 * k }}>
          <View style={lx.line} />
          <RNText allowFontScaling={false} style={[t(21, 700, '#586072', { letterSpacing: 3.5 * k }), { marginHorizontal: 26 * k }]}>STAFF ONLY</RNText>
          <View style={lx.line} />
        </View>
        <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(26, 500, '#111111'), { textAlign: 'center', marginTop: 18 * k }]}>
          For <RNText style={strong}>Technician · Pickup Person · Staff</RNText> accounts
        </RNText>
      </View>

      {/* Feature row */}
      <Gap k={k} min={34} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: 771 * k }}>
        <Feature k={k} t={t} icon={CalendarCheck} fg="#048870" label={'Mark\nattendance'} />
        <View style={[lx.featureDivider, { height: 90 * k, marginTop: 34 * k }]} />
        <Feature k={k} t={t} icon={Truck} fg="#009545" label={'Manage\npickups'} />
        <View style={[lx.featureDivider, { height: 90 * k, marginTop: 34 * k }]} />
        <Feature k={k} t={t} icon={ShieldCheck} fg="#008630" label={'Trusted\n& secure'} />
      </View>

      <Gap k={k} min={36} />
      <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(22, 400, '#505B6F'), { textAlign: 'center', maxWidth: 860 * k }]}>
        Customers should use the Globo Green customer app.
      </RNText>
    </View>
  );
}

function Feature({ k, t, icon: Icon, fg, label }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <LinearGradient colors={['#ECFBF6', '#E0F6EF']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ width: 115 * k, height: 90 * k, borderRadius: 26 * k, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={56 * k} color={fg} strokeWidth={2} />
      </LinearGradient>
      <RNText allowFontScaling={false} style={[t(26, 400, '#111111', { lineHeight: 30 * k }), { textAlign: 'center', marginTop: 12 * k }]}>{label}</RNText>
    </View>
  );
}

/* ------------------------------------------------------------------ step 2 */

function OtpStep({
  mobile, otp, otpRef, onOtpChange, onSubmit, onBack, loading, error, k, shift,
}) {
  const t = textOn(k);
  const boxes = Array.from({ length: OTP_LENGTH });
  const boxGap = 14;
  const boxW = (748 - 76 - boxGap * (OTP_LENGTH - 1)) / OTP_LENGTH; // design px

  return (
    <View style={{ width: LOGIN_DW * k, alignItems: 'center', flexGrow: 1 }}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back"
        style={[lx.back, { top: 97 * k + shift, left: 41 * k, width: 70 * k, height: 70 * k, borderRadius: 35 * k }]}>
        <ArrowLeft size={34 * k} color="#014755" strokeWidth={2.4} />
      </Pressable>

      <BrandBlock k={k} t={t} shift={shift} />

      {/* Hero art + heading */}
      <Gap k={k} min={4} />
      <Image source={require('../../assets/login-hero.png')} style={{ width: 300 * k, height: 204 * k }} resizeMode="contain" />
      <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(50, 900, '#0A0B0B', { letterSpacing: -0.6 * k, lineHeight: 62 * k }), { maxWidth: 860 * k }]}>
        Enter your <RNText style={{ color: '#035C6C' }}>MPIN</RNText>
      </RNText>
      <RNText allowFontScaling={false} style={[t(27, 400, '#5C677A'), { marginTop: 2 * k, textAlign: 'center', maxWidth: 800 * k }]}>
        Enter the {OTP_LENGTH}-digit MPIN set by your shop owner for
      </RNText>
      <View style={[lx.phonePill, { marginTop: 16 * k, height: 70 * k, borderRadius: 35 * k, paddingHorizontal: 30 * k, minWidth: 460 * k }]}>
        <Phone size={30 * k} color="#5C697B" strokeWidth={1.8} />
        <RNText allowFontScaling={false} numberOfLines={1} style={[t(30, 700, '#000000', { letterSpacing: 1 * k }), { flex: 1, marginLeft: 16 * k }]}>{mobile}</RNText>
        <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit number">
          <RNText allowFontScaling={false} style={[t(27, 800, '#035C6C'), { marginLeft: 24 * k }]}>Edit</RNText>
        </TouchableOpacity>
      </View>

      {/* MPIN card */}
      <Gap k={k} min={26} />
      <View style={[lx.card, { width: 748 * k, borderRadius: 40 * k, paddingHorizontal: 38 * k, paddingTop: 24 * k, paddingBottom: 28 * k }]}>
        <RNText allowFontScaling={false} style={[t(27, 500, '#5E6B7A'), { marginLeft: 6 * k }]}>Login MPIN</RNText>
        {/* The visible boxes are display-only; one transparent input sits on top
            of the whole row so backspace, paste and SMS autofill all behave like
            a normal single field instead of six that fight over focus. */}
        <Pressable onPress={() => otpRef.current?.focus()} style={{ marginTop: 12 * k }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} pointerEvents="none">
            {boxes.map((_, i) => {
              const filled = !!otp[i];
              const active = otp.length === i;
              return (
                <View key={i} style={[lx.otpBox, {
                  width: boxW * k, height: 100 * k, borderRadius: 22 * k,
                  borderColor: active ? '#035C6C' : filled ? '#9FD3D6' : '#DDE2E7',
                  backgroundColor: active || filled ? '#FFFFFF' : '#F7F9FA',
                }]}>
                  <RNText allowFontScaling={false} style={t(40, 800, '#000000')}>{filled ? '•' : ''}</RNText>
                </View>
              );
            })}
          </View>
          {/* Outside the box row and absolutely positioned, so typed digits can
              never give it width and squeeze/shift the boxes. */}
          <RNTextInput
            ref={otpRef}
            value={otp}
            onChangeText={onOtpChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            caretHidden
            contextMenuHidden
            scrollEnabled={false}
            textContentType="none"
            autoComplete="off"
            secureTextEntry
            accessibilityLabel="Login MPIN"
            style={styles.otpHiddenInput}
          />
        </Pressable>

        <ErrorBox msg={error} />

        <CtaButton k={k} t={t} label="LOGIN" loading={loading} onPress={onSubmit} />

        <RNText allowFontScaling={false} style={[t(24, 400, '#5C677A'), { textAlign: 'center', marginTop: 24 * k }]}>
          Forgot MPIN? Ask your shop owner to reset it.
        </RNText>
      </View>

      {/* Safety note */}
      <Gap k={k} min={30} />
      <View style={[lx.safe, { width: 748 * k, borderRadius: 32 * k, padding: 22 * k }]}>
        <LinearGradient colors={['#ECFBF6', '#E0F6EF']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ width: 90 * k, height: 80 * k, borderRadius: 24 * k, alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={44 * k} color="#008630" strokeWidth={2} />
        </LinearGradient>
        <View style={{ flex: 1, marginLeft: 22 * k }}>
          <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={t(26, 800, '#111111')}>Your MPIN is never shown or shared</RNText>
          <RNText allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[t(22, 400, '#5C677A'), { marginTop: 4 * k }]}>Stored securely and verified only by the server</RNText>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- parts */

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{msg}</Text>
    </View>
  );
}

const lx = StyleSheet.create({
  tile: {
    backgroundColor: '#035C6C',
    shadowColor: '#7FE3F0', shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  rule: { height: 2, backgroundColor: '#BBC6CC', borderRadius: 1 },
  card: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#111111', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
  input: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#DDE2E7', backgroundColor: '#FFFFFF' },
  cta: {
    backgroundColor: '#035C6C',
    shadowColor: '#035C6C', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  line: { flex: 1, height: 1.5, backgroundColor: '#E1E5EA' },
  featureDivider: { width: 1.5, backgroundColor: '#E5E8EB' },
  back: {
    position: 'absolute', zIndex: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
    shadowColor: '#0B3B40', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  phonePill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#DDE2E7',
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  otpBox: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  safe: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EEF2F2',
    shadowColor: '#111111', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  otpHiddenInput: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    opacity: 0, color: 'transparent', padding: 0, fontSize: 1,
  },
  errorBox: {
    marginTop: rs(12),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: 'rgba(248,65,65,0.35)',
    backgroundColor: '#FEECEC',
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
  },
  errorText: { fontSize: rf(12.5), lineHeight: rlh(17), color: '#F32C26' },
});
