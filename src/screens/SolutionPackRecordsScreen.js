import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight, Search } from 'lucide-react-native';
import { Text, TextInput } from '../components/Typography';
import { Badge, Card, DeviceThumb, SC, fmtWhen, statusMeta } from '../components/SolutionKit';
import { confirm, notify } from '../components/confirm';
import { deleteRecord, loadRecords, titleOf } from '../utils/solutionRecords';
import { rf } from '../utils/responsive';

const TABS = [['all', 'All'], ['draft', 'Drafts'], ['saved', 'Saved'], ['published', 'Published']];

// My Repair Records — the records kept on this phone. "Published" only after
// the server confirmed the record; Draft / Saved are Local only.
export default function SolutionPackRecordsScreen({ navigation }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await loadRecords();
      setList([...rows].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      setError(null);
    } catch (e) {
      setError(e?.message || 'Could not read records on this phone.');
      setList([]);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => {
    const c = { all: 0, draft: 0, saved: 0, published: 0 };
    (list || []).forEach((r) => { c.all += 1; c[r.status || 'draft'] = (c[r.status || 'draft'] || 0) + 1; });
    return c;
  }, [list]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list || []).filter((r) => (tab === 'all' || (r.status || 'draft') === tab)
      && (!needle || [r.brand?.name, r.model?.name, r.issue, r.category?.name, r.jobRef].filter(Boolean).join(' ').toLowerCase().includes(needle)));
  }, [list, tab, q]);

  const open = (r) => {
    if (r.status === 'published') navigation.navigate('SolutionPackDetails', { recordId: r.id });
    else navigation.navigate('SolutionPackUpload', { recordId: r.id, ticketId: r.ticketId || undefined });
  };

  const remove = async (r) => {
    const ok = await confirm({
      title: 'Delete record?',
      message: r.status === 'published'
        ? 'Removes the copy on this phone. The published solution on the server stays.'
        : 'This record is only on this phone and will be lost.',
      confirmText: 'Delete', destructive: true,
    });
    if (!ok) return;
    try { await deleteRecord(r.id); load(); } catch (e) { notify('Could not delete', e?.message || 'Storage error', { type: 'error' }); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: SC.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12 }}>
        {TABS.map(([k, label]) => {
          const on = tab === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setTab(k)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, marginRight: 8, backgroundColor: on ? SC.green : SC.bg, borderWidth: 1, borderColor: on ? SC.green : SC.border }}
            >
              <Text style={{ fontSize: rf(12), fontWeight: '700', color: on ? '#FFFFFF' : SC.ink }}>{label} ({counts[k] || 0})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', margin: 12, marginBottom: 6, backgroundColor: SC.soft, borderRadius: 22, paddingHorizontal: 12 }}>
        <Search size={16} color={SC.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search your records..." placeholderTextColor={SC.faint} style={{ flex: 1, paddingVertical: 9, marginLeft: 8, fontSize: rf(13), color: SC.ink }} />
      </View>

      {list === null ? <ActivityIndicator color={SC.green} style={{ marginTop: 30 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
          {error ? <Text style={{ color: '#B91C1C', fontSize: rf(12), marginBottom: 10 }}>{error}</Text> : null}
          {shown.length === 0 && !error ? (
            <Text style={{ textAlign: 'center', color: SC.muted, fontSize: rf(12.5), paddingVertical: 30 }}>
              {list.length ? 'No records match.' : 'No repair records yet. Use Upload New to record a repair.'}
            </Text>
          ) : null}
          {shown.map((r) => {
            const st = statusMeta(r);
            return (
              <Card key={r.id} onPress={() => open(r)} onLongPress={() => remove(r)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <DeviceThumb brand={r.brand} model={r.model} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ flex: 1, fontSize: rf(14), fontWeight: '800', color: SC.ink }} numberOfLines={1}>
                      {[r.brand?.name, r.model?.name].filter(Boolean).join(' ') || 'Device'}
                    </Text>
                    <Badge label={st.label} tone={st.tone} />
                  </View>
                  <Text style={{ fontSize: rf(12), color: SC.ink, marginTop: 2 }} numberOfLines={1}>{titleOf(r) || 'Issue not entered yet'}</Text>
                  <Text style={{ fontSize: rf(11), color: SC.muted, marginTop: 2 }} numberOfLines={1}>
                    {st.where}{r.jobRef ? ` · ${r.jobRef}` : ''} · Updated: {fmtWhen(r.updatedAt)}
                  </Text>
                  {r.status === 'saved' && r.lastError ? (
                    <Text style={{ fontSize: rf(10.5), color: SC.warn, marginTop: 2 }} numberOfLines={2}>{r.lastError}</Text>
                  ) : null}
                </View>
                <ChevronRight size={18} color={SC.ink} style={{ marginLeft: 6 }} />
              </Card>
            );
          })}
          {list.length ? <Text style={{ textAlign: 'center', color: SC.faint, fontSize: rf(10.5), marginTop: 4 }}>Long-press a record to delete it.</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}
