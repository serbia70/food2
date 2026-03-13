package handlers

import (
	"net/http"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func handleListOrders(c *gin.Context) bool {
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")

	shopID, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return true
	}

	status := c.Query("status")
	query := "SELECT * FROM orders WHERE shop_id = ?"
	args := []interface{}{shopID}

	if status != "" {
		query += " AND status = ?"
		args = append(args, status)
	}

	query += " ORDER BY created_at DESC LIMIT 50"

	var orders []db.Order
	err := db.DB.Select(&orders, query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch orders"})
		return true
	}

	if orders == nil {
		orders = []db.Order{}
	}

	c.JSON(http.StatusOK, orders)
	return true
}
