package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

type rejectOrderRequest struct {
	Reason string `json:"reason"`
}

func AdminMarkPaid(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	orderID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || orderID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid order id"})
		return
	}

	_, err = db.DB.Exec(`
		UPDATE orders
		SET status = 'completed', updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND shop_id = ?
	`, orderID, shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update failed"})
		return
	}

	// 记录佣金明细
	go RecordCommissionForOrder(shopID, orderID)

	publishOrderAsync(shopID, gin.H{

		"event":    "status_update",
		"order_id": orderID,
		"status":   "completed",
	})
	publishRealtimeAsync(shopID, gin.H{
		"event":    "status_update",
		"order_id": orderID,
		"status":   "completed",
	})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminRejectOrder(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	orderID, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || orderID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid order id"})
		return
	}

	var req rejectOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "reason required"})
		return
	}

	fullReason := "拒绝原因: " + reason
	remarksJSON := `["` + strings.ReplaceAll(fullReason, `"`, `'`) + `"]`

	_, err = db.DB.Exec(`
		UPDATE orders
		SET status = 'cancelled', remarks_json = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND shop_id = ?
	`, remarksJSON, orderID, shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "reject failed"})
		return
	}

	publishOrderAsync(shopID, gin.H{
		"event":    "status_update",
		"order_id": orderID,
		"status":   "cancelled",
	})
	publishRealtimeAsync(shopID, gin.H{
		"event":    "status_update",
		"order_id": orderID,
		"status":   "cancelled",
	})

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminApproveTableReviews(c *gin.Context) {
	updateTableReviews(c, "confirmed")
}

func AdminRejectTableReviews(c *gin.Context) {
	updateTableReviews(c, "cancelled")
}

func updateTableReviews(c *gin.Context, status string) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	tableNum := strings.TrimSpace(c.Param("table"))
	if tableNum == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "table required"})
		return
	}

	_, err := db.DB.Exec(`
		UPDATE orders
		SET status = ?, updated_at = CURRENT_TIMESTAMP
		WHERE shop_id = ? AND status = 'review_needed' AND table_info LIKE ?
	`, status, shopID, tableNum+"%")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update failed"})
		return
	}

	publishOrderAsync(shopID, gin.H{
		"event":  "table_orders_refresh",
		"table":  tableNum,
		"status": status,
	})
	publishRealtimeAsync(shopID, gin.H{
		"event": "table_orders_refresh",
		"table": tableNum,
	})

	c.JSON(http.StatusOK, gin.H{"success": true})
}
