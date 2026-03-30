import crypto from 'node:crypto';

export type RiderTelegramBindPayload = {
  riderId: number;
  riderPhone: string;
  expiresAt: string;
};

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

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
  const riderPhone = String(payload?.riderPhone || '').trim();
  const expiresAt = String(payload?.expiresAt || '').trim();

  if (!Number.isFinite(riderId) || riderId <= 0) throw new Error('invalid_bind_rider_id');
  if (!riderPhone) throw new Error('invalid_bind_rider_phone');
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) throw new Error('invalid_bind_expires_at');

  return { riderId, riderPhone, expiresAt };
}

export function buildRiderTelegramBindToken(payload: RiderTelegramBindPayload, secret: string): string {
  const normalized = validateBindPayload(payload);
  const body = toBase64Url(JSON.stringify(normalized));
  const sig = signBindBody(body, secret);
  return `${body}.${sig}`;
}

export function parseRiderTelegramBindToken(token: string, secret: string): RiderTelegramBindPayload {
  const [body, sig] = String(token || '').split('.');
  const expected = signBindBody(body, secret);
  if (!body || !sig || !safeEqualSignature(sig, expected)) throw new Error('invalid_bind_signature');
  return validateBindPayload(JSON.parse(fromBase64Url(body)) as RiderTelegramBindPayload);
}
