package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/security"
	"meituan-go/internal/services/mqtt"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
)

func handleBatchUpdateCommission(c *gin.Context, payload json.RawMessage) {
	var p struct {
		OldVal string `json:"oldVal"`
		NewVal string `json:"newVal"`
		Type   string `json:"type"`
	}
	json.Unmarshal(payload, &p)

	res, err := db.DB.Exec("UPDATE shops SET commission_value = ? WHERE commission_type = ? AND commission_value = ?", p.NewVal, p.Type, p.OldVal)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update commission values"})
		return
	}
	rows, _ := res.RowsAffected()
	c.JSON(http.StatusOK, gin.H{"success": true, "changes": rows})
}

func handleCreateShop(c *gin.Context, payload json.RawMessage) {
	var p struct {
		Name     string `json:"name"`
		Slug     string `json:"slug"`
		Phone    string `json:"phone"`
		Password string `json:"password"`
	}
	json.Unmarshal(payload, &p)

	providedSlug := strings.TrimSpace(p.Slug)
	slug := ""
	if providedSlug != "" {
		slug = providedSlug
	} else {
		phoneDigits := phoneDigitsRe.ReplaceAllString(strings.TrimSpace(p.Phone), "")
		if phoneDigits != "" {
			suffix := phoneDigits
			if len(phoneDigits) > 4 {
				suffix = phoneDigits[len(phoneDigits)-4:]
			}
			slug = "s" + suffix
		}
	}

	if strings.TrimSpace(slug) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug required"})
		return
	}
	if !isValidShopSlug(slug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid slug"})
		return
	}

	mqttSecret := generateMQTTSecret()
	shopSettings := map[string]interface{}{"commission_mode": "global"}
	shopSettingsJSON, _ := json.Marshal(shopSettings)
	hashedPassword, hashErr := security.HashPassword(p.Password)
	if hashErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create shop"})
		return
	}

	_, err := db.DB.Exec("INSERT INTO shops (name, slug, phone, password, commission_type, commission_value, settings, status, mqtt_secret) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
		p.Name, slug, p.Phone, hashedPassword, "percentage", 3, string(shopSettingsJSON), mqttSecret)

	if err != nil {
		if providedSlug != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "slug already exists"})
			return
		}
		slug = fmt.Sprintf("s%d", time.Now().Unix()%100000)
		_, err = db.DB.Exec("INSERT INTO shops (name, slug, phone, password, commission_type, commission_value, settings, status, mqtt_secret) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
			p.Name, slug, p.Phone, hashedPassword, "percentage", 3, string(shopSettingsJSON), mqttSecret)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create shop"})
		return
	}

	go mqtt.SubscribeShopStatus(slug, mqttSecret)
	c.JSON(http.StatusOK, gin.H{"success": true, "slug": slug, "mqtt_secret": mqttSecret})
}

