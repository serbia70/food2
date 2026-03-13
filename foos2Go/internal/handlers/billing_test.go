package handlers

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func setupBillingTestDB(t *testing.T) int64 {
	t.Helper()

	gin.SetMode(gin.TestMode)
	dbPath := filepath.Join(t.TempDir(), "billing-handler-test.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	res, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status) VALUES (?, ?, ?, 'active')", "Test Shop", "test-shop", "admin")
	if err != nil {
		t.Fatalf("insert shop failed: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func newTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	return c, w
}

func decodeResponseMap(t *testing.T, w *httptest.ResponseRecorder) map[string]interface{} {
	t.Helper()

	var data map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatalf("decode response failed: %v; raw=%s", err, w.Body.String())
	}
	return data
}

func TestBillingHandlers_SetPlanAndGetBilling(t *testing.T) {
	shopID := setupBillingTestDB(t)

	cSet, wSet := newTestContext()
	handleSetShopPlan(cSet, []byte(`{"id":`+toJSONInt(shopID)+`,"planType":"subscription"}`))
	if wSet.Code != 200 {
		t.Fatalf("set plan status=%d body=%s", wSet.Code, wSet.Body.String())
	}

	var plan string
	if err := db.DB.Get(&plan, "SELECT plan_type FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query plan_type failed: %v", err)
	}
	if plan != "subscription" {
		t.Fatalf("expected plan_type=subscription, got %s", plan)
	}

	cGet, wGet := newTestContext()
	handleGetShopBilling(cGet, []byte(`{"id":`+toJSONInt(shopID)+`}`))
	if wGet.Code != 200 {
		t.Fatalf("get billing status=%d body=%s", wGet.Code, wGet.Body.String())
	}

	resp := decodeResponseMap(t, wGet)
	if resp["billing_currency"] != "RSD" {
		t.Fatalf("expected billing_currency=RSD, got %v", resp["billing_currency"])
	}
	if _, ok := resp["subscription_fee_rsd"]; !ok {
		t.Fatalf("expected subscription_fee_rsd in response")
	}
}

func TestBillingHandlers_SetPlanBusiness(t *testing.T) {
	shopID := setupBillingTestDB(t)

	cSet, wSet := newTestContext()
	handleSetShopPlan(cSet, []byte(`{"id":`+toJSONInt(shopID)+`,"planType":"business"}`))
	if wSet.Code != 200 {
		t.Fatalf("set business plan status=%d body=%s", wSet.Code, wSet.Body.String())
	}

	var plan string
	if err := db.DB.Get(&plan, "SELECT plan_type FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query plan_type failed: %v", err)
	}
	if plan != "business" {
		t.Fatalf("expected plan_type=business, got %s", plan)
	}
}

func TestCalculateProratedUpgradeChargeRoundsToInteger(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	charge := calculateProratedUpgradeCharge(now, 1200, 1800)
	if charge != 329 {
		t.Fatalf("expected prorated charge rounded to 329, got %d", charge)
	}
}

