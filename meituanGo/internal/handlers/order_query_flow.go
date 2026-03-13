package handlers

import (
	"net/http"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func handleGetOrder(c *gin.Context) bool {
	slug := c.Param("slug")
	orderNo := c.Param("order_no")

	shopID, err := getShopIDBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Shop not found"})
		return true
	}

	var order db.Order
	err = db.DB.Get(&order, "SELECT * FROM orders WHERE order_no = ? AND shop_id = ?", orderNo, shopID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return true
	}

	c.JSON(http.StatusOK, order)
	return true
}
