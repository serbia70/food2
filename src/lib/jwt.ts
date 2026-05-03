import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

export interface AdminToken {
  shopId: string;
  shopName: string;
  id: number;
}

export function verifyAdminToken(token: string): AdminToken | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AdminToken;
  } catch {
    return null;
  }
}

export function generateAdminToken(payload: AdminToken): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
