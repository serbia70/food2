package handlers

import (
	"log"

	"meituan-go/internal/services/mqtt"
	"meituan-go/internal/services/realtime"

	"github.com/gin-gonic/gin"
)

func publishOrderAsync(shopID int64, payload gin.H) {
	go func() {
		if err := mqtt.PublishOrder(shopID, payload); err != nil {
			log.Printf("[Publish] MQTT publish failed (shop=%d): %v", shopID, err)
		}
	}()
}

func publishRealtimeAsync(shopID int64, payload gin.H) {
	go func() {
		if err := realtime.Publish(shopID, payload); err != nil {
			log.Printf("[Publish] Realtime publish failed (shop=%d): %v", shopID, err)
		}
	}()
}
