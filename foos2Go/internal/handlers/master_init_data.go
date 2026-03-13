package handlers

import (
	"database/sql"
	"log"
	"strings"
	"time"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func buildMasterShopSummary(shopID int64) map[string]interface{} {
	var totalOrderCount, deliveryOrderCount, dineInOrderCount, todayOrderCount sql.NullInt64
	var deliveryRevenue, dineInRevenue, totalRevenue, todayRevenue sql.NullInt64
	var deliveryTodayCount, dineInTodayCount, deliveryTodayRevenue, dineInTodayRevenue sql.NullInt64
	var commissionTotal, commissionMonth, commissionToday sql.NullInt64

	now := time.Now()
	monthStart := now.Format("2006-01-01")
	// Use LIKE 'YYYY-MM-DD%' to be timezone/format agnostic
	todayPattern := now.Format("2006-01-02") + "%"

	log.Printf("[MasterStats] Shop=%d Time=%s Pattern=%s", shopID, now.Format(time.RFC3339), todayPattern)

	// ---------------------------------------------------------
	// 1. Calculate Today's Stats in Memory (The "Nuclear Option")
	// ---------------------------------------------------------
	rows, err := db.DB.Query(`SELECT id, order_type, total_amount FROM orders WHERE shop_id = ? AND created_at LIKE ?`, shopID, todayPattern)
	if err != nil {
		log.Printf("[MasterStats] Error querying today orders: %v", err)
	} else {
		defer rows.Close()
		var tCount, dCount, tRev, dRev int64
		var count int
		for rows.Next() {
			var id int64
			var oType string
			var amt int64
			if err := rows.Scan(&id, &oType, &amt); err == nil {
				count++
				oType = strings.ToLower(strings.TrimSpace(oType))

				// Log the first few orders to verify type matching
				if count <= 5 {
					log.Printf("[MasterStats] Processing Order ID=%d Type='%s' Amt=%d", id, oType, amt)
				}

				if strings.Contains(oType, "delivery") {
					dCount++
					dRev += amt
				} else {
					// Fallback: anything not delivery is dine_in
					tCount++
					tRev += amt
				}
			}
		}
		log.Printf("[MasterStats] In-memory Result: Total=%d Delivery=%d/%d DineIn=%d/%d", count, dCount, dRev, tCount, tRev)

		todayOrderCount.Int64 = int64(count)
		deliveryTodayCount.Int64 = dCount
		dineInTodayCount.Int64 = tCount
		todayRevenue.Int64 = dRev + tRev
		deliveryTodayRevenue.Int64 = dRev
		dineInTodayRevenue.Int64 = tRev
	}

	// ---------------------------------------------------------
	// 2. Historical Totals (Keep using SQL for these, they seem fine)
	// ---------------------------------------------------------
	_ = db.DB.QueryRow(`SELECT COUNT(*) FROM orders WHERE shop_id = ?`, shopID).Scan(&totalOrderCount)
	_ = db.DB.QueryRow(`SELECT COUNT(*) FROM orders WHERE shop_id = ? AND order_type LIKE '%delivery%'`, shopID).Scan(&deliveryOrderCount)
	_ = db.DB.QueryRow(`SELECT COUNT(*) FROM orders WHERE shop_id = ? AND order_type LIKE '%dine_in%'`, shopID).Scan(&dineInOrderCount)

	_ = db.DB.QueryRow(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE shop_id = ? AND order_type LIKE '%delivery%'`, shopID).Scan(&deliveryRevenue)
	_ = db.DB.QueryRow(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE shop_id = ? AND order_type LIKE '%dine_in%'`, shopID).Scan(&dineInRevenue)
	_ = db.DB.QueryRow(`SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE shop_id = ?`, shopID).Scan(&totalRevenue)

	// ---------------------------------------------------------
	// 3. Commissions
	// ---------------------------------------------------------
	_ = db.DB.QueryRow(`SELECT COALESCE(SUM(commission_amount), 0) FROM commission_records WHERE shop_id = ?`, shopID).Scan(&commissionTotal)
	_ = db.DB.QueryRow(`SELECT COALESCE(SUM(commission_amount), 0) FROM commission_records WHERE shop_id = ? AND created_at >= ?`, shopID, monthStart+" 00:00:00").Scan(&commissionMonth)
	_ = db.DB.QueryRow(`SELECT COALESCE(SUM(commission_amount), 0) FROM commission_records WHERE shop_id = ? AND created_at LIKE ?`, shopID, todayPattern).Scan(&commissionToday)

	avgOrderAmount := int64(0)
	if totalOrderCount.Int64 > 0 {
		avgOrderAmount = totalRevenue.Int64 / totalOrderCount.Int64
	}

	return map[string]interface{}{
		"total_order_count":        totalOrderCount.Int64,
		"delivery_order_count":     deliveryOrderCount.Int64,
		"dine_in_order_count":      dineInOrderCount.Int64,
		"today_order_count":        todayOrderCount.Int64,
		"delivery_today_count":     deliveryTodayCount.Int64,
		"dine_in_today_count":      dineInTodayCount.Int64,
		"delivery_revenue":         deliveryRevenue.Int64,
		"dine_in_revenue":          dineInRevenue.Int64,
		"today_revenue":            todayRevenue.Int64,
		"delivery_today_revenue":   deliveryTodayRevenue.Int64,
		"dine_in_today_revenue":    dineInTodayRevenue.Int64,
		"avg_order_amount":         avgOrderAmount,
		"commission_total_rsd":     commissionTotal.Int64,
		"commission_month_rsd":     commissionMonth.Int64,
		"commission_today_rsd":     commissionToday.Int64,
		"unsettled_commission_rsd": commissionMonth.Int64,
	}
}

func masterDisplayStatus(status string) string {
	status = strings.TrimSpace(status)
	switch status {
	case "disabled":
		return "已停用"
	case "expired":
		return "已过期"
	case "active", "":
		return "营业中"
	default:
		return "营业中"
	}
}

func masterDisplayBillingStatus(raw string, balance int64) string {
	raw = strings.TrimSpace(raw)
	if balance > 0 {
		return "正常"
	}
	switch raw {
	case "past_due":
		return "逾期"
	case "warning", "inactive":
		return "预警"
	case "active", "":
		return "正常"
	default:
		return "预警"
	}
}

func masterDisplayExpiryStatus(expireDate string) string {
	expireDate = strings.TrimSpace(expireDate)
	if expireDate == "" {
		return "未设置"
	}
	if strings.HasPrefix(expireDate, "0001-") || strings.HasPrefix(expireDate, "1970-") {
		return "未设置"
	}
	parsed, err := time.Parse(time.RFC3339, expireDate)
	if err != nil {
		parsed, err = time.Parse("2006-01-02", expireDate)
		if err != nil {
			return "未设置"
		}
	}

	if parsed.Before(time.Now()) {
		return "已过期"
	}
	return "正常"
}

func masterDisplayShopState(status string, enableDelivery bool, enableDineIn bool, deliveryLocked bool, dineInLocked bool, balance int64) string {
	status = strings.TrimSpace(status)
	if status == "disabled" {
		return "已停用"
	}
	if status == "expired" {
		return "已停用"
	}
	if !enableDelivery && !enableDineIn {
		if balance <= 0 {
			return "外卖堂食均停止"
		}
		return "已手动停止接单"
	}
	if !enableDelivery {
		return "外卖已锁定"
	}
	if !enableDineIn {
		return "堂食点餐停止"
	}
	if deliveryLocked && dineInLocked && balance <= 0 {
		return "外卖堂食均停止"
	}
	if deliveryLocked && dineInLocked {
		return "已手动停止接单"
	}
	if deliveryLocked {
		return "外卖已锁定"
	}
	if dineInLocked {
		return "堂食点餐停止"
	}
	return "正常运营"
}

func masterDisplayShopStateReason(status string, enableDelivery bool, enableDineIn bool, deliveryLocked bool, deliveryLockReason string, dineInLocked bool, dineInLockReason string, balance int64) string {
	status = strings.TrimSpace(status)
	if status == "disabled" || status == "expired" {
		return "店铺当前不可运营"
	}
	if !enableDelivery && !enableDineIn {
		if balance <= 0 {
			return "余额不足，外卖和堂食均已停止"
		}
		return "店铺已手动关闭外卖和堂食"
	}
	if !enableDelivery {
		return "店铺已手动关闭外卖"
	}
	if !enableDineIn {
		return "店铺已手动关闭堂食"
	}
	if deliveryLocked && dineInLocked && balance <= 0 {
		if deliveryLockReason != "" && dineInLockReason != "" && deliveryLockReason == dineInLockReason {
			return deliveryLockReason
		}
		if balance <= 0 {
			return "余额不足，外卖和堂食均已停止"
		}
		return "外卖和堂食当前都不可用"
	}
	if deliveryLocked && dineInLocked {
		if deliveryLockReason != "" && dineInLockReason != "" {
			return deliveryLockReason + "；" + dineInLockReason
		}
		if deliveryLockReason != "" {
			return deliveryLockReason
		}
		return dineInLockReason
	}
	if deliveryLocked {
		return deliveryLockReason
	}
	if dineInLocked {
		return dineInLockReason
	}
	return ""
}

// Check lock state functions (assuming they are not in db/shops.go, adding here to be safe)
func isShopDeliveryLocked(shopID int64) bool {
	var locked int
	err := db.DB.Get(&locked, "SELECT delivery_locked FROM shops WHERE id = ?", shopID)
	return err == nil && locked == 1
}

func isShopDineInLocked(shopID int64) bool {
	var locked int
	err := db.DB.Get(&locked, "SELECT dine_in_locked FROM shops WHERE id = ?", shopID)
	return err == nil && locked == 1
}

func getShopDeliveryLockReason(shopID int64) string {
	var reason sql.NullString
	err := db.DB.Get(&reason, "SELECT delivery_lock_reason FROM shops WHERE id = ?", shopID)
	if err != nil {
		return ""
	}
	return reason.String
}

func getShopDineInLockReason(shopID int64) string {
	var reason sql.NullString
	err := db.DB.Get(&reason, "SELECT dine_in_lock_reason FROM shops WHERE id = ?", shopID)
	if err != nil {
		return ""
	}
	return reason.String
}

// MasterInitData returns dashboard data
func MasterInitData(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}

	settingsMap := getMasterSettingsMap()
	subscriptionFee := subscriptionMonthlyFee(settingsMap)
	businessFee := businessMonthlyFee(settingsMap)

	query := `
		SELECT id, name, slug, status, expire_date, last_paid_month, commission_type, commission_value,
		       enable_delivery, enable_dine_in, enable_reservation, settings
		FROM shops ORDER BY expire_date ASC, slug ASC`
	if hasShopMQTTSecretColumn() {
		query = `
			SELECT id, name, slug, status, expire_date, last_paid_month, commission_type, commission_value,
			       enable_delivery, enable_dine_in, enable_reservation, settings, mqtt_secret
			FROM shops ORDER BY expire_date ASC, slug ASC`
	}

	rows, err := db.DB.Query(query)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to load shops"})
		return
	}
	defer rows.Close()

	var shops []map[string]interface{}
	for rows.Next() {
		var s db.Shop
		var status sql.NullString
		var expireDate, lastPaidMonth, commissionType, settings, mqttSecret sql.NullString
		var commissionValue, enableDelivery, enableDineIn, enableReservation sql.NullInt64

		if hasShopMQTTSecretColumn() {
			err := rows.Scan(&s.ID, &s.Name, &s.Slug, &status, &expireDate, &lastPaidMonth, &commissionType, &commissionValue,
				&enableDelivery, &enableDineIn, &enableReservation, &settings, &mqttSecret)
			if err != nil {
				continue
			}
		} else {
			err := rows.Scan(&s.ID, &s.Name, &s.Slug, &status, &expireDate, &lastPaidMonth, &commissionType, &commissionValue,
				&enableDelivery, &enableDineIn, &enableReservation, &settings)
			if err != nil {
				continue
			}
			mqttSecret = sql.NullString{}
		}

		summary := buildMasterShopSummary(s.ID)

		var planType, billingStatus, nextChargeDate, graceUntil sql.NullString
		var balanceRSD sql.NullInt64
		_ = db.DB.QueryRow(`
			SELECT plan_type, balance_rsd, billing_status, next_charge_date, grace_until
			FROM billing_accounts
			WHERE shop_id = ?
		`, s.ID).Scan(&planType, &balanceRSD, &billingStatus, &nextChargeDate, &graceUntil)

		resolvedBillingStatus := billingStatus.String
		if !billingStatus.Valid || strings.TrimSpace(resolvedBillingStatus) == "" {
			resolvedBillingStatus = "active"
		}
		if resolvedBillingStatus == "inactive" && balanceRSD.Int64 > 0 {
			resolvedBillingStatus = "warning"
		}

		resolvedStatus := strings.TrimSpace(status.String)
		if resolvedStatus == "" {
			resolvedStatus = "active"
		}

		resolvedPlanType := planType.String
		if !planType.Valid || strings.TrimSpace(resolvedPlanType) == "" {
			resolvedPlanType = planSubscription
		}
		resolvedPlanType = normalizePlanType(resolvedPlanType)

		monthlyFee := subscriptionFee
		if resolvedPlanType == planBusiness {
			monthlyFee = businessFee
		}

		alertLevel := billingAlertLevel(resolvedPlanType, balanceRSD.Int64, monthlyFee, resolvedBillingStatus)

		effectiveCommissionType := commissionType.String
		effectiveCommissionValue := float64(commissionValue.Int64)
		commissionMode := "override"
		overrideType := effectiveCommissionType
		overrideValue := effectiveCommissionValue
		if ct, cv, mode, ov, ot, cErr := resolveDeliveryCommissionConfig(s.ID); cErr == nil {
			effectiveCommissionType = ct
			effectiveCommissionValue = cv
			commissionMode = mode
			overrideValue = ov
			overrideType = ot
		}

		shops = append(shops, map[string]interface{}{
			"id":                        s.ID,
			"name":                      s.Name,
			"slug":                      s.Slug,
			"phone":                     "",
			"status":                    resolvedStatus,
			"expire_date":               expireDate.String,
			"last_paid_month":           lastPaidMonth.String,
			"commission_type":           effectiveCommissionType,
			"commission_value":          effectiveCommissionValue,
			"enable_delivery":           enableDelivery.Int64,
			"enable_dine_in":            enableDineIn.Int64,
			"enable_reservation":        enableReservation.Int64,
			"settings":                  settings.String,
			"billing_plan_type":         resolvedPlanType,
			"billing_balance_rsd":       balanceRSD.Int64,
			"billing_status":            resolvedBillingStatus,
			"billing_next_charge":       nextChargeDate.String,
			"billing_grace_until":       graceUntil.String,
			"billing_alert_level":       alertLevel,
			"display_status":            masterDisplayStatus(resolvedStatus),
			"display_billing_status":    masterDisplayBillingStatus(resolvedBillingStatus, balanceRSD.Int64),
			"display_expiry_status":     masterDisplayExpiryStatus(expireDate.String),
			"display_shop_state":        masterDisplayShopState(resolvedStatus, enableDelivery.Int64 != 0, enableDineIn.Int64 != 0, isShopDeliveryLocked(s.ID), isShopDineInLocked(s.ID), balanceRSD.Int64),
			"display_shop_state_reason": masterDisplayShopStateReason(resolvedStatus, enableDelivery.Int64 != 0, enableDineIn.Int64 != 0, isShopDeliveryLocked(s.ID), getShopDeliveryLockReason(s.ID), isShopDineInLocked(s.ID), getShopDineInLockReason(s.ID), balanceRSD.Int64),
			"delivery_locked":           isShopDeliveryLocked(s.ID),
			"today_revenue":             toInt64(summary["today_revenue"]),
			"today_order_count":         toInt64(summary["today_order_count"]),
			"delivery_today_count":      toInt64(summary["delivery_today_count"]),
			"dine_in_today_count":       toInt64(summary["dine_in_today_count"]),
			"delivery_today_revenue":    toInt64(summary["delivery_today_revenue"]),
			"dine_in_today_revenue":     toInt64(summary["dine_in_today_revenue"]),
			"avg_order_amount":          toInt64(summary["avg_order_amount"]),
			"commission_total_rsd":      toInt64(summary["commission_total_rsd"]),
			"commission_month_rsd":      toInt64(summary["commission_month_rsd"]),
			"commission_today_rsd":      toInt64(summary["commission_today_rsd"]),
			"unsettled_commission_rsd":  toInt64(summary["unsettled_commission_rsd"]),
			"commission_mode":           commissionMode,
			"commission_override_type":  overrideType,
			"commission_override_value": overrideValue,
			"mqtt_secret":               mqttSecret.String,
		})
	}

	c.JSON(200, gin.H{
		"shops":    shops,
		"settings": settingsMap,
	})
}

func toInt64(v interface{}) int64 {
	switch t := v.(type) {
	case int:
		return int64(t)
	case int64:
		return t
	case float64:
		return int64(t)
	default:
		return 0
	}
}
