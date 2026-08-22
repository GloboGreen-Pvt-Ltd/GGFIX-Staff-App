import { ticketApi } from './client';

// Technician personal KYC documents — backed by ticket-service
// /technicians/me/kyc-documents (controller: TechnicianKycDocumentController,
// entity: technician_kyc_documents, migration 42).
//
// Employee app only uploads Aadhar (front + back) + PAN; the controller is
// type-agnostic so any docType is accepted, but the upload screen restricts
// the picker to those three.

function unwrap(list) {
  return Array.isArray(list) ? list : (list?.content ?? list?.data ?? []);
}

export async function listMyKycDocuments() {
  return unwrap(await ticketApi.get('/technicians/me/kyc-documents'));
}

export async function saveMyKycDocuments(documents) {
  return await ticketApi.post('/technicians/me/kyc-documents', { body: { documents } });
}

export async function deleteMyKycDocument(docType) {
  return await ticketApi.del(`/technicians/me/kyc-documents/${encodeURIComponent(docType)}`);
}
