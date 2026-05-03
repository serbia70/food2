function readEnv(): Record<string, string | undefined> {
  return ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
}

function pickFirstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

export function readTelegramCallbackSecret(): string {
  const env = readEnv();
  return pickFirstNonEmpty([
    env.TELEGRAM_CALLBACK_SECRET,
    env.TELEGRAM_WEBHOOK_SECRET,
    env.JWT_SECRET,
    process.env.TELEGRAM_CALLBACK_SECRET,
    process.env.TELEGRAM_WEBHOOK_SECRET,
    process.env.JWT_SECRET,
  ]);
}

export function readTelegramRequestSecret(): string {
  const env = readEnv();
  return pickFirstNonEmpty([
    env.TELEGRAM_WEBHOOK_SECRET,
    env.TELEGRAM_CALLBACK_SECRET,
    process.env.TELEGRAM_WEBHOOK_SECRET,
    process.env.TELEGRAM_CALLBACK_SECRET,
  ]);
}
