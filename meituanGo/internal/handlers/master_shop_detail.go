package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func MasterShopDetail(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}

	shopID, err := strconv.ParseInt(strings.TrimSpace(c.Query("id")), 10, 64)
	if err != nil || shopID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid shop id"})
		return
	}

	var shop db.Shop
	if err := db.DB.Get(&shop, "SELECT * FROM shops WHERE id = ? LIMIT 1", shopID); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "shop not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load shop"})
		return
	}

	summary := buildMasterShopSummary(shopID)

	type billingLedgerRow struct {
		EntryType string `db:"entry_type" json:"entry_type"`
		AmountRSD int64  `db:"amount_rsd" json:"amount_rsd"`
		Note      string `db:"note" json:"note"`
		CreatedAt string `db:"created_at" json:"created_at"`
	}
	billingLedger := []billingLedgerRow{}
	_ = db.DB.Select(&billingLedger, `
		SELECT entry_type, amount_rsd, note, created_at
		FROM billing_ledger
		WHERE shop_id = ?
		ORDER BY id DESC
		LIMIT 20
	`, shopID)

	type commissionRecordRow struct {
		OrderNo          string `db:"order_no" json:"order_no"`
		OrderType        string `db:"order_type" json:"order_type"`
		CommissionAmount int64  `db:"commission_amount" json:"commission_amount"`
		TotalAmount      int64  `db:"total_amount" json:"total_amount"`
		CreatedAt        string `db:"created_at" json:"created_at"`
	}
	commissionRecords := []commissionRecordRow{}
	_ = db.DB.Select(&commissionRecords, `
		SELECT order_no, order_type, commission_amount, total_amount, created_at
		FROM commission_records
		WHERE shop_id = ?
		ORDER BY id DESC
		LIMIT 20
	`, shopID)

	var billingBalance int64
	_ = db.DB.Get(&billingBalance, "SELECT COALESCE(balance_rsd, 0) FROM billing_accounts WHERE shop_id = ? LIMIT 1", shopID)
	summary["billing_balance_rsd"] = billingBalance

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"shop":              shop,
		"summary":           summary,
		"billingLedger":     billingLedger,
		"commissionRecords": commissionRecords,
	})
}
