import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { CircleAlert, ClipboardCheck, ListOrdered, Package, Play, Search, Video as VideoIcon, Wrench } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { AudioRow, Badge, Card, DeviceThumb, SC, statusMeta } from '../components/SolutionKit';
import ImageViewerModal from '../components/ImageViewerModal';
import { searchSolutionPacks } from '../api/tickets';
import { loadRecords, packFiles, parseDescription, resultOf, slotOfName, SLOTS } from '../utils/solutionRecords';
import { openExternalUrl } from '../utils/safeLink';
import { rf } from '../utils/responsive';
import { ReferenceCard } from './SolutionPackReferenceViewScreen';

const slotLabel = (s) => SLOTS.find(([k]) => k === s)?.[1] || null;

// One view model for a server pack or a record kept on this phone.
function fromPack(p) {
  const d = parseDescription(p.description);
  return {
    id: p.id, title: p.title || 'Solution pack', brand: { id: p.brandId, name: p.brandName }, model: { id: p.modelId, name: p.modelName },
    category: [p.issueCategory, p.issueSubcategory].filter(Boolean).join(' / '), categoryId: p.issueCategoryId,
    ...d, fault: d.fault || '',
    media: packFiles(p).map((f) => ({ kind: f.type, uri: f.url, remote: true, label: slotLabel(slotOfName(f.name)) || f.name })),
  };
}
function fromRecord(r) {
  return {
    id: r.serverId || r.id, title: String(r.issue || '').split('\n')[0] || 'Repair record', brand: r.brand, model: r.model,
    category: r.category?.name || '', categoryId: r.category?.id, fault: r.issue, diagnosis: r.diagnosis, solution: r.solution,
    steps: r.steps || [], parts: r.parts, result: r.result, resultText: resultOf(r.result)?.label || '', record: r,
    media: (r.media || []).map((m) => ({ kind: m.kind, uri: m.url || m.localUri, remote: !!m.url, label: slotLabel(m.slot) || m.name })),
  };
}

