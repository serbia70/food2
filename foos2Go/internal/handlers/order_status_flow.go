package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func verifyOrderBelongsToShop(orderID string, shopID interface{}) bool {
	var count int
	err := db.DB.Get(&count, "SELECT count(*) FROM orders WHERE id = ? AND shop_id = ?", orderID, shopID)
	return err == nil && count > 0
}

func updateOrderStatusRecord(orderID string, shopID interface{}, req UpdateOrderStatusRequest) error {
	var err error
	if strings.TrimSpace(req.CourierName) != "" || strings.TrimSpace(req.CourierPhone) != "" {
		_, err = db.DB.Exec(`
			UPDATE orders
			SET status = ?, courier_name = ?, courier_phone = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ? AND shop_id = ?
		`, req.Status, req.CourierName, req.CourierPhone, orderID, shopID)
	} else {
		_, err = db.DB.Exec("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?", req.Status, orderID, shopID)
	}
	return err
}

func publishOrderStatusUpdated(shopID int64, orderID string, req UpdateOrderStatusRequest) {
	publishOrderAsync(shopID, gin.H{
		"event":         "status_update",
		"order_id":      orderID,
		"status":        req.Status,
		"courier_name":  req.CourierName,
		"courier_phone": req.CourierPhone,
	})
	publishRealtimeAsync(shopID, gin.H{
		"event":    "status_update",
		"order_id": orderID,
		"status":   req.Status,
	})
}

func handleOrderStatusUpdate(c *gin.Context, req UpdateOrderStatusRequest) bool {
	shopID, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return true
	}

	orderID := c.Param("id")
	if !verifyOrderBelongsToShop(orderID, shopID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return true
	}

	shopIDInt, _ := shopID.(int64)
	orderIDInt, _ := strconv.ParseInt(orderID, 10, 64)

	if req.Status == "completed" || req.Status == "paid" {
		go RecordCommissionForOrder(shopIDInt, orderIDInt)
	}

	if err := updateOrderStatusRecord(orderID, shopID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update order"})
		return true
	}

	publishOrderStatusUpdated(shopIDInt, orderID, req)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Order updated"})
	return true
}
