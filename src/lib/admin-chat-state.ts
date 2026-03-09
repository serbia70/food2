type ChatMessageLike = {
  sender_phone?: unknown;
  created_at?: unknown;
};

type UnreadMap = Record<string, number>;

function toPhone(value: unknown): string {
  return String(value || '').trim();
}

function toTimestamp(value: unknown): number {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function chooseChatPhoneOnOpen(lastUnreadPhone: string): string {
  return toPhone(lastUnreadPhone);
}

export function buildRecentChatPhones(messages: ChatMessageLike[], unreadByPhone: UnreadMap = {}): string[] {
  const latestByPhone = new Map<string, number>();

  for (const message of messages || []) {
    const phone = toPhone(message?.sender_phone);
    if (!phone) continue;
    const timestamp = toTimestamp(message?.created_at);
    const previous = latestByPhone.get(phone) || 0;
    if (timestamp >= previous) latestByPhone.set(phone, timestamp);
  }

  return Array.from(latestByPhone.entries())
    .sort((a, b) => {
      const unreadDiff = (Number(unreadByPhone[b[0]] || 0) - Number(unreadByPhone[a[0]] || 0));
      if (unreadDiff !== 0) return unreadDiff;
      const timeDiff = b[1] - a[1];
      if (timeDiff !== 0) return timeDiff;
      return a[0].localeCompare(b[0]);
    })
    .map(([phone]) => phone);
}