func TestUpgradeShopPlanToBusinessNow_DeductsProratedCharge(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"subscription_fee_rsd": 1200, "business_fee_rsd": 1800})

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'subscription', 1000, '2026-02-01', 'active')
		ON CONFLICT(shop_id) DO UPDATE SET plan_type = excluded.plan_type, balance_rsd = excluded.balance_rsd
	`, shopID); err != nil {
		t.Fatalf("seed billing account failed: %v", err)
	}

	now := time.Date(2026, 1, 15, 9, 0, 0, 0, time.UTC)
	charge, billing, err := upgradeShopPlanToBusinessNow(shopID, now)
	if err != nil {
		t.Fatalf("upgradeShopPlanToBusinessNow failed: %v", err)
	}
	if charge != 329 {
		t.Fatalf("expected charge 329, got %d", charge)
	}
	if billing.PlanType != "business" {
		t.Fatalf("expected plan business after upgrade, got %s", billing.PlanType)
	}
	if billing.BalanceRSD != 671 {
		t.Fatalf("expected balance 671 after charge, got %d", billing.BalanceRSD)
	}

	var row struct {
		EntryType string `db:"entry_type"`
		AmountRSD int64  `db:"amount_rsd"`
	}
	if err := db.DB.Get(&row, "SELECT entry_type, amount_rsd FROM billing_ledger WHERE shop_id = ? ORDER BY id DESC LIMIT 1", shopID); err != nil {
		t.Fatalf("query upgrade ledger failed: %v", err)
	}
	if row.EntryType != "plan_upgrade_prorated" || row.AmountRSD != -329 {
		t.Fatalf("unexpected upgrade ledger row: %+v", row)
	}
}

func TestUpgradeShopPlanToBusinessNow_InsufficientBalance(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"subscription_fee_rsd": 1200, "business_fee_rsd": 1800})

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'subscription', 100, '2026-02-01', 'active')
		ON CONFLICT(shop_id) DO UPDATE SET plan_type = excluded.plan_type, balance_rsd = excluded.balance_rsd
	`, shopID); err != nil {
		t.Fatalf("seed billing account failed: %v", err)
	}

	_, _, err := upgradeShopPlanToBusinessNow(shopID, time.Date(2026, 1, 15, 9, 0, 0, 0, time.UTC))
	if !errors.Is(err, errPlanUpgradeInsufficient) {
		t.Fatalf("expected errPlanUpgradeInsufficient, got %v", err)
	}
}

func TestScheduleShopPlanDowngrade_SetsPendingPlan(t *testing.T) {
	shopID := setupBillingTestDB(t)

	if _, err := db.DB.Exec(`
		INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
		VALUES (?, 'business', 1000, '2026-02-01', 'active')
		ON CONFLICT(shop_id) DO UPDATE SET plan_type = excluded.plan_type, balance_rsd = excluded.balance_rsd
	`, shopID); err != nil {
		t.Fatalf("seed billing account failed: %v", err)
	}

	billing, err := scheduleShopPlanDowngrade(shopID)
	if err != nil {
		t.Fatalf("scheduleShopPlanDowngrade failed: %v", err)
	}
	if billing.PendingPlanType == nil || *billing.PendingPlanType != "subscription" {
		t.Fatalf("expected pending_plan_type subscription, got %v", billing.PendingPlanType)
	}
}

func TestBillingHandlers_SetPlanRejectsFreePlan(t *testing.T) {
	shopID := setupBillingTestDB(t)

	cSet, wSet := newTestContext()
	handleSetShopPlan(cSet, []byte(`{"id":`+toJSONInt(shopID)+`,"planType":"free"}`))
	if wSet.Code != 400 {
		t.Fatalf("set free plan should be rejected, got status=%d body=%s", wSet.Code, wSet.Body.String())
	}
}

func TestBillingHandlers_GetBillingBootstrapsAccount(t *testing.T) {
	shopID := setupBillingTestDB(t)

	var countBefore int
	if err := db.DB.Get(&countBefore, "SELECT COUNT(*) FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query account count failed: %v", err)
	}
	if countBefore != 0 {
		t.Fatalf("expected no account before bootstrap, got %d", countBefore)
	}

	cGet, wGet := newTestContext()
	handleGetShopBilling(cGet, []byte(`{"id":`+toJSONInt(shopID)+`}`))
	if wGet.Code != 200 {
		t.Fatalf("get billing status=%d body=%s", wGet.Code, wGet.Body.String())
	}

	var countAfter int
	if err := db.DB.Get(&countAfter, "SELECT COUNT(*) FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query account count after bootstrap failed: %v", err)
	}
	if countAfter != 1 {
		t.Fatalf("expected account created by bootstrap, got %d", countAfter)
	}
}

