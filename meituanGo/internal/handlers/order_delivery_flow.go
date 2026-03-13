package handlers

import (
	"net/http"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
)

func resolveDeliveryChargeOrAbort(c *gin.Context, shopID int64, req CreateOrderRequest) (int64, bool) {
	if req.OrderType != "delivery" {
		return 0, false
	}

	if err := ensureBillingAccount(shopID); err != nil {
		writeBillingAccountError(c, err)
		return 0, true
	}

	deliveryChargeRSD, err := loadDeliveryChargeForOrder(shopID, req.TotalAmount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve delivery commission"})
		return 0, true
	}
	if deliveryChargeRSD <= 0 {
		deliveryChargeRSD = 1
	}
	return deliveryChargeRSD, false
}

func insertDeliveryOrderWithBilling(query string, shopID int64, req CreateOrderRequest, orderNo string, itemsJSON []byte, scheduledFor *string, deliveryChargeRSD int64) (sqlResult dbResult, inserted bool, errResp *gin.H) {
	res, execErr := db.DB.Exec(query,
		orderNo,
		shopID,
		utils.StringPtr(req.TableInfo),
		req.OrderType,
		req.TotalAmount,
		string(itemsJSON),
		utils.StringPtr(req.Remarks),
		utils.StringPtr(req.UserPhone),
		scheduledFor,
	)
	if execErr != nil {
		if strings.Contains(execErr.Error(), "UNIQUE constraint failed: orders.order_no") {
			time.Sleep(5 * time.Millisecond)
			return nil, false, nil
		}
		resp := gin.H{"error": "Failed to create order"}
		return nil, false, &resp
	}

	return res, true, nil
}

func recordDeliveryCommissionSnapshot(shopID, orderID int64, orderNo string, req CreateOrderRequest, deliveryChargeRSD int64) {
	_ = shopID
	_ = orderID
	_ = orderNo
	_ = req
	_ = deliveryChargeRSD
}

type dbResult interface {
	LastInsertId() (int64, error)
	RowsAffected() (int64, error)
}
