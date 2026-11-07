import React from 'react';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

// Line illustrations for the Condition & Description step: a device drawing
// with the affected part and a green warning badge (functional problems), or
// the item itself (accessories). Drawn in SVG so they stay sharp at every size
// and ship no image files. viewBox is 64 × 64.

const INK = '#1F2937';
const ACCENT = '#3CC29A';
const SW = 1.8;

const line = { stroke: INK, strokeWidth: SW, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

function Badge({ x, y }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={8.5} fill="#FFFFFF" stroke={INK} strokeWidth={1.4} />
      <Path d={`M${x} ${y - 5} L${x + 5} ${y + 3.6} L${x - 5} ${y + 3.6} Z`} fill={ACCENT} />
      <Line x1={x} y1={y - 1.6} x2={x} y2={y + 0.9} stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" />
      <Circle cx={x} cy={y + 2.5} r={0.7} fill="#FFFFFF" />
    </G>
  );
}

const Front = () => (
  <G>
    <Rect x={18} y={6} width={28} height={52} rx={5} {...line} />
    <Rect x={27} y={8.5} width={10} height={2.6} rx={1.3} fill={INK} />
  </G>
);
const Back = () => <Rect x={18} y={6} width={28} height={52} rx={5} {...line} />;
const CameraBlock = () => (
  <G>
    <Rect x={21} y={9} width={11} height={15} rx={3} {...line} />
    <Circle cx={26.5} cy={13.5} r={2.3} {...line} />
    <Circle cx={26.5} cy={19.8} r={2.3} {...line} />
  </G>
);
// Side profile: the phone seen from its edge.
const Side = () => <Rect x={28} y={6} width={8} height={52} rx={3} {...line} />;
// Bottom edge: the phone seen from below.
const Bottom = () => <Rect x={8} y={27} width={48} height={11} rx={5.5} {...line} />;

