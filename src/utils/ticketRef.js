// Canonical short reference for a ticket, INCLUDING the leading "#".
//
// Prefer the server-assigned trackingId. The deterministic fallback (CSPEN +
// first 8 digits of the UUID) must be identical everywhere the same ticket is
// shown — Home, Task Assign and Task Report previously diverged (Home rendered a
// 12-hex form, the task lists rendered CSPEN), so the same ticket read two
// different ways and couldn't be cross-referenced.
export function ticketRef(t) {
  if (!t) return '#——';
  if (t.trackingId) return `#${t.trackingId}`;
  const digits = String(t.id || '').replace(/[^0-9]/g, '').slice(0, 8);
  return `#CSPEN${digits || '——'}`;
}
