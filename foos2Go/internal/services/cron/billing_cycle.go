package cron

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"meituan-go/internal/db"
)

type dueBillingAccount struct {
	ShopID          int64   `db:"shop_id"`
	BalanceRSD      int64   `db:"balance_rsd"`
	PlanType        string  `db:"plan_type"`
	PendingPlanType *string `db:"pending_plan_type"`
	NextChargeDate  *string `db:"next_charge_date"`
}

func runMonthlyBillingCycleAt(now time.Time, settings map[string]interface{}) error {
	graceDays := settingIntFromMap(settings, "grace_days", 3)
	if graceDays <= 0 {
		graceDays = 3
	}

	var accounts []dueBillingAccount
	err := db.DB.Select(&accounts, `
		SELECT shop_id, balance_rsd, plan_type, pending_plan_type, next_charge_date
		FROM billing_accounts
		WHERE plan_type IN ('subscription', 'business') AND date(next_charge_date) <= date(?)
	`, now.Format("2006-01-02"))
	if err != nil {
		return err
	}

	periodKey := now.Format("2006-01")
	for _, account := range accounts {
		if err := processSingleSubscriptionCharge(now, account.ShopID, settings, graceDays, periodKey); err != nil {
			return err
		}
	}

	return nil
}

func processSingleSubscriptionCharge(now time.Time, shopID int64, settings map[string]interface{}, graceDays int, periodKey string) error {
	tx, err := db.DB.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var account dueBillingAccount
	if err := tx.Get(&account, `
		SELECT shop_id, balance_rsd, plan_type, pending_plan_type, next_charge_date
		FROM billing_accounts
		WHERE shop_id = ?
	`, shopID); err != nil {
		return err
	}

	activePlan := strings.ToLower(strings.TrimSpace(account.PlanType))
	if account.PendingPlanType != nil {
		pending := strings.ToLower(strings.TrimSpace(*account.PendingPlanType))
		if pending == "subscription" || pending == "business" {
			activePlan = pending
		}
	}

	if activePlan != "subscription" && activePlan != "business" {
		return tx.Commit()
	}

	fee := feeByPlanType(settings, activePlan)
	if fee <= 0 {
		return fmt.Errorf("invalid monthly fee for plan %s", activePlan)
	}

	if account.BalanceRSD >= int64(fee) {
		insertRes, err := tx.Exec(`
			INSERT OR IGNORE INTO billing_ledger (shop_id, entry_type, amount_rsd, note)
			VALUES (?, 'subscription_charge', ?, ?)
		`, shopID, -fee, periodKey)
		if err != nil {
			return err
		}
		inserted, _ := insertRes.RowsAffected()
		if inserted == 0 {
			return tx.Commit()
		}

		updateRes, err := tx.Exec(`
			UPDATE billing_accounts
			SET balance_rsd = balance_rsd - ?,
			    plan_type = ?,
			    pending_plan_type = NULL,
			    billing_status = 'active',
			    grace_until = NULL,
			    next_charge_date = date(COALESCE(next_charge_date, ?), '+1 month'),
			    updated_at = CURRENT_TIMESTAMP
			WHERE shop_id = ? AND balance_rsd >= ?
		`, fee, activePlan, now.Format("2006-01-02"), shopID, fee)
		if err != nil {
			return err
		}
		updatedRows, _ := updateRes.RowsAffected()
		if updatedRows == 0 {
			return fmt.Errorf("subscription charge update failed due to concurrent balance change")
		}

		return tx.Commit()
	}

	graceUntil := now.AddDate(0, 0, graceDays).Format("2006-01-02 15:04:05")
	_, err = tx.Exec(`
		UPDATE billing_accounts
		SET plan_type = ?,
		    pending_plan_type = NULL,
		    billing_status = 'grace',
		    grace_until = ?,
		    updated_at = CURRENT_TIMESTAMP
		WHERE shop_id = ?
	`, activePlan, graceUntil, shopID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`
		INSERT OR IGNORE INTO billing_ledger (shop_id, entry_type, amount_rsd, note)
		VALUES (?, 'subscription_charge_failed', 0, ?)
	`, shopID, periodKey)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func applyGraceDowngradesAt(now time.Time, settings map[string]interface{}) error {
	var accounts []dueBillingAccount
	err := db.DB.Select(&accounts, `
		SELECT shop_id, balance_rsd, plan_type, pending_plan_type, next_charge_date
		FROM billing_accounts
		WHERE plan_type IN ('subscription', 'business')
		  AND billing_status = 'grace'
		  AND grace_until IS NOT NULL
		  AND datetime(grace_until) <= datetime(?)
	`, now.Format("2006-01-02 15:04:05"))
	if err != nil {
		return err
	}

	for _, account := range accounts {
		fee := feeByPlanType(settings, account.PlanType)
		if fee <= 0 {
			fee = settingIntFromMap(settings, "subscription_fee_rsd", 1200)
		}
		if account.BalanceRSD >= int64(fee) {
			continue
		}

		tx, err := db.DB.Beginx()
		if err != nil {
			return err
		}

		if _, err = tx.Exec(`
			UPDATE billing_accounts
			SET billing_status = 'inactive',
			    grace_until = NULL,
			    updated_at = CURRENT_TIMESTAMP
			WHERE shop_id = ?
		`, account.ShopID); err != nil {
			tx.Rollback()
			return err
		}

		if _, err = tx.Exec(`
			INSERT OR IGNORE INTO billing_ledger (shop_id, entry_type, amount_rsd, note)
			VALUES (?, 'subscription_downgrade', 0, ?)
		`, account.ShopID, now.Format("2006-01")); err != nil {
			tx.Rollback()
			return err
		}

		if err = tx.Commit(); err != nil {
			return err
		}
	}

	return nil
}

func feeByPlanType(settings map[string]interface{}, planType string) int {
	normalized := strings.ToLower(strings.TrimSpace(planType))
	if normalized == "business" {
		return settingIntFromMap(settings, "business_fee_rsd", 1800)
	}
	return settingIntFromMap(settings, "subscription_fee_rsd", 1200)
}

func settingIntFromMap(settings map[string]interface{}, key string, fallback int) int {
	if settings == nil {
		return fallback
	}
	v, ok := settings[key]
	if !ok {
		return fallback
	}

	switch t := v.(type) {
	case int:
		if t > 0 {
			return t
		}
	case int64:
		if t > 0 {
			return int(t)
		}
	case float64:
		if t > 0 {
			return int(t)
		}
	case string:
		parsed, err := strconv.Atoi(t)
		if err == nil && parsed > 0 {
			return parsed
		}
	}

	return fallback
}