func handleDeleteShop(c *gin.Context, payload json.RawMessage) {
	var p struct{ ID int }
	json.Unmarshal(payload, &p)
	_, err := db.DB.Exec("DELETE FROM shops WHERE id = ?", p.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete shop"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func handleUpdateShop(c *gin.Context, payload json.RawMessage) {
	var p map[string]interface{}
	json.Unmarshal(payload, &p)

	var oldSlug, oldMqttSecret string
	db.DB.QueryRow("SELECT slug, mqtt_secret FROM shops WHERE id = ?", p["id"]).Scan(&oldSlug, &oldMqttSecret)

	commissionType := normalizeCommissionType(fmt.Sprintf("%v", p["commissionType"]))
	if commissionType == "" {
		commissionType = "per_order"
	}
	commissionValueFloat, ok := valueAsFloat(p["commissionValue"])
	if !ok || commissionValueFloat <= 0 {
		commissionValueFloat = 30
	}
	commissionValue := int64(commissionValueFloat)
	if commissionValue <= 0 {
		commissionValue = 1
	}

	query := "UPDATE shops SET name=?, slug=?, expire_date=?, last_paid_month=?, commission_type=?, commission_value=?"
	args := []interface{}{
		p["name"], p["slug"], p["expireDate"], p["lastPaidMonth"],
		commissionType, commissionValue,
	}

	if _, ok := p["enableDelivery"]; ok {
		query += ", enable_delivery=?"
		args = append(args, boolToInt(p["enableDelivery"]))
	}
	if _, ok := p["enableDineIn"]; ok {
		query += ", enable_dine_in=?"
		args = append(args, boolToInt(p["enableDineIn"]))
	}
	if _, ok := p["enableReservation"]; ok {
		query += ", enable_reservation=?"
		args = append(args, boolToInt(p["enableReservation"]))
	}

	if status := strings.TrimSpace(fmt.Sprintf("%v", p["status"])); status != "" {
		query += ", status=?"
		args = append(args, status)
	}

	if pwd, ok := p["newPassword"].(string); ok && pwd != "" {
		hash, hashErr := security.HashPassword(pwd)
		if hashErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update shop"})
			return
		}
		query += ", password=?"
		args = append(args, hash)
	} else if pwd, ok := p["password"].(string); ok && strings.TrimSpace(pwd) != "" {
		hash, hashErr := security.HashPassword(strings.TrimSpace(pwd))
		if hashErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update shop"})
			return
		}
		query += ", password=?"
		args = append(args, hash)
	}

	if mqttSec, ok := p["mqttSecret"].(string); ok && mqttSec != "" {
		query += ", mqtt_secret=?"
		args = append(args, mqttSec)
	}

	query += " WHERE id=?"
	args = append(args, p["id"])

	_, err := db.DB.Exec(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update shop"})
		return
	}

	if planType := strings.TrimSpace(fmt.Sprintf("%v", p["billingPlanType"])); planType != "" {
		_, err := db.DB.Exec("UPDATE billing_accounts SET plan_type = ? WHERE shop_id = ?", planType, p["id"])
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update billing plan"})
			return
		}
	}

	var settingsStr sql.NullString
	_ = db.DB.QueryRow("SELECT settings FROM shops WHERE id = ?", p["id"]).Scan(&settingsStr)
	settings := map[string]interface{}{}
	if settingsStr.Valid && strings.TrimSpace(settingsStr.String) != "" {
		_ = json.Unmarshal([]byte(settingsStr.String), &settings)
	}
	if settings == nil {
		settings = map[string]interface{}{}
	}

	commissionMode := strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", p["commissionMode"])))
	if commissionMode != "global" && commissionMode != "override" {
		commissionMode = "override"
	}
	settings["commission_mode"] = commissionMode
	if commissionMode == "override" {
		settings["commission_override_type"] = commissionType
		settings["commission_override_value"] = commissionValueFloat
	}

	settingsBytes, _ := json.Marshal(settings)
	if err := updateShopSettingsRaw(utils.Int64(p["id"]), string(settingsBytes)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update shop commission settings"})
		return
	}

	newSlug, _ := p["slug"].(string)
	newMqttSecret, _ := p["mqttSecret"].(string)
	if newSlug != oldSlug || newMqttSecret != oldMqttSecret {
		if newSlug != "" && newMqttSecret != "" {
			go mqtt.SubscribeShopStatus(newSlug, newMqttSecret)
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func handleRenewShop(c *gin.Context, payload json.RawMessage) {
	var p struct{ ID interface{} }
	json.Unmarshal(payload, &p)
	month := time.Now().Format("2006-01")
	_, err := db.DB.Exec("UPDATE shops SET last_paid_month = ? WHERE id = ?", month, p.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to renew shop"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "paidMonth": month})
}

func handleApproveRenew(c *gin.Context, payload json.RawMessage) {
	var p struct{ ID interface{} }
	json.Unmarshal(payload, &p)
	_, err := db.DB.Exec("UPDATE shops SET expire_date = date(expire_date, '+1 month') WHERE id = ?", p.ID)
	if err != nil {
		_, err = db.DB.Exec("UPDATE shops SET expire_date = date('now', '+1 month') WHERE id = ? AND expire_date IS NULL", p.ID)
	}

	settingsStr, _ := getShopSettingsRaw(utils.Int64(p.ID))
	var settings map[string]interface{}
	json.Unmarshal([]byte(settingsStr), &settings)
	delete(settings, "last_payment_request")
	newSettings, _ := json.Marshal(settings)
	_ = updateShopSettingsRaw(utils.Int64(p.ID), string(newSettings))

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func handleRejectRenew(c *gin.Context, payload json.RawMessage) {
	var p struct{ ID interface{} }
	json.Unmarshal(payload, &p)
	settingsStr, _ := getShopSettingsRaw(utils.Int64(p.ID))
	var settings map[string]interface{}
	json.Unmarshal([]byte(settingsStr), &settings)
	if req, ok := settings["last_payment_request"].(map[string]interface{}); ok {
		req["status"] = "rejected"
		settings["last_payment_request"] = req
		newSettings, _ := json.Marshal(settings)
		_ = updateShopSettingsRaw(utils.Int64(p.ID), string(newSettings))
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

var shopSlugRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)
var phoneDigitsRe = regexp.MustCompile(`\D+`)

func isValidShopSlug(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	return shopSlugRe.MatchString(s)
}

func generateMQTTSecret() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func boolToInt(v interface{}) int {
	if b, ok := v.(bool); ok && b {
		return 1
	}
	if i, ok := v.(int); ok && i == 1 {
		return 1
	}
	if f, ok := v.(float64); ok && f == 1 {
		return 1
	}
	return 0
}
