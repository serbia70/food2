package handlers

import (
	"log"
	"time"

	"meituan-go/internal/services/mqtt"

	"github.com/gin-gonic/gin"
)

func publishCreatedOrderEvents(shopID, id int64, orderNo string, req CreateOrderRequest, itemsJSON string, scheduledFor *string) {
	publishOrderAsync(shopID, gin.H{
		"type":          "new_order",
		"event":         "new_order",
		"id":            id,
		"order_no":      orderNo,
		"order_type":    req.OrderType,
		"total_amount":  req.TotalAmount,
		"status":        "pending",
		"created_at":    time.Now(),
		"table_info":    req.TableInfo,
		"items_json":    itemsJSON,
		"scheduled_for": scheduledFor,
	})
	publishRealtimeAsync(shopID, gin.H{
		"event":    "new_order",
		"order_id": id,
		"status":   "pending",
	})

	if req.OrderType == "dine_in" {
		publishOrderAsync(shopID, gin.H{
			"type":         "order",
			"event":        "order",
			"id":           id,
			"order_no":     orderNo,
			"order_type":   req.OrderType,
			"total_amount": req.TotalAmount,
			"status":       "pending",
			"table_info":   req.TableInfo,
			"items_json":   itemsJSON,
		})
	}
}

func publishCreatedOrderToPrinter(slug string, shopID, id int64, orderNo string, req CreateOrderRequest, itemsJSON string, scheduledFor *string) {
	go func() {
		mqttSecret, err := loadShopMQTTSecretBySlug(slug)
		if err != nil || mqttSecret == "" {
			log.Printf("[Order] Shop %s has no mqtt_secret configured, skipping print", slug)
			return
		}

		printItems := buildPrinterItems(shopID, itemsJSON)

		printOrder := gin.H{
			"type":          req.OrderType,
			"event":         "new_order",
			"id":            orderNo,
			"order_id":      id,
			"db_order_id":   id,
			"order_no":      orderNo,
			"pickup_no":     pickupNoFromOrderNo(orderNo),
			"table_info":    req.TableInfo,
			"order_type":    req.OrderType,
			"total_amount":  req.TotalAmount,
			"items":         printItems,
			"remarks":       req.Remarks,
			"user_phone":    req.UserPhone,
			"date":          time.Now().Format("2006-01-02 15:04:05"),
			"scheduled_for": scheduledFor,
		}

		if err := mqtt.PublishOrderForPrinter(slug, mqttSecret, printOrder); err != nil {
			log.Printf("[Order] Failed to send print command: %v", err)
		}
	}()
}
