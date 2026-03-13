package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
)

type ReservationHandler struct{}

type CreateReservationRequest struct {
	GuestCount      int     `json:"guest_count" binding:"required,min=1,max=50"`
	ReservationTime string  `json:"reservation_time" binding:"required"`
	CustomerPhone   string  `json:"customer_phone" binding:"required"`
	DineType        string  `json:"dine_type" binding:"required"`
	DeliveryAddress *string `json:"delivery_address"`
	CustomerName    *string `json:"customer_name"`
	Items           any     `json:"items"`
	Remarks         *string `json:"remarks"`
}

type UpdateReservationRequest struct {
	Status string `json:"status" binding:"required,oneof=pending confirmed completed cancelled"`
}

type CheckinReservationRequest struct {
	TableInfo string `json:"table_info"` // e.g. "Hall 5" or "5号桌"
}

func parseReservationTime(raw string) (time.Time, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return time.Time{}, fmt.Errorf("empty reservation time")
	}

	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02T15:04:05", v); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02 15:04:05", v); err == nil {
		return t, nil
	}

	return time.Time{}, fmt.Errorf("invalid reservation time format")
}

func normalizeOptionalText(v *string) *string {
	if v == nil {
		return nil
	}
	t := strings.TrimSpace(*v)
	if t == "" {
		return nil
	}
	return &t
}

func reservationFeatureGate(shopID int64) (int, gin.H, bool) {
	var planType string
	if err := db.DB.Get(&planType, "SELECT COALESCE((SELECT plan_type FROM billing_accounts WHERE shop_id = ? LIMIT 1), 'subscription')", shopID); err != nil {
		return http.StatusInternalServerError, gin.H{"error": "Failed to check billing plan"}, true
	}
	planType = normalizePlanType(planType)
	if planType == "" {
		planType = planSubscription
	}
	if planType != planSubscription && planType != planBusiness {
		return http.StatusForbidden, gin.H{
			"error": "Reservation is available on subscription/business plan only",
			"code":  "reservation_subscription_required",
		}, true
	}

	var enableReservation int64
	if err := db.DB.Get(&enableReservation, "SELECT COALESCE(enable_reservation, 0) FROM shops WHERE id = ? LIMIT 1", shopID); err != nil {
		return http.StatusInternalServerError, gin.H{"error": "Failed to check reservation setting"}, true
	}
	if enableReservation == 0 {
		return http.StatusForbidden, gin.H{
			"error": "Reservation is disabled for this shop",
			"code":  "reservation_disabled",
		}, true
	}

	return 0, nil, false
}

func (h *ReservationHandler) CreateReservation(c *gin.Context) {
	slug := c.Param("slug")

	shopID, err := getShopIDBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Shop not found"})
		return
	}

	var req CreateReservationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid reservation request"})
		return
	}

	if status, body, blocked := reservationFeatureGate(shopID); blocked {
		c.JSON(status, body)
		return
	}

	if strings.TrimSpace(req.DineType) != "dine_in" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":   "Reservation supports dine_in only. Use delivery order for scheduled delivery.",
			"code":    "reservation_dine_in_only",
			"migrate": "Use /api/order with type=delivery and scheduled delivery time",
		})
		return
	}

	reservationTime, err := parseReservationTime(req.ReservationTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid reservation time format"})
		return
	}

	now := time.Now()
	minTime := now.Add(2 * time.Hour)
	maxTime := now.Add(7 * 24 * time.Hour)

	if reservationTime.Before(minTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Reservation time must be at least 2 hours from now"})
		return
	}
	if reservationTime.After(maxTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Reservation time cannot be more than 7 days from now"})
		return
	}

	var itemsJSON *string
	if req.Items != nil {
		b, err := json.Marshal(req.Items)
		if err == nil {
			s := string(b)
			itemsJSON = &s
		}
	}

	phone := strings.TrimSpace(req.CustomerPhone)
	if phone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Customer phone is required"})
		return
	}

	customerName := normalizeOptionalText(req.CustomerName)
	userRemarks := normalizeOptionalText(req.Remarks)

	finalRemarks := userRemarks

	reservationTimeStr := reservationTime.Format("2006-01-02 15:04:05")

	query := `
		INSERT INTO reservations (shop_id, guest_count, reservation_time, customer_phone, dine_type, customer_name, items_json, remarks, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
	`
	res, err := db.DB.Exec(query,
		shopID,
		req.GuestCount,
		reservationTimeStr,
		phone,
		req.DineType,
		customerName,
		itemsJSON,
		finalRemarks,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create reservation"})
		return
	}

	id, _ := res.LastInsertId()

	publishRealtimeAsync(shopID, gin.H{
		"event":          "new_reservation",
		"reservation_id": id,
		"status":         "pending",
	})
	publishOrderAsync(shopID, gin.H{
		"type":             "new_reservation",
		"event":            "new_reservation",
		"reservation_id":   id,
		"dine_type":        req.DineType,
		"reservation_time": reservationTimeStr,
		"status":           "pending",
	})

	c.JSON(http.StatusCreated, gin.H{
		"message":        "Reservation created",
		"reservation_id": id,
	})
}

