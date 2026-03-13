package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func filterPublicMasterSettings(settings map[string]interface{}) map[string]interface{} {
	// Public home is unauthenticated; only allow keys that are safe to expose to all clients.
	allow := []string{
		"categories",
		"footer_text",
		"footer_phone",
		"footer_copyright",
		"wechat_id",
		"wechat_qr",
		"wechat_contact_qr",
		"wechat_payment_qr",
		"alipay_payment_qr",
		"r2_public_domain",
		"image_storage",
		"upload_strict_r2",
		"exchange_rate",
		"billing_currency",
		"default_commission_type",
		"default_commission_value",
		"subscription_delivery_commission_type",
		"subscription_delivery_commission_value",
		"business_delivery_commission_type",
		"business_delivery_commission_value",
		"subscription_fee_rsd",
		"business_fee_rsd",
		"grace_days",
		"retention_dine_in_days",
		"retention_delivery_days",
		"stats_retention_mode",
		"auto_vip_enabled",
		"auto_vip_monthly_threshold",
		"auto_vip_total_threshold",
		"free_delivery_commission_type",
		"free_delivery_commission_value",
	}

	out := make(map[string]interface{}, len(allow))
	for _, k := range allow {
		if v, ok := settings[k]; ok {
			out[k] = v
		}
	}
	return out
}

func filterPublicShopSettingsJSON(raw string) string {
	// Shop settings include sensitive fields (drivers phone numbers, telegram tokens, etc.).
	// Public home only needs a very small subset to support filtering/display.
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "{}"
	}

	var in map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &in); err != nil || in == nil {
		return "{}"
	}

	out := map[string]interface{}{}
	if v, ok := in["city"]; ok {
		out["city"] = v
	}
	if v, ok := in["category"]; ok {
		out["category"] = v
	}
	if v, ok := in["delivery_type"]; ok {
		out["delivery_type"] = v
	}
	if v, ok := in["logo"]; ok {
		out["logo"] = v
	}
	if v, ok := in["address"]; ok {
		out["address"] = v
	}
	if v, ok := in["delivery"]; ok {
		// Delivery may include fee/free_threshold/zones; treat as public.
		out["delivery"] = v
	}

	b, err := json.Marshal(out)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func PublicHomeData(c *gin.Context) {
	settingsMap := getMasterSettingsMap()
	settingsMap = filterPublicMasterSettings(settingsMap)

	type homeShopRow struct {
		ID       int64          `db:"id" json:"id"`
		Name     string         `db:"name" json:"name"`
		Slug     string         `db:"slug" json:"slug"`
		Address  sql.NullString `db:"address" json:"-"`
		Status   sql.NullString `db:"status" json:"-"`
		Settings sql.NullString `db:"settings" json:"-"`
	}

	rows := []homeShopRow{}
	if err := db.DB.Select(&rows, `
		SELECT id, name, slug, address, status, settings
		FROM shops
		WHERE TRIM(COALESCE(slug, '')) != ''
		ORDER BY slug ASC
	`); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load home data"})
		return
	}

	shops := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		status := strings.TrimSpace(row.Status.String)
		if status == "disabled" || status == "expired" {
			continue
		}
		shops = append(shops, gin.H{
			"id":       row.ID,
			"name":     row.Name,
			"slug":     row.Slug,
			"address":  strings.TrimSpace(row.Address.String),
			"status":   status,
			"settings": filterPublicShopSettingsJSON(row.Settings.String),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"shops":    shops,
		"settings": settingsMap,
	})
}
