import { Platform } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

// Thin adapter that keeps the small slice of the old `expo-av` Audio API this
// app uses (voice-note record + playback), implemented on `expo-audio`, which
// replaced expo-av in Expo SDK 55+. Screens import { Audio } from here instead
// of 'expo-av', so their recording / upload / playback logic stays unchanged.
//
// Covered: requestPermissionsAsync, setAudioModeAsync, Recording
// (prepareToRecordAsync / startAsync / stopAndUnloadAsync / getURI),
// RecordingOptionsPresets.HIGH_QUALITY, and Sound.createAsync returning a
// sound with play/pause/stop/setPosition/setRate/getStatus/unload and
// setOnPlaybackStatusUpdate. Status objects use expo-av field names
// (positionMillis, durationMillis, isPlaying, didJustFinish, isLoaded).

// expo-audio presets carry per-platform sub-objects; flatten for this OS
// (mirrors expo-audio's own createRecordingOptions).
function platformRecordingOptions(preset) {
  const common = {
    extension: preset.extension,
    sampleRate: preset.sampleRate,
    numberOfChannels: preset.numberOfChannels,
    bitRate: preset.bitRate,
    isMeteringEnabled: preset.isMeteringEnabled ?? false,
  };
  if (Platform.OS === 'ios') return { ...common, directory: preset.directory, ...preset.ios };
  if (Platform.OS === 'android') return { ...common, directory: preset.directory, ...preset.android };
  return { ...common, ...preset.web };
}

// expo-audio status (seconds) → expo-av status shape (milliseconds).
function toAvStatus(st) {
  if (!st) return { isLoaded: false };
  return {
    isLoaded: !!st.isLoaded,
    positionMillis: Math.round((st.currentTime || 0) * 1000),
    durationMillis: st.duration ? Math.round(st.duration * 1000) : undefined,
    isPlaying: !!st.playing,
    didJustFinish: !!st.didJustFinish,
    isBuffering: !!st.isBuffering,
    rate: st.playbackRate,
  };
}

class Recording {
  constructor() {
    this._recorder = null;
    this._uri = null;
  }

  async prepareToRecordAsync(preset = RecordingPresets.HIGH_QUALITY) {
    this._recorder = new AudioModule.AudioRecorder(platformRecordingOptions(preset));
    await this._recorder.prepareToRecordAsync();
  }

  async startAsync() {
    this._recorder?.record();
  }

  async stopAndUnloadAsync() {
    const rec = this._recorder;
    if (!rec) return;
    await rec.stop();
    this._uri = rec.uri || this._uri;
    try { rec.release?.(); } catch (_) {}
    this._recorder = null;
  }

  getURI() {
    return this._uri || this._recorder?.uri || null;
  }
}

class Sound {
  constructor(player) {
    this._player = player;
    this._sub = null;
  }

  // Resolves once the source has loaded (like expo-av's createAsync), so an
  // immediate getStatusAsync() can already report the duration.
  static async createAsync(source, initialStatus = {}, onPlaybackStatusUpdate) {
    const uri = typeof source === 'object' && source !== null ? source.uri : source;
    const player = createAudioPlayer(uri, {
      updateInterval: initialStatus.progressUpdateIntervalMillis ?? 500,
    });
    const sound = new Sound(player);
    if (initialStatus.rate && initialStatus.rate !== 1) {
      player.setPlaybackRate(initialStatus.rate, initialStatus.shouldCorrectPitch === false ? undefined : 'high');
    }
    if (onPlaybackStatusUpdate) sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
    await sound._waitUntilLoaded();
    if (initialStatus.shouldPlay) player.play();
    return { sound, status: toAvStatus(player.currentStatus) };
  }

  _waitUntilLoaded(timeoutMs = 8000) {
    if (this._player.isLoaded) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); sub.remove(); resolve(); };
      const sub = this._player.addListener('playbackStatusUpdate', (st) => { if (st?.isLoaded) done(); });
      const timer = setTimeout(done, timeoutMs);
    });
  }

  setOnPlaybackStatusUpdate(cb) {
    this._sub?.remove();
    this._sub = cb ? this._player.addListener('playbackStatusUpdate', (st) => cb(toAvStatus(st))) : null;
  }

  async getStatusAsync() {
    return toAvStatus(this._player.currentStatus);
  }

  async playAsync() {
    this._player.play();
  }

  async pauseAsync() {
    this._player.pause();
  }

  async stopAsync() {
    this._player.pause();
    await this._player.seekTo(0);
  }

  async setPositionAsync(millis) {
    await this._player.seekTo((millis || 0) / 1000);
  }

  async setRateAsync(rate, shouldCorrectPitch = true) {
    this._player.setPlaybackRate(rate, shouldCorrectPitch ? 'high' : undefined);
  }

  async unloadAsync() {
    this._sub?.remove();
    this._sub = null;
    try { this._player.remove(); } catch (_) {}
  }
}

export const Audio = {
  requestPermissionsAsync: requestRecordingPermissionsAsync,
  // Maps expo-av's iOS-named flags onto expo-audio's cross-platform ones; only
  // keys the caller passed are forwarded.
  async setAudioModeAsync(mode = {}) {
    const next = {};
    if (mode.playsInSilentModeIOS !== undefined) next.playsInSilentMode = !!mode.playsInSilentModeIOS;
    if (mode.allowsRecordingIOS !== undefined) next.allowsRecording = !!mode.allowsRecordingIOS;
    if (mode.staysActiveInBackground !== undefined) next.shouldPlayInBackground = !!mode.staysActiveInBackground;
    await setAudioModeAsync(next);
  },
  Recording,
  RecordingOptionsPresets: RecordingPresets,
  Sound,
};