const ART = {
  frontCamera: () => (<G><Front /><Circle cx={32} cy={16} r={2.2} fill={INK} /><Badge x={41} y={23} /></G>),
  backCamera: () => (<G><Back /><CameraBlock /><Badge x={39} y={28} /></G>),
  cameraGlass: () => (<G><Back /><CameraBlock /><Path d="M23 12 l4 5 l-2 3 l4 3" {...line} stroke={ACCENT} /><Badge x={39} y={28} /></G>),
  volume: () => (<G><Side /><Rect x={25.5} y={16} width={2.5} height={8} rx={1} fill={INK} /><Rect x={25.5} y={27} width={2.5} height={8} rx={1} fill={INK} /><Badge x={44} y={22} /></G>),
  silent: () => (<G><Side /><Rect x={25.5} y={11} width={2.5} height={5} rx={1} fill={INK} /><Badge x={44} y={14} /></G>),
  power: () => (<G><Side /><Rect x={36} y={18} width={2.5} height={10} rx={1} fill={INK} /><Badge x={20} y={24} /></G>),
  simSlot: () => (<G><Side /><Rect x={36} y={34} width={2.5} height={9} rx={1} {...line} strokeWidth={1.4} /><Badge x={20} y={38} /></G>),
  fingerprint: () => (
    <G>
      <Back />
      <Path d="M27 34 a5 5 0 0 1 10 0 v3" {...line} />
      <Path d="M24.5 34 a7.5 7.5 0 0 1 15 0 v1.5" {...line} />
      <Path d="M29.5 34.5 a2.5 2.5 0 0 1 5 0 v4" {...line} />
      <Badge x={41} y={42} />
    </G>
  ),
  faceId: () => (
    <G>
      <Front />
      <Path d="M24 22 v-3 h3 M37 19 h3 v3 M40 33 v3 h-3 M27 36 h-3 v-3" {...line} />
      <Circle cx={32} cy={26} r={3} {...line} />
      <Path d="M27.5 33 a5 3.5 0 0 1 9 0" {...line} />
      <Badge x={41} y={42} />
    </G>
  ),
  wifi: () => (
    <G>
      <Front />
      <Path d="M24 29 a11 11 0 0 1 16 0 M27 32.5 a6.5 6.5 0 0 1 10 0" {...line} />
      <Circle cx={32} cy={36} r={1.4} fill={INK} />
      <Badge x={41} y={45} />
    </G>
  ),
  bluetooth: () => (<G><Front /><Path d="M28 25 l8 7 l-4 4 v-15 l4 4 l-8 7" {...line} /><Badge x={41} y={45} /></G>),
  network: () => (<G><Front /><Path d="M25 38 v-3 M29 38 v-6 M33 38 v-9 M37 38 v-12" {...line} strokeWidth={2.4} /><Badge x={41} y={46} /></G>),
  speaker: () => (<G><Bottom /><Path d="M14 32.5 h0.1 M17 32.5 h0.1 M20 32.5 h0.1 M44 32.5 h0.1 M47 32.5 h0.1 M50 32.5 h0.1" stroke={INK} strokeWidth={2.4} strokeLinecap="round" /><Rect x={28} y={30.5} width={8} height={4} rx={2} {...line} strokeWidth={1.4} /><Badge x={46} y={20} /></G>),
  chargingPort: () => (<G><Bottom /><Rect x={27} y={30} width={10} height={5} rx={2.5} fill={INK} /><Badge x={32} y={18} /></G>),
  earSpeaker: () => (<G><Front /><Rect x={26} y={13} width={12} height={2.4} rx={1.2} fill={ACCENT} /><Badge x={41} y={24} /></G>),
  mic: () => (
    <G>
      <Front />
      <Rect x={29} y={22} width={6} height={10} rx={3} fill={ACCENT} />
      <Path d="M26.5 29 a5.5 5.5 0 0 0 11 0 M32 34.5 v3" {...line} />
      <Badge x={41} y={44} />
    </G>
  ),
  vibrator: () => (<G><Front /><Path d="M12 18 l-3 4 l3 4 l-3 4 l3 4 M52 18 l3 4 l-3 4 l3 4 l-3 4" {...line} /><Badge x={32} y={32} /></G>),
  proximity: () => (<G><Front /><Circle cx={36} cy={15} r={1.5} fill={INK} /><Path d="M40 18 a5 5 0 0 0 0 -6 M43 21 a9 9 0 0 0 0 -12" {...line} stroke={ACCENT} /><Badge x={32} y={34} /></G>),
  battery: () => (<G><Front /><Rect x={26} y={22} width={12} height={20} rx={2} {...line} /><Rect x={29.5} y={19.5} width={5} height={2.5} rx={1} fill={INK} /><Rect x={28.5} y={34} width={7} height={5.5} rx={1} fill={ACCENT} /><Badge x={41} y={46} /></G>),
  flashlight: () => (<G><Back /><CameraBlock /><Path d="M38 10 l-3 6 h3 l-2 6" {...line} stroke={ACCENT} /><Badge x={36} y={36} /></G>),
  display: () => (<G><Front /><Path d="M24 18 l6 8 l-3 5 l7 6 M30 26 l8 -3" {...line} stroke={ACCENT} /><Badge x={41} y={46} /></G>),
  touch: () => (<G><Front /><Circle cx={32} cy={30} r={4} {...line} stroke={ACCENT} /><Circle cx={32} cy={30} r={8} {...line} stroke={ACCENT} strokeDasharray="2 3" /><Badge x={41} y={46} /></G>),
  backPanel: () => (<G><Back /><Path d="M24 30 l6 5 l-2 6 l8 5 M30 35 l7 -4" {...line} stroke={ACCENT} /><Badge x={39} y={18} /></G>),
  generic: () => (<G><Front /><Badge x={32} y={32} /></G>),
  // Physical-condition states (screen / body): clean → spots → scratches → cracks → dents.
  condClean: () => (<G><Front /><Path d="M25 31 l5 5 l9 -10" {...line} stroke={'#01AC77'} strokeWidth={3} /></G>),
  spotsMinor: () => (<G><Front /><Circle cx={28} cy={24} r={2.2} fill={'#E5484D'} /><Circle cx={37} cy={36} r={1.6} fill={'#E5484D'} /></G>),
  spotsMajor: () => (<G><Front /><Circle cx={26} cy={20} r={3} fill={'#E5484D'} /><Circle cx={37} cy={24} r={2.4} fill={'#E5484D'} /><Circle cx={29} cy={33} r={3.4} fill={'#E5484D'} /><Circle cx={38} cy={40} r={2.2} fill={'#E5484D'} /><Circle cx={25} cy={44} r={1.8} fill={'#E5484D'} /></G>),
  scratchMinor: () => (<G><Front /><Path d="M25 22 l8 -4 M30 38 l9 -3" {...line} stroke={'#E5484D'} /></G>),
  scratchMajor: () => (<G><Front /><Path d="M23 20 l16 -6 M24 30 l15 -5 M25 41 l14 -6 M27 47 l10 -3" {...line} stroke={'#E5484D'} /></G>),
  cracked: () => (<G><Front /><Path d="M32 14 l-4 10 l7 6 l-6 9 l5 8 M35 30 l6 -3" {...line} stroke={'#E5484D'} /></G>),
  dented: () => (<G><Back /><Path d="M18 26 q5 4 0 8" {...line} stroke={'#E5484D'} /><Path d="M46 38 q-5 4 0 8" {...line} stroke={'#E5484D'} /></G>),
  broken: () => (<G><Front /><Path d="M22 14 l20 36 M42 14 l-20 36" {...line} stroke={'#E5484D'} /></G>),
  // Accessories
  box: () => (
    <G>
      <Rect x={10} y={20} width={44} height={30} rx={2} {...line} />
      <Rect x={10} y={20} width={44} height={6} fill={ACCENT} stroke={INK} strokeWidth={SW} />
      <Line x1={38} y1={20} x2={38} y2={50} {...line} />
      <Line x1={14} y1={31} x2={26} y2={31} {...line} />
    </G>
  ),
  cable: () => (
    <G>
      <Path d="M14 44 c0 -14 18 -14 18 -2 s18 12 18 -6 v-10" {...line} />
      <Rect x={45} y={12} width={10} height={14} rx={2} fill={ACCENT} stroke={INK} strokeWidth={SW} />
      <Rect x={47.5} y={8} width={5} height={4} rx={1} {...line} />
    </G>
  ),
  adapter: () => (
    <G>
      <Rect x={17} y={20} width={30} height={30} rx={5} {...line} />
      <Line x1={27} y1={12} x2={27} y2={20} {...line} strokeWidth={2.6} />
      <Line x1={37} y1={12} x2={37} y2={20} {...line} strokeWidth={2.6} />
      <Rect x={27} y={40} width={10} height={4} rx={2} fill={ACCENT} />
    </G>
  ),
  earphones: () => (
    <G>
      <Circle cx={20} cy={18} r={6} fill={ACCENT} stroke={INK} strokeWidth={SW} />
      <Circle cx={44} cy={18} r={6} fill={ACCENT} stroke={INK} strokeWidth={SW} />
      <Path d="M20 24 c0 14 6 18 12 22 M44 24 c0 14 -6 18 -12 22 v8" {...line} />
    </G>
  ),
  bill: () => (
    <G>
      <Path d="M16 8 h32 v48 l-4 -3 l-4 3 l-4 -3 l-4 3 l-4 -3 l-4 3 l-4 -3 l-4 3 Z" {...line} />
      <Line x1={22} y1={18} x2={42} y2={18} {...line} />
      <Line x1={22} y1={25} x2={36} y2={25} {...line} />
      <Path d="M27 33 h10 M27 37 h10 M30 33 c6 0 6 8 0 8 l7 7" {...line} stroke={ACCENT} />
    </G>
  ),
};