func (h *ReservationHandler) ListReservations(c *gin.Context) {
	shopID, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	shopIDInt := utils.Int64(shopID)
	if shopIDInt <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	if status, body, blocked := reservationFeatureGate(shopIDInt); blocked {
		c.JSON(status, body)
		return
	}

	date := c.Query("date")
	reqStatus := c.Query("status")

	query := `SELECT 
		id, shop_id, guest_count, reservation_time, customer_phone, 
		dine_type, COALESCE(customer_name, '') as customer_name, 
		COALESCE(items_json, '[]') as items_json, 
		COALESCE(remarks, '') as remarks, 
		status, created_at, updated_at 
	FROM reservations WHERE shop_id = ?`

	args := []any{shopIDInt}

	if date != "" {
		query += " AND date(reservation_time) = date(?)"
		args = append(args, date)
	} else {
		// 默认最近7天
		query += " AND date(reservation_time) >= date('now', 'localtime') AND date(reservation_time) <= date('now', 'localtime', '+7 days')"
	}

	if reqStatus != "" {
		query += " AND status = ?"
		args = append(args, reqStatus)
	}

	query += " ORDER BY reservation_time ASC"

	var reservations []db.Reservation
	err := db.DB.Select(&reservations, query, args...)
	if err != nil {
		fmt.Printf("[ListReservations Error] %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch reservations"})
		return
	}

	if reservations == nil {
		reservations = []db.Reservation{}
	}

	c.JSON(http.StatusOK, reservations)
}

func (h *ReservationHandler) UpdateReservationStatus(c *gin.Context) {
	shopID, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	shopIDInt := utils.Int64(shopID)

	reservationID := c.Param("id")

	var req UpdateReservationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status"})
		return
	}

	var count int
	err := db.DB.Get(&count, "SELECT count(*) FROM reservations WHERE id = ? AND shop_id = ?", reservationID, shopIDInt)
	if err != nil || count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Reservation not found"})
		return
	}

	_, err = db.DB.Exec("UPDATE reservations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", req.Status, reservationID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update reservation"})
		return
	}

	publishRealtimeAsync(shopIDInt, gin.H{
		"event":          "reservation_status_update",
		"reservation_id": reservationID,
		"status":         req.Status,
	})

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Reservation updated"})
}

