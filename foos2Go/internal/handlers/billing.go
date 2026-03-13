package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

var errBillingShopNotFound = errors.New("shop not found")

const (
	planSubscription = "subscription"
	planBusiness     = "business"
)

var (
	errPlanAlreadyBusiness     = errors.New("plan already business")
	errPlanUpgradeInsufficient = errors.New("insufficient balance for upgrade")
	errPlanInvalidTransition   = errors.New("invalid plan transition")
)

var billingNowFunc = time.Now

var billingBalanceAdjustMu sync.Mutex

type billingSnapshot struct {
	ShopID          int64   `db:"shop_id" json:"shop_id"`
	PlanType        string  `db:"plan_type" json:"plan_type"`
	PendingPlanType *string `db:"pending_plan_type" json:"pending_plan_type,omitempty"`
	BalanceRSD      int64   `db:"balance_rsd" json:"balance_rsd"`
	NextChargeDate  *string `db:"next_charge_date" json:"next_charge_date"`
	GraceUntil      *string `db:"grace_until" json:"grace_until"`
	BillingStatus   string  `db:"billing_status" json:"billing_status"`
}

type adjustBalancePayload struct {
	ID             int64    `json:"id"`
	AmountRSD      int64    `json:"amountRsd"`
	EntryType      string   `json:"entryType"`
	Note           string   `json:"note"`
	SourceCurrency *string  `json:"sourceCurrency"`
	SourceAmount   *float64 `json:"sourceAmount"`
	FXRate         *float64 `json:"fxRate"`
}

type adjustBalanceResult struct {
	Billing billingSnapshot
	ErrCode string
}

type shopBillingDetails struct {
	Billing            billingSnapshot
	SubscriptionFeeRSD int64
	BusinessFeeRSD     int64
	BillingCurrency    string
}

func ensureBillingAccountAndLoadSnapshot(shopID int64) (billingSnapshot, error) {
	if err := ensureBillingAccount(shopID); err != nil {
		return billingSnapshot{}, err
	}
	return loadShopBillingSnapshot(shopID)
}

func setShopBillingPlan(shopID int64, planType string) (billingSnapshot, error) {
	if err := ensureBillingAccount(shopID); err != nil {
		return billingSnapshot{}, err
	}

	tx, err := beginBillingTx()
	if err != nil {
		return billingSnapshot{}, err
	}
	defer tx.Rollback()

	if err := updateBillingPlanInTx(tx, shopID, planType, nil); err != nil {
		return billingSnapshot{}, err
	}
	if err := tx.Commit(); err != nil {
		return billingSnapshot{}, err
	}

	return loadShopBillingSnapshot(shopID)
}

func getShopBillingDetails(shopID int64) (shopBillingDetails, error) {
	billing, err := ensureBillingAccountAndLoadSnapshot(shopID)
	if err != nil {
		return shopBillingDetails{}, err
	}
	settings := getMasterSettingsMap()
	return shopBillingDetails{
		Billing:            billing,
		SubscriptionFeeRSD: subscriptionMonthlyFee(settings),
		BusinessFeeRSD:     businessMonthlyFee(settings),
		BillingCurrency:    "RSD",
	}, nil
}

func beginBillingTx() (*sqlx.Tx, error) {
	return db.DB.Beginx()
}

func applyBillingBalanceDelta(tx *sqlx.Tx, shopID int64, delta int64) error {
	res, err := tx.Exec(`
		UPDATE billing_accounts
		SET balance_rsd = balance_rsd + ?, updated_at = CURRENT_TIMESTAMP
		WHERE shop_id = ? AND balance_rsd + ? >= 0
	`, delta, shopID, delta)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("balance cannot be negative")
	}
	return nil
}

