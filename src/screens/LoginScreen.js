import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft, ArrowRight, CalendarCheck, Phone, Settings, ShieldCheck, Smartphone, Truck, Wrench,
} from 'lucide-react-native';
import { login, requestOtp } from '../api/auth';
import { AUTH_BASE } from '../api/config';
import { rf, rlh, rs } from '../utils/responsive';
import { normalizeIndianMobile } from '../utils/mobile';
import { logProfileDebug } from '../utils/profileDebug';
import BrandMark from '../components/BrandMark';

/**
 * Employee sign-in: mobile number → OTP. Two steps live in this one screen
 * (rather than two navigator routes) because RootNavigator mounts a single
 * "Login" screen while logged out — keeping the step in local state avoids
 * touching the navigator and keeps the entered number in scope for the resend.
 *
 * Wire-level flow, both endpoints already exist in auth-service:
 *   1. POST /auth/otp/send  { email: <mobile> }  — 400s with "No account found…"
 *      when the mobile isn't on a users row, so it doubles as the existence
 *      check before we show the code step.
 *   2. POST /auth/login     { email: <mobile>, otp }
 *
 * OTP is SIX digits, not the four drawn in the design: auth-service compares
 * against users.otp_code, whose default is 123456 (see AuthService.login and
 * registerTechnician). There's no SMS gateway yet — a mobile identifier always
 * resolves to that static code.
 */

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const MOBILE_DIGITS = 10;

// Brand palette: green, red, yellow, ink + light neutrals (same as Home).
const GREEN = '#09AD2A';
const GREEN_DARK = '#078F22';
const RED = '#F84141';
const YELLOW = '#F3BF23';
const INK = '#1E1E1E';
const BG = '#F8F8F8';
const SURFACE = '#F3F3F3';
const GREEN_TINT = '#E6F7EA';
const RED_TINT = '#FEECEC';
const YELLOW_TINT = '#FDF6E0';
const TEXT = INK;
const MUTED = '#6E6E6E';
const BORDER = '#E6E6E6';
const DANGER = RED;
const MAX_WIDTH = 480;