func TestBillingHandlers_NotFoundShopReturns404(t *testing.T) {
	_ = setupBillingTestDB(t)

	c, w := newTestContext()
	handleGetShopBilling(c, []byte(`{"id":999999}`))
	if w.Code != 404 {
		t.Fatalf("expected 404 for unknown shop, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBillingHandlers_SetPlanNotFoundShopReturns404(t *testing.T) {
	_ = setupBillingTestDB(t)

	c, w := newTestContext()
	handleSetShopPlan(c, []byte(`{"id":999999,"planType":"subscription"}`))
	if w.Code != 404 {
		t.Fatalf("expected 404 for unknown shop in set plan, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBillingHandlers_AdjustBalanceAndLedger(t *testing.T) {
	shopID := setupBillingTestDB(t)

	c1, w1 := newTestContext()
	handleAdjustShopBalance(c1, []byte(`{"id":`+toJSONInt(shopID)+`,"amountRsd":2000,"entryType":"manual_topup"}`))
	if w1.Code != 200 {
		t.Fatalf("topup status=%d body=%s", w1.Code, w1.Body.String())
	}

	var balance int64
	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query balance failed: %v", err)
	}
	if balance != 2000 {
		t.Fatalf("expected balance=2000, got %d", balance)
	}

	c2, w2 := newTestContext()
	handleAdjustShopBalance(c2, []byte(`{"id":`+toJSONInt(shopID)+`,"amountRsd":-500,"entryType":"manual_debit"}`))
	if w2.Code != 200 {
		t.Fatalf("debit status=%d body=%s", w2.Code, w2.Body.String())
	}

	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query balance after debit failed: %v", err)
	}
	if balance != 1500 {
		t.Fatalf("expected balance=1500, got %d", balance)
	}

	var ledgerCount int
	if err := db.DB.Get(&ledgerCount, "SELECT COUNT(*) FROM billing_ledger WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query ledger count failed: %v", err)
	}
	if ledgerCount != 2 {
		t.Fatalf("expected 2 ledger entries, got %d", ledgerCount)
	}
}

func TestBillingHandlers_AdjustBalanceRejectsNegative(t *testing.T) {
	shopID := setupBillingTestDB(t)

	cTopup, wTopup := newTestContext()
	handleAdjustShopBalance(cTopup, []byte(`{"id":`+toJSONInt(shopID)+`,"amountRsd":100}`))
	if wTopup.Code != 200 {
		t.Fatalf("initial topup status=%d body=%s", wTopup.Code, wTopup.Body.String())
	}

	cDebit, wDebit := newTestContext()
	handleAdjustShopBalance(cDebit, []byte(`{"id":`+toJSONInt(shopID)+`,"amountRsd":-200}`))
	if wDebit.Code != 400 {
		t.Fatalf("expected 400 for overdraft, got %d body=%s", wDebit.Code, wDebit.Body.String())
	}

	var balance int64
	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query balance failed: %v", err)
	}
	if balance != 100 {
		t.Fatalf("balance should remain 100 after rejected debit, got %d", balance)
	}
}

