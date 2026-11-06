import React, { useEffect, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Check, TriangleAlert } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { getFunctionalIssues } from '../../api/master';
import { rf } from '../../utils/responsive';
import { SK, SellCard, SellCta, SellLoader, SellPage, PrefillNote } from './sellKit';
import { getFunctionalIssueIcon } from './functionalIssueIcons';

// Functional issues — the customer app's list (master data) with the same
// icons, multi-select, pre-selected from the customer's order.
const FALLBACK = ['Battery Issue', 'Battery Replaced Local Market', 'Flashlight Not Working', 'Front Camera Not Working', 'Back Camera Not Working',
  'Camera Glass Broken', 'SIM Slot Broken', 'Network Issue', 'Speaker Not Working', 'Mic Not Working', 'Touch ID / Face ID Not Working',
  'Volume Button Not Working', 'WiFi or Bluetooth Not Working', 'Charging Port Not Working', 'Power Button Not Working', 'Vibrator Not Working'];
const norm = (s) => String(s || '').trim().toLowerCase();

export default function SellInspectFunctionalScreen({ navigation, route }) {
  const params = route.params || {};
  const prior = params.editHints?.issues || [];
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await getFunctionalIssues(params.device?.categoryId).catch(() => []);
      const all = list.length ? list : FALLBACK.map((n, i) => ({ id: `f${i}`, name: n }));
      const ids = new Set(prior.map((p) => p?.issueId).filter(Boolean));
      const codes = new Set(prior.map((p) => norm(p?.issueCode)).filter(Boolean));
      const seed = all.filter((it) => ids.has(it.id) || (it.code && codes.has(norm(it.code))) || codes.has(norm(it.name))).map((it) => it.id);
      if (!alive) return;
      setIssues(all);
      setSelected(seed);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const toggle = (id) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const next = () => navigation.navigate('SellInspectAccessories', {
    ...params,
    issues: issues.filter((it) => selected.includes(it.id)).map((it) => ({ issueId: it.id, issueCode: it.code || null, name: it.name })),
  });

  return (
    <SellPage
      title="Functional"
      subtitle="Select any issues"
      navigation={navigation}
      footer={<SellCta title={selected.length ? `Continue (${selected.length} issue${selected.length === 1 ? '' : 's'})` : 'Continue'} onPress={next} />}
    >
      {loading ? <SellLoader /> : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
          {prior.length ? <PrefillNote /> : null}
          <SellCard title="Functionality issues">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {issues.map((it) => {
                const on = selected.includes(it.id);
                const Icon = getFunctionalIssueIcon(it.name);
                return (
                  <View key={it.id} style={{ width: '33.333%', padding: 4 }}>
                    <TouchableOpacity
                      onPress={() => toggle(it.id)}
                      activeOpacity={0.85}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={{
                        minHeight: 96, borderRadius: 14, padding: 8, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: on ? SK.tealSoft : '#F8FAFB', borderWidth: on ? 2 : 1, borderColor: on ? SK.teal : SK.line,
                      }}
                    >
                      <View style={{ height: 40, width: 40, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={28} color={on ? SK.teal : SK.navy} strokeWidth={1.7} />
                        <View style={{ position: 'absolute', right: -4, bottom: -2 }}>
                          {on ? (
                            <View style={{ height: 16, width: 16, borderRadius: 8, backgroundColor: SK.teal, alignItems: 'center', justifyContent: 'center' }}>
                              <Check size={10} color="#FFFFFF" strokeWidth={3} />
                            </View>
                          ) : <TriangleAlert size={14} color={SK.amber} fill={SK.amberSoft} strokeWidth={2.2} />}
                        </View>
                      </View>
                      <Text style={{ fontSize: rf(12), fontWeight: on ? '800' : '600', color: SK.ink, textAlign: 'center', marginTop: 6 }} numberOfLines={3}>{it.name}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </SellCard>
        </ScrollView>
      )}
    </SellPage>
  );
}
