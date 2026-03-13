package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

type commissionRefundRequestPayload struct {
	OrderID int64  `json:"orderId"`
	Reason  string `json:"reason"`
}

type commissionRefundReviewPayload struct {
	RequestID  int64  `json:"requestId"`
	Action     string `json:"action"`
	ReviewNote string `json:"reviewNote"`
	ReviewedBy string `json:"reviewedBy"`
}

func AdminListCommissionRefundRequests(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	var rows []map[string]any
	err := db.DB.Select(&rows, `
		SELECT id, order_id, commission_record_id, commission_amount, reason, status, review_note, reviewed_by, reviewed_at, created_at
		FROM commission_refund_requests
		WHERE shop_id = ?
		ORDER BY id DESC
	`, shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to load refund requests"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "requests": rows})
}

func MasterListCommissionRefundRequests(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}

	var rows []map[string]any
	err := db.DB.Select(&rows, `
		SELECT id, shop_id, order_id, commission_record_id, commission_amount, reason, status, review_note, reviewed_by, reviewed_at, created_at
		FROM commission_refund_requests
		ORDER BY status = 'pending' DESC, id DESC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to load refund requests"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "requests": rows})
}

func AdminCreateCommissionRefundRequest(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	var req commissionRefundRequestPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}
	if req.OrderID <= 0 || strings.TrimSpace(req.Reason) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "orderId and reason required"})
		return
	}

	var record struct {
		ID               int64  `db:"id"`
		OrderID          int64  `db:"order_id"`
		CommissionAmount int64  `db:"commission_amount"`
		RefundStatus     string `db:"refund_status"`
		OrderType        string `db:"order_type"`
	}
	err := db.DB.Get(&record, `
		SELECT id, order_id, commission_amount, refund_status, order_type
		FROM commission_records
		WHERE shop_id = ? AND order_id = ?
	`, shopID, req.OrderID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "commission record not found"})
		return
	}
	if strings.TrimSpace(record.OrderType) != "delivery" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "only delivery commission can be refunded"})
		return
	}
	if strings.TrimSpace(record.RefundStatus) == "refunded" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "commission already refunded"})
		return
	}

	var pendingCount int
	if err := db.DB.Get(&pendingCount, `
		SELECT COUNT(*) FROM commission_refund_requests
		WHERE commission_record_id = ? AND status = 'pending'
	`, record.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to validate pending request"})
		return
	}
	if pendingCount > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "refund request already pending"})
		return
	}

	_, err = db.DB.Exec(`
		INSERT INTO commission_refund_requests (shop_id, order_id, commission_record_id, commission_amount, reason, status)
		VALUES (?, ?, ?, ?, ?, 'pending')
	`, shopID, req.OrderID, record.ID, record.CommissionAmount, strings.TrimSpace(req.Reason))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to create refund request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func MasterReviewCommissionRefund(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}

	var req commissionRefundReviewPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}
	if req.RequestID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "requestId required"})
		return
	}
	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action != "approve" && action != "reject" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid action"})
		return
	}

	var refundReq struct {
		ID                 int64  `db:"id"`
		ShopID             int64  `db:"shop_id"`
		CommissionRecordID int64  `db:"commission_record_id"`
		CommissionAmount   int64  `db:"commission_amount"`
		Status             string `db:"status"`
	}
	err := db.DB.Get(&refundReq, `
		SELECT id, shop_id, commission_record_id, commission_amount, status
		FROM commission_refund_requests
		WHERE id = ?
	`, req.RequestID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "refund request not found"})
		return
	}
	if strings.TrimSpace(refundReq.Status) != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "refund request already reviewed"})
		return
	}

	if action == "reject" {
		_, err := db.DB.Exec(`
			UPDATE commission_refund_requests
			SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, strings.TrimSpace(req.ReviewNote), strings.TrimSpace(req.ReviewedBy), req.RequestID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to reject refund request"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}

	tx, err := db.DB.Beginx()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to begin transaction"})
		return
	}
	defer tx.Rollback()

	if err := applyBillingBalanceDelta(tx, refundReq.ShopID, refundReq.CommissionAmount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to refund balance"})
		return
	}
	if err := insertBillingLedgerEntry(tx, refundReq.ShopID, "commission_refund", refundReq.CommissionAmount, nil, nil, nil, fmt.Sprintf("commission_record_id=%d", refundReq.CommissionRecordID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to write refund ledger"})
		return
	}
	if _, err := tx.Exec(`
		UPDATE commission_records
		SET refund_status = 'refunded'
		WHERE id = ?
	`, refundReq.CommissionRecordID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to update commission record"})
		return
	}
	if _, err := tx.Exec(`
		UPDATE commission_refund_requests
		SET status = 'approved', review_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, strings.TrimSpace(req.ReviewNote), strings.TrimSpace(req.ReviewedBy), req.RequestID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to update refund request"})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to commit refund review"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
