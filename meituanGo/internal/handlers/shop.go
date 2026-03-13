package handlers

import (
	"database/sql"
	"log"
	"net/http"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

type shopBillingView struct {
	PlanType   sql.NullString `db:"plan_type"`
	BalanceRSD sql.NullInt64  `db:"balance_rsd"`
}

type ShopHandler struct{}

func (h *ShopHandler) GetShopBySlug(c *gin.Context) {
	slug := c.Param("slug")

	var shop db.Shop
	query := `
		SELECT
			id,
			name,
			slug,
			password,
			phone,
			address,
			status,
			settings,
			expire_date,
			last_paid_month,
			commission_type,
			commission_value,
			enable_delivery,
			enable_dine_in,
			enable_reservation,
			table_config,
			created_at,
			updated_at
		FROM shops
		WHERE slug = ?
	`
	if hasShopMQTTSecretColumn() {
		query = `
			SELECT
				id,
				name,
				slug,
				password,
				phone,
				address,
				status,
				settings,
				expire_date,
				last_paid_month,
				commission_type,
				commission_value,
				enable_delivery,
				enable_dine_in,
				enable_reservation,
				mqtt_secret,
				table_config,
				created_at,
				updated_at
			FROM shops
			WHERE slug = ?
		`
	}
	err := db.DB.Get(&shop, query, slug)

	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Shop not found"})
			return
		}
		log.Printf("GetShopBySlug error for slug '%s': %v", slug, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}

	if err := ensureBillingAccount(shop.ID); err != nil {
		log.Printf("GetShopBySlug ensure billing account failed for shop %d: %v", shop.ID, err)
	}

	planType := planSubscription
	balanceRSD := int64(0)
	var billing shopBillingView
	if err := db.DB.Get(&billing, `
		SELECT plan_type, balance_rsd
		FROM billing_accounts
		WHERE shop_id = ?
	`, shop.ID); err != nil {
		log.Printf("GetShopBySlug billing lookup failed for shop %d: %v", shop.ID, err)
	} else {
		if billing.PlanType.Valid {
			planType = billing.PlanType.String
		}
		if billing.BalanceRSD.Valid {
			balanceRSD = billing.BalanceRSD.Int64
		}
	}

	planType = normalizePlanType(planType)
	if planType == "" {
		planType = planSubscription
	}
	shop.BillingPlanType = &planType
	shop.BillingBalanceRSD = &balanceRSD

	if planType != planSubscription && planType != planBusiness {
		off := int64(0)
		shop.EnableReservation = &off
	} else if shop.EnableReservation == nil {
		on := int64(1)
		shop.EnableReservation = &on
	}

	deliveryCharge, _, _, _, chargeErr := loadDeliveryChargeGateForShop(shop.ID)
	if chargeErr != nil {
		log.Printf("GetShopBySlug resolve delivery commission failed for shop %d: %v", shop.ID, chargeErr)
		deliveryCharge = 1
	}
	if deliveryCharge <= 0 {
		deliveryCharge = 1
	}
	shop.DeliveryChargeRSD = &deliveryCharge

	deliveryLocked := balanceRSD < deliveryCharge
	if shop.EnableDelivery != nil && *shop.EnableDelivery == 0 {
		deliveryLocked = true
	}
	shop.DeliveryLocked = &deliveryLocked

	if deliveryLocked {
		reason := "Insufficient wallet balance for delivery commission"
		if balanceRSD < deliveryCharge {
			reason = "Wallet balance is too low for delivery commission deduction"
		}
		if shop.EnableDelivery != nil && *shop.EnableDelivery == 0 {
			reason = "Delivery is disabled by shop settings"
		}
		shop.DeliveryLockReason = &reason
	}

	c.JSON(http.StatusOK, shop)
}
