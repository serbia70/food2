import { z } from 'zod';

export const masterSettingsSchema = z
  .object({
    mqttBroker: z.string().min(1),
    defaultShopTier: z.string().min(1),
  })
  .strict();

export type MasterSettingsContract = z.infer<typeof masterSettingsSchema>;

export function parseMasterSettingsContract(input: unknown): MasterSettingsContract {
  return masterSettingsSchema.parse(input);
}
