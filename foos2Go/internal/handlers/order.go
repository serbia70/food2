package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
)

type OrderHandler struct{}

var orderNoLocation = loadOrderNoLocation()

type CreateOrderRequest struct {
	TableInfo        string          `json:"table_info"`
	OrderType        string          `json:"order_type"` // dine_in, delivery
	TotalAmount      int64           `json:"total_amount"`
	Items            json.RawMessage `json:"items"`
	Remarks          string          `json:"remarks"`
	UserPhone        string          `json:"user_phone"`
	ScheduledFor     string          `json:"scheduled_for"`
	DineInAction     string          `json:"dine_in_action"`
	Merge            bool            `json:"merge"`
	CheckoutExisting bool            `json:"checkout_existing"`
	UsePoints        int64           `json:"use_points"`       // Points to deduct
	PointsDeduction  int64           `json:"points_deduction"` // RSD value of points used
}

type activeTableOrder struct {
	ID          int64   `db:"id"`
	OrderNo     string  `db:"order_no"`
	ItemsJSON   string  `db:"items_json"`
	TotalAmount int64   `db:"total_amount"`
	RemarksJSON *string `db:"remarks_json"`
	TableInfo   *string `db:"table_info"`
}

type UpdateOrderStatusRequest struct {
	Status       string `json:"status" binding:"required"`
	CourierName  string `json:"courier_name"`
	CourierPhone string `json:"courier_phone"`
}

func (h *OrderHandler) CreateOrder(c *gin.Context) {
	slug := c.Param("slug")

	// 1. Get Shop ID
	shopID, err := getShopIDBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Shop not found"})
		return
	}

	// 2. Parse Request
	var req CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order request"})
		return
	}
	req.OrderType = strings.ToLower(strings.TrimSpace(req.OrderType))

	scheduledFor, err := normalizeScheduledFor(req.OrderType, req.ScheduledFor)
	if err != nil {
		if errors.Is(err, errScheduledForDineInOnly) {
			c.JSON(http.StatusUnprocessableEntity, gin.H{
				"error": "scheduled_for is only supported for delivery/takeout order flow",
				"code":  "order_scheduled_for_delivery_only",
			})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scheduled_for format"})
		return
	}

	deliveryChargeRSD, aborted := resolveDeliveryChargeOrAbort(c, shopID, req)
	if aborted {
		return
	}

	// 3. Validate Items payload
	itemsJSON := req.Items
	if len(itemsJSON) == 0 {
		itemsJSON = json.RawMessage("[]")
	}
	if !json.Valid(itemsJSON) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid items payload"})
		return
	}

	if tryHandleDineInTableOrder(c, slug, shopID, req, string(itemsJSON)) {
		return
	}

	// 4. Generate Order No (YYMMDD + 3-digit daily sequence)
	var (
		orderNo string
		id      int64
	)

	// 5. Insert Order
	query := `
		INSERT INTO orders (order_no, shop_id, table_info, order_type, status, total_amount, items_json, remarks_json, user_phone, scheduled_for)
		VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
	`

	inserted := false
	for attempt := 0; attempt < 6; attempt++ {
		orderNo, err = nextDailyOrderNo()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order number"})
			return
		}

		var res sql.Result
		var execErr error
		if req.OrderType == "delivery" {
			insertRes, insertedNow, errResp := insertDeliveryOrderWithBilling(query, shopID, req, orderNo, itemsJSON, scheduledFor, deliveryChargeRSD)
			if errResp != nil {
				status := http.StatusInternalServerError
				if code, ok := (*errResp)["code"]; ok && code == "delivery_balance_insufficient" {
					status = http.StatusPaymentRequired
				}
				c.JSON(status, *errResp)
				return
			}
			if !insertedNow {
				continue
			}
			if insertRes != nil {
				res = insertRes
			}
		} else {
			res, execErr = db.DB.Exec(query,
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
					continue
				}

				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
				return
			}
		}

		if res != nil {
			id, _ = res.LastInsertId()
			if req.OrderType == "delivery" {
				recordDeliveryCommissionSnapshot(shopID, id, orderNo, req, deliveryChargeRSD)
			}
			inserted = true
			break
		}
	}

	if !inserted {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
		return
	}

	publishCreatedOrderEvents(shopID, id, orderNo, req, string(itemsJSON), scheduledFor)
	publishCreatedOrderToPrinter(slug, shopID, id, orderNo, req, string(itemsJSON), scheduledFor)

	resp := gin.H{
		"message":  "Order created",
		"order_id": id,
		"order_no": orderNo,
	}

	applyDeliveryCustomerRewards(resp, shopID, req)

	if scheduledFor != nil {
		resp["scheduled_for"] = *scheduledFor
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *OrderHandler) GetOrder(c *gin.Context) {
	handleGetOrder(c)
}

// Admin: List Orders
func (h *OrderHandler) ListOrders(c *gin.Context) {
	handleListOrders(c)
}

// Admin: Update Order Status
func (h *OrderHandler) UpdateOrderStatus(c *gin.Context) {
	var req UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
		return
	}
	handleOrderStatusUpdate(c, req)
}