func (h *ReservationHandler) CheckinReservation(c *gin.Context) {
	shopID, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	shopIDInt := utils.Int64(shopID)

	reservationID := c.Param("id")

	var req CheckinReservationRequest
	_ = c.ShouldBindJSON(&req)

	var r db.Reservation
	err := db.DB.Get(&r, `SELECT 
		id, shop_id, guest_count, reservation_time, customer_phone, 
		dine_type, COALESCE(customer_name, '') as customer_name, 
		COALESCE(items_json, '[]') as items_json, 
		COALESCE(remarks, '') as remarks, 
		status, created_at, updated_at 
	FROM reservations WHERE id = ? AND shop_id = ?`, reservationID, shopIDInt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Reservation not found"})
		return
	}

	_, err = db.DB.Exec("UPDATE reservations SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", reservationID)

	itemsStr := ""
	if r.ItemsJSON != nil {
		itemsStr = *r.ItemsJSON
	}

	hasItems := itemsStr != "" && itemsStr != "{}" && itemsStr != "[]" && itemsStr != "null"
	tableInfo := strings.TrimSpace(req.TableInfo)
	var orderID int64 = 0

	if hasItems && tableInfo != "" {
		var items any
		total := int64(0)
		if err := json.Unmarshal([]byte(itemsStr), &items); err == nil {
			if list, ok := items.([]any); ok {
				for _, item := range list {
					if m, ok := item.(map[string]any); ok {
						p := int64(utils.GetFloat64(m["price"]))
						q := int64(utils.GetFloat64(m["quantity"]))
						if q < 1 {
							q = 1
						}
						total += p * q
					}
				}
			}
		}

		orderNo := generateOrderNo(shopIDInt)
		res, err := db.DB.Exec(`
			INSERT INTO orders (
				order_no, shop_id, table_info, order_type, status, 
				total_amount, items_json, remarks_json, user_phone, created_at
			) VALUES (?, ?, ?, 'dine_in', 'pending', ?, ?, ?, ?, CURRENT_TIMESTAMP)
		`, orderNo, shopIDInt, tableInfo, total, itemsStr, "[]", r.CustomerPhone)

		if err == nil {
			orderID, _ = res.LastInsertId()
			publishRealtimeAsync(shopIDInt, gin.H{"event": "new_order", "order_id": orderID, "table": tableInfo})
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "order_id": orderID})
}

func (h *ReservationHandler) PrintReservation(c *gin.Context) {
	c.JSON(http.StatusGone, gin.H{
		"success": false,
		"error":   "Reservation printing has been removed",
		"code":    "reservation_print_removed",
	})
}

func (h *ReservationHandler) GetReservationStats(c *gin.Context) {
	shopID, _ := c.Get("shop_id")
	shopIDInt := utils.Int64(shopID)
	today := time.Now().Format("2006-01-02")

	var stats struct {
		TodayTotal     int `json:"today_total"`
		TodayPending   int `json:"today_pending"`
		TodayConfirmed int `json:"today_confirmed"`
		TodayCompleted int `json:"today_completed"`
		TodayCancelled int `json:"today_cancelled"`
	}

	db.DB.Get(&stats.TodayTotal, "SELECT COUNT(*) FROM reservations WHERE shop_id = ? AND date(reservation_time) = ?", shopIDInt, today)
	db.DB.Get(&stats.TodayPending, "SELECT COUNT(*) FROM reservations WHERE shop_id = ? AND date(reservation_time) = ? AND status = 'pending'", shopIDInt, today)
	db.DB.Get(&stats.TodayConfirmed, "SELECT COUNT(*) FROM reservations WHERE shop_id = ? AND date(reservation_time) = ? AND status = 'confirmed'", shopIDInt, today)
	db.DB.Get(&stats.TodayCompleted, "SELECT COUNT(*) FROM reservations WHERE shop_id = ? AND date(reservation_time) = ? AND status = 'completed'", shopIDInt, today)
	db.DB.Get(&stats.TodayCancelled, "SELECT COUNT(*) FROM reservations WHERE shop_id = ? AND date(reservation_time) = ? AND status = 'cancelled'", shopIDInt, today)

	c.JSON(http.StatusOK, stats)
}
