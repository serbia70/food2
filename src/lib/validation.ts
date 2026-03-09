import { z } from "zod";

// ==========================================
// Order Validation Schemas
// ==========================================

export const OrderItemSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string().min(1, "Product name is required"),
  subName: z.string().nullable().optional(),
  price: z.number().min(0),
  quantity: z.number().int().positive(),
  image: z.string().nullable().optional(),
});

export const UserInfoSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(6, "Phone number is too short"),
  address: z.string().optional(),
  password: z.string().optional(),
});

export const OrderRequestSchema = z.object({
  restaurantId: z.union([z.string(), z.number()]),
  items: z.union([
    z.record(z.string(), OrderItemSchema), // Record<string, OrderItem>
    z.array(OrderItemSchema), // OrderItem[]
  ]),
  total: z.number().min(0),
  type: z.enum(["dine_in", "delivery"]),
  info: z.string().optional().default(""),
  user: UserInfoSchema.optional(),
  remarks: z.array(z.any()).optional(),
  status: z.string().optional(),
  isAdmin: z.boolean().optional(),
  note: z.string().optional(),
});

// Export inferred types for frontend use
export type OrderRequestInput = z.infer<typeof OrderRequestSchema>;
export type OrderItemInput = z.infer<typeof OrderItemSchema>;
export type UserInfoInput = z.infer<typeof UserInfoSchema>;

// ==========================================
// Auth Validation Schemas
// ==========================================

export const LoginSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(1, "Password is required"),
});

export const RegisterSchema = z.object({
  phone: z.string().min(6, "Phone must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  address: z.string().optional(),
});

export const AdminLoginSchema = z.object({
  shopId: z.string().min(1, "Shop ID is required"),
  password: z.string().min(1, "Password is required"),
});

export const RiderAuthSchema = z
  .object({
    action: z.enum(["login", "register"]),
    name: z.string().optional(),
    phone: z.string().min(1, "Phone is required"),
    password: z.string().min(1, "Password is required"),
  })
  .refine(
    (data) => {
      if (data.action === "register" && !data.name) return false;
      return true;
    },
    {
      message: "Name is required for registration",
      path: ["name"],
    },
  );

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
export type RiderAuthInput = z.infer<typeof RiderAuthSchema>;

// ==========================================
// Admin/Shop Schemas
// ==========================================

export const ShopUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(4).optional(),
  settings: z.any().optional(), // Can be refined later
  status: z.enum(["active", "pending", "banned"]).optional(),
});

export type ShopUpdateInput = z.infer<typeof ShopUpdateSchema>;

// ==========================================
// Query Params Schemas
// ==========================================

export const ShopIdQuerySchema = z.object({
  shopId: z.string().min(1, "shopId is required"),
});

export const StatsQuerySchema = z.object({
  shopId: z.string().min(1, "shopId is required"),
  start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date format (YYYY-MM-DD)"),
  end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date format (YYYY-MM-DD)"),
  type: z.enum(["all", "delivery", "dine_in"]).optional().default("all"),
});

// ==========================================
// Archive Schemas
// ==========================================

export const ArchiveActionSchema = z.object({
  action: z.enum(["archive", "delete_archived", "stats"]),
  restaurantId: z.union([z.string(), z.number()]),
  months: z.number().optional().default(3),
});

export type ArchiveActionInput = z.infer<typeof ArchiveActionSchema>;

/**
 * Helper to validate request body
 */
export async function validateBody<T>(
  request: Request,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const data = await request.json();
  return schema.parse(data);
}

/**
 * Helper to validate URL search params
 */
export function validateQuery<T>(url: URL, schema: z.ZodSchema<T>): T {
  const params = Object.fromEntries(url.searchParams.entries());
  return schema.parse(params);
}