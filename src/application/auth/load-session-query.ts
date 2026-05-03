import type { AuthSession } from '../../domain/auth/auth-session.ts';

type SessionPayloadInput = {
  kind: AuthSession['kind'];
  userId?: number;
  displayName?: string;
  isAuthenticated?: boolean;
};

export type SessionPayload = {
  kind: AuthSession['kind'];
  isAuthenticated: boolean;
  userId?: number;
  displayName?: string;
};

export function createSessionPayload(input: SessionPayloadInput): SessionPayload {
  const isAuthenticated = input.isAuthenticated ?? input.kind !== 'guest';

  return {
    kind: input.kind,
    isAuthenticated,
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
  };
}

export function createGuestSessionPayload(): SessionPayload {
  return createSessionPayload({ kind: 'guest', isAuthenticated: false });
}
