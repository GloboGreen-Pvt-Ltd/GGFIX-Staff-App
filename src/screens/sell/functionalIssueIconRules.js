// Semantic icon rules for the Sell "Functional" issue tiles. Pure data (lucide
// icon NAMES) so the mapping can be audited without React; the screen turns a
// name into a component via functionalIssueIcons.js. Presentation only — issue
// ids, names and order are untouched.
//
// Checked top to bottom against the lower-cased issue name; first match wins,
// so specific phrases come before generic words.

export const ISSUE_ICON_RULES = [
  // battery / charging / power
  [/battery replaced/, 'BatteryCharging'],
  [/battery/, 'BatteryWarning'],
  [/magnetic charger/, 'Magnet'],
  [/case not charging/, 'BatteryLow'],
  [/adapter/, 'Cable'],
  [/charging pin|charging port/, 'PlugZap'],
  [/charging/, 'BatteryWarning'],
  [/power button/, 'Power'],
  [/auto shutdown/, 'PowerOff'],
  [/restarting|restart/, 'RotateCcw'],

  // camera / light
  [/flash ?light/, 'FlashlightOff'],
  [/camera glass/, 'ScanLine'],
  [/webcam/, 'Webcam'],
  [/camera/, 'CameraOff'],

  // network / connectivity
  [/sim slot/, 'CreditCard'],
  [/wifi \/ bluetooth|wifi or bluetooth/, 'WifiOff'],
  [/wifi/, 'WifiOff'],
  [/bluetooth/, 'BluetoothOff'],
  [/pairing|not pairing/, 'Unlink'],
  [/auto disconnect/, 'Unlink'],
  [/network/, 'RadioTower'],
  [/gps/, 'Navigation'],

  // audio
  [/ear speaker/, 'Ear'],
  [/left earbud|right earbud/, 'Headphones'],
  [/\banc\b/, 'AudioLines'],
  [/call voice/, 'PhoneCall'],
  [/mic/, 'MicOff'],
  [/sound distortion/, 'AudioWaveform'],
  [/sound cutting/, 'VolumeOff'],
  [/one side sound/, 'Volume1'],
  [/audio delay/, 'Timer'],
  [/low sound/, 'Volume1'],
  [/no sound|speaker/, 'VolumeX'],
  [/volume button/, 'Volume2'],

  // buttons / touch / sensors
  [/touch id|face id/, 'ScanFace'],
  [/fingerprint/, 'Fingerprint'],
  [/touch control/, 'Hand'],
  [/touchpad/, 'MousePointer2'],
  [/keyboard/, 'Keyboard'],
  [/side button/, 'RectangleVertical'],
  [/crown/, 'CircleDot'],
  [/proximity/, 'Radar'],
  [/heart rate/, 'HeartPulse'],
  [/spo2/, 'Activity'],
  [/step counter/, 'Footprints'],
  [/auto rotation/, 'RotateCw'],
  [/vibrat/, 'VibrateOff'],
  [/notification/, 'BellOff'],

  // performance / hardware
  [/heating/, 'ThermometerSun'],
  [/fan/, 'Fan'],
  [/slow/, 'Gauge'],
  [/hard disk|ssd/, 'HardDrive'],
  [/storage/, 'HardDrive'],
  [/\bram\b/, 'MemoryStick'],
  [/motherboard/, 'CircuitBoard'],
  [/bios/, 'Settings2'],

  // software
  [/app crash/, 'TriangleAlert'],
  [/virus/, 'Bug'],
  [/firmware/, 'Cpu'],
  [/os problem|software/, 'Code'],
];

export const DEFAULT_ISSUE_ICON = 'Wrench';

// -> { name, matched: boolean }
export function resolveIssueIconName(issueName) {
  const s = String(issueName || '').toLowerCase().trim();
  for (const [re, name] of ISSUE_ICON_RULES) if (re.test(s)) return { name, matched: true };
  return { name: DEFAULT_ISSUE_ICON, matched: false };
}
