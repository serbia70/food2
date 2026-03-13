package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func billingAlertLevel(planType string, balanceRSD, monthlyFee int64, billingStatus string) string {
	status := strings.ToLower(strings.TrimSpace(billingStatus))
	normalizedPlan := normalizePlanType(planType)
	if (normalizedPlan == planSubscription || normalizedPlan == planBusiness) && (status == "grace" || status == "inactive") {
		return "overdue"
	}

	if balanceRSD < 200 {
		return "critical"
	}
	if balanceRSD < 1000 {
		return "warning"
	}

	return "normal"
}

func AdminBillingStatus(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, ok := shopIDRaw.(int64)
	if !ok || shopID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}

	if err := ensureBillingAccount(shopID); err != nil {
		writeBillingAccountError(c, err)
		return
	}

	settings := getMasterSettingsMap()
	subscriptionFee := subscriptionMonthlyFee(settings)
	businessFee := businessMonthlyFee(settings)

	var p struct {
		PlanType        sql.NullString `db:"plan_type"`
		PendingPlanType sql.NullString `db:"pending_plan_type"`
		BalanceRSD      sql.NullInt64  `db:"balance_rsd"`
		NextChargeDate  sql.NullString `db:"next_charge_date"`
		GraceUntil      sql.NullString `db:"grace_until"`
		BillingStatus   sql.NullString `db:"billing_status"`
	}
	err := db.DB.Get(&p, `
		SELECT plan_type, pending_plan_type, balance_rsd, next_charge_date, grace_until, billing_status
		FROM billing_accounts
		WHERE shop_id = ?
	`, shopID)
	if err != nil {
		writeBillingLoadError(c, err)
		return
	}

	balance := p.BalanceRSD.Int64
	planType := p.PlanType.String
	if !p.PlanType.Valid || strings.TrimSpace(planType) == "" {
		planType = planSubscription
	}
	status := p.BillingStatus.String
	if !p.BillingStatus.Valid || strings.TrimSpace(status) == "" {
		status = "active"
	}
	pendingPlan := strings.ToLower(strings.TrimSpace(p.PendingPlanType.String))
	if pendingPlan != "subscription" && pendingPlan != "business" {
		pendingPlan = ""
	}
	upgradeCharge := int64(0)
	if normalizePlanType(planType) == planSubscription {
		upgradeCharge = calculateProratedUpgradeCharge(billingNowFunc(), subscriptionFee, businessFee)
	}

	// 计算佣金统计
	lastMonthStart, lastMonthEnd, thisMonthStart := calculateBillingPeriods()
	lastMonthRevenue := calculateShopRevenue(shopID, lastMonthStart, lastMonthEnd)
	thisMonthRevenue := calculateShopRevenue(shopID, thisMonthStart, "")

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"billing": gin.H{
			"shop_id":             shopID,
			"plan_type":           planType,
			"pending_plan_type":   pendingPlan,
			"balance_rsd":         balance,
			"next_charge_date":    p.NextChargeDate.String,
			"grace_until":         p.GraceUntil.String,
			"billing_status":      status,
			"billing_alert_level": billingAlertLevel(planType, balance, subscriptionFee, status),
			"upgrade_charge_rsd":  upgradeCharge,
			"last_month_revenue":  lastMonthRevenue,
			"this_month_revenue":  thisMonthRevenue,
		},
		"subscription_fee_rsd": subscriptionFee,
		"business_fee_rsd":     businessFee,
		"billing_currency":     "RSD",
	})
}