/** Which drawing fits an issue / accessory name (master data uses free text). */
// Picture for one physical-condition option ("No Spot", "Minor Spot", "Major Scratches"…).
export function conditionArtFor(label) {
  const n = String(label || '').toLowerCase();
  const has = (...w) => w.some((x) => n.includes(x));
  const heavy = has('major', 'heavy', 'many', 'multiple', 'big', 'large', 'deep', 'severe', 'more');
  if (has('no ', 'none', 'flawless', 'perfect', 'good', 'excellent', 'like new', 'clean', 'without')) return 'condClean';
  if (has('broken', 'not working', 'dead', 'shatter')) return 'broken';
  if (has('crack')) return 'cracked';
  if (has('dent', 'bend', 'bent')) return 'dented';
  if (has('scratch')) return heavy ? 'scratchMajor' : 'scratchMinor';
  if (has('spot', 'dot', 'patch', 'line', 'shade', 'discolor', 'burn')) return heavy ? 'spotsMajor' : 'spotsMinor';
  if (has('minor', 'light', 'small', 'few')) return 'scratchMinor';
  return 'generic';
}

export function artFor(name) {
  const n = String(name || '').toLowerCase();
  const has = (...w) => w.some((x) => n.includes(x));
  // Accessories first: "Charging Cable" must not read as the charging port.
  if (has('cable')) return 'cable';
  if (has('original box', 'box')) return 'box';
  if (has('adapter', 'charger')) return 'adapter';
  if (has('earphone', 'headphone', 'earbud')) return 'earphones';
  if (has('bill', 'invoice', 'receipt')) return 'bill';
  if (has('glass') && has('camera')) return 'cameraGlass';
  if (has('front camera', 'selfie')) return 'frontCamera';
  if (has('back camera', 'rear camera', 'camera')) return 'backCamera';
  if (has('volume')) return 'volume';
  if (has('silent', 'mute', 'alert slider')) return 'silent';
  if (has('power')) return 'power';
  if (has('sim')) return 'simSlot';
  if (has('finger', 'touch id')) return 'fingerprint';
  if (has('face')) return 'faceId';
  if (has('wifi', 'wi-fi')) return 'wifi';
  if (has('bluetooth')) return 'bluetooth';
  if (has('network', 'signal')) return 'network';
  if (has('ear speaker', 'earpiece', 'receiver')) return 'earSpeaker';
  if (has('speaker', 'loud')) return 'speaker';
  if (has('charging', 'port')) return 'chargingPort';
  if (has('mic')) return 'mic';
  if (has('vibrat')) return 'vibrator';
  if (has('proximity', 'sensor')) return 'proximity';
  if (has('battery')) return 'battery';
  if (has('flash', 'torch')) return 'flashlight';
  if (has('back panel', 'back glass', 'housing', 'body')) return 'backPanel';
  if (has('touch')) return 'touch';
  if (has('display', 'screen', 'lcd', 'line')) return 'display';
  if (has('box')) return 'box';
  if (has('cable')) return 'cable';
  if (has('adapter', 'charger')) return 'adapter';
  if (has('earphone', 'headphone', 'earbud')) return 'earphones';
  if (has('bill', 'invoice', 'receipt')) return 'bill';
  return 'generic';
}

export default function ConditionArt({ kind, size = 56 }) {
  const Draw = ART[kind] || ART.generic;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Draw />
    </Svg>
  );
}
