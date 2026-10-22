import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { listMyKycDocuments } from '../api/technicianKyc';
import { rf, rlh } from '../utils/responsive';
import { useSecureScreen } from '../utils/secureScreen';

const ORDER = ['aadharFront', 'aadharBack', 'pan'];
const TITLES = {
  aadharFront: 'Aadhar Card Front',
  aadharBack:  'Aadhar Card Back',
  pan:         'PAN Card',
};

function isPdf(url) {
  return typeof url === 'string' && url.toLowerCase().includes('.pdf');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TechnicianKycViewScreen({ route, navigation }) {
  useSecureScreen(); // block screenshots of Aadhaar/PAN
  const fromSubmit = !!route?.params?.fromSubmit;
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const list = await listMyKycDocuments();
      setDocs(Array.isArray(list) ? list : []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const byType = Object.fromEntries(docs.map((d) => [d.docType, d]));
  // Show the known types first (in canonical order), then ANY other stored
  // docType — otherwise a document the shop uploaded under a different key
  // (e.g. "aadhar"/"gst") is invisible and the screen wrongly reads "No documents".
  const orderedDocs = [
    ...ORDER.map((key) => byType[key]).filter(Boolean),
    ...docs.filter((d) => d && !ORDER.includes(d.docType)),
  ];

  const overallStatus = (() => {
    if (orderedDocs.length === 0) return 'NONE';
    if (orderedDocs.some((d) => d.status === 'REJECTED')) return 'REJECTED';
    if (orderedDocs.every((d) => d.status === 'APPROVED')) return 'APPROVED';
    return 'PENDING_REVIEW';
  })();

  // Once KYC documents are on file (uploaded by the shop when the employee was
  // created — or by the employee themselves), the employee side is READ-ONLY.
  // The employee can only upload when nothing is on file yet.
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {/* Status hero */}
        <View style={[
          styles.statusCard,
          overallStatus === 'APPROVED' && styles.statusApproved,
          overallStatus === 'REJECTED' && styles.statusRejected,
          overallStatus === 'PENDING_REVIEW' && styles.statusPending,
          overallStatus === 'NONE' && styles.statusNone,
        ]}>
          <View style={styles.statusIconWrap}>
            <Ionicons
              name={
                overallStatus === 'APPROVED' ? 'shield-checkmark'
                  : overallStatus === 'REJECTED' ? 'close-circle'
                    : overallStatus === 'NONE' ? 'document-text-outline'
                      : 'time'
              }
              size={22}
              color="#FFFFFF"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>
              {overallStatus === 'APPROVED' && 'KYC Approved'}
              {overallStatus === 'REJECTED' && 'KYC Rejected'}
              {overallStatus === 'PENDING_REVIEW' && 'Under Review'}
              {overallStatus === 'NONE' && 'No documents yet'}
            </Text>
            <Text style={styles.statusSub}>
              {fromSubmit && overallStatus === 'PENDING_REVIEW'
                ? 'Thank you! Your documents are now being reviewed by admin.'
                : overallStatus === 'APPROVED' ? 'All documents have been verified.'
                  : overallStatus === 'REJECTED' ? 'One or more documents were rejected. Re-upload them to resubmit for review.'
                    : overallStatus === 'NONE' ? 'Upload your KYC documents to start verification.'
                      : `${orderedDocs.length} document${orderedDocs.length === 1 ? '' : 's'} awaiting admin review.`}
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#035C6C" style={{ marginVertical: 40 }} />
        ) : orderedDocs.length === 0 ? (
          <TouchableOpacity
            style={styles.uploadBtn}
            onPress={() => navigation.navigate('TechnicianKycUpload')}
            activeOpacity={0.85}
          >
            <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
            <Text style={styles.uploadBtnText}>Upload KYC Documents</Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* Locked when approved / under review; re-upload allowed only when a
                document was REJECTED, so the employee is never left at a dead-end. */}
            {overallStatus === 'REJECTED' ? (
              <View style={styles.rejectBanner}>
                <Ionicons name="alert-circle" size={16} color="#D93434" />
                <Text style={styles.rejectBannerText}>
                  A document was rejected. Re-upload it below to resubmit your KYC for review.
                </Text>
              </View>
            ) : (
              <View style={styles.lockBanner}>
                <Ionicons name="lock-closed" size={16} color="#8A6700" />
                <Text style={styles.lockBannerText}>
                  Your KYC documents are on file and managed by your shop. Contact your shop owner to make changes.
                </Text>
              </View>
            )}

            <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>Uploaded Documents</Text>

            <View style={styles.grid}>
              {orderedDocs.map((doc) => {
                const pillStyle =
                  doc.status === 'APPROVED' ? styles.pillApproved
                    : doc.status === 'REJECTED' ? styles.pillRejected
                      : styles.pillPending;
                const pillLabel =
                  doc.status === 'APPROVED' ? 'Approved'
                    : doc.status === 'REJECTED' ? 'Rejected'
                      : 'Pending';
                return (
                  <View key={doc.id || doc.docType} style={styles.cardOuter}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderIcon}>
                        <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
                      </View>
                      <Text style={styles.cardHeaderTitle} numberOfLines={1}>
                        {doc.title || TITLES[doc.docType] || doc.docType}
                      </Text>
                      {doc.required && <Text style={styles.requiredStar}>*</Text>}
                    </View>

                    <View style={styles.preview}>
                      {isPdf(doc.url) ? (
                        <View style={styles.pdfTile}>
                          <View style={styles.pdfBadge}><Text style={styles.pdfBadgeText}>PDF</Text></View>
                          <Text style={styles.pdfName} numberOfLines={2}>
                            {(doc.title || doc.docType).toLowerCase().replace(/\s+/g, '-')}.pdf
                          </Text>
                        </View>
                      ) : (
                        <Image source={{ uri: doc.url }} style={styles.previewImg} />
                      )}
                    </View>

                    <View style={styles.cardFooter}>
                      <View style={[styles.pill, pillStyle]}>
                        <Text style={styles.pillText}>{pillLabel}</Text>
                      </View>
                      <Text style={styles.uploadedDate}>{fmtDate(doc.updatedAt || doc.createdAt)}</Text>
                    </View>
                    {doc.status === 'REJECTED' && doc.rejectReason && (
                      <Text style={styles.rejectReason}>{doc.rejectReason}</Text>
                    )}
                  </View>
                );
              })}
            </View>

            {overallStatus === 'REJECTED' ? (
              <TouchableOpacity
                style={styles.reuploadBtn}
                onPress={() => navigation.navigate('TechnicianKycUpload', { existing: byType })}
                activeOpacity={0.85}
              >
                <Ionicons name="cloud-upload-outline" size={15} color="#FFFFFF" />
                <Text style={styles.reuploadBtnText}>Re-upload Rejected Documents</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 12, paddingBottom: 28 },

  statusCard: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 11,
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  statusApproved: { backgroundColor: '#609138' },
  statusRejected: { backgroundColor: '#F32C26' },
  statusPending:  { backgroundColor: '#035C6C' },
  statusNone:     { backgroundColor: '#6B7280' },
  statusIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontSize: rf(16), fontWeight: '800', color: '#FFFFFF' },
  statusSub: { fontSize: rf(12), color: 'rgba(255,255,255,0.92)', marginTop: 2, lineHeight: rlh(16) },

  lockBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FDF6E0', borderRadius: 12, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#F6DE8D',
  },
  lockBannerText: { flex: 1, fontSize: rf(11.5), color: '#8A6700', fontWeight: '600', lineHeight: rlh(16) },

  rejectBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEECEC', borderRadius: 12, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#FBD0D0',
  },
  rejectBannerText: { flex: 1, fontSize: rf(11.5), color: '#C62E2E', fontWeight: '600', lineHeight: rlh(16) },
  reuploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F32C26', borderRadius: 999, paddingVertical: 10, marginTop: 12,
  },
  reuploadBtnText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '800', letterSpacing: 0.5 },

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionLabel: { fontSize: rf(16), fontWeight: '800', color: '#1C3053' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#E5F3F5', borderRadius: 999 },
  editBtnText: { fontSize: rf(11), color: '#035C6C', fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  cardOuter: { width: '48%', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 7, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  cardHeaderIcon: { width: 18, alignItems: 'center' },
  cardHeaderTitle: { flex: 1, fontSize: rf(11), fontWeight: '700', color: '#111111' },
  requiredStar: { color: '#F32C26', fontWeight: '800', fontSize: rf(12) },

  preview: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#F3F4F6', minHeight: 92 },
  previewImg: { width: '100%', height: 92, resizeMode: 'cover' },
  pdfTile: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, minHeight: 92 },
  pdfBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: '#F32C26' },
  pdfBadgeText: { color: '#FFFFFF', fontSize: rf(10), fontWeight: '800' },
  pdfName: { flex: 1, fontSize: rf(11), color: '#6B7280', fontWeight: '600' },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillApproved: { backgroundColor: '#609138' },
  pillRejected: { backgroundColor: '#F32C26' },
  pillPending:  { backgroundColor: '#FAA700' },
  pillText: { fontSize: rf(9), color: '#FFFFFF', fontWeight: '800' },
  uploadedDate: { flex: 1, fontSize: rf(9), color: '#A3A3A3', fontWeight: '600' },

  rejectReason: { fontSize: rf(10), color: '#F32C26', marginTop: 4, fontStyle: 'italic' },

  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#035C6C',
    borderRadius: 999,
    paddingVertical: 10,
    marginTop: 14,
  },
  uploadBtnText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '800', letterSpacing: 0.5 },

  editLargeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#035C6C',
    borderRadius: 999,
    paddingVertical: 10,
    marginTop: 14,
  },
  editLargeBtnText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '800', letterSpacing: 0.5 },
});
