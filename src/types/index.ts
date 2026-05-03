// src/types/index.ts

export interface Shop {
  id: number;
  slug: string;
  name: string;
  category?: string;
  password?: string;
  settings?: string; // JSON string
  mqttSecret?: string;
  expireDate?: string;
  commissionType?: "per_order" | "percentage";
  commissionValue?: number;
  lastPaidMonth?: string;
  tableConfig?: string; // JSON string
  phone?: string;
  status?: "active" | "pending" | "banned";
  enableDelivery?: number; // 0 or 1
  enableDineIn?: number; // 0 or 1
  dineInBillingStartAt?: string;
  dineInExpiresAt?: string;
  dineInGraceUntil?: string;
  dineInDisabledAt?: string;
  dineInStopReason?: "manual" | "auto_expired";
  enableReservation?: number; // 0 or 1
  billingPlanType?: "subscription" | "business";
  billingBalanceRsd?: number;
  deliveryChargeRsd?: number;
  deliveryLocked?: boolean;
  deliveryLockReason?: string;
  ownerUserId?: number;
  deliveryFeeSettings?: string; // JSON string
  city?: string;
  zone?: string;
  deliveryType?: "merchant" | "platform";
  address?: string;
}

export interface Order {
  id: number;
  orderNo: string;
  restaurantId: number;
  shopName?: string;
  shopSlug?: string;
  restaurantName?: string;
  restaurantSlug?: string;
  slug?: string;
  points?: number;
  userPoints?: number;
  pointsBalance?: number;
  isVip?: boolean | number | string;
  vipLevel?: string;
  tableInfo?: string;
  orderType: "dine_in" | "delivery";
  status:
    | "pending"
    | "confirmed"
    | "awaiting_courier"
    | "delivering"
    | "completed"
    | "cancelled"
    | "review_needed"
    | "archived";
  totalAmount: number;
  itemsJson: string; // JSON string
  originalItemsJson?: string; // JSON string
  remarksJson?: string; // JSON string
  userPhone?: string;
  scheduledFor?: string;
  createdAt: string;
  updatedAt?: string;
  isDeleted?: number; // 0 or 1
  deletedAt?: string;
  archived?: number; // 0 or 1
  archivedAt?: string;
  paidAt?: string;
  courierName?: string;
  courierPhone?: string;
  pickupEtaMinutes?: number;
  pickupReadyAt?: string;
  riderBroadcastedAt?: string;
  riderRemindCount?: number;
  riderLastRemindedAt?: string;
  riderContactAttemptedAt?: string;
  modificationCount?: number;
  deliveryFeeStatus?: "pending" | "paid";
  allowAdd?: number; // 0 or 1
}

export interface User {
  id: number;
  phone: string;
  name?: string;
  password?: string;
  lastAddress?: string;
  createdAt: string;
  googleId?: string;
  email?: string;
  avatar?: string;
  role?: "customer" | "merchant" | "admin";
}

export interface Rider {
  id: number;
  name: string;
  phone: string;
  password?: string;
  status: "offline" | "available" | "busy";
  telegramChatId?: string;
  telegramUsername?: string;
  createdAt?: string;
}

export interface Product {
  id: number | string;
  categoryId?: number;
  restaurantId?: number;
  name: string;
  subName?: string;
  price: number;
  img?: string;
  isAvailable?: number; // 0 or 1
  sortOrder?: number;
  stock?: number;
  description?: string;
  // UI helper fields
  image?: string;
  quantity?: number;
  [key: string]: any;
}

export interface Category {
  id: number | string;
  restaurantId?: number;
  name: string;
  subName?: string;
  sortOrder?: number;
  products: Product[];
  // UI helper fields
  icon?: string;
  color?: string;
}

export interface MasterAdmin {
  id: number;
  password?: string;
  settings?: string;
}

// === UI/App Specific Interfaces ===

export interface Zone {
  name: string;
  count: number;
  prefix?: string;
  tables?: (string | number)[];
}

export interface TableConfig {
  zones: Zone[];
}

export interface TableCardData {
  zoneName: string;
  tableNum: string;
  displayNum?: string; // Add this line
  hasOrder: boolean;
  hasReviewRequest: boolean;
  total: number;
  orderTime: string;
  isNew: boolean;
  orderTimeTimestamp: number;
}
