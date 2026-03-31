import { z } from 'zod';

export const orderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'awaitingCourier',
  'delivering',
  'completed',
  'cancelled',
  'reviewNeeded',
  'archived',
  'paid',
]);

export const dispatchStatusSchema = z.enum(['idle', 'active']);

export const riderStatusSchema = z.enum(['offline', 'available', 'busy']);

export const dispatchSchema = z
  .object({
    status: dispatchStatusSchema,
    dispatchRound: z.number().int(),
    currentPoolIndex: z.number().int(),
  })
  .strict();

export const riderSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string().min(1),
    phone: z.string().min(1),
    status: riderStatusSchema,
  })
  .strict();

export const orderSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    orderNo: z.string().min(1),
    status: orderStatusSchema,
    dispatch: dispatchSchema.optional(),
    rider: riderSchema.optional(),
  })
  .strict();

export type DispatchContract = z.infer<typeof dispatchSchema>;
export type RiderContract = z.infer<typeof riderSchema>;
export type OrderContract = z.infer<typeof orderSchema>;

export function parseOrderContract(input: unknown): OrderContract {
  return orderSchema.parse(input);
}
