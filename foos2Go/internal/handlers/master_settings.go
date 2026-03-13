package handlers

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func handleUpdateSettings(c *gin.Context, payload json.RawMessage) {
	var p map[string]interface{}
	if err := json.Unmarshal(payload, &p); err != nil {
		c.JSON(400, gin.H{"error": "Invalid payload"})
		return
	}

	settings := getMasterSettingsMap()
	mergeMasterSettingsPayload(settings, p)
	saveMasterSettingsMap(settings)
	c.JSON(200, gin.H{"success": true})
}

func mergeMasterSettingsPayload(settings map[string]interface{}, payload map[string]interface{}) {
	keyMap := masterSettingsKeyMap()
	for k, v := range payload {
		if dbKey, ok := keyMap[k]; ok {
			settings[dbKey] = v
		} else {
			settings[k] = v
		}
	}
	applyMasterSettingsDefaults(settings)
}

func masterSettingsKeyMap() map[string]string {
	return map[string]string{
		"mqttBroker":                          "mqtt_broker",
		"wechatId":                            "wechat_id",
		"wechat_contact_qr":                   "wechat_contact_qr",
		"alipay_payment_qr":                   "alipay_payment_qr",
		"wechat_payment_qr":                   "wechat_payment_qr",
		"exchange_rate":                       "exchange_rate",
		"footerText":                          "footer_text",
		"footerPhone":                         "footer_phone",
		"footerCopyright":                     "footer_copyright",
		"imageStorage":                        "image_storage",
		"r2PublicDomain":                      "r2_public_domain",
		"uploadStrictR2":                      "upload_strict_r2",
		"subscriptionDeliveryCommissionType":  "subscription_delivery_commission_type",
		"subscriptionDeliveryCommissionValue": "subscription_delivery_commission_value",
		"businessDeliveryCommissionType":      "business_delivery_commission_type",
		"businessDeliveryCommissionValue":     "business_delivery_commission_value",
		"subscriptionFeeRsd":                  "subscription_fee_rsd",
		"businessFeeRsd":                      "business_fee_rsd",
		"billingCurrency":                     "billing_currency",
		"graceDays":                           "grace_days",
		"retentionDineInDays":                 "retention_dine_in_days",
		"retentionDeliveryDays":               "retention_delivery_days",
		"statsRetentionMode":                  "stats_retention_mode",
		"backupTime":                          "backup_time",
		"backupRetention":                     "backup_retention",
		"backupTarget":                        "backup_target",
		"backupHost":                          "backup_host",
		"backupUser":                          "backup_user",
		"backupPass":                          "backup_pass",
		"backupPath":                          "backup_path",
		"backupEndpoint":                      "backup_endpoint",
		"backupBucket":                        "backup_bucket",
	}
}

func handleUpdateRateCenter(c *gin.Context, payload json.RawMessage) {
	var p interface{}
	json.Unmarshal(payload, &p)
	updateMasterSettingKey("rate_center", p)
	c.JSON(200, gin.H{"success": true})
}

func getMasterSettingsMap() map[string]interface{} {
	var settingsStr string
	err := db.DB.QueryRow("SELECT settings FROM master_admin WHERE id = 1").Scan(&settingsStr)
	var settings map[string]interface{}
	if err != nil {
		settings = make(map[string]interface{})
	} else {
		json.Unmarshal([]byte(settingsStr), &settings)
	}
	if settings == nil {
		settings = make(map[string]interface{})
	}
	applyMasterSettingsDefaults(settings)
	return settings
}

func saveMasterSettingsMap(settings map[string]interface{}) {
	bytes, _ := json.Marshal(settings)
	db.DB.Exec("UPDATE master_admin SET settings = ? WHERE id = 1", string(bytes))
}

func updateMasterSettingKey(key string, value interface{}) {
	settings := getMasterSettingsMap()
	settings[key] = value
	applyMasterSettingsDefaults(settings)
	saveMasterSettingsMap(settings)
}

func applyMasterSettingsDefaults(settings map[string]interface{}) {
	if settings == nil {
		return
	}

	applyPositiveIntDefault(settings, "subscription_fee_rsd", 1200)
	applyPositiveIntDefault(settings, "business_fee_rsd", 1800)
	settings["billing_currency"] = "RSD"
	applyCommissionSettingDefaults(settings, "subscription_delivery_commission_type", "subscription_delivery_commission_value", "percentage", 3.0)
	applyCommissionSettingDefaults(settings, "business_delivery_commission_type", "business_delivery_commission_value", "percentage", 3.0)
	applyPositiveIntDefault(settings, "grace_days", 3)
	applyPositiveIntDefault(settings, "retention_dine_in_days", 7)
	applyPositiveIntDefault(settings, "retention_delivery_days", 90)

	if _, ok := settings["auto_vip_enabled"]; !ok {
		settings["auto_vip_enabled"] = true
	}
	applyPositiveIntDefault(settings, "auto_vip_monthly_threshold", 20000)
	applyPositiveIntDefault(settings, "auto_vip_total_threshold", 60000)

	mode := strings.TrimSpace(fmt.Sprintf("%v", settings["stats_retention_mode"]))
	if mode != "permanent" && mode != "3y" {
		settings["stats_retention_mode"] = "permanent"
	}
}

func applyCommissionSettingDefaults(settings map[string]interface{}, typeKey, valueKey, fallbackType string, fallbackValue float64) {
	resolvedType := normalizeCommissionType(fmt.Sprintf("%v", settings[typeKey]))
	if resolvedType == "" {
		resolvedType = fallbackType
	}
	settings[typeKey] = resolvedType

	v, ok := valueAsFloat(settings[valueKey])
	if !ok || v <= 0 {
		v = fallbackValue
	}
	settings[valueKey] = v
}

func applyPositiveIntDefault(settings map[string]interface{}, key string, fallback int) {
	if n, ok := valueAsInt(settings[key]); ok && n > 0 {
		settings[key] = n
		return
	}
	settings[key] = fallback
}

func valueAsInt(v interface{}) (int, bool) {
	switch t := v.(type) {
	case int:
		return t, true
	case int64:
		return int(t), true
	case float64:
		return int(t), true
	case float32:
		return int(t), true
	case string:
		trimmed := strings.TrimSpace(t)
		if trimmed == "" {
			return 0, false
		}
		n, err := strconv.Atoi(trimmed)
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		return 0, false
	}
}
