import { z } from 'zod';

export const authSessionSchema = z
  .object({
    kind: z.enum(['guest', 'user', 'admin', 'master', 'rider']),
    isAuthenticated: z.boolean(),
    userId: z.number().int().optional(),
    displayName: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'guest' && value.isAuthenticated) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'guest session cannot be authenticated',
      });
    }
  });

export type AuthSession = z.infer<typeof authSessionSchema>;

export function parseAuthSession(input: unknown): AuthSession {
  return authSessionSchema.parse(input);
}
