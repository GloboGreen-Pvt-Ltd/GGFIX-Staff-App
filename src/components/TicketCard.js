import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { Text } from './Typography';
import { rf, rs } from '../utils/responsive';

// List card used by Task Report / Assign Report (pickup-list style):
//   [badge]  #REF chip / title / subtitle          [STATUS] / date / time
//   ─────────────────────────────────────────────────────────────
//   rows of { icon, label, value } pairs — left aligned | right aligned
//   optional aside (e.g. Reject / Accept) to the right of the rows
//   optional footer (e.g. Review button)
// statusIcon puts an icon in the status pill; iconBubble draws row icons in a
// grey circle. compact tightens spacing and type, puts date + time on one
// line and keeps every field to a single line (Job Report).
export default function TicketCard({
  badge, refId, title, subtitle, subtitle2, status, statusColor = '#035C6C', statusIcon: StatusIcon, date, time, rows = [], aside, iconBubble, footer, onPress, onLongPress, compact,
}) {
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} delayLongPress={400} activeOpacity={0.9} style={[S.card, compact && S.cardCompact]}>
      <View style={S.top}>
        {badge}
        <View style={{ flex: 1, minWidth: 0, marginLeft: rs(compact ? 8 : 10) }}>
          {refId ? (
            <View style={[S.refChip, compact && S.refChipCompact]}><Text style={[S.refText, compact && S.refTextCompact]} numberOfLines={1}>{refId}</Text></View>
          ) : null}
          <Text style={[S.title, compact && S.titleCompact]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[S.subtitle, compact && S.subtitleCompact]} numberOfLines={1}>{subtitle}</Text> : null}
          {subtitle2 ? <Text style={[S.subtitle, compact && S.subtitleCompact]} numberOfLines={1}>{subtitle2}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: rs(8), maxWidth: '42%' }}>
          {status ? (
            <View style={[S.status, { backgroundColor: `${statusColor}1A`, borderColor: `${statusColor}55` }]}>
              {StatusIcon ? <StatusIcon size={rs(compact ? 10 : 12)} color={statusColor} strokeWidth={2.4} /> : null}
              <Text style={[S.statusText, { color: statusColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{String(status).toUpperCase()}</Text>
            </View>
          ) : null}
          {date ? (
            <View style={S.dateRow}>
              <Calendar size={rs(compact ? 11 : 12)} color="#6B7280" strokeWidth={2} />
              <Text style={[S.date, compact && S.dateCompact]} numberOfLines={1}>
                {compact && time ? `${date} · ${time}` : date}
              </Text>
            </View>
          ) : null}
          {time && !compact ? <Text style={S.time} numberOfLines={1}>{time}</Text> : null}
        </View>
      </View>

      {rows.length ? <View style={[S.divider, compact && S.dividerCompact]} /> : null}
      <View style={aside ? S.rowsWithAside : null}>
        <View style={aside ? { flex: 1, minWidth: 0 } : null}>
          {rows.map((pair, i) => (
            <View key={i} style={[S.row, i > 0 && { marginTop: rs(compact ? 2 : 4) }]}>
              {/* A field with no partner spans the full width (and may wrap to 2 lines, 1 when compact). */}
              <Field {...(pair[0] || {})} wide={!pair[1] && !compact} bubble={iconBubble} compact={compact} />
              {pair[1] ? <Field {...pair[1]} right bubble={iconBubble} compact={compact} /> : null}
            </View>
          ))}
        </View>
        {aside ? <View style={{ marginLeft: rs(8) }}>{aside}</View> : null}
      </View>
      {footer ? <View style={{ marginTop: rs(6) }}>{footer}</View> : null}
    </TouchableOpacity>
  );
}

// One compact line per field: icon + value (the icon stands in for the label).
function Field({ icon: Icon, label, value, right, muted, onPress, wide, bubble, compact }) {
  if (!label) return <View style={{ flex: 1 }} />;
  const body = (
    <View style={[S.fieldHead, compact && S.fieldHeadCompact, right && { justifyContent: 'flex-end' }, bubble && { alignItems: 'center' }]} accessibilityLabel={`${label}: ${value || '—'}`}>
      {Icon ? (
        <View style={bubble ? [S.fieldIconBubble, compact && S.fieldIconBubbleCompact] : [S.fieldIcon, compact && S.fieldIconCompact]}>
          <Icon size={rs(bubble ? (compact ? 12 : 15) : compact ? 12 : 13)} color="#6B7280" strokeWidth={2} />
        </View>
      ) : null}
      <Text style={[S.fieldValue, compact && S.fieldValueCompact, { flexShrink: 1 }, muted && { color: '#9CA3AF' }, onPress && { color: '#035C6C' }]} numberOfLines={wide ? 2 : 1}>{value || '—'}</Text>
    </View>
  );
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      {onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7} hitSlop={6}>{body}</TouchableOpacity> : body}
    </View>
  );
}

const S = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: rs(8), paddingHorizontal: rs(10), marginBottom: rs(6),
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  refChip: { alignSelf: 'flex-start', backgroundColor: '#E5F3F5', borderRadius: rs(6), paddingHorizontal: rs(6), paddingVertical: rs(2), marginBottom: rs(2) },
  refText: { fontSize: rf(10), fontWeight: '800', color: '#035C6C' },
  title: { fontSize: rf(13.5), fontWeight: '800', color: '#111111' },
  subtitle: { fontSize: rf(12), color: '#6B7280', marginTop: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: rs(4), borderWidth: 1, borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(3) },
  statusText: { fontSize: rf(10), fontWeight: '800', letterSpacing: 0.3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4), marginTop: rs(4) },
  date: { fontSize: rf(11), fontWeight: '600', color: '#374151' },
  time: { fontSize: rf(10.5), color: '#6B7280', marginTop: 1 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: rs(6) },
  row: { flexDirection: 'row', gap: rs(10) },
  rowsWithAside: { flexDirection: 'row', alignItems: 'center' },
  fieldIconBubble: { width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  // Fixed icon box = one text line tall, so icon and text line up on every row
  // (also when the text wraps to a second line).
  fieldHead: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
  // Icon centred under the device badge (32 wide), text starts in line with the title.
  fieldIcon: { width: rs(32), height: rf(17), alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: rf(10.5), color: '#6B7280' },
  fieldValue: { fontSize: rf(12), lineHeight: rf(17), fontWeight: '700', color: '#111111' },

  // compact (Job Report)
  cardCompact: { borderRadius: rs(12), paddingVertical: rs(6), paddingHorizontal: rs(9), marginBottom: rs(5) },
  refChipCompact: { paddingHorizontal: rs(5), paddingVertical: rs(1), marginBottom: rs(1) },
  refTextCompact: { fontSize: rf(9.5) },
  titleCompact: { fontSize: rf(12.5) },
  subtitleCompact: { fontSize: rf(11), marginTop: 0 },
  dateCompact: { fontSize: rf(10.5) },
  dividerCompact: { marginVertical: rs(4) },
  fieldHeadCompact: { gap: rs(8) },
  fieldIconCompact: { height: rf(15) },
  fieldIconBubbleCompact: { width: rs(24), height: rs(24), borderRadius: rs(12) },
  fieldValueCompact: { fontSize: rf(11.5), lineHeight: rf(15), fontWeight: '600' },
});