// Reference Details — Details / Media / Related.
export default function SolutionPackDetailsScreen({ route, navigation }) {
  const { pack, recordId } = route.params || {};
  const [vm, setVm] = useState(pack ? fromPack(pack) : null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('details');
  const [related, setRelated] = useState(null);
  const [viewerAt, setViewerAt] = useState(-1);

  useEffect(() => {
    if (pack || !recordId) return;
    loadRecords().then((l) => {
      const r = l.find((x) => x.id === recordId);
      if (r) setVm(fromRecord(r)); else setErr('This record is no longer on this phone.');
    }).catch((e) => setErr(e?.message || 'Could not read the record.'));
  }, [pack, recordId]);

  useEffect(() => {
    if (tab !== 'related' || related || !vm) return;
    const query = vm.categoryId ? { issueCategoryId: vm.categoryId } : vm.brand?.id ? { brandId: vm.brand.id } : null;
    if (!query) { setRelated([]); return; }
    searchSolutionPacks({ packType: 'NEW', ...query })
      .then((rows) => setRelated((Array.isArray(rows) ? rows : []).filter((p) => p.id !== vm.id).slice(0, 10)))
      .catch(() => setRelated('error'));
  }, [tab, related, vm]);

  const images = useMemo(() => (vm?.media || []).filter((m) => m.kind === 'image'), [vm]);
  if (err) return <View style={{ flex: 1, backgroundColor: SC.bg, padding: 20 }}><Text style={{ color: SC.muted, textAlign: 'center' }}>{err}</Text></View>;
  if (!vm) return <View style={{ flex: 1, backgroundColor: SC.bg }}><ActivityIndicator color={SC.green} style={{ marginTop: 30 }} /></View>;

  const result = resultOf(vm.result);
  const st = vm.record ? statusMeta(vm.record) : null;
  const sections = [
    ['Fault / Problem', vm.fault, CircleAlert],
    ['Diagnosis / Root Cause', vm.diagnosis, Search],
    ['Repair Solution', vm.solution, Wrench],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: SC.bg }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <DeviceThumb brand={vm.brand} model={vm.model} size={58} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: rf(17), fontWeight: '800', color: SC.ink }} numberOfLines={1}>
                {[vm.brand?.name, vm.model?.name].filter(Boolean).join(' ') || 'Device'}
              </Text>
              {result ? <Badge label={result.short} tone={result.key === 'fixed' ? 'ok' : 'warn'} /> : null}
            </View>
            <Text style={{ fontSize: rf(13), color: SC.ink, marginTop: 3 }} numberOfLines={2}>{vm.title}</Text>
            {vm.category ? <Text style={{ fontSize: rf(11.5), color: SC.muted, marginTop: 2 }}>{vm.category}</Text> : null}
            {st ? <Text style={{ fontSize: rf(11), color: st.tone === 'ok' ? SC.ok : SC.warn, marginTop: 2, fontWeight: '700' }}>{st.label} · {st.where}</Text> : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: SC.border, borderRadius: 22, padding: 3, marginBottom: 12 }}>
          {[['details', 'Details'], ['media', `Media (${vm.media.length})`], ['related', 'Related']].map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setTab(k)} style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 18, backgroundColor: tab === k ? SC.green : 'transparent' }}>
              <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: tab === k ? '#FFFFFF' : SC.ink }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'details' ? (
          <>
            {sections.map(([label, text, Icon]) => (
              <Card key={label}>
                <Head icon={Icon} label={label} />
                <Text style={{ fontSize: rf(12.5), color: text ? '#374151' : SC.faint, lineHeight: rf(18) }}>{text || 'Not recorded'}</Text>
              </Card>
            ))}
            <Card>
              <Head icon={ListOrdered} label="Repair Steps" />
              {vm.steps.length ? vm.steps.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: i ? 8 : 0 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: SC.green, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: rf(10.5), fontWeight: '800' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: rf(12.5), color: SC.ink, lineHeight: rf(18) }}>{s}</Text>
                </View>
              )) : <Text style={{ fontSize: rf(12.5), color: SC.faint }}>Not recorded</Text>}
            </Card>
            {vm.parts ? <Card><Head icon={Package} label="Parts Used" /><Text style={{ fontSize: rf(12.5), color: '#374151' }}>{vm.parts}</Text></Card> : null}
            {vm.resultText ? <Card><Head icon={ClipboardCheck} label="Testing Result" /><Text style={{ fontSize: rf(12.5), color: '#374151' }}>{vm.resultText}</Text></Card> : null}
          </>
        ) : null}

        {tab === 'media' ? (
          <>
            {vm.media.length === 0 ? <Text style={{ textAlign: 'center', color: SC.muted, paddingVertical: 20 }}>No media attached</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {images.map((m, i) => (
                <TouchableOpacity key={i} onPress={() => setViewerAt(i)} style={{ width: '33.33%', padding: 4 }}>
                  <Image source={{ uri: m.uri }} style={{ width: '100%', aspectRatio: 0.9, borderRadius: 10, backgroundColor: SC.soft }} />
                  {m.label ? <Text style={{ fontSize: rf(11), color: SC.ink, textAlign: 'center', marginTop: 3, fontWeight: '600' }} numberOfLines={1}>{m.label}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
            {vm.media.filter((m) => m.kind === 'audio').map((m, i) => <AudioRow key={`a${i}`} uri={m.uri} label="Voice note" />)}
            {vm.media.filter((m) => m.kind === 'video').map((m, i) => (
              <TouchableOpacity
                key={`v${i}`}
                disabled={!m.remote}
                onPress={() => openExternalUrl(m.uri)}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: SC.soft, borderRadius: 10, padding: 8, marginTop: 8 }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: SC.green, alignItems: 'center', justifyContent: 'center' }}>
                  {m.remote ? <Play size={15} color="#FFFFFF" /> : <VideoIcon size={15} color="#FFFFFF" />}
                </View>
                <Text style={{ flex: 1, marginLeft: 10, fontSize: rf(12.5), color: SC.ink }}>{m.remote ? 'Video — tap to play' : 'Video saved on this phone'}</Text>
              </TouchableOpacity>
            ))}
            <ImageViewerModal visible={viewerAt >= 0} images={images.map((m) => ({ uri: m.uri, label: m.label }))} index={Math.max(viewerAt, 0)} onClose={() => setViewerAt(-1)} />
          </>
        ) : null}

        {tab === 'related' ? (
          related === null ? <ActivityIndicator color={SC.green} style={{ marginTop: 20 }} />
            : related === 'error' ? <Text style={{ textAlign: 'center', color: '#B91C1C', paddingVertical: 20 }}>Could not load related solutions.</Text>
              : related.length === 0 ? <Text style={{ textAlign: 'center', color: SC.muted, paddingVertical: 20 }}>No related solutions yet.</Text>
                : related.map((p) => <ReferenceCard key={p.id} pack={p} onPress={() => navigation.push('SolutionPackDetails', { pack: p })} />)
        ) : null}
      </ScrollView>
    </View>
  );
}

function Head({ icon: Icon, label }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
      <Icon size={16} color={SC.green} />
      <Text style={{ marginLeft: 8, fontSize: rf(13.5), fontWeight: '800', color: SC.ink }}>{label}</Text>
    </View>
  );
}
