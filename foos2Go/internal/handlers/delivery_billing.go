package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"meituan-go/internal/db"
)

type shopCommissionConfig struct {
	CommissionType  sql.NullString  `db:"commission_type"`
	CommissionValue sql.NullFloat64 `db:"commission_value"`
	SettingsJSON    sql.NullString  `db:"settings"`
	PlanType        sql.NullString  `db:"plan_type"`
}

func loadShopCommissionConfig(shopID int64) (*shopCommissionConfig, error) {
	var row shopCommissionConfig
	if err := db.DB.Get(&row, `
		SELECT s.commission_type, s.commission_value, s.settings,
		       COALESCE(b.plan_type, 'subscription') AS plan_type
		FROM shops s
		LEFT JOIN billing_accounts b ON b.shop_id = s.id
		WHERE s.id = ?
	`, shopID); err != nil {
		return nil, err
	}
	return &row, nil
}

func resolveGlobalCommissionByPlan(planType string, settings map[string]interface{}) (string, float64) {
	resolvedPlan := normalizePlanType(planType)
	if resolvedPlan == "" {
		resolvedPlan = planSubscription
	}

	typeKey := "subscription_delivery_commission_type"
	valueKey := "subscription_delivery_commission_value"
	defaultType := "percentage"
	defaultValue := 3.0

	if resolvedPlan == planBusiness {
		typeKey = "business_delivery_commission_type"
		valueKey = "business_delivery_commission_value"
		defaultType = "percentage"
		defaultValue = 3.0
	}

	commissionType := normalizeCommissionType(fmt.Sprintf("%v", settings[typeKey]))
	if commissionType == "" {
		commissionType = defaultType
	}

	commissionValue, ok := valueAsFloat(settings[valueKey])
	if !ok || commissionValue <= 0 {
		commissionValue = defaultValue
	}

	return commissionType, commissionValue
}

func resolveDeliveryCommissionConfig(shopID int64) (string, float64, string, float64, string, error) {
	row, err := loadShopCommissionConfig(shopID)
	if err != nil {
		return "", 0, "", 0, "", err
	}

	legacyType := normalizeCommissionType(row.CommissionType.String)
	if legacyType == "" {
		legacyType = "per_order"
	}
	legacyValue := row.CommissionValue.Float64
	if legacyValue <= 0 {
		legacyValue = 30
	}

	mode := ""
	overrideType := legacyType
	overrideValue := legacyValue

	if row.SettingsJSON.Valid && strings.TrimSpace(row.SettingsJSON.String) != "" {
		var settings map[string]interface{}
		if json.Unmarshal([]byte(row.SettingsJSON.String), &settings) == nil {
			mode = strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", settings["commission_mode"])))
			overrideFromSettingsType := normalizeCommissionType(fmt.Sprintf("%v", settings["commission_override_type"]))
			overrideFromSettingsValue, ok := valueAsFloat(settings["commission_override_value"])
			if overrideFromSettingsType != "" {
				overrideType = overrideFromSettingsType
			}
			if ok && overrideFromSettingsValue > 0 {
				overrideValue = overrideFromSettingsValue
			}
		}
	}

	if mode != "global" && mode != "override" {
		mode = "global"
	}

	if mode == "override" {
		return overrideType, overrideValue, mode, overrideValue, overrideType, nil
	}

	globalType, globalValue := resolveGlobalCommissionByPlan(row.PlanType.String, getMasterSettingsMap())
	return globalType, globalValue, mode, overrideValue, overrideType, nil
}

func loadDeliveryChargeForOrder(shopID, totalAmount int64) (int64, error) {
	commissionType, commissionValue, _, _, _, err := resolveDeliveryCommissionConfig(shopID)
	if err != nil {
		return 0, fmt.Errorf("resolve delivery commission config failed: %w", err)
	}
	return deliveryChargeForOrderTotal(commissionType, commissionValue, totalAmount), nil
}

func loadDeliveryChargeGateForShop(shopID int64) (int64, string, float64, string, error) {
	commissionType, commissionValue, mode, _, _, err := resolveDeliveryCommissionConfig(shopID)
	if err != nil {
		return 0, "", 0, "", err
	}
	return deliveryChargeGateAmount(commissionType, commissionValue), commissionType, commissionValue, mode, nil
}

func normalizeCommissionType(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "per_order", "percentage":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return ""
	}
}

func deliveryChargeForOrderTotal(commissionType string, commissionValue float64, totalAmount int64) int64 {
	t := normalizeCommissionType(commissionType)
	if t == "" {
		t = "per_order"
	}
	v := commissionValue
	if v <= 0 {
		v = 1
	}

	if t == "percentage" {
		if totalAmount <= 0 {
			return 1
		}
		amount := int64(math.Ceil(float64(totalAmount) * v / 100.0))
		if amount <= 0 {
			return 1
		}
		return amount
	}

	amount := int64(math.Ceil(v))
	if amount <= 0 {
		return 1
	}
	return amount
}

func deliveryChargeGateAmount(commissionType string, commissionValue float64) int64 {
	return deliveryChargeForOrderTotal(commissionType, commissionValue, 1)
}
