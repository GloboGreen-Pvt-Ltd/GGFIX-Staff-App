import React, { useEffect, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Smartphone, Hand, TabletSmartphone, Frame, BatteryMedium, Camera, Plug, ClipboardCheck, Check } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { getConditionGroups, getConditionOptions } from '../../api/master';
import { rf } from '../../utils/responsive';
import { SK, SellCard, SellCta, SellLoader, SellPage, PrefillNote } from './sellKit';

// Screen and body condition — the customer app's condition groups / options
// (master data), one pick per group, pre-selected from the customer's order.
const FALLBACK_GROUPS = [
  { id: 'SCREEN_DISPLAY', code: 'SCREEN_DISPLAY', name: 'Screen / Display', options: ['No Spot', 'Minor Spot or patches', 'Major Spot or patches', 'Multiple Visible line', 'Discoloration'] },
  { id: 'TOUCH_GLASS', code: 'TOUCH_GLASS', name: 'Touch Glass', options: ['No defects', '1 or 2 Minor Scratches', 'Heavy Scratches', 'Touch Glass Broken'] },
  { id: 'BACK_PANEL', code: 'BACK_PANEL', name: 'Back Panel', options: ['No defects', '1 or 2 Minor Scratches', 'Heavy Scratches', 'Back Panel Broken'] },
  { id: 'SIDE_AND_CENTER_PANEL', code: 'SIDE_AND_CENTER_PANEL', name: 'Side and Center Panel', options: ['No defects', 'Minor dent or scratches', 'Major dent or heavy scratches', 'Center panel broken or bent'] },
];
const rank = (g) => {
  const n = `${g.name || ''} ${g.code || ''}`.toLowerCase();
  if (n.includes('screen') || n.includes('display')) return 1;
  if (n.includes('touch')) return 2;
  if (n.includes('back')) return 3;
  if (n.includes('side') || n.includes('center')) return 4;
  return 99;
};
const groupIcon = (g) => {
  const n = `${g.name || ''} ${g.code || ''}`.toLowerCase();
  if (n.includes('touch')) return Hand;
  if (n.includes('screen') || n.includes('display')) return Smartphone;
  if (n.includes('back') || n.includes('body')) return TabletSmartphone;
  if (n.includes('side') || n.includes('center') || n.includes('frame')) return Frame;
  if (n.includes('battery') || n.includes('power')) return BatteryMedium;
  if (n.includes('camera')) return Camera;
  if (n.includes('charg') || n.includes('connect')) return Plug;
  return ClipboardCheck;
};
const norm = (s) => String(s || '').trim().toLowerCase();

export default function SellInspectScreenConditionScreen({ navigation, route }) {
  const params = route.params || {};
  const prior = params.editHints?.conditions || [];
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState({}); // groupId -> { id, label, groupCode, groupName }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await getConditionGroups(params.device?.categoryId).catch(() => []);
      const base = (list.length ? list : FALLBACK_GROUPS).slice().sort((a, b) => rank(a) - rank(b));
      const withOpts = [];
      for (const g of base) {
        const fromApi = list.length ? await getConditionOptions(g.id).catch(() => []) : [];
        const opts = fromApi.length ? fromApi : (g.options || []).map((o, i) => ({ id: `${g.id}-${i}`, label: o }));
        withOpts.push({ ...g, opts });
      }
      // The customer's pick per group: by group code (else name), then option id (else label).
      const seed = {};
      withOpts.forEach((g) => {
        const p = prior.find((c) => norm(c?.groupCode) === norm(g.code)) || prior.find((c) => c?.groupName && norm(c.groupName) === norm(g.name));
        const o = p && (g.opts.find((x) => p.optionId && x.id === p.optionId) || g.opts.find((x) => p.optionLabel && norm(x.label) === norm(p.optionLabel)));
        if (o) seed[g.id] = { id: o.id, label: o.label, groupCode: g.code, groupName: g.name };
      });
      if (!alive) return;
      setGroups(withOpts);
      setSelected(seed);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const done = groups.length > 0 && groups.every((g) => selected[g.id]);
  const next = () => navigation.navigate('SellInspectFunctional', {
    ...params,
    conditions: Object.values(selected).map((s) => ({ groupCode: s.groupCode, groupName: s.groupName, optionId: s.id, optionLabel: s.label })),
  });

  return (
    <SellPage title="Screen" subtitle="Screen and body condition" navigation={navigation} footer={<SellCta onPress={next} disabled={!done} />}>
      {loading ? <SellLoader /> : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
          {prior.length ? <PrefillNote /> : null}
          {groups.map((g) => (
            <SellCard key={g.id} title={g.name} Icon={groupIcon(g)}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                {g.opts.map((o) => {
                  const on = selected[g.id]?.id === o.id;
                  return (
                    <View key={o.id} style={{ width: '33.333%', padding: 4 }}>
                      <TouchableOpacity
                        onPress={() => setSelected((s) => ({ ...s, [g.id]: { id: o.id, label: o.label, groupCode: g.code, groupName: g.name } }))}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        style={{
                          minHeight: 84, borderRadius: 14, padding: 8, alignItems: 'center', justifyContent: 'center',
                          backgroundColor: on ? SK.tealSoft : '#F8FAFB', borderWidth: on ? 2 : 1, borderColor: on ? SK.teal : SK.line,
                        }}
                      >
                        {on ? (
                          <View style={{ position: 'absolute', top: 6, right: 6, height: 18, width: 18, borderRadius: 9, backgroundColor: SK.teal, alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={11} color="#FFFFFF" strokeWidth={3} />
                          </View>
                        ) : null}
                        <Smartphone size={26} color={on ? SK.teal : SK.navy} strokeWidth={1.6} />
                        <Text style={{ fontSize: rf(12), fontWeight: on ? '800' : '600', color: SK.ink, textAlign: 'center', marginTop: 6 }} numberOfLines={3}>{o.label}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </SellCard>
          ))}
        </ScrollView>
      )}
    </SellPage>
  );
}