func TestBillingHandlers_AdjustBalanceRejectsInvalidEntryType(t *testing.T) {
	shopID := setupBillingTestDB(t)

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"amountRsd":200,"entryType":"invalid_type"}`))
	if w.Code != 400 {
		t.Fatalf("expected 400 for invalid entry type, got %d body=%s", w.Code, w.Body.String())
	}

	var ledgerCount int
	if err := db.DB.Get(&ledgerCount, "SELECT COUNT(*) FROM billing_ledger WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query ledger count failed: %v", err)
	}
	if ledgerCount != 0 {
		t.Fatalf("expected no ledger entries for invalid payload, got %d", ledgerCount)
	}
}

func TestBillingHandlers_AdjustBalanceNotFoundShopReturns404(t *testing.T) {
	_ = setupBillingTestDB(t)

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":999999,"amountRsd":200,"entryType":"manual_topup"}`))
	if w.Code != 404 {
		t.Fatalf("expected 404 for unknown shop in adjust balance, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBillingHandlers_AdjustBalanceConcurrentNoLostUpdate(t *testing.T) {
	shopID := setupBillingTestDB(t)

	const workers = 10
	const amount = 10
	var wg sync.WaitGroup
	wg.Add(workers)
	type result struct {
		code int
		body string
	}
	results := make([]result, workers)

	for i := 0; i < workers; i++ {
		go func(idx int) {
			defer wg.Done()
			c, w := newTestContext()
			handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"amountRsd":`+strconv.Itoa(amount)+`,"entryType":"manual_topup"}`))
			results[idx] = result{code: w.Code, body: w.Body.String()}
		}(i)
	}

	wg.Wait()

	var balance int64
	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query balance failed: %v", err)
	}
	want := int64(workers * amount)
	if balance != want {
		t.Fatalf("unexpected concurrent balance: got %d want %d results=%+v", balance, want, results)
	}
}

func TestBillingHandlers_CNYTopupConvertsUsingConfiguredRate(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"exchange_rate": 18.2})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":100}`))
	if w.Code != 200 {
		t.Fatalf("cny topup status=%d body=%s", w.Code, w.Body.String())
	}

	var balance int64
	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query balance failed: %v", err)
	}
	if balance != 1820 {
		t.Fatalf("expected balance=1820 after conversion, got %d", balance)
	}

	var row struct {
		EntryType      string   `db:"entry_type"`
		AmountRSD      int64    `db:"amount_rsd"`
		SourceCurrency *string  `db:"source_currency"`
		SourceAmount   *float64 `db:"source_amount"`
		FXRate         *float64 `db:"fx_rate"`
	}
	if err := db.DB.Get(&row, `
		SELECT entry_type, amount_rsd, source_currency, source_amount, fx_rate
		FROM billing_ledger
		WHERE shop_id = ?
		ORDER BY id DESC
		LIMIT 1
	`, shopID); err != nil {
		t.Fatalf("query cny ledger failed: %v", err)
	}

	if row.EntryType != "cny_topup" {
		t.Fatalf("expected entry_type=cny_topup, got %s", row.EntryType)
	}
	if row.AmountRSD != 1820 {
		t.Fatalf("expected ledger amount_rsd=1820, got %d", row.AmountRSD)
	}
	if row.SourceCurrency == nil || *row.SourceCurrency != "CNY" {
		t.Fatalf("expected source_currency=CNY, got %v", row.SourceCurrency)
	}
	if row.SourceAmount == nil || *row.SourceAmount != 100 {
		t.Fatalf("expected source_amount=100, got %v", row.SourceAmount)
	}
	if row.FXRate == nil || *row.FXRate != 18.2 {
		t.Fatalf("expected fx_rate=18.2, got %v", row.FXRate)
	}
}

func TestBillingHandlers_CNYTopupRejectsWhenRateUnavailable(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"exchange_rate": ""})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":100}`))
	if w.Code != 400 {
		t.Fatalf("expected 400 when CNY conversion rate missing, got %d body=%s", w.Code, w.Body.String())
	}

	var balance int64
	if err := db.DB.Get(&balance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query balance failed: %v", err)
	}
	if balance != 0 {
		t.Fatalf("expected balance unchanged at 0, got %d", balance)
	}

	var ledgerCount int
	if err := db.DB.Get(&ledgerCount, "SELECT COUNT(*) FROM billing_ledger WHERE shop_id = ?", shopID); err != nil {
		t.Fatalf("query ledger count failed: %v", err)
	}
	if ledgerCount != 0 {
		t.Fatalf("expected no ledger rows on rejected CNY topup, got %d", ledgerCount)
	}
}

func TestBillingHandlers_CNYTopupUsesConfiguredRateEvenIfPayloadHasFxRate(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"exchange_rate": 18.2})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":100,"fxRate":99.9}`))
	if w.Code != 200 {
		t.Fatalf("cny topup status=%d body=%s", w.Code, w.Body.String())
	}

	var row struct {
		AmountRSD int64    `db:"amount_rsd"`
		FXRate    *float64 `db:"fx_rate"`
	}
	if err := db.DB.Get(&row, "SELECT amount_rsd, fx_rate FROM billing_ledger WHERE shop_id = ? ORDER BY id DESC LIMIT 1", shopID); err != nil {
		t.Fatalf("query ledger row failed: %v", err)
	}
	if row.AmountRSD != 1820 {
		t.Fatalf("expected configured-rate conversion to 1820, got %d", row.AmountRSD)
	}
	if row.FXRate == nil || *row.FXRate != 18.2 {
		t.Fatalf("expected stored fx_rate=18.2 from config, got %v", row.FXRate)
	}
}

