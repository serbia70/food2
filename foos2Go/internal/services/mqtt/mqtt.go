package mqtt

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"meituan-go/internal/db"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

var client mqtt.Client

var publishTimeout = loadPublishTimeout()

// ChatTopic returns MQTT topic for shop chat.
func ChatTopic(shopID int64, phone string) string {
	return fmt.Sprintf("shop/%d/chat/%s", shopID, strings.TrimSpace(phone))
}

// PublishChatMessage publishes a chat event payload to the given shop+phone topic.
// It is best-effort: callers should handle errors (typically log only).
func PublishChatMessage(shopID int64, phone string, payload interface{}) error {
	if client == nil || !client.IsConnected() {
		return fmt.Errorf("mqtt client not connected")
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal chat payload: %w", err)
	}
	return publishRaw(ChatTopic(shopID, phone), data)
}

// PrintStatusMessage N1 回传的状态消息
type PrintStatusMessage struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
	Device    string `json:"device"`
}

// Init initializes the MQTT client and starts status listener
func Init() error {
	broker := os.Getenv("MQTT_URL")
	if broker == "" {
		broker = "wss://mqtt.serbia70.com:443/mqtt"
	}

	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetClientID(fmt.Sprintf("meituan-go-server-%d", time.Now().Unix()))
	opts.SetKeepAlive(60 * time.Second)
	opts.SetPingTimeout(10 * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(5 * time.Second)
	opts.SetMaxReconnectInterval(5 * time.Minute)
	opts.SetCleanSession(false)
	opts.SetOrderMatters(false)

	opts.SetOnConnectHandler(func(c mqtt.Client) {
		log.Println("[MQTT] Server connected")
		// 订阅所有店铺的状态回传
		subscribeToAllStatus(c)
	})

	opts.SetConnectionLostHandler(func(c mqtt.Client, err error) {
		log.Printf("[MQTT] Connection lost: %v", err)
	})

	c := mqtt.NewClient(opts)
	if token := c.Connect(); token.Wait() && token.Error() != nil {
		return fmt.Errorf("failed to connect to MQTT broker: %w", token.Error())
	}

	client = c
	log.Printf("[MQTT] Connected to broker at %s", broker)
	return nil
}

func loadPublishTimeout() time.Duration {
	raw := strings.TrimSpace(os.Getenv("MEITUAN_MQTT_PUBLISH_TIMEOUT_MS"))
	if raw == "" {
		return 5 * time.Second
	}
	ms, err := strconv.Atoi(raw)
	if err != nil || ms <= 0 {
		log.Printf("[MQTT] Invalid MEITUAN_MQTT_PUBLISH_TIMEOUT_MS=%q, fallback to 5000", raw)
		return 5 * time.Second
	}
	return time.Duration(ms) * time.Millisecond
}

// subscribeToAllStatus 订阅所有店铺的打印状态
func subscribeToAllStatus(c mqtt.Client) {
	if !hasShopMQTTSecretColumn() {
		log.Printf("[MQTT] shops.mqtt_secret missing, skip status subscriptions")
		return
	}

	// 获取所有店铺
	var shops []struct {
		Slug       string `db:"slug"`
		MQTTSecret string `db:"mqtt_secret"`
	}

	err := db.DB.Select(&shops, "SELECT slug, mqtt_secret FROM shops WHERE mqtt_secret IS NOT NULL AND mqtt_secret != ''")
	if err != nil {
		log.Printf("[MQTT] Failed to fetch shops: %v", err)
		return
	}

	for _, shop := range shops {
		topic := fmt.Sprintf("restaurant/%s/%s/status", shop.Slug, shop.MQTTSecret)
		if token := c.Subscribe(topic, 1, handleStatusMessage); token.Wait() && token.Error() != nil {
			log.Printf("[MQTT] Failed to subscribe to %s: %v", topic, token.Error())
		} else {
			log.Printf("[MQTT] Subscribed to status topic: %s", topic)
		}
	}
}

// handleStatusMessage 处理 N1 回传的打印状态
func handleStatusMessage(c mqtt.Client, msg mqtt.Message) {
	var status PrintStatusMessage
	if err := json.Unmarshal(msg.Payload(), &status); err != nil {
		log.Printf("[MQTT] Failed to parse status message: %v", err)
		return
	}

	log.Printf("[MQTT] Status from %s: %s - %s", status.Device, status.Status, status.Message)

	// 更新订单打印状态
	if status.Status == "printed" || status.Status == "failed" {
		updateOrderPrintStatus(status.Message, status.Status)
	}
}

// updateOrderPrintStatus 更新数据库中的打印状态
func updateOrderPrintStatus(orderIDStr, printStatus string) {
	// 从 message 中提取订单 ID
	// message 格式: "12345" 或 "12345|error message"
	parts := strings.Split(orderIDStr, "|")
	orderID := strings.TrimSpace(parts[0])

	if orderID == "" {
		return
	}

	updated := false

	if id, err := strconv.ParseInt(orderID, 10, 64); err == nil {
		if res, execErr := db.DB.Exec("UPDATE orders SET print_status = ? WHERE id = ?", printStatus, id); execErr != nil {
			log.Printf("[MQTT] Failed to update print status by id: %v", execErr)
		} else {
			if n, _ := res.RowsAffected(); n > 0 {
				updated = true
				log.Printf("[MQTT] Order(id=%d) print status updated to: %s", id, printStatus)
			}
		}
	}

	if !updated {
		res, err := db.DB.Exec("UPDATE orders SET print_status = ? WHERE order_no = ?", printStatus, orderID)
		if err != nil {
			log.Printf("[MQTT] Failed to update print status by order_no: %v", err)
			return
		}
		if n, _ := res.RowsAffected(); n > 0 {
			updated = true
			log.Printf("[MQTT] Order(order_no=%s) print status updated to: %s", orderID, printStatus)
		}
	}

	if !updated {
		log.Printf("[MQTT] Print status callback not matched: %s", orderID)
	}
}

// PublishOrder sends a new order notification (for frontend)
func PublishOrder(shopID int64, order interface{}) error {
	if client == nil || !client.IsConnected() {
		return fmt.Errorf("mqtt client not connected")
	}

	payload, err := json.Marshal(order)
	if err != nil {
		return fmt.Errorf("marshal order payload: %w", err)
	}

	// Legacy topic (keep compatibility)
	if err := publishRaw(fmt.Sprintf("shop/%d/orders", shopID), payload); err != nil {
		return err
	}

	// New topic expected by admin/frontend pages: restaurant/{slug}/{secret}/order
	shopSlug, mqttSecret, err := loadShopMQTTTopicInfo(shopID)
	if err != nil {
		return fmt.Errorf("load shop for mqtt topic (shop_id=%d): %w", shopID, err)
	}
	if strings.TrimSpace(shopSlug) == "" || strings.TrimSpace(mqttSecret) == "" {
		return fmt.Errorf("missing shop slug or mqtt_secret for shop_id=%d", shopID)
	}
	topic := fmt.Sprintf("restaurant/%s/%s/order", shopSlug, mqttSecret)
	if err := publishRaw(topic, payload); err != nil {
		return err
	}
	return nil
}

func hasShopMQTTSecretColumn() bool {
	type tableInfoRow struct {
		CID       int            `db:"cid"`
		Name      string         `db:"name"`
		Type      string         `db:"type"`
		NotNull   int            `db:"notnull"`
		DfltValue sql.NullString `db:"dflt_value"`
		PK        int            `db:"pk"`
	}

	var rows []tableInfoRow
	if err := db.DB.Select(&rows, "PRAGMA table_info(shops)"); err != nil {
		log.Printf("[MQTT] inspect shops schema failed: %v", err)
		return false
	}

	for _, row := range rows {
		if strings.EqualFold(strings.TrimSpace(row.Name), "mqtt_secret") {
			return true
		}
	}
	return false
}

func loadShopMQTTTopicInfo(shopID int64) (string, string, error) {
	if hasShopMQTTSecretColumn() {
		var shop struct {
			Slug       string         `db:"slug"`
			MQTTSecret sql.NullString `db:"mqtt_secret"`
		}
		if err := db.DB.Get(&shop, "SELECT slug, mqtt_secret FROM shops WHERE id = ? LIMIT 1", shopID); err != nil {
			return "", "", err
		}
		return strings.TrimSpace(shop.Slug), strings.TrimSpace(shop.MQTTSecret.String), nil
	}

	var slug string
	if err := db.DB.Get(&slug, "SELECT slug FROM shops WHERE id = ? LIMIT 1", shopID); err != nil {
		return "", "", err
	}
	return strings.TrimSpace(slug), "", nil
}

func publishRaw(topic string, payload []byte) error {
	token := client.Publish(topic, 0, false, payload)
	if !token.WaitTimeout(publishTimeout) {
		return fmt.Errorf("publish timeout to %s after %s", topic, publishTimeout)
	}
	if token.Error() != nil {
		return fmt.Errorf("publish to %s: %w", topic, token.Error())
	}
	log.Printf("[MQTT] Published to %s", topic)
	return nil
}

// PublishOrderForPrinter 发送打印指令到 N1（QoS 1）
func PublishOrderForPrinter(shopSlug, mqttSecret string, order interface{}) error {
	if client == nil || !client.IsConnected() {
		return fmt.Errorf("MQTT client not connected")
	}

	if mqttSecret == "" {
		return fmt.Errorf("mqtt_secret not configured for shop %s", shopSlug)
	}

	topic := fmt.Sprintf("restaurant/%s/%s/print", shopSlug, mqttSecret)
	payload, err := json.Marshal(order)
	if err != nil {
		return fmt.Errorf("failed to marshal order: %w", err)
	}

	// QoS 1 - 至少送达一次
	token := client.Publish(topic, 1, false, payload)
	if !token.WaitTimeout(publishTimeout) {
		return fmt.Errorf("print publish timeout after %s", publishTimeout)
	}
	if token.Error() != nil {
		return fmt.Errorf("failed to publish: %w", token.Error())
	}

	log.Printf("[MQTT] Print command sent to %s", topic)
	return nil
}

// SubscribeShopStatus 为新创建的店铺订阅状态主题
func SubscribeShopStatus(shopSlug, mqttSecret string) {
	if client == nil || !client.IsConnected() {
		return
	}

	topic := fmt.Sprintf("restaurant/%s/%s/status", shopSlug, mqttSecret)
	if token := client.Subscribe(topic, 1, handleStatusMessage); token.Wait() && token.Error() != nil {
		log.Printf("[MQTT] Failed to subscribe to %s: %v", topic, token.Error())
	} else {
		log.Printf("[MQTT] Subscribed to status topic: %s", topic)
	}
}

// RefreshSubscriptions 重新订阅所有店铺（用于店铺配置更新后）
func RefreshSubscriptions() {
	if client == nil || !client.IsConnected() {
		return
	}

	log.Println("[MQTT] Refreshing status subscriptions...")
	subscribeToAllStatus(client)
}
