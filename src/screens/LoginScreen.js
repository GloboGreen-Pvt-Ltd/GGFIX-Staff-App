import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { login, requestOtp } from '../api/auth';
import { AUTH_BASE } from '../api/config';
import { Button } from '../components/rnr';
import { rf, rlh, rs } from '../utils/responsive';

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
const DIAL_CODE = '+91';
const MOBILE_DIGITS = 10;

const NAVY = '#00008B';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const AMBER = '#F59E0B';
const DANGER = '#EF4444';

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
    if (mobile.length !== MOBILE_DIGITS) {
      setError(`Enter your ${MOBILE_DIGITS}-digit mobile number`);
      return;
    }
    try {
      setLoading(true);
      await requestOtp(mobile);
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

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + rs(24), paddingBottom: insets.bottom + rs(28) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 'MOBILE' ? (
          <MobileStep
            mobile={mobile}
            setMobile={setMobile}
            loading={loading}
            error={error}
            onSubmit={sendOtp}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ step 1 */

function MobileStep({ mobile, setMobile, loading, error, onSubmit }) {
  return (
    <View>
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="cover" />

      <Text style={styles.h1}>Login with{'\n'}mobile number</Text>
      <Text style={styles.sub}>Welcome to our app !</Text>

      <View style={styles.inputRow}>
        <View style={styles.dialCard}>
          <IndiaFlag />
          <Text style={styles.dialText}>{DIAL_CODE}</Text>
        </View>
        <View style={styles.numberCard}>
          <TextInput
            value={mobile}
            onChangeText={(v) => setMobile(v.replace(/[^0-9]/g, '').slice(0, MOBILE_DIGITS))}
            placeholder="9876543210"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            maxLength={MOBILE_DIGITS}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            style={styles.numberInput}
          />
        </View>
      </View>

      <ErrorBox msg={error} />

      <PrimaryButton label="LOGIN" loading={loading} onPress={onSubmit} />

      <Text style={styles.footnote}>
        Technician · Pickup Person · Staff only. Customers should use the Globo Green customer app.
      </Text>
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
      <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
        <ArrowLeft size={rs(20)} color={TEXT} />
      </Pressable>

      <Text style={styles.h1Center}>Verify Phone</Text>
      <Text style={styles.subCenter}>Code is sent to {DIAL_CODE} {mobile}</Text>

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

      {__DEV__ ? (
        // Dev-only hint. Advertising the default OTP in production hands
        // attackers the second half of a credential (mobile + a guessable
        // static OTP = account takeover).
        <Text style={styles.devHint}>Default dev OTP for shop staff: 123456.</Text>
      ) : null}

      {note ? <Text style={styles.note}>{note}</Text> : null}
      <ErrorBox msg={error} />

      <PrimaryButton label="VERIFY" loading={loading} onPress={onSubmit} />

      <View style={styles.resendRow}>
        <Text style={styles.resendMuted}>Not yet code? </Text>
        <Pressable onPress={onResend} disabled={!canResend} hitSlop={8}>
          <Text style={[styles.resendLink, !canResend && styles.resendLinkOff]}>
            {seconds > 0 ? `Resend in ${seconds}s` : 'Resend Now'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- parts */

function PrimaryButton({ label, loading, onPress }) {
  return (
    <Button
      onPress={onPress}
      loading={loading}
      fullWidth
      elevated={false}
      // twMerge drops Button's own `rounded-2xl`/`py-3.5` in favour of these, so
      // the CTA keeps the design's squarer 10px corners at a fixed 56px height.
      className="rounded-[10px] py-0"
      style={styles.cta}
    >
      <View style={styles.ctaInner}>
        <Text style={styles.ctaText}>{label}</Text>
        <ArrowRight size={rs(18)} color="#FFFFFF" strokeWidth={2} />
      </View>
    </Button>
  );
}

/**
 * Drawn rather than the 🇮🇳 emoji: regional-indicator flags fall back to two
 * boxed letters on some Android builds, which reads as a rendering bug.
 */
function IndiaFlag() {
  return (
    <View style={styles.flag}>
      <View style={[styles.flagStripe, { backgroundColor: '#FF9933' }]} />
      <View style={[styles.flagStripe, { backgroundColor: '#FFFFFF' }]}>
        <View style={styles.chakra} />
      </View>
      <View style={[styles.flagStripe, { backgroundColor: '#138808' }]} />
    </View>
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

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: rs(24) },

  logo: { height: rs(52), width: rs(52), borderRadius: rs(14), marginBottom: rs(22) },

  h1: { fontSize: rf(28), lineHeight: rlh(36), fontWeight: '800', color: TEXT, letterSpacing: -0.4 },
  h1Center: { fontSize: rf(26), lineHeight: rlh(32), fontWeight: '800', color: TEXT, textAlign: 'center' },
  sub: { fontSize: rf(13.5), lineHeight: rlh(20), color: MUTED, marginTop: rs(8) },
  subCenter: { fontSize: rf(13.5), lineHeight: rlh(20), color: MUTED, textAlign: 'center', marginTop: rs(8) },

  inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: rs(28) },
  dialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: rs(54),
    paddingHorizontal: rs(12),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    marginRight: rs(10),
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  dialText: { fontSize: rf(15), fontWeight: '700', color: TEXT, marginLeft: rs(7) },
  numberCard: {
    flex: 1,
    height: rs(54),
    justifyContent: 'center',
    paddingHorizontal: rs(14),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  numberInput: { fontSize: rf(15.5), fontWeight: '600', color: TEXT, padding: 0 },

  flag: { height: rs(16), width: rs(22), borderRadius: rs(3), overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  flagStripe: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chakra: { height: rs(4), width: rs(4), borderRadius: rs(2), backgroundColor: '#000080' },

  backBtn: { alignSelf: 'flex-start', height: rs(36), width: rs(36), alignItems: 'center', justifyContent: 'center', marginBottom: rs(8), marginLeft: -rs(8) },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: rs(26) },
  otpBox: {
    flex: 1,
    height: rs(56),
    marginHorizontal: rs(4),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  otpBoxActive: { borderColor: NAVY, borderWidth: 1.5 },
  otpChar: { fontSize: rf(20), fontWeight: '700', color: TEXT },
  otpCharEmpty: { fontSize: rf(20), fontWeight: '700', color: '#CBD5E1' },
  otpHiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },

  devHint: { fontSize: rf(11), color: MUTED, marginTop: rs(10), textAlign: 'center' },
  note: { fontSize: rf(12.5), color: '#004C40', marginTop: rs(10), textAlign: 'center' },

  cta: { height: rs(56), borderRadius: rs(10), marginTop: rs(26), paddingVertical: 0 },
  ctaInner: { flexDirection: 'row', alignItems: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: rf(14.5), fontWeight: '800', letterSpacing: 1.6, marginRight: rs(10) },

  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: rs(30) },
  resendMuted: { fontSize: rf(12.5), color: MUTED },
  resendLink: { fontSize: rf(12.5), fontWeight: '700', color: AMBER },
  resendLinkOff: { color: MUTED, fontWeight: '600' },

  footnote: { fontSize: rf(11), lineHeight: rlh(16), color: MUTED, textAlign: 'center', marginTop: rs(28) },

  errorBox: {
    marginTop: rs(14),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
  },
  errorText: { fontSize: rf(12), lineHeight: rlh(17), color: DANGER },
});
