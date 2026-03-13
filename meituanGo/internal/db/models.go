package db

type Shop struct {
	ID                 int64   `db:"id" json:"id"`
	Name               string  `db:"name" json:"name"`
	Slug               string  `db:"slug" json:"slug"`
	Password           string  `db:"password" json:"-"` // Don't expose password
	Phone              *string `db:"phone" json:"phone"`
	Address            *string `db:"address" json:"address"`
	Status             string  `db:"status" json:"status"`
	Settings           *string `db:"settings" json:"settings"` // JSON string
	ExpireDate         *string `db:"expire_date" json:"expire_date"`
	LastPaidMonth      *string `db:"last_paid_month" json:"last_paid_month"`
	CommissionType     *string `db:"commission_type" json:"commission_type"`
	CommissionValue    *int64  `db:"commission_value" json:"commission_value"`
	EnableDelivery     *int64  `db:"enable_delivery" json:"enable_delivery"`
	EnableDineIn       *int64  `db:"enable_dine_in" json:"enable_dine_in"`
	EnableReservation  *int64  `db:"enable_reservation" json:"enable_reservation"`
	BillingPlanType    *string `db:"-" json:"billing_plan_type,omitempty"`
	BillingBalanceRSD  *int64  `db:"-" json:"billing_balance_rsd,omitempty"`
	DeliveryChargeRSD  *int64  `db:"-" json:"delivery_charge_rsd,omitempty"`
	DeliveryLocked     *bool   `db:"-" json:"delivery_locked,omitempty"`
	DeliveryLockReason *string `db:"-" json:"delivery_lock_reason,omitempty"`
	MQTTSecret         *string `db:"mqtt_secret" json:"mqtt_secret,omitempty"`
	TableConfig        *string `db:"table_config" json:"table_config,omitempty"`
	DeliveryCount      *int64  `db:"delivery_count" json:"delivery_count"`
	TotalRevenue       *int64  `db:"total_revenue" json:"total_revenue"`
	CreatedAt          *string `db:"created_at" json:"created_at"`
	UpdatedAt          *string `db:"updated_at" json:"updated_at"`
}

type Category struct {
	ID           int64     `db:"id" json:"id"`
	ShopID       int64     `db:"shop_id" json:"shop_id"`
	RestaurantID *int64    `db:"restaurant_id" json:"restaurant_id,omitempty"`
	Name         string    `db:"name" json:"name"`
	SubName      *string   `db:"sub_name" json:"sub_name,omitempty"`
	SortOrder    int       `db:"sort_order" json:"sort_order"`
	CreatedAt    *string   `db:"created_at" json:"created_at"`
	UpdatedAt    *string   `db:"updated_at" json:"updated_at"` // Fix null scan error
	Products     []Product `json:"products,omitempty"`         // For nesting in API
}

type Product struct {
	ID           int64   `db:"id" json:"id"`
	CategoryID   *int64  `db:"category_id" json:"category_id"`
	ShopID       int64   `db:"shop_id" json:"shop_id"`
	RestaurantID *int64  `db:"restaurant_id" json:"restaurant_id,omitempty"`
	Name         string  `db:"name" json:"name"`
	SubName      *string `db:"sub_name" json:"sub_name"`
	Price        int64   `db:"price" json:"price"` // In cents
	Img          *string `db:"img" json:"img"`
	Description  *string `db:"description" json:"description"`
	IsAvailable  int     `db:"is_available" json:"is_available"`
	SortOrder    int     `db:"sort_order" json:"sort_order"`
	Stock        *int64  `db:"stock" json:"stock,omitempty"`
	CreatedAt    *string `db:"created_at" json:"created_at"`
	UpdatedAt    *string `db:"updated_at" json:"updated_at"` // Fix null scan error
}

type Order struct {
	ID                int64   `db:"id" json:"id"`
	OrderNo           string  `db:"order_no" json:"order_no"`
	ShopID            int64   `db:"shop_id" json:"shop_id"`
	RestaurantID      *int64  `db:"restaurant_id" json:"restaurant_id,omitempty"`
	TableInfo         *string `db:"table_info" json:"table_info"`
	OrderType         string  `db:"order_type" json:"order_type"`
	Status            string  `db:"status" json:"status"`
	PrintStatus       string  `db:"print_status" json:"print_status"`
	TotalAmount       int64   `db:"total_amount" json:"total_amount"`
	ItemsJSON         string  `db:"items_json" json:"items_json"`
	OriginalItems     *string `db:"original_items" json:"original_items,omitempty"`
	OriginalItemsJSON *string `db:"original_items_json" json:"original_items_json,omitempty"`
	RemarksJSON       *string `db:"remarks_json" json:"remarks_json"`
	UserPhone         *string `db:"user_phone" json:"user_phone"`
	ScheduledFor      *string `db:"scheduled_for" json:"scheduled_for,omitempty"`
	CreatedAt         *string `db:"created_at" json:"created_at"`
	UpdatedAt         *string `db:"updated_at" json:"updated_at"` // Fix null scan error
	CourierPhone      *string `db:"courier_phone" json:"courier_phone"`
	CourierName       *string `db:"courier_name" json:"courier_name"`
	Archived          *int64  `db:"archived" json:"archived"`
	ArchivedAt        *string `db:"archived_at" json:"archived_at"`
	PaidAt            *string `db:"paid_at" json:"paid_at,omitempty"`
	IsDeleted         *int64  `db:"is_deleted" json:"is_deleted"`
	DeletedAt         *string `db:"deleted_at" json:"deleted_at"`
	ModificationCount *int64  `db:"modification_count" json:"modification_count,omitempty"`
	DeliveryFeeStatus *string `db:"delivery_fee_status" json:"delivery_fee_status,omitempty"`
	AllowAdd          *int64  `db:"allow_add" json:"allow_add,omitempty"`
	DeliveryInfo      *string `db:"delivery_info" json:"delivery_info,omitempty"`
}

type User struct {
	ID           int64   `db:"id" json:"id"`
	Phone        *string `db:"phone" json:"phone"`
	Name         *string `db:"name" json:"name"`
	Password     *string `db:"password" json:"-"`
	LoginAccount *string `db:"login_account" json:"login_account"`
	LastAddress  *string `db:"last_address" json:"last_address"`
	Email        *string `db:"email" json:"email"`
	Avatar       *string `db:"avatar" json:"avatar"`
	CreatedAt    *string `db:"created_at" json:"created_at"`
}

type Rider struct {
	ID        int64   `db:"id" json:"id"`
	Name      string  `db:"name" json:"name"`
	Phone     string  `db:"phone" json:"phone"`
	Password  *string `db:"password" json:"-"`
	Status    string  `db:"status" json:"status"`
	CreatedAt *string `db:"created_at" json:"created_at"`
}

type Reservation struct {
	ID              int64   `db:"id" json:"id"`
	ShopID          int64   `db:"shop_id" json:"shop_id"`
	GuestCount      int     `db:"guest_count" json:"guest_count"`
	ReservationTime string  `db:"reservation_time" json:"reservation_time"`
	CustomerPhone   string  `db:"customer_phone" json:"customer_phone"`
	DineType        string  `db:"dine_type" json:"dine_type"`
	CustomerName    *string `db:"customer_name" json:"customer_name,omitempty"`
	ItemsJSON       *string `db:"items_json" json:"items_json,omitempty"`
	Remarks         *string `db:"remarks" json:"remarks,omitempty"`
	Status          string  `db:"status" json:"status"`
	CreatedAt       *string `db:"created_at" json:"created_at"`
	UpdatedAt       *string `db:"updated_at" json:"updated_at"`
}
