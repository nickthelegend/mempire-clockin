export function receiptDisposition(status: { err: unknown; confirmationStatus?: string | null } | null | undefined): 'unresolved' | 'failed' | 'confirmed' {
  if (!status) return 'unresolved';
  if (status.confirmationStatus !== 'confirmed' && status.confirmationStatus !== 'finalized') return 'unresolved';
  if (status.err != null) return 'failed';
  return status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized' ? 'confirmed' : 'unresolved';
}
