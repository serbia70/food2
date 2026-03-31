import { z } from 'zod';

export const menuProductSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string().min(1),
    price: z.number(),
    imageUrl: z.string().min(1).optional(),
  })
  .strict();

export const menuCategorySchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string().min(1),
    products: z.array(menuProductSchema),
  })
  .strict();

export const shopSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    slug: z.string().min(1),
    name: z.string().min(1),
    deliveryEnabled: z.boolean().optional(),
    footerPhone: z.string().min(1).optional(),
  })
  .strict();

export type MenuProductContract = z.infer<typeof menuProductSchema>;
export type MenuCategoryContract = z.infer<typeof menuCategorySchema>;
export type ShopContract = z.infer<typeof shopSchema>;

export function parseShopContract(input: unknown): ShopContract {
  return shopSchema.parse(input);
}

export function parseMenuContract(input: unknown): MenuCategoryContract[] {
  return z.array(menuCategorySchema).parse(input);
}
