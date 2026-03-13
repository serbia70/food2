package handlers

import "github.com/gin-gonic/gin"

func applyDeliveryCustomerRewards(resp gin.H, shopID int64, req CreateOrderRequest) {
	if req.UserPhone == "" || req.OrderType != "delivery" {
		return
	}

	if req.UsePoints > 0 && req.PointsDeduction > 0 {
		deducted, err := DeductPointsFromCustomer(shopID, req.UserPhone, req.UsePoints)
		if err == nil {
			resp["points_deducted"] = deducted
			resp["points_value_rsd"] = req.PointsDeduction
		}
	}

	pointsPerSpend := 20
	if settings, err := getShopSettings(shopID); err == nil {
		if pts, ok := settings["points"].(map[string]interface{}); ok {
			if pps, ok := pts["points_per_spend"].(float64); ok && pps > 0 {
				pointsPerSpend = int(pps)
			}
		}
	}

	pointsEarned := int64(req.TotalAmount / int64(pointsPerSpend))
	if pointsEarned > 0 {
		if err := AddPointsToCustomer(shopID, req.UserPhone, pointsEarned); err == nil {
			resp["points_earned"] = pointsEarned
		}
	}

	UpdateCustomerSpend(shopID, req.UserPhone, req.TotalAmount)
	checkAndUpgradeToVIP(shopID, req.UserPhone)
}
