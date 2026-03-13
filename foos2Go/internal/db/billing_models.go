package db

type BillingAccount struct {
	ID             int64   `db:"id" json:"id"`
	ShopID         int64   `db:"shop_id" json:"shop_id"`
	PlanType       string  `db:"plan_type" json:"plan_type"`
	BalanceRSD     int64   `db:"balance_rsd" json:"balance_rsd"`
	NextChargeDate *string `db:"next_charge_date" json:"next_charge_date"`
	GraceUntil     *string `db:"grace_until" json:"grace_until"`
	BillingStatus  string  `db:"billing_status" json:"billing_status"`
	CreatedAt      *string `db:"created_at" json:"created_at"`
	UpdatedAt      *string `db:"updated_at" json:"updated_at"`
}

type BillingLedgerEntry struct {
	ID             int64    `db:"id" json:"id"`
	ShopID         int64    `db:"shop_id" json:"shop_id"`
	EntryType      string   `db:"entry_type" json:"entry_type"`
	AmountRSD      int64    `db:"amount_rsd" json:"amount_rsd"`
	SourceCurrency *string  `db:"source_currency" json:"source_currency"`
	SourceAmount   *float64 `db:"source_amount" json:"source_amount"`
	FXRate         *float64 `db:"fx_rate" json:"fx_rate"`
	Note           *string  `db:"note" json:"note"`
	CreatedAt      *string  `db:"created_at" json:"created_at"`
}

type OrderDailyStat struct {
	ID         int64   `db:"id" json:"id"`
	ShopID     int64   `db:"shop_id" json:"shop_id"`
	StatDate   string  `db:"stat_date" json:"stat_date"`
	OrderType  string  `db:"order_type" json:"order_type"`
	OrderCount int64   `db:"order_count" json:"order_count"`
	TotalRSD   int64   `db:"total_rsd" json:"total_rsd"`
	CreatedAt  *string `db:"created_at" json:"created_at"`
	UpdatedAt  *string `db:"updated_at" json:"updated_at"`
}
