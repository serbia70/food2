package handlers

import (
	"log"
	"net/http"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/services/mqtt"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
)

func tryHandleDineInTableOrder(c *gin.Context, slug string, shopID int64, req CreateOrderRequest, itemsJSON string) bool {
	if req.OrderType != "dine_in" || strings.TrimSpace(req.TableInfo) == "" {
		return false
	}

	tableKey := strings.TrimSpace(req.TableInfo)
	numeric := ""
	for i := len(tableKey) - 1; i >= 0; i-- {
		if tableKey[i] < '0' || tableKey[i] > '9' {
			numeric = tableKey[i+1:]
			break
		}
	}
	if numeric == "" && len(tableKey) > 0 {
		allDigits := true
		for i := 0; i < len(tableKey); i++ {
			if tableKey[i] < '0' || tableKey[i] > '9' {
				allDigits = false
				break
			}
		}
		if allDigits {
			numeric = tableKey
		}
	}

	action := strings.ToLower(strings.TrimSpace(req.DineInAction))
	if req.Merge {
		action = "add"
	}
	if req.CheckoutExisting {
		action = "new"
	}

	active, err := queryActiveTableOrders(shopID, tableKey, numeric)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query table active orders"})
		return true
	}

	if action == "add" && len(active) > 0 {
		handleMergeIntoActiveTableOrder(c, slug, shopID, req, itemsJSON, tableKey, active[0])
		return true
	}

	if action == "new" && len(active) > 0 {
		if err := closeActiveTableOrders(shopID, tableKey, active); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to close previous table orders"})
			return true
		}
	}

	return false
}

func queryActiveTableOrders(shopID int64, tableKey, numeric string) ([]activeTableOrder, error) {
	pattern := tableKey + " %"
	num := numeric
	if num == "" {
		num = tableKey
	}
	numPattern := num + " %"

	active := []activeTableOrder{}
	err := db.DB.Select(&active, `
		SELECT id, order_no, items_json, total_amount, remarks_json, table_info
		FROM orders
		WHERE shop_id = ?
		  AND order_type = 'dine_in'
		  AND status NOT IN ('completed','cancelled','archived','paid')
		  AND (is_deleted = 0 OR is_deleted IS NULL)
		  AND (
		    table_info = ? OR table_info LIKE ? OR
		    table_info = ? OR table_info LIKE ?
		  )
		ORDER BY id DESC
	`, shopID, tableKey, pattern, num, numPattern)
	return active, err
}

func handleMergeIntoActiveTableOrder(c *gin.Context, slug string, shopID int64, req CreateOrderRequest, itemsJSON string, tableKey string, target activeTableOrder) {
	mergedItemsJSON, mergedTotal := mergeOrderItems(target.ItemsJSON, itemsJSON, target.TotalAmount, req.TotalAmount)
	mergedRemarks := mergeRemarks(target.RemarksJSON, req.Remarks)

	_, err := db.DB.Exec(`
		UPDATE orders
		SET items_json = ?, total_amount = ?, remarks_json = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND shop_id = ?
	`, mergedItemsJSON, mergedTotal, utils.StringPtr(mergedRemarks), target.ID, shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to merge order"})
		return
	}

	targetTable := tableKey
	if target.TableInfo != nil && strings.TrimSpace(*target.TableInfo) != "" {
		targetTable = strings.TrimSpace(*target.TableInfo)
	}

	publishOrderAsync(shopID, gin.H{
		"type":         "order",
		"event":        "order",
		"id":           target.ID,
		"order_no":     target.OrderNo,
		"order_type":   "dine_in",
		"total_amount": mergedTotal,
		"status":       "pending",
		"table_info":   targetTable,
		"items_json":   mergedItemsJSON,
	})
	publishRealtimeAsync(shopID, gin.H{
		"event":    "order",
		"order_id": target.ID,
		"status":   "pending",
	})

	go func() {
		mqttSecret, err := loadShopMQTTSecretBySlug(slug)
		if err != nil || mqttSecret == "" {
			log.Printf("[Order] Shop %s has no mqtt_secret configured, skipping print", slug)
			return
		}

		itemsList := buildPrinterItems(shopID, mergedItemsJSON)

		printOrder := gin.H{
			"type":         "dine_in",
			"event":        "order_add",
			"id":           target.OrderNo,
			"order_id":     target.ID,
			"db_order_id":  target.ID,
			"order_no":     target.OrderNo,
			"pickup_no":    pickupNoFromOrderNo(target.OrderNo),
			"table_info":   targetTable,
			"order_type":   "dine_in",
			"total_amount": mergedTotal,
			"items":        itemsList,
			"remarks":      mergedRemarks,
			"date":         time.Now().Format("2006-01-02 15:04:05"),
		}

		if err := mqtt.PublishOrderForPrinter(slug, mqttSecret, printOrder); err != nil {
			log.Printf("[Order] Failed to send print command for add dishes: %v", err)
		} else {
			log.Printf("[Order] Print command sent for add dishes, order #%s", target.OrderNo)
		}
	}()

	c.JSON(http.StatusOK, gin.H{
		"message":  "Order merged",
		"merged":   true,
		"order_id": target.ID,
		"order_no": target.OrderNo,
	})
}

func closeActiveTableOrders(shopID int64, tableKey string, active []activeTableOrder) error {
	ids := make([]interface{}, 0, len(active)+1)
	ids = append(ids, shopID)
	ph := ""
	for _, o := range active {
		ids = append(ids, o.ID)
		ph += "?,"
	}
	ph = strings.TrimSuffix(ph, ",")

	_, err := db.DB.Exec(
		"UPDATE orders SET status='completed', archived=1, archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE shop_id = ? AND id IN ("+ph+")",
		ids...,
	)
	if err != nil {
		return err
	}

	publishOrderAsync(shopID, gin.H{
		"event":        "table_checkout",
		"table_number": tableKey,
		"updated":      len(active),
	})
	publishRealtimeAsync(shopID, gin.H{
		"event":        "table_checkout",
		"table_number": tableKey,
		"updated":      len(active),
	})

	return nil
}
