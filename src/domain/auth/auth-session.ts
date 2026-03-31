import { z } from 'zod';

export const authSessionSchema = z
  .object({
    kind: z.enum(['guest', 'user', 'admin', 'master', 'rider']),
    isAuthenticated: z.boolean(),
    token: z.string().min(1).optional(),
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
      return;
    }

    if (value.kind !== 'guest' && value.isAuthenticated) {
      if (value.token === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'authenticated non-guest session requires token',
          path: ['token'],
        });
      }
      if (value.userId === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'authenticated non-guest session requires userId',
          path: ['userId'],
        });
      }
    }
  });

export type AuthSession = z.infer<typeof authSessionSchema>;

export function parseAuthSession(input: unknown): AuthSession {
  return authSessionSchema.parse(input);
}
