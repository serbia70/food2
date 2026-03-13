package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
)

type updateTableConfigRequest struct {
	TableConfig any `json:"table_config"`
	Payload     struct {
		TableConfig any `json:"table_config"`
	} `json:"payload"`
}

type updatePasswordRequest struct {
	NewPassword string `json:"new_password"`
}

type editOrderRequest struct {
	ItemsJSON   string `json:"items_json"`
	TotalAmount int64  `json:"total_amount"`
}

type approveRenewRequest struct {
	Amount int64 `json:"amount"`
}

type adminPlanUpgradeRequest struct {
	Confirm bool `json:"confirm"`
}

func AdminUpdateSettings(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	var incoming map[string]any
	if err := c.ShouldBindJSON(&incoming); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}

	settings := incoming
	if payload, ok := incoming["payload"].(map[string]any); ok {
		settings = payload
	}
	if settings == nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "settings required"})
		return
	}

	buf, _ := json.Marshal(settings)
	err := updateShopSettingsRaw(shopID, string(buf))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "save settings failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminUpdateMasterSettings(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	var req struct {
		AlipayQR string `json:"alipay_qr"`
		WechatQR string `json:"wechat_qr"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}

	settings, _ := getShopSettings(shopID)
	settings["alipay_qr"] = strings.TrimSpace(req.AlipayQR)
	settings["wechat_qr"] = strings.TrimSpace(req.WechatQR)

	buf, _ := json.Marshal(settings)
	err := updateShopSettingsRaw(shopID, string(buf))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "save master settings failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminApproveRenew(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	var req approveRenewRequest
	_ = c.ShouldBindJSON(&req)

	if _, err := db.DB.Exec("UPDATE shops SET expire_date = date(expire_date, '+1 month') WHERE id = ?", shopID); err != nil {
		if _, err2 := db.DB.Exec("UPDATE shops SET expire_date = date('now', '+1 month') WHERE id = ? AND expire_date IS NULL", shopID); err2 != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "approve renew failed"})
			return
		}
	}

	month := time.Now().Format("2006-01")
	_, _ = db.DB.Exec("UPDATE shops SET last_paid_month = ? WHERE id = ?", month, shopID)

	settings, _ := getShopSettings(shopID)
	delete(settings, "last_payment_request")
	buf, _ := json.Marshal(settings)
	_ = updateShopSettingsRaw(shopID, string(buf))

	c.JSON(http.StatusOK, gin.H{"success": true, "amount": req.Amount})
}

func AdminPlanQuoteUpgrade(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	charge, billing, err := quoteUpgradeToBusinessCharge(shopID, billingNowFunc())
	if err != nil {
		if errors.Is(err, errPlanAlreadyBusiness) {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "already_business", "billing": billing})
			return
		}
		if errors.Is(err, errPlanInvalidTransition) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid_plan_state"})
			return
		}
		writeBillingAccountError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "charge_rsd": charge, "billing": billing})
}

func AdminPlanUpgrade(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	var req adminPlanUpgradeRequest
	_ = c.ShouldBindJSON(&req)
	if !req.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "confirm_required"})
		return
	}

	charge, billing, err := upgradeShopPlanToBusinessNow(shopID, billingNowFunc())
	if err != nil {
		if errors.Is(err, errPlanAlreadyBusiness) {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "already_business", "billing": billing})
			return
		}
		if errors.Is(err, errPlanUpgradeInsufficient) {
			c.JSON(http.StatusPaymentRequired, gin.H{"success": false, "error": "insufficient_balance_for_upgrade"})
			return
		}
		if errors.Is(err, errPlanInvalidTransition) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid_plan_state"})
			return
		}
		writeBillingAccountError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "charge_rsd": charge, "billing": billing})
}

func AdminPlanScheduleDowngrade(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	billing, err := scheduleShopPlanDowngrade(shopID)
	if err != nil {
		if errors.Is(err, errPlanInvalidTransition) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid_plan_state"})
			return
		}
		writeBillingAccountError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "billing": billing})
}

func AdminPlanCancelDowngrade(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	if err := ensureBillingAccount(shopID); err != nil {
		writeBillingAccountError(c, err)
		return
	}
	if _, err := db.DB.Exec(`
		UPDATE billing_accounts
		SET pending_plan_type = NULL,
		    updated_at = CURRENT_TIMESTAMP
		WHERE shop_id = ?
	`, shopID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "cancel downgrade failed"})
		return
	}
	billing, err := loadShopBillingSnapshot(shopID)
	if err != nil {
		writeBillingLoadError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "billing": billing})
}

func AdminUpdateTableConfig(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	var req updateTableConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}

	tc := req.TableConfig
	if tc == nil {
		tc = req.Payload.TableConfig
	}
	if tc == nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "table_config required"})
		return
	}

	settings, _ := getShopSettings(shopID)
	settings["table_config"] = tc
	if tcObj, ok := tc.(map[string]any); ok {
		if zones, ok := tcObj["zones"]; ok {
			settings["tables"] = zones
		}
	}

	buf, _ := json.Marshal(settings)
	_, err := db.DB.Exec(
		"UPDATE shops SET settings = ?, table_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		string(buf),
		utils.JSONString(settings["table_config"]),
		shopID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "save table config failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminUpdatePassword(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	var req updatePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}

	newPassword := strings.TrimSpace(req.NewPassword)
	if len(newPassword) < 4 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "password too short"})
		return
	}

	_, err := db.DB.Exec(`
		UPDATE shops
		SET password = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, newPassword, shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update password failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminEditOrder(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID, _ := shopIDRaw.(int64)

	orderID := strings.TrimSpace(c.Param("id"))
	if orderID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id required"})
		return
	}

	var req editOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}
	if strings.TrimSpace(req.ItemsJSON) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "items_json required"})
		return
	}
	if !json.Valid([]byte(req.ItemsJSON)) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "items_json invalid"})
		return
	}

	_, err := db.DB.Exec(`
		UPDATE orders
		SET items_json = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND shop_id = ?
	`, req.ItemsJSON, req.TotalAmount, orderID, shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update order failed"})
		return
	}

	// 多退少补逻辑
	if id, parseErr := strconv.ParseInt(orderID, 10, 64); parseErr == nil {
		go UpdateCommissionOnOrderEdit(shopID, id, int(req.TotalAmount))
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
