import crypto from 'node:crypto';

export type RiderTelegramBindPayload = {
  riderId: number;
  riderPhone?: string;
  expiresAt: string;
};

type RiderTelegramBindCompactPayload = {
  r: number;
  e: number;
};

function signBindBody(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function safeEqualSignature(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function validateBindPayload(payload: RiderTelegramBindPayload): RiderTelegramBindPayload {
  const riderId = Number(payload?.riderId);
  const expiresAt = String(payload?.expiresAt || '').trim();

  if (!Number.isFinite(riderId) || riderId <= 0) throw new Error('invalid_bind_rider_id');
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) throw new Error('invalid_bind_expires_at');

  return { riderId, expiresAt };
}

function toCompactPayload(payload: RiderTelegramBindPayload): RiderTelegramBindCompactPayload {
  return {
    r: payload.riderId,
    e: Date.parse(payload.expiresAt),
  };
}

function fromCompactPayload(payload: RiderTelegramBindCompactPayload): RiderTelegramBindPayload {
  return validateBindPayload({
    riderId: Number(payload?.r),
    expiresAt: new Date(Number(payload?.e)).toISOString(),
  });
}

export function buildRiderTelegramBindToken(payload: RiderTelegramBindPayload, secret: string): string {
  const normalized = validateBindPayload(payload);
  const compact = toCompactPayload(normalized);
  const body = Buffer.from(JSON.stringify(compact), 'utf8').toString('base64url');
  const sig = signBindBody(body, secret).slice(0, 12);
  return `${body}.${sig}`;
}

export function parseRiderTelegramBindToken(token: string, secret: string): RiderTelegramBindPayload {
  const [body, sig] = String(token || '').split('.');
  const expected = signBindBody(body, secret).slice(0, 12);
  if (!body || !sig || !safeEqualSignature(sig, expected)) throw new Error('invalid_bind_signature');
  return fromCompactPayload(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as RiderTelegramBindCompactPayload);
}
