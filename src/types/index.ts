// src/types/index.ts

export interface Shop {
  id: number;
  slug: string;
  name: string;
  category?: string;
  password?: string;
  settings?: string; // JSON string
  mqtt_secret?: string;
  expire_date?: string;
  commission_type?: "per_order" | "percentage";
  commission_value?: number;
  last_paid_month?: string;
  table_config?: string; // JSON string
  phone?: string;
  status?: "active" | "pending" | "banned";
  enable_delivery?: number; // 0 or 1
  enable_dine_in?: number; // 0 or 1
  dine_in_billing_start_at?: string;
  dine_in_expires_at?: string;
  dine_in_grace_until?: string;
  dine_in_disabled_at?: string;
  dine_in_stop_reason?: "manual" | "auto_expired";
  enable_reservation?: number; // 0 or 1
  billing_plan_type?: "subscription" | "business";
  billing_balance_rsd?: number;
  delivery_charge_rsd?: number;
  delivery_locked?: boolean;
  delivery_lock_reason?: string;
  owner_user_id?: number;
  delivery_fee_settings?: string; // JSON string
  city?: string;
  zone?: string;
  delivery_type?: "merchant" | "platform";
  address?: string;
}

export interface Order {
  id: number;
  order_no: string;
  restaurant_id: number;
  shop_name?: string;
  shop_slug?: string;
  restaurant_name?: string;
  restaurant_slug?: string;
  slug?: string;
  points?: number;
  user_points?: number;
  points_balance?: number;
  is_vip?: boolean | number | string;
  vip_level?: string;
  table_info?: string;
  order_type: "dine_in" | "delivery";
  status:
    | "pending"
    | "confirmed"
    | "awaiting_courier"
    | "delivering"
    | "completed"
    | "cancelled"
    | "review_needed"
    | "archived";
  total_amount: number;
  items_json: string; // JSON string
  original_items_json?: string; // JSON string
  remarks_json?: string; // JSON string
  user_phone?: string;
  scheduled_for?: string;
  created_at: string;
  updated_at?: string;
  is_deleted?: number; // 0 or 1
  deleted_at?: string;
  archived?: number; // 0 or 1
  archived_at?: string;
  paid_at?: string;
  courier_name?: string;
  courier_phone?: string;
  pickup_eta_minutes?: number;
  pickup_ready_at?: string;
  rider_broadcasted_at?: string;
  rider_remind_count?: number;
  rider_last_reminded_at?: string;
  rider_contact_attempted_at?: string;
  modification_count?: number;
  delivery_fee_status?: "pending" | "paid";
  allow_add?: number; // 0 or 1
}

export interface User {
  id: number;
  phone: string;
  name?: string;
  password?: string;
  last_address?: string;
  created_at: string;
  google_id?: string;
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
  telegram_chat_id?: string;
  telegram_username?: string;
  created_at?: string;
}

export interface Product {
  id: number | string;
  category_id?: number;
  restaurant_id?: number;
  name: string;
  sub_name?: string;
  price: number;
  img?: string;
  is_available?: number; // 0 or 1
  sort_order?: number;
  stock?: number;
  description?: string;
  // UI helper fields
  image?: string;
  quantity?: number;
  [key: string]: any;
}

export interface Category {
  id: number | string;
  restaurant_id?: number;
  name: string;
  sub_name?: string;
  subName?: string;
  sort_order?: number;
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