func AdminBillingRecords(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID := shopIDRaw.(int64)

	var records []struct {
		ID               int64  `db:"id" json:"id"`
		OrderNo          string `db:"order_no" json:"order_no"`
		TotalAmount      int    `db:"total_amount" json:"total_amount"`
		CommissionRate   int    `db:"commission_rate" json:"commission_rate"`
		CommissionAmount int    `db:"commission_amount" json:"commission_amount"`
		BalanceAfter     int64  `db:"balance_after" json:"balance_after"`
		OrderType        string `db:"order_type" json:"order_type"`
		CreatedAt        string `db:"created_at" json:"created_at"`
	}

	err := db.DB.Select(&records, `
		SELECT id, order_no, total_amount, commission_rate, commission_amount, balance_after, order_type, created_at
		FROM commission_records
		WHERE shop_id = ?
		ORDER BY created_at DESC
		LIMIT 200
	`, shopID)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "load failed"})
		return
	}

	var dailyStats []struct {
		Date             string `db:"stat_date" json:"date"`
		OrderCount       int    `db:"order_count" json:"order_count"`
		CommissionAmount int    `db:"total_commission" json:"commission_amount"`
	}

	// 按天汇总最近30天
	err = db.DB.Select(&dailyStats, `
		SELECT date(created_at) as stat_date, COUNT(*) as order_count, SUM(commission_amount) as total_commission
		FROM commission_records
		WHERE shop_id = ?
		GROUP BY date(created_at)
		ORDER BY stat_date DESC
		LIMIT 30
	`, shopID)

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"records":     records,
		"daily_stats": dailyStats,
	})
}

func calculateBillingPeriods() (string, string, string) {
	now := time.Now()
	// 上个月开始和结束
	lastMonth := now.AddDate(0, -1, 0)
	lastMonthStart := time.Date(lastMonth.Year(), lastMonth.Month(), 1, 0, 0, 0, 0, time.Local).Format("2006-01-02")
	lastMonthEnd := time.Date(now.Year(), now.Month(), 0, 23, 59, 59, 0, time.Local).Format("2006-01-02")
	// 本月开始
	thisMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local).Format("2006-01-02")
	return lastMonthStart, lastMonthEnd, thisMonthStart
}

func calculateShopRevenue(shopID int64, start, end string) int64 {
	var total int64
	query := `
		SELECT COALESCE(SUM(amount), 0) FROM (
			SELECT SUM(total_amount) as amount FROM orders 
			WHERE shop_id = ? AND date(created_at) >= ? `
	args := []interface{}{shopID, start}
	if end != "" {
		query += " AND date(created_at) <= ? "
		args = append(args, end)
	}
	query += " AND status IN ('completed', 'paid', 'archived') "
	query += ` UNION ALL
			SELECT SUM(total_rsd) as amount FROM order_daily_stats 
			WHERE shop_id = ? AND date(stat_date) >= ? `
	args = append(args, shopID, start)
	if end != "" {
		query += " AND date(stat_date) <= ? "
		args = append(args, end)
	}
	query += " ) "

	err := db.DB.Get(&total, query, args...)
	if err != nil {
		return 0
	}
	return total
}

func RecordCommissionForOrder(shopID, orderID int64) {
	// 1. 防止重复扣费
	var existingCount int
	db.DB.Get(&existingCount, "SELECT COUNT(*) FROM commission_records WHERE order_id = ?", orderID)
	if existingCount > 0 {
		return
	}

	// 2. 获取订单信息
	var order struct {
		OrderNo     string `db:"order_no"`
		TotalAmount int    `db:"total_amount"`
		OrderType   string `db:"order_type"`
		Status      string `db:"status"`
	}
	err := db.DB.Get(&order, "SELECT order_no, total_amount, order_type, status FROM orders WHERE id = ?", orderID)
	if err != nil {
		return
	}
	if strings.TrimSpace(order.OrderType) != "delivery" {
		return
	}
	if strings.TrimSpace(order.Status) != "completed" && strings.TrimSpace(order.Status) != "paid" {
		return
	}

	// 3. 读取当前真实生效的外卖提成配置
	commissionType, commissionValue, _, _, _, err := resolveDeliveryCommissionConfig(shopID)
	if err != nil {
		return
	}
	commissionAmount := int(deliveryChargeForOrderTotal(commissionType, commissionValue, int64(order.TotalAmount)))
	if commissionAmount <= 0 {
		return
	}

	// 4. 执行
	rateForSnapshot := int(commissionValue)
	err = PerformDeductionAndRecord(shopID, orderID, order.OrderNo, order.TotalAmount, rateForSnapshot, commissionAmount, order.OrderType, true)
}