func TestBillingHandlers_CNYTopupRejectsConflictingEntryType(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"exchange_rate": 18.2})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":100,"entryType":"manual_topup"}`))
	if w.Code != 400 {
		t.Fatalf("expected 400 for conflicting CNY entryType, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBillingHandlers_RejectsSourceAmountWithoutSourceCurrency(t *testing.T) {
	shopID := setupBillingTestDB(t)

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"amountRsd":100,"sourceAmount":10}`))
	if w.Code != 400 {
		t.Fatalf("expected 400 for orphan source amount, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBillingHandlers_CNYTopupUsesRateCenterFirst(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{
		"exchange_rate": 18.2,
		"rate_center": map[string]interface{}{
			"base_rate":     18.0,
			"manual_offset": 0.2,
		},
	})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":10}`))
	if w.Code != 200 {
		t.Fatalf("cny topup status=%d body=%s", w.Code, w.Body.String())
	}

	var amount int64
	if err := db.DB.Get(&amount, "SELECT amount_rsd FROM billing_ledger WHERE shop_id = ? ORDER BY id DESC LIMIT 1", shopID); err != nil {
		t.Fatalf("query converted amount failed: %v", err)
	}
	if amount != 182 {
		t.Fatalf("expected 182 from rate_center 18.2, got %d", amount)
	}
}

func TestBillingHandlers_CNYTopupInvertsSubOneExchangeRate(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"exchange_rate": 0.05})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":100}`))
	if w.Code != 200 {
		t.Fatalf("cny topup status=%d body=%s", w.Code, w.Body.String())
	}

	var amount int64
	if err := db.DB.Get(&amount, "SELECT amount_rsd FROM billing_ledger WHERE shop_id = ? ORDER BY id DESC LIMIT 1", shopID); err != nil {
		t.Fatalf("query converted amount failed: %v", err)
	}
	if amount != 2000 {
		t.Fatalf("expected inverted conversion amount=2000, got %d", amount)
	}
}

func TestBillingHandlers_CNYTopupRejectsInvalidConfiguredRate(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"exchange_rate": "abc"})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":100}`))
	if w.Code != 400 {
		t.Fatalf("expected 400 for invalid configured rate, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBillingHandlers_CNYTopupRejectsConflictingAmountRSD(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"exchange_rate": 18.2})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"amountRsd":10,"sourceCurrency":"CNY","sourceAmount":100}`))
	if w.Code != 400 {
		t.Fatalf("expected 400 for conflicting amountRsd in CNY topup, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBillingHandlers_CNYTopupRejectsTooSmallConversionResult(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{
		"rate_center": map[string]interface{}{
			"base_rate":     0.001,
			"manual_offset": 0,
		},
	})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":1}`))
	if w.Code != 400 {
		t.Fatalf("expected 400 for tiny conversion result, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestBillingHandlers_CNYTopupRejectsOutOfRangeConversion(t *testing.T) {
	shopID := setupBillingTestDB(t)
	setMasterSettings(t, map[string]interface{}{"exchange_rate": 18.2})

	c, w := newTestContext()
	handleAdjustShopBalance(c, []byte(`{"id":`+toJSONInt(shopID)+`,"sourceCurrency":"CNY","sourceAmount":1e307}`))
	if w.Code != 400 {
		t.Fatalf("expected 400 for out-of-range conversion, got %d body=%s", w.Code, w.Body.String())
	}
}

func setMasterSettings(t *testing.T, settings map[string]interface{}) {
	t.Helper()

	raw, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal settings failed: %v", err)
	}

	if _, err := db.DB.Exec("UPDATE master_admin SET settings = ? WHERE id = 1", string(raw)); err != nil {
		t.Fatalf("update master settings failed: %v", err)
	}
}

func toJSONInt(v int64) string {
	return strconv.FormatInt(v, 10)
}
