export interface DispatchDecisionMeta {
  action: 'accepted' | 'declined';
  riderId: string;
  riderName: string;
  riderPhone: string;
  at: string;
}

export interface DispatchTelegramMessageRef {
  chatId: string;
  messageId: number;
}

export interface DispatchMeta {
  lastRiderDecision: DispatchDecisionMeta | null;
  declinedRiderIds: string[];
  currentRiderId: string;
  currentAssignedAt: string;
  currentExpiresAt: string;
  invalidatedRiderIds: string[];
  lastInvalidationReason: 'declined' | 'timeout' | 'reassigned' | null;
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
  telegramMessageRef: DispatchTelegramMessageRef | null;
}

const DISPATCH_META_PREFIX = 'dispatch_meta:';

function createEmptyDispatchMeta(): DispatchMeta {
  return {
    lastRiderDecision: null,
    declinedRiderIds: [],
    currentRiderId: '',
    currentAssignedAt: '',
    currentExpiresAt: '',
    invalidatedRiderIds: [],
    lastInvalidationReason: null,
    acceptedAt: '',
    pickedUpAt: '',
    completedAt: '',
    telegramMessageRef: null,
  };
}

export function parseDispatchTimestamp(value: string | null | undefined): number {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

export function readDispatchMetaFromRemarks(remarksJson: string | null | undefined): DispatchMeta {
  let remarks: unknown[] = [];
  try {
    const parsed = JSON.parse(String(remarksJson || '')) as unknown;
    remarks = Array.isArray(parsed) ? parsed : [];
  } catch {
    remarks = [];
  }

  for (let index = remarks.length - 1; index >= 0; index -= 1) {
    const value = String(remarks[index] || '').trim();
    if (!value.startsWith(DISPATCH_META_PREFIX)) continue;
    try {
      const parsed = JSON.parse(value.slice(DISPATCH_META_PREFIX.length)) as Partial<DispatchMeta>;
      const last = parsed.lastRiderDecision && typeof parsed.lastRiderDecision === 'object'
        ? {
            action: parsed.lastRiderDecision.action === 'accepted' ? 'accepted' : 'declined',
            riderId: String(parsed.lastRiderDecision.riderId || '').trim(),
            riderName: String(parsed.lastRiderDecision.riderName || '').trim(),
            riderPhone: String(parsed.lastRiderDecision.riderPhone || '').trim(),
            at: String(parsed.lastRiderDecision.at || '').trim(),
          }
        : null;

      const lastInvalidationReason = parsed.lastInvalidationReason === 'declined'
        || parsed.lastInvalidationReason === 'timeout'
        || parsed.lastInvalidationReason === 'reassigned'
        ? parsed.lastInvalidationReason
        : null;

      const currentAssignedAt = String(parsed.currentAssignedAt || '').trim();
      const currentExpiresAt = String(parsed.currentExpiresAt || '').trim();
      const acceptedAt = String(parsed.acceptedAt || '').trim();
      const pickedUpAt = String(parsed.pickedUpAt || '').trim();
      const completedAt = String(parsed.completedAt || '').trim();
      const rawTelegramMessageRef = parsed.telegramMessageRef && typeof parsed.telegramMessageRef === 'object'
        ? parsed.telegramMessageRef
        : null;
      const telegramChatId = String(rawTelegramMessageRef?.chatId || '').trim();
      const telegramMessageId = Number(rawTelegramMessageRef?.messageId || 0);
      const telegramMessageRef = telegramChatId && telegramMessageId > 0
        ? {
            chatId: telegramChatId,
            messageId: telegramMessageId,
          }
        : null;

      return {
        lastRiderDecision: last && last.riderId && last.riderName && last.riderPhone && last.at ? last : null,
        declinedRiderIds: Array.isArray(parsed.declinedRiderIds)
          ? parsed.declinedRiderIds.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        currentRiderId: String(parsed.currentRiderId || '').trim(),
        currentAssignedAt: parseDispatchTimestamp(currentAssignedAt) > 0 ? currentAssignedAt : '',
        currentExpiresAt: parseDispatchTimestamp(currentExpiresAt) > 0 ? currentExpiresAt : '',
        invalidatedRiderIds: Array.isArray(parsed.invalidatedRiderIds)
          ? parsed.invalidatedRiderIds.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        lastInvalidationReason,
        acceptedAt: parseDispatchTimestamp(acceptedAt) > 0 ? acceptedAt : '',
        pickedUpAt: parseDispatchTimestamp(pickedUpAt) > 0 ? pickedUpAt : '',
        completedAt: parseDispatchTimestamp(completedAt) > 0 ? completedAt : '',
        telegramMessageRef,
      };
    } catch {
      continue;
    }
  }

  return createEmptyDispatchMeta();
}

export function buildDispatchMetaRemarks(
  remarksJson: string | null | undefined,
  meta: DispatchMeta,
): string[] {
  let remarks: string[] = [];
  try {
    const parsed = JSON.parse(String(remarksJson || '')) as unknown;
    remarks = Array.isArray(parsed) ? parsed.map((item) => String(item || '')).filter(Boolean) : [];
  } catch {
    remarks = [];
  }

  const filtered = remarks.filter((item) => !String(item || '').trim().startsWith(DISPATCH_META_PREFIX));
  filtered.push(`${DISPATCH_META_PREFIX}${JSON.stringify(meta)}`);
  return filtered;
}