func insertBillingLedgerEntry(tx *sqlx.Tx, shopID int64, entryType string, amountRSD int64, sourceCurrency *string, sourceAmount *float64, fxRate *float64, note string) error {
	_, err := tx.Exec(`
		INSERT INTO billing_ledger (shop_id, entry_type, amount_rsd, source_currency, source_amount, fx_rate, note)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, shopID, entryType, amountRSD, sourceCurrency, sourceAmount, fxRate, strings.TrimSpace(note))
	return err
}

func resolveLedgerEntryType(amountRSD int64, entryType string) (string, error) {
	resolved := strings.TrimSpace(entryType)
	if resolved == "" {
		if amountRSD > 0 {
			resolved = "manual_topup"
		} else {
			resolved = "manual_debit"
		}
	}
	if !isAllowedLedgerEntryType(resolved) {
		return "", fmt.Errorf("invalid entry type")
	}
	return resolved, nil
}

func adjustBillingBalance(p adjustBalancePayload) (adjustBalanceResult, error) {
	if err := ensureBillingAccount(p.ID); err != nil {
		return adjustBalanceResult{}, err
	}

	if err := normalizeAdjustBalancePayload(&p); err != nil {
		return adjustBalanceResult{ErrCode: "validation"}, err
	}
	if p.AmountRSD == 0 {
		return adjustBalanceResult{ErrCode: "validation"}, fmt.Errorf("invalid amount")
	}

	entryType, err := resolveLedgerEntryType(p.AmountRSD, p.EntryType)
	if err != nil {
		return adjustBalanceResult{ErrCode: "validation"}, err
	}

	const maxAttempts = 5
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		tx, err := beginBillingTx()
		if err != nil {
			if isSQLiteBusyError(err) && attempt < maxAttempts {
				time.Sleep(time.Duration(attempt*20) * time.Millisecond)
				continue
			}
			return adjustBalanceResult{ErrCode: "begin_tx"}, err
		}

		committed := false
		func() {
			defer func() {
				if !committed {
					_ = tx.Rollback()
				}
			}()

			if err = applyBillingBalanceDelta(tx, p.ID, p.AmountRSD); err != nil {
				return
			}
			if err = insertBillingLedgerEntry(tx, p.ID, entryType, p.AmountRSD, p.SourceCurrency, p.SourceAmount, p.FXRate, p.Note); err != nil {
				return
			}
			err = tx.Commit()
			if err == nil {
				committed = true
			}
		}()

		if err == nil {
			billing, loadErr := loadShopBillingSnapshot(p.ID)
			if loadErr != nil {
				return adjustBalanceResult{ErrCode: "load_snapshot"}, loadErr
			}
			return adjustBalanceResult{Billing: billing}, nil
		}
		if err.Error() == "balance cannot be negative" {
			return adjustBalanceResult{ErrCode: "negative_balance"}, err
		}
		if isSQLiteBusyError(err) && attempt < maxAttempts {
			time.Sleep(time.Duration(attempt*20) * time.Millisecond)
			continue
		}
		if isSQLiteBusyError(err) {
			return adjustBalanceResult{ErrCode: "busy"}, err
		}
		if strings.Contains(strings.ToLower(err.Error()), "ledger") {
			return adjustBalanceResult{ErrCode: "ledger"}, err
		}
		return adjustBalanceResult{ErrCode: "update_balance"}, err
	}

	return adjustBalanceResult{ErrCode: "retry_exhausted"}, fmt.Errorf("failed to adjust balance after retries")
}

func isSQLiteBusyError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(msg, "database is locked") || strings.Contains(msg, "database table is locked") || strings.Contains(msg, "database is busy")
}

func handleSetShopPlan(c *gin.Context, payload []byte) {
	var p struct {
		ID       int64  `json:"id"`
		PlanType string `json:"planType"`
	}
	if err := decodeBillingPayload(payload, &p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	planType := strings.ToLower(strings.TrimSpace(p.PlanType))
	if p.ID <= 0 || !isSupportedPlanType(planType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid shop id or plan type"})
		return
	}

	billing, err := setShopBillingPlan(p.ID, planType)
	if err != nil {
		if errors.Is(err, errBillingShopNotFound) {
			writeBillingAccountError(c, err)
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update shop plan"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "billing": billing})
}

func handleAdjustShopBalance(c *gin.Context, payload []byte) {
	billingBalanceAdjustMu.Lock()
	defer billingBalanceAdjustMu.Unlock()

	var p adjustBalancePayload
	if err := decodeBillingPayload(payload, &p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	if p.ID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid shop id"})
		return
	}
	result, err := adjustBillingBalance(p)
	if err != nil {
		switch result.ErrCode {
		case "":
			writeBillingAccountError(c, err)
		case "negative_balance":
			c.JSON(http.StatusBadRequest, gin.H{"error": "Balance cannot be negative"})
		case "validation":
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid billing payload"})
		case "busy", "begin_tx", "retry_exhausted":
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database busy, please retry"})
		case "ledger":
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create ledger entry"})
		case "load_snapshot":
			writeBillingLoadError(c, err)
		case "update_balance":
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update balance"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update billing balance"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "billing": result.Billing})
}

func handleGetShopBilling(c *gin.Context, payload []byte) {
	var p struct {
		ID int64 `json:"id"`
	}
	if err := decodeBillingPayload(payload, &p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	if p.ID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid shop id"})
		return
	}

	details, err := getShopBillingDetails(p.ID)
	if err != nil {
		if errors.Is(err, errBillingShopNotFound) {
			writeBillingAccountError(c, err)
		} else {
			writeBillingLoadError(c, err)
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":              true,
		"billing":              details.Billing,
		"subscription_fee_rsd": details.SubscriptionFeeRSD,
		"business_fee_rsd":     details.BusinessFeeRSD,
		"billing_currency":     details.BillingCurrency,
	})
}

func decodeBillingPayload(payload []byte, out interface{}) error {
	if len(payload) == 0 {
		return fmt.Errorf("empty payload")
	}

	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return err
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("multiple JSON values are not allowed")
	}

	return nil
}

func normalizePlanType(v string) string {
	plan := strings.ToLower(strings.TrimSpace(v))
	switch plan {
	case "", "free", planSubscription:
		return planSubscription
	case planBusiness:
		return planBusiness
	default:
		return plan
	}
}

func isSupportedPlanType(planType string) bool {
	return planType == planSubscription || planType == planBusiness
}

func subscriptionMonthlyFee(settings map[string]interface{}) int64 {
	fee, ok := valueAsInt(settings["subscription_fee_rsd"])
	if !ok || fee <= 0 {
		fee = 1200
	}
	return int64(fee)
}

func businessMonthlyFee(settings map[string]interface{}) int64 {
	fee, ok := valueAsInt(settings["business_fee_rsd"])
	if !ok || fee <= 0 {
		fee = 1800
	}
	return int64(fee)
}

func loadBillingForPlanChange(shopID int64) (billingSnapshot, error) {
	billing, err := ensureBillingAccountAndLoadSnapshot(shopID)
	if err != nil {
		return billingSnapshot{}, err
	}
	currentPlan := normalizePlanType(billing.PlanType)
	if currentPlan == "" {
		currentPlan = planSubscription
	}
	billing.PlanType = currentPlan
	return billing, nil
}

func updateBillingPlanInTx(tx *sqlx.Tx, shopID int64, planType string, pendingPlanType *string) error {
	_, err := tx.Exec(`
		UPDATE billing_accounts
		SET plan_type = ?,
		    pending_plan_type = ?,
		    billing_status = 'active',
		    next_charge_date = CASE
		      WHEN (next_charge_date IS NULL OR next_charge_date = '')
		      THEN date('now', 'start of month', '+1 month')
		      ELSE next_charge_date
		    END,
		    updated_at = CURRENT_TIMESTAMP
		WHERE shop_id = ?
	`, planType, pendingPlanType, shopID)
	return err
}

func ensureBillingAccount(shopID int64) error {
	const maxAttempts = 5
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		var count int
		if err := db.DB.Get(&count, "SELECT COUNT(*) FROM billing_accounts WHERE shop_id = ?", shopID); err != nil {
			if isSQLiteBusyError(err) && attempt < maxAttempts {
				time.Sleep(time.Duration(attempt*20) * time.Millisecond)
				continue
			}
			return fmt.Errorf("failed checking billing account: %w", err)
		}
		if count > 0 {
			return nil
		}

		_, err := db.DB.Exec(`
			INSERT INTO billing_accounts (shop_id, plan_type, balance_rsd, next_charge_date, billing_status)
			SELECT ?, 'subscription', 0, date('now', 'start of month', '+1 month'), 'active'
			WHERE EXISTS (SELECT 1 FROM shops WHERE id = ?)
		`, shopID, shopID)
		if err == nil {
			if checkErr := db.DB.Get(&count, "SELECT COUNT(*) FROM billing_accounts WHERE shop_id = ?", shopID); checkErr == nil && count > 0 {
				return nil
			}
			var shopExists int
			if checkShop := db.DB.Get(&shopExists, "SELECT COUNT(*) FROM shops WHERE id = ?", shopID); checkShop == nil && shopExists == 0 {
				return errBillingShopNotFound
			}
			if attempt < maxAttempts {
				time.Sleep(time.Duration(attempt*20) * time.Millisecond)
				continue
			}
			return fmt.Errorf("failed creating billing account: unknown post-insert state")
		}

		if checkErr := db.DB.Get(&count, "SELECT COUNT(*) FROM billing_accounts WHERE shop_id = ?", shopID); checkErr == nil && count > 0 {
			return nil
		}
		var shopExists int
		if checkShop := db.DB.Get(&shopExists, "SELECT COUNT(*) FROM shops WHERE id = ?", shopID); checkShop == nil && shopExists == 0 {
			return errBillingShopNotFound
		}
		if isSQLiteBusyError(err) && attempt < maxAttempts {
			time.Sleep(time.Duration(attempt*20) * time.Millisecond)
			continue
		}
		return fmt.Errorf("failed creating billing account: %w", err)
	}

	return fmt.Errorf("failed creating billing account after retries")
}

func writeBillingAccountError(c *gin.Context, err error) {
	if errors.Is(err, errBillingShopNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Shop not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to ensure billing account"})
}

func writeBillingLoadError(c *gin.Context, err error) {
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Shop billing account not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load billing snapshot"})
}

func isAllowedLedgerEntryType(v string) bool {
	switch strings.TrimSpace(v) {
	case "manual_topup", "manual_debit", "manual_adjust", "cny_topup", "subscription_charge", "subscription_charge_failed", "subscription_downgrade", "delivery_commission", "plan_upgrade_prorated":
		return true
	default:
		return false
	}
}

func normalizeAdjustBalancePayload(p *adjustBalancePayload) error {
	if p == nil {
		return fmt.Errorf("invalid payload")
	}

	sourceCurrency := normalizeSourceCurrency(p.SourceCurrency)
	if sourceCurrency == "" {
		if p.SourceAmount != nil || p.FXRate != nil {
			return fmt.Errorf("sourceCurrency is required when sourceAmount/fxRate is provided")
		}
		return nil
	}
	if sourceCurrency != "CNY" {
		return fmt.Errorf("unsupported source currency")
	}
	if p.AmountRSD != 0 {
		return fmt.Errorf("amountRsd must not be set for CNY top-up")
	}
	if typed := strings.TrimSpace(p.EntryType); typed != "" && typed != "cny_topup" {
		return fmt.Errorf("entryType must be cny_topup for CNY top-up")
	}
	if p.SourceAmount == nil || *p.SourceAmount <= 0 {
		return fmt.Errorf("sourceAmount is required for CNY top-up")
	}

	fxRate, err := resolveCNYToRSDRate(getMasterSettingsMap())
	if err != nil {
		return err
	}

	converted := (*p.SourceAmount) * fxRate
	if math.IsNaN(converted) || math.IsInf(converted, 0) || converted > float64(math.MaxInt64) {
		return fmt.Errorf("conversion result is out of range")
	}

	amountRSD := int64(math.Round(converted))
	if amountRSD <= 0 {
		return fmt.Errorf("conversion result is too small")
	}

	p.AmountRSD = amountRSD
	p.SourceCurrency = stringPtr("CNY")
	p.FXRate = floatPtr(fxRate)
	p.EntryType = "cny_topup"

	return nil
}

func resolveCNYToRSDRate(settings map[string]interface{}) (float64, error) {
	if settings == nil {
		return 0, fmt.Errorf("CNY conversion rate is not configured")
	}

	if rc, ok := settings["rate_center"].(map[string]interface{}); ok {
		base, baseOK := valueAsFloat(rc["base_rate"])
		offset, _ := valueAsFloat(rc["manual_offset"])
		if baseOK && base > 0 {
			rate := base + offset
			if rate > 0 {
				return rate, nil
			}
		}
	}

	raw, ok := valueAsFloat(settings["exchange_rate"])
	if ok && raw > 0 {
		if raw < 1 {
			return 1 / raw, nil
		}
		return raw, nil
	}

	return 0, fmt.Errorf("CNY conversion rate is not configured")
}

func valueAsFloat(v interface{}) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case string:
		trimmed := strings.TrimSpace(t)
		if trimmed == "" {
			return 0, false
		}
		n, err := strconv.ParseFloat(trimmed, 64)
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		return 0, false
	}
}

func normalizeSourceCurrency(raw *string) string {
	if raw == nil {
		return ""
	}
	return strings.ToUpper(strings.TrimSpace(*raw))
}

func stringPtr(v string) *string {
	copy := v
	return &copy
}

func floatPtr(v float64) *float64 {
	copy := v
	return &copy
}

func loadShopBillingSnapshot(shopID int64) (billingSnapshot, error) {
	var snapshot billingSnapshot
	err := db.DB.Get(&snapshot, `
		SELECT shop_id, plan_type, pending_plan_type, balance_rsd, next_charge_date, grace_until, billing_status
		FROM billing_accounts
		WHERE shop_id = ?
	`, shopID)
	return snapshot, err
}

func calculateProratedUpgradeCharge(now time.Time, fromFee, toFee int64) int64 {
	if toFee <= fromFee {
		return 0
	}
	currentMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	nextMonthStart := currentMonthStart.AddDate(0, 1, 0)
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	daysInMonth := int(nextMonthStart.Sub(currentMonthStart).Hours() / 24)
	remainingDays := int(nextMonthStart.Sub(todayStart).Hours() / 24)
	if daysInMonth <= 0 || remainingDays <= 0 {
		return 0
	}

	diff := float64(toFee - fromFee)
	charge := int64(math.Round(diff * float64(remainingDays) / float64(daysInMonth)))
	if charge < 0 {
		return 0
	}
	return charge
}

func quoteUpgradeToBusinessCharge(shopID int64, now time.Time) (int64, billingSnapshot, error) {
	billing, err := loadBillingForPlanChange(shopID)
	if err != nil {
		return 0, billingSnapshot{}, err
	}

	currentPlan := billing.PlanType
	if currentPlan == planBusiness {
		return 0, billing, errPlanAlreadyBusiness
	}
	if currentPlan != planSubscription {
		return 0, billing, errPlanInvalidTransition
	}

	settings := getMasterSettingsMap()
	charge := calculateProratedUpgradeCharge(now, subscriptionMonthlyFee(settings), businessMonthlyFee(settings))
	return charge, billing, nil
}

func upgradeShopPlanToBusinessNow(shopID int64, now time.Time) (int64, billingSnapshot, error) {
	charge, billing, err := quoteUpgradeToBusinessCharge(shopID, now)
	if err != nil {
		return 0, billing, err
	}

	tx, err := beginBillingTx()
	if err != nil {
		return 0, billingSnapshot{}, err
	}
	defer tx.Rollback()

	if charge > 0 {
		if err := applyBillingBalanceDelta(tx, shopID, -charge); err != nil {
			if err.Error() == "balance cannot be negative" {
				return 0, billingSnapshot{}, errPlanUpgradeInsufficient
			}
			return 0, billingSnapshot{}, err
		}

		if err := insertBillingLedgerEntry(tx, shopID, "plan_upgrade_prorated", -charge, nil, nil, nil, now.Format("2006-01-02")); err != nil {
			return 0, billingSnapshot{}, err
		}
	}

	if err := updateBillingPlanInTx(tx, shopID, planBusiness, nil); err != nil {
		return 0, billingSnapshot{}, err
	}

	if err := tx.Commit(); err != nil {
		return 0, billingSnapshot{}, err
	}

	billing, err = loadShopBillingSnapshot(shopID)
	if err != nil {
		return 0, billingSnapshot{}, err
	}
	return charge, billing, nil
}

func scheduleShopPlanDowngrade(shopID int64) (billingSnapshot, error) {
	billing, err := loadBillingForPlanChange(shopID)
	if err != nil {
		return billingSnapshot{}, err
	}
	if billing.PlanType != planBusiness {
		return billingSnapshot{}, errPlanInvalidTransition
	}

	if _, err := db.DB.Exec(`
		UPDATE billing_accounts
		SET pending_plan_type = 'subscription',
		    updated_at = CURRENT_TIMESTAMP
		WHERE shop_id = ?
	`, shopID); err != nil {
		return billingSnapshot{}, err
	}

	return loadShopBillingSnapshot(shopID)
}