export default function LoginScreen({ onLogin }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('MOBILE'); // MOBILE | OTP
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const otpRef = useRef(null);
  // Guards the auto-submit that fires when the 6th digit lands, so a slow
  // request can't be double-sent by another keystroke (or by paste + tap).
  const verifyingRef = useRef(false);

  // Resend countdown.
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  /**
   * Only surface internal host/URL topology (AUTH_BASE, tried URL) in dev
   * builds — leaking the backend IP/port map to end users aids attackers and
   * adds nothing for them. Production shows a generic, non-revealing message.
   */
  const describeError = (e, fallback) => {
    const msg = e?.message || fallback;
    if (__DEV__) {
      const isLocalhost = /localhost|127\.0\.0\.1/.test(String(msg));
      if (!isLocalhost) return msg;
      const urlMatch = String(msg).match(/URL:\s*(\S+)/i);
      const triedUrl = urlMatch ? urlMatch[1] : '(unknown)';
      return (
        `Can't reach server (trying localhost). Tried: ${triedUrl}. ` +
        `Current AUTH_BASE: ${AUTH_BASE}. Restart Expo with EXPO_PUBLIC_API_HOST=YOUR_PC_IP.`
      );
    }
    // Network/unreachable → generic connectivity message; auth failures → the
    // server's own (non-topology) message so the user still gets useful
    // feedback like "Invalid OTP".
    const status = e?.status;
    if (!status || status === 0) return "Can't reach the server. Check your connection and try again.";
    return msg;
  };

  const sendOtp = async ({ resend = false } = {}) => {
    setError(null);
    setNote(null);
    const normalized = normalizeIndianMobile(mobile);
    if (!normalized) {
      setError(`Enter your ${MOBILE_DIGITS}-digit mobile number`);
      return;
    }
    if (normalized !== mobile) setMobile(normalized);
    try {
      setLoading(true);
      await requestOtp(normalized);
      setSeconds(RESEND_SECONDS);
      if (resend) setNote('A new code has been sent.');
      else setStep('OTP');
    } catch (e) {
      setError(describeError(e, 'Could not send the code.'));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (code) => {
    const entered = (code ?? otp).trim();
    setError(null);
    setNote(null);
    if (entered.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code`);
      return;
    }
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    try {
      setLoading(true);
      const data = await login(mobile, { otp: entered });
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
      onLogin(data);
    } catch (e) {
      setError(describeError(e, 'Authentication failed'));
      // Wrong code → wipe the boxes and re-focus so the retry is one action.
      // A network/server failure keeps the digits: they were probably right and
      // re-typing six of them to retry a dropped request is pure friction.
      if (e?.status === 401) {
        setOtp('');
        otpRef.current?.focus();
      }
    } finally {
      verifyingRef.current = false;
      setLoading(false);
    }
  };

  const onOtpChange = (v) => {
    const digits = v.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setOtp(digits);
    if (digits.length === OTP_LENGTH) verify(digits);
  };

  const backToMobile = () => {
    setStep('MOBILE');
    setOtp('');
    setError(null);
    setNote(null);
  };

  const { width: winW } = useWindowDimensions();
  const contentW = Math.min(winW, MAX_WIDTH) - rs(40);

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Backdrop />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + rs(16), paddingBottom: insets.bottom + rs(20) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW }}>
          {step === 'MOBILE' ? (
            <MobileStep
              mobile={mobile}
              setMobile={setMobile}
              loading={loading}
              error={error}
              onSubmit={sendOtp}
              wide={contentW >= 340}
            />
          ) : (
            <OtpStep
              mobile={mobile}
              otp={otp}
              otpRef={otpRef}
              onOtpChange={onOtpChange}
              onSubmit={() => verify()}
              onBack={backToMobile}
              onResend={() => sendOtp({ resend: true })}
              seconds={seconds}
              loading={loading}
              error={error}
              note={note}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* --------------------------------------------------------------- backdrop */

// Soft green shapes in the corners — decorative only.
function Backdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.blob, { top: -rs(80), right: -rs(90), width: rs(300), height: rs(300), backgroundColor: '#EAF7EC' }]} />
      <View style={[styles.blob, { top: rs(40), left: -rs(120), width: rs(220), height: rs(220), backgroundColor: '#F1F8F2' }]} />
      <View style={[styles.blob, { bottom: -rs(110), left: -rs(80), width: rs(220), height: rs(220), backgroundColor: '#CDEFD3' }]} />
      <View style={[styles.blob, { bottom: -rs(60), left: -rs(30), width: rs(130), height: rs(130), backgroundColor: '#9FDFAB', opacity: 0.55 }]} />
      <View style={[styles.blob, { bottom: -rs(110), right: -rs(80), width: rs(220), height: rs(220), backgroundColor: '#CDEFD3' }]} />
      <View style={[styles.blob, { bottom: -rs(60), right: -rs(30), width: rs(130), height: rs(130), backgroundColor: '#9FDFAB', opacity: 0.55 }]} />
    </View>
  );
}

// Repair-themed illustration built from shapes + icons (no image assets):
// a phone showing the logo on a pedestal, with wrench / phone / gear badges.
function HeroArt({ size }) {
  const phoneW = size * 0.46;
  const phoneH = phoneW * 1.9;
  const badge = size * 0.27;
  return (
    <View pointerEvents="none" style={{ width: size, height: size * 1.12 }}>
      <View style={[styles.blob, { top: size * 0.02, right: -size * 0.1, width: size * 0.95, height: size * 0.95, backgroundColor: GREEN_TINT }]} />
      <View style={[styles.blob, { top: size * 0.38, left: size * 0.02, width: size * 0.5, height: size * 0.5, backgroundColor: YELLOW_TINT }]} />
      {/* pedestal */}
      <View style={{ position: 'absolute', bottom: size * 0.02, left: size * 0.16, width: size * 0.78, height: size * 0.16, borderRadius: size * 0.4, backgroundColor: '#FFFFFF', shadowColor: INK, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 }} />
      {/* phone */}
      <View style={{
        position: 'absolute', bottom: size * 0.1, right: size * 0.16, width: phoneW, height: phoneH,
        borderRadius: phoneW * 0.2, backgroundColor: INK, padding: phoneW * 0.06, transform: [{ rotate: '10deg' }],
        shadowColor: INK, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 4, height: 8 }, elevation: 6,
      }}>
        <LinearGradient colors={['#F3FBF4', '#DFF4E3']} style={{ flex: 1, borderRadius: phoneW * 0.15, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={require('../../assets/logo.png')} style={{ width: phoneW * 0.6, height: phoneW * 0.6 }} resizeMode="contain" />
        </LinearGradient>
      </View>
      {/* badges */}
      <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2, top: size * 0.06, left: size * 0.04, backgroundColor: RED }]}>
        <Wrench size={badge * 0.46} color="#FFFFFF" strokeWidth={2.4} />
      </View>
      <View style={[styles.badge, { width: badge, height: badge, borderRadius: badge / 2, top: size * 0.42, right: -size * 0.04, backgroundColor: YELLOW }]}>
        <Smartphone size={badge * 0.46} color="#FFFFFF" strokeWidth={2.4} />
      </View>
      <View style={{ position: 'absolute', bottom: size * 0.08, right: size * 0.02 }}>
        <Settings size={size * 0.26} color={GREEN_DARK} fill={GREEN} strokeWidth={1.6} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ step 1 */

function MobileStep({ mobile, setMobile, loading, error, onSubmit, wide }) {
  const art = wide ? rs(170) : rs(130);
  return (
    <View>
      {/* Hero: logo + heading on the left, illustration on the right */}
      <View style={styles.hero}>
        <View style={{ position: 'absolute', right: -rs(6), top: 0 }}>
          <HeroArt size={art} />
        </View>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.h1}>
          Login with{'\n'}
          <Text style={{ color: GREEN }}>mobile number</Text>
        </Text>
        <Text style={styles.sub}>Welcome to GGFIX Employee App</Text>
      </View>

      {/* Login card */}
      <View style={styles.card}>
        <Text style={styles.label}>Mobile number</Text>
        <View style={styles.numberCard}>
          <Phone size={rs(19)} color={MUTED} strokeWidth={2} />
          <View style={styles.inputDivider} />
          <TextInput
            value={mobile}
            onChangeText={(v) => setMobile(v.replace(/[^\d+]/g, '').slice(0, 13))}
            placeholder="9876543210"
            placeholderTextColor="#A3A3A3"
            keyboardType="number-pad"
            maxLength={16}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            style={styles.numberInput}
          />
        </View>

        <ErrorBox msg={error} />

        <PrimaryButton label="LOGIN" loading={loading} onPress={onSubmit} />

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>STAFF ONLY</Text>
          <View style={styles.orLine} />
        </View>
        <Text style={styles.cardNote}>
          For <Text style={styles.cardNoteStrong}>Technician · Pickup Person · Staff</Text> accounts
        </Text>
      </View>

      {/* Feature row */}
      <View style={styles.features}>
        <Feature icon={CalendarCheck} bg={GREEN_TINT} fg={GREEN} label={'Mark\nattendance'} />
        <View style={styles.featureDivider} />
        <Feature icon={Truck} bg={YELLOW_TINT} fg="#C99500" label={'Manage\npickups'} />
        <View style={styles.featureDivider} />
        <Feature icon={ShieldCheck} bg={RED_TINT} fg={RED} label={'Trusted\n& secure'} />
      </View>

      <Text style={styles.footnote}>
        Customers should use the Globo Green customer app.
      </Text>
    </View>
  );
}

function Feature({ icon: Icon, bg, fg, label }) {
  const dot = rs(48);
  return (
    <View style={styles.feature}>
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(22)} color={fg} strokeWidth={2.2} />
      </View>
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ step 2 */

function OtpStep({
  mobile, otp, otpRef, onOtpChange, onSubmit, onBack, onResend, seconds, loading, error, note,
}) {
  const boxes = Array.from({ length: OTP_LENGTH });
  const canResend = seconds <= 0 && !loading;

  return (
    <View>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
        <ArrowLeft size={rs(20)} color={TEXT} />
      </Pressable>

      <BrandMark size={80} />
      <Text style={[styles.h1Center, { marginTop: rs(16) }]}>
        Verify <Text style={{ color: GREEN }}>Phone</Text>
      </Text>
      <Text style={styles.subCenter}>We have sent a {OTP_LENGTH}-digit code to</Text>
      <View style={styles.phonePill}>
        <Phone size={rs(16)} color={MUTED} strokeWidth={2.2} />
        <Text style={styles.phonePillText}>{mobile}</Text>
        <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit number">
          <Text style={styles.phonePillEdit}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {/* The visible boxes are display-only; one transparent input sits on top
            of the whole row so backspace, paste and SMS autofill all behave like
            a normal single field instead of six that fight over focus. */}
        <Pressable onPress={() => otpRef.current?.focus()} style={styles.otpRow}>
          {boxes.map((_, i) => {
            const char = otp[i] || '';
            const active = otp.length === i;
            return (
              <View key={i} style={[styles.otpBox, active && styles.otpBoxActive]}>
                <Text style={char ? styles.otpChar : styles.otpCharEmpty}>{char || '0'}</Text>
              </View>
            );
          })}
          <TextInput
            ref={otpRef}
            value={otp}
            onChangeText={onOtpChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            caretHidden
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            style={styles.otpHiddenInput}
          />
        </Pressable>

        {note ? <Text style={styles.note}>{note}</Text> : null}
        <ErrorBox msg={error} />

        <PrimaryButton label="VERIFY" loading={loading} onPress={onSubmit} />

        <View style={styles.resendRow}>
          <Text style={styles.resendMuted}>Didn’t receive the code? </Text>
          <TouchableOpacity onPress={onResend} disabled={!canResend} hitSlop={8} activeOpacity={0.7}>
            <Text style={[styles.resendLink, !canResend && seconds <= 0 && styles.resendLinkOff]}>
              {seconds > 0 ? `Resend in ${seconds}s` : 'Resend now'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.safeCard}>
        <View style={styles.safeIcon}>
          <ShieldCheck size={rs(20)} color={GREEN} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.safeTitle}>Your number is safe with us</Text>
          <Text style={styles.safeSub}>We use secure and encrypted verification</Text>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- parts */

function PrimaryButton({ label, loading, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.9}
      style={[styles.cta, loading && { opacity: 0.75 }]}
    >
      <LinearGradient colors={['#12BE36', GREEN, GREEN_DARK]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.ctaInner}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={styles.ctaText}>{label}</Text>
            <ArrowRight size={rs(20)} color="#FFFFFF" strokeWidth={2.4} />
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{msg}</Text>
    </View>
  );
}

const cardShadow = {
  shadowColor: INK, shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5,
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  blob: { position: 'absolute', borderRadius: 9999 },
  badge: {
    position: 'absolute', alignItems: 'center', justifyContent: 'center',
    shadowColor: INK, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },

  // The PNG is a teal roundel on an opaque white square canvas, so `contain`
  // keeps the whole mark visible without cropping.
  logo: { height: rs(96), width: rs(96), marginBottom: rs(18) },

  hero: { minHeight: rs(250), justifyContent: 'flex-end', paddingBottom: rs(4) },
  h1: { fontSize: rf(30), lineHeight: rlh(37), fontWeight: '900', color: TEXT, letterSpacing: -0.4 },
  h1Center: { fontSize: rf(28), lineHeight: rlh(34), fontWeight: '900', color: TEXT, textAlign: 'center' },
  sub: { fontSize: rf(14.5), lineHeight: rlh(20), color: MUTED, marginTop: rs(6) },
  subCenter: { fontSize: rf(14), lineHeight: rlh(20), color: MUTED, textAlign: 'center', marginTop: rs(6) },

  card: {
    marginTop: rs(22), backgroundColor: '#FFFFFF', borderRadius: rs(26),
    paddingHorizontal: rs(18), paddingVertical: rs(20), ...cardShadow,
  },
  label: { fontSize: rf(13.5), color: MUTED, marginBottom: rs(8), marginLeft: rs(2) },
  numberCard: {
    flexDirection: 'row', alignItems: 'center',
    height: rs(56), paddingHorizontal: rs(16), borderRadius: rs(16),
    borderWidth: 1, borderColor: BORDER, backgroundColor: '#FFFFFF',
  },
  inputDivider: { width: 1, height: rs(24), backgroundColor: BORDER, marginHorizontal: rs(14) },
  numberInput: { flex: 1, fontSize: rf(17), fontWeight: '600', color: TEXT, padding: 0, letterSpacing: 0.5 },

  orRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(20) },
  orLine: { flex: 1, height: 1, backgroundColor: BORDER },
  orText: { fontSize: rf(11.5), fontWeight: '700', color: MUTED, marginHorizontal: rs(12), letterSpacing: 1 },
  cardNote: { fontSize: rf(13), color: TEXT, textAlign: 'center', marginTop: rs(10) },
  cardNoteStrong: { fontWeight: '800', color: GREEN_DARK },

  features: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginTop: rs(22) },
  feature: { flex: 1, alignItems: 'center' },
  featureDivider: { width: 1, height: rs(46), backgroundColor: BORDER, marginTop: rs(10) },
  featureText: { fontSize: rf(13), lineHeight: rlh(17), color: TEXT, textAlign: 'center', marginTop: rs(8) },

  backBtn: {
    alignSelf: 'flex-start', height: rs(42), width: rs(42), borderRadius: rs(21), alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', marginBottom: rs(12), ...cardShadow,
  },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  otpBox: {
    flex: 1,
    height: rs(56),
    marginHorizontal: rs(4),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rs(14),
    borderWidth: 1,
    borderColor: '#EDEDED',
    backgroundColor: '#F7F7F7',
    shadowColor: INK, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  otpBoxActive: { borderColor: GREEN, borderWidth: 2, backgroundColor: '#FFFFFF' },
  otpChar: { fontSize: rf(20), fontWeight: '800', color: TEXT },
  otpCharEmpty: { fontSize: rf(20), fontWeight: '700', color: '#CFCFCF' },
  otpHiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },

  note: { fontSize: rf(12.5), color: GREEN_DARK, fontWeight: '600', marginTop: rs(12), textAlign: 'center' },

  cta: {
    height: rs(56), borderRadius: 999, marginTop: rs(18), overflow: 'hidden',
    shadowColor: GREEN, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  ctaInner: { flex: 1, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: rf(16), fontWeight: '900', letterSpacing: 2, marginRight: rs(12) },

  phonePill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: rs(10),
    backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: rs(14), height: rs(44), minWidth: rs(230),
    shadowColor: INK, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  phonePillText: { flex: 1, fontSize: rf(15), fontWeight: '600', color: TEXT, marginLeft: rs(10), letterSpacing: 0.5 },
  phonePillEdit: { fontSize: rf(13.5), fontWeight: '800', color: GREEN_DARK, marginLeft: rs(12) },
  safeCard: {
    flexDirection: 'row', alignItems: 'center', marginTop: rs(18), backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: rs(18), borderWidth: 1, borderColor: '#EEF2EE', paddingHorizontal: rs(14), paddingVertical: rs(12),
  },
  safeIcon: { width: rs(40), height: rs(40), borderRadius: rs(20), backgroundColor: GREEN_TINT, alignItems: 'center', justifyContent: 'center', marginRight: rs(12) },
  safeTitle: { fontSize: rf(13.5), fontWeight: '800', color: TEXT },
  safeSub: { fontSize: rf(11.5), color: MUTED, marginTop: 2 },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: rs(18) },
  resendMuted: { fontSize: rf(13), color: MUTED },
  resendLink: { fontSize: rf(13), fontWeight: '800', color: GREEN_DARK },

  resendLinkOff: { color: MUTED, fontWeight: '600' },

  footnote: { fontSize: rf(11.5), lineHeight: rlh(16), color: MUTED, textAlign: 'center', marginTop: rs(18) },

  errorBox: {
    marginTop: rs(12),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: 'rgba(248,65,65,0.35)',
    backgroundColor: RED_TINT,
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
  },
  errorText: { fontSize: rf(12.5), lineHeight: rlh(17), color: '#C62828' },
});