func PerformDeductionAndRecord(shopID, orderID int64, orderNo string, totalAmount, rate, commissionAmount int, orderType string, shouldDeductBalance bool) error {
	tx, err := db.DB.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	newBalance := int64(0)

	if shouldDeductBalance {
		// 扣除余额 (billing_accounts)
		_, err = tx.Exec(`
			UPDATE billing_accounts 
			SET balance_rsd = balance_rsd - ?, updated_at = CURRENT_TIMESTAMP 
			WHERE shop_id = ?
		`, commissionAmount, shopID)
		if err != nil {
			return err
		}
	}

	// 获取扣费后的实时余额用于记录
	err = tx.Get(&newBalance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID)
	if err != nil {
		newBalance = 0 // 降级处理
	}

	// 插入佣金明细 (commission_records) 增加 balance_after
	_, err = tx.Exec(`
		INSERT INTO commission_records (shop_id, order_id, order_no, total_amount, commission_rate, commission_amount, order_type, balance_after)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, shopID, orderID, orderNo, totalAmount, rate, commissionAmount, orderType, newBalance)
	if err != nil {
		return err
	}

	// 插入账单流水 (billing_ledger)
	_, err = tx.Exec(`
		INSERT INTO billing_ledger (shop_id, entry_type, amount_rsd, note)
		VALUES (?, 'commission_deduction', ?, ?)
	`, shopID, -commissionAmount, fmt.Sprintf("订单扣费 #%s", orderNo))
	if err != nil {
		return err
	}

	return tx.Commit()
}

// UpdateCommissionOnOrderEdit 处理订单修改后的多退少补逻辑
func UpdateCommissionOnOrderEdit(shopID, orderID int64, newTotalAmount int) {
	// 1. 获取旧的扣费记录
	var oldRecord struct {
		ID               int64  `db:"id"`
		CommissionAmount int    `db:"commission_amount"`
		CommissionRate   int    `db:"commission_rate"`
		OrderNo          string `db:"order_no"`
		OrderType        string `db:"order_type"`
	}
	err := db.DB.Get(&oldRecord, "SELECT id, commission_amount, commission_rate, order_no, order_type FROM commission_records WHERE order_id = ?", orderID)
	if err != nil {
		// 如果没找到旧记录（比如之前的旧单），则尝试按新单补一笔记录
		RecordCommissionForOrder(shopID, orderID)
		return
	}

	// 2. 根据旧的比例计算新佣金 (将 30 视为 3.0%)
	rateFloat := float64(oldRecord.CommissionRate) / 10.0
	newCommission := int(float64(newTotalAmount) * (rateFloat / 100.0))
	diff := newCommission - oldRecord.CommissionAmount

	if diff == 0 {
		return // 金额没变，无需操作
	}

	// 3. 执行多退少补
	tx, err := db.DB.Beginx()
	if err != nil {
		return
	}
	defer tx.Rollback()

	// 3.1 更新余额
	_, err = tx.Exec("UPDATE billing_accounts SET balance_rsd = balance_rsd - ?, updated_at = CURRENT_TIMESTAMP WHERE shop_id = ?", diff, shopID)
	if err != nil {
		return
	}

	// 获取扣费后的实时余额
	var newBalance int64
	err = tx.Get(&newBalance, "SELECT balance_rsd FROM billing_accounts WHERE shop_id = ?", shopID)

	// 3.2 更新佣金记录 (增加 balance_after)
	_, err = tx.Exec(`
		UPDATE commission_records 
		SET total_amount = ?, commission_amount = ?, balance_after = ?, created_at = CURRENT_TIMESTAMP 
		WHERE id = ?
	`, newTotalAmount, newCommission, newBalance, oldRecord.ID)
	if err != nil {
		return
	}

	// 3.3 插入流水说明
	note := fmt.Sprintf("订单金额修正 #%s (差额: %d RSD)", oldRecord.OrderNo, -diff)
	_, err = tx.Exec(`
		INSERT INTO billing_ledger (shop_id, entry_type, amount_rsd, note)
		VALUES (?, 'commission_adjustment', ?, ?)
	`, shopID, -diff, note)
	if err != nil {
		return
	}

	tx.Commit()
}
