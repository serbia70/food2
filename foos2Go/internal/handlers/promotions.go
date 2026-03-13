package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/services/mqtt"

	"github.com/gin-gonic/gin"
)

type promotion struct {
	ID                int64      `db:"id" json:"id"`
	ShopID            int64      `db:"shop_id" json:"shop_id"`
	Name              string     `db:"name" json:"name"`
	PromoType         string     `db:"promo_type" json:"promo_type"`
	DiscountPercent   *float64   `db:"discount_percent" json:"discount_percent,omitempty"`
	MinSpendRSD       *int64     `db:"min_spend_rsd" json:"min_spend_rsd,omitempty"`
	DiscountAmountRSD *int64     `db:"discount_amount_rsd" json:"discount_amount_rsd,omitempty"`
	BonusPoints       *int64     `db:"bonus_points" json:"bonus_points,omitempty"`
	SelectedProducts  *string    `db:"selected_products" json:"selected_products,omitempty"`
	SpecialPriceRSD   *int64     `db:"special_price_rsd" json:"special_price_rsd,omitempty"`
	StartsAt          *time.Time `db:"starts_at" json:"starts_at,omitempty"`
	EndsAt            *time.Time `db:"ends_at" json:"ends_at,omitempty"`
	Stackable         int        `db:"stackable" json:"stackable"`
	IsActive          int        `db:"is_active" json:"is_active"`
	CreatedAt         time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt         time.Time  `db:"updated_at" json:"updated_at"`
}

type loyaltyPoints struct {
	ID                 int64     `db:"id" json:"id"`
	ShopID             int64     `db:"shop_id" json:"shop_id"`
	UserPhone          string    `db:"user_phone" json:"user_phone"`
	PointsBalance      int64     `db:"points_balance" json:"points_balance"`
	IsVIP              int       `db:"is_vip" json:"is_vip"`
	VIPDiscountPercent float64   `db:"vip_discount_percent" json:"vip_discount_percent"`
	TotalSpendRSD      int64     `db:"total_spend_rsd" json:"total_spend_rsd"`
	CreatedAt          time.Time `db:"created_at" json:"created_at"`
	UpdatedAt          time.Time `db:"updated_at" json:"updated_at"`
}

type chatMessage struct {
	ID          int64     `db:"id" json:"id"`
	ShopID      int64     `db:"shop_id" json:"shop_id"`
	OrderID     *int64    `db:"order_id" json:"order_id,omitempty"`
	SenderRole  string    `db:"sender_role" json:"sender_role"`
	SenderPhone *string   `db:"sender_phone" json:"sender_phone,omitempty"`
	Message     string    `db:"message" json:"message"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
}

type createPromotionRequest struct {
	Name              string   `json:"name" binding:"required"`
	PromoType         string   `json:"promo_type" binding:"required"`
	DiscountPercent   *float64 `json:"discount_percent"`
	MinSpendRSD       *int64   `json:"min_spend_rsd"`
	DiscountAmountRSD *int64   `json:"discount_amount_rsd"`
	BonusPoints       *int64   `json:"bonus_points"`
	SelectedProducts  *[]int64 `json:"selected_products"`
	SpecialPriceRSD   *int64   `json:"special_price_rsd"`
	StartsAt          *string  `json:"starts_at"`
	EndsAt            *string  `json:"ends_at"`
	Stackable         bool     `json:"stackable"`
}

type promotionPayload struct {
	Stackable            int
	StartsAt             *time.Time
	EndsAt               *time.Time
	SelectedProductsJSON *string
}

type promotionSQLArgs struct {
	Name                 string
	PromoType            string
	DiscountPercent      *float64
	MinSpendRSD          *int64
	DiscountAmountRSD    *int64
	BonusPoints          *int64
	SelectedProductsJSON *string
	SpecialPriceRSD      *int64
	StartsAt             *time.Time
	EndsAt               *time.Time
	Stackable            int
}

func (pr *createPromotionRequest) normalize() error {
	if pr.PromoType != "spend_discount" && pr.PromoType != "percent_discount" && pr.PromoType != "bonus_points" && pr.PromoType != "special" {
		return fmt.Errorf("invalid promo_type")
	}
	return nil
}

func buildPromotionPayload(req createPromotionRequest) promotionPayload {
	payload := promotionPayload{}
	if req.Stackable {
		payload.Stackable = 1
	}
	payload.StartsAt = parsePromotionTime(req.StartsAt)
	payload.EndsAt = parsePromotionTime(req.EndsAt)
	payload.SelectedProductsJSON = encodePromotionProductIDs(req.SelectedProducts)
	return payload
}

func buildPromotionSQLArgs(req createPromotionRequest, payload promotionPayload) promotionSQLArgs {
	return promotionSQLArgs{
		Name:                 req.Name,
		PromoType:            req.PromoType,
		DiscountPercent:      req.DiscountPercent,
		MinSpendRSD:          req.MinSpendRSD,
		DiscountAmountRSD:    req.DiscountAmountRSD,
		BonusPoints:          req.BonusPoints,
		SelectedProductsJSON: payload.SelectedProductsJSON,
		SpecialPriceRSD:      req.SpecialPriceRSD,
		StartsAt:             payload.StartsAt,
		EndsAt:               payload.EndsAt,
		Stackable:            payload.Stackable,
	}
}

func getShopIDFromContext(c *gin.Context) (int64, bool) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return 0, false
	}
	return shopIDRaw.(int64), true
}

func parsePromotionID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid promotion ID"})
		return 0, false
	}
	return id, true
}

func readPromotionRequest(c *gin.Context) (createPromotionRequest, promotionSQLArgs, bool) {
	var req createPromotionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid promotion request"})
		return createPromotionRequest{}, promotionSQLArgs{}, false
	}
	if err := req.normalize(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid promotion payload"})
		return createPromotionRequest{}, promotionSQLArgs{}, false
	}
	payload := buildPromotionPayload(req)
	return req, buildPromotionSQLArgs(req, payload), true
}

func listPromotionsByShop(shopID int64) ([]promotion, error) {
	var promotions []promotion
	err := db.DB.Select(&promotions, `
		SELECT id, shop_id, name, promo_type, discount_percent, min_spend_rsd,
		       discount_amount_rsd, bonus_points, selected_products, special_price_rsd, starts_at, ends_at, stackable,
		       is_active, created_at, updated_at
		FROM shop_promotions
		WHERE shop_id = ?
		ORDER BY created_at DESC
	`, shopID)
	return promotions, err
}

func insertPromotion(shopID int64, args promotionSQLArgs) (int64, error) {
	result, err := db.DB.Exec(`
		INSERT INTO shop_promotions 
		(shop_id, name, promo_type, discount_percent, min_spend_rsd, discount_amount_rsd, 
		 bonus_points, selected_products, special_price_rsd, starts_at, ends_at, stackable, is_active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
	`, shopID, args.Name, args.PromoType, args.DiscountPercent, args.MinSpendRSD,
		args.DiscountAmountRSD, args.BonusPoints, args.SelectedProductsJSON, args.SpecialPriceRSD, args.StartsAt, args.EndsAt, args.Stackable)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func updatePromotion(shopID int64, id int64, args promotionSQLArgs) error {
	_, err := db.DB.Exec(`
		UPDATE shop_promotions
		SET name = ?, promo_type = ?, discount_percent = ?, min_spend_rsd = ?, 
		    discount_amount_rsd = ?, bonus_points = ?, selected_products = ?, special_price_rsd = ?,
		    starts_at = ?, ends_at = ?, 
		    stackable = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ? AND shop_id = ?
	`, args.Name, args.PromoType, args.DiscountPercent, args.MinSpendRSD,
		args.DiscountAmountRSD, args.BonusPoints, args.SelectedProductsJSON, args.SpecialPriceRSD,
		args.StartsAt, args.EndsAt, args.Stackable, id, shopID)
	return err
}

func deletePromotion(shopID int64, id int64) error {
	_, err := db.DB.Exec("DELETE FROM shop_promotions WHERE id = ? AND shop_id = ?", id, shopID)
	return err
}

func togglePromotionActive(shopID int64, id int64) (int, error) {
	var currentActive int
	if err := db.DB.Get(&currentActive, "SELECT is_active FROM shop_promotions WHERE id = ? AND shop_id = ?", id, shopID); err != nil {
		return 0, err
	}
	newActive := 1
	if currentActive == 1 {
		newActive = 0
	}
	_, err := db.DB.Exec("UPDATE shop_promotions SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?", newActive, id, shopID)
	return newActive, err
}

func parsePromotionTime(raw *string) *time.Time {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	if t, err := time.Parse("2006-01-02T15:04:05", *raw); err == nil {
		return &t
	}
	if t, err := time.Parse("2006-01-02", *raw); err == nil {
		return &t
	}
	return nil
}

func encodePromotionProductIDs(ids *[]int64) *string {
	if ids == nil || len(*ids) == 0 {
		return nil
	}
	parts := make([]string, 0, len(*ids))
	for _, pid := range *ids {
		parts = append(parts, strconv.FormatInt(pid, 10))
	}
	encoded := "[" + strings.Join(parts, ",") + "]"
	return &encoded
}

func AdminListPromotions(c *gin.Context) {
	shopID, ok := getShopIDFromContext(c)
	if !ok {
		return
	}

	promotions, err := listPromotionsByShop(shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load promotions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "promotions": promotions})
}

func AdminCreatePromotion(c *gin.Context) {
	shopID, ok := getShopIDFromContext(c)
	if !ok {
		return
	}

	_, args, ok := readPromotionRequest(c)
	if !ok {
		return
	}

	id, err := insertPromotion(shopID, args)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create promotion"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "id": id})
}

func AdminUpdatePromotion(c *gin.Context) {
	shopID, ok := getShopIDFromContext(c)
	if !ok {
		return
	}

	id, ok := parsePromotionID(c)
	if !ok {
		return
	}

	_, args, ok := readPromotionRequest(c)
	if !ok {
		return
	}

	err := updatePromotion(shopID, id, args)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update promotion"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminDeletePromotion(c *gin.Context) {
	shopID, ok := getShopIDFromContext(c)
	if !ok {
		return
	}
	id, ok := parsePromotionID(c)
	if !ok {
		return
	}

	err := deletePromotion(shopID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete promotion"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminTogglePromotion(c *gin.Context) {
	shopID, ok := getShopIDFromContext(c)
	if !ok {
		return
	}
	id, ok := parsePromotionID(c)
	if !ok {
		return
	}

	newActive, err := togglePromotionActive(shopID, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Promotion not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to toggle promotion"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "is_active": newActive})
}

func AdminListCustomers(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID := shopIDRaw.(int64)

	type customerWithStats struct {
		UserPhone          string  `db:"user_phone" json:"user_phone"`
		UserName           string  `db:"user_name" json:"user_name,omitempty"`
		TotalSpendRSD      int64   `db:"total_spend_rsd" json:"total_spend_rsd"`
		MonthSpendRSD      int64   `db:"month_spend_rsd" json:"month_spend_rsd"`
		OrderCount         int64   `db:"order_count" json:"order_count"`
		MonthOrderCount    int64   `db:"month_order_count" json:"month_order_count"`
		LastOrderAt        *string `db:"last_order_at" json:"last_order_at,omitempty"`
		IsVIP              int     `db:"is_vip" json:"is_vip"`
		PointsBalance      int64   `db:"points_balance" json:"points_balance"`
		VIPDiscountPercent float64 `db:"vip_discount_percent" json:"vip_discount_percent"`
	}

	var customers []customerWithStats
	err := db.DB.Select(&customers, `
		SELECT 
			o.user_phone,
			COALESCE(u.name, '') as user_name,
			COALESCE(SUM(o.total_amount), 0) as total_spend_rsd,
			COUNT(*) as order_count,
			SUM(CASE WHEN strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) as month_order_count,
			COALESCE(SUM(CASE WHEN strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now') THEN o.total_amount ELSE 0 END), 0) as month_spend_rsd,
			MAX(o.created_at) as last_order_at,
			COALESCE(lp.is_vip, 0) as is_vip,
			COALESCE(lp.points_balance, 0) as points_balance,
			COALESCE(lp.vip_discount_percent, 100) as vip_discount_percent
		FROM orders o
		LEFT JOIN users u ON o.user_phone = u.phone
		LEFT JOIN shop_loyalty_points lp ON o.user_phone = lp.user_phone AND lp.shop_id = o.shop_id
		WHERE o.shop_id = ? AND o.user_phone IS NOT NULL AND TRIM(o.user_phone) != ''
		GROUP BY o.user_phone
		ORDER BY total_spend_rsd DESC
	`, shopID)
	if err != nil {
		log.Printf("AdminListCustomers error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load customers"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "customers": customers})
}

func AdminExportCustomersCSV(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID := shopIDRaw.(int64)

	var customers []loyaltyPoints
	err := db.DB.Select(&customers, `
		SELECT user_phone, points_balance, is_vip, vip_discount_percent, total_spend_rsd
		FROM shop_loyalty_points
		WHERE shop_id = ?
		ORDER BY total_spend_rsd DESC
	`, shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load customers"})
		return
	}

	filename := fmt.Sprintf("customers_%d_%s.csv", shopID, time.Now().Format("20060102"))
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	writer := csv.NewWriter(c.Writer)
	writer.Write([]string{"手机号", "积分余额", "VIP", "VIP折扣%", "累计消费(RSD)"})
	for _, cust := range customers {
		vipStatus := "普通"
		if cust.IsVIP == 1 {
			vipStatus = "VIP"
		}
		writer.Write([]string{
			cust.UserPhone,
			strconv.FormatInt(cust.PointsBalance, 10),
			vipStatus,
			fmt.Sprintf("%.0f", cust.VIPDiscountPercent),
			strconv.FormatInt(cust.TotalSpendRSD, 10),
		})
	}
	writer.Flush()
}

type modifyCustomerPointsRequest struct {
	UserPhone string `json:"user_phone" binding:"required"`
	Points    int64  `json:"points"`
	Action    string `json:"action"`
}

func AdminModifyCustomerPoints(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID := shopIDRaw.(int64)

	var req modifyCustomerPointsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid customer points request"})
		return
	}

	if req.Points <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "points must be positive"})
		return
	}

	action := strings.ToLower(strings.TrimSpace(req.Action))
	if action == "deduct" {
		_, err := db.DB.Exec(`
			UPDATE shop_loyalty_points
			SET points_balance = points_balance - ?, updated_at = CURRENT_TIMESTAMP
			WHERE shop_id = ? AND user_phone = ? AND points_balance >= ?
		`, req.Points, shopID, req.UserPhone, req.Points)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to deduct points"})
			return
		}
	} else {
		_, err := db.DB.Exec(`
			INSERT INTO shop_loyalty_points (shop_id, user_phone, points_balance, is_vip, vip_discount_percent, total_spend_rsd)
			VALUES (?, ?, ?, 0, 100, 0)
			ON CONFLICT(shop_id, user_phone) DO UPDATE SET 
				points_balance = points_balance + ?, updated_at = CURRENT_TIMESTAMP
		`, shopID, req.UserPhone, req.Points, req.Points)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to add points"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

type createCustomerRequest struct {
	UserPhone          string  `json:"user_phone" binding:"required"`
	PointsBalance      int64   `json:"points_balance"`
	IsVIP              bool    `json:"is_vip"`
	VIPDiscountPercent float64 `json:"vip_discount_percent"`
}

func AdminCreateCustomer(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID := shopIDRaw.(int64)

	var req createCustomerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid customer request"})
		return
	}

	userPhone := strings.TrimSpace(req.UserPhone)
	if userPhone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "user_phone is required"})
		return
	}

	points := req.PointsBalance
	if points < 0 {
		points = 0
	}

	vipDiscount := 100.0
	if req.IsVIP {
		vipDiscount = req.VIPDiscountPercent
		if vipDiscount <= 0 || vipDiscount > 100 {
			vipDiscount = 100
		}
	}

	isVIP := 0
	if req.IsVIP {
		isVIP = 1
	}

	_, err := db.DB.Exec(`
		INSERT INTO shop_loyalty_points (shop_id, user_phone, points_balance, is_vip, vip_discount_percent, total_spend_rsd)
		VALUES (?, ?, ?, ?, ?, 0)
		ON CONFLICT(shop_id, user_phone) DO UPDATE SET 
			points_balance = points_balance + ?,
			is_vip = ?,
			vip_discount_percent = ?,
			updated_at = CURRENT_TIMESTAMP
	`, shopID, userPhone, points, isVIP, vipDiscount, points, isVIP, vipDiscount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create customer"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

type setCustomerVipRequest struct {
	UserPhone          string  `json:"user_phone" binding:"required"`
	IsVIP              bool    `json:"is_vip"`
	VIPDiscountPercent float64 `json:"vip_discount_percent"`
}

func AdminSetCustomerVIP(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID := shopIDRaw.(int64)

	var req setCustomerVipRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid vip request"})
		return
	}

	vipStatus := 0
	if req.IsVIP {
		vipStatus = 1
	}
	discount := req.VIPDiscountPercent
	if discount <= 0 || discount > 100 {
		discount = 95
	}

	_, err := db.DB.Exec(`
		INSERT INTO shop_loyalty_points (shop_id, user_phone, points_balance, is_vip, vip_discount_percent, total_spend_rsd)
		VALUES (?, ?, 0, ?, ?, 0)
		ON CONFLICT(shop_id, user_phone) DO UPDATE SET 
			is_vip = ?, vip_discount_percent = ?, updated_at = CURRENT_TIMESTAMP
	`, shopID, req.UserPhone, vipStatus, discount, vipStatus, discount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to set VIP"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func AdminListChatMessages(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID := shopIDRaw.(int64)

	userPhone := c.Query("user_phone")
	if userPhone == "" {
		userPhone = c.Query("sender_phone")
	}

	var messages []chatMessage
	var err error

	if userPhone != "" {
		err = db.DB.Select(&messages, `
			SELECT id, shop_id, order_id, sender_role, sender_phone, message, created_at
			FROM chat_messages
			WHERE shop_id = ? AND sender_phone = ?
			ORDER BY created_at ASC
			LIMIT 100
		`, shopID, userPhone)
	} else {
		err = db.DB.Select(&messages, `
			SELECT id, shop_id, order_id, sender_role, sender_phone, message, created_at
			FROM chat_messages
			WHERE shop_id = ?
			ORDER BY created_at DESC
			LIMIT 100
		`, shopID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load messages"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "messages": messages})
}

type sendChatMessageRequest struct {
	OrderID     *int64 `json:"order_id"`
	SenderPhone string `json:"sender_phone"`
	Message     string `json:"message" binding:"required"`
}

func AdminSendChatMessage(c *gin.Context) {
	shopIDRaw, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopID := shopIDRaw.(int64)

	var req sendChatMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid chat message request"})
		return
	}
	if strings.TrimSpace(req.Message) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "message is required"})
		return
	}

	result, err := db.DB.Exec(`
		INSERT INTO chat_messages (shop_id, order_id, sender_role, sender_phone, message)
		VALUES (?, ?, 'admin', ?, ?)
	`, shopID, req.OrderID, req.SenderPhone, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to send message"})
		return
	}

	// Best-effort realtime publish (do not affect HTTP response)
	go func() {
		payload := gin.H{
			"shop_id":      shopID,
			"sender_role":  "admin",
			"sender_phone": strings.TrimSpace(req.SenderPhone),
			"message":      req.Message,
			"created_at":   time.Now().UTC(),
		}
		phone := strings.TrimSpace(req.SenderPhone)
		if phone == "" {
			phone = "shop"
			payload["sender_phone"] = phone
		}
		if err := mqtt.PublishChatMessage(shopID, phone, payload); err != nil {
			log.Printf("[MQTT] Publish chat failed (shop_id=%d phone=%s): %v", shopID, phone, err)
		}
	}()

	id, _ := result.LastInsertId()
	c.JSON(http.StatusOK, gin.H{"success": true, "id": id})
}

func GetActivePromotions(shopID int64) ([]promotion, error) {
	now := time.Now()
	var promotions []promotion
	err := db.DB.Select(&promotions, `
		SELECT id, shop_id, name, promo_type, discount_percent, min_spend_rsd, 
		       discount_amount_rsd, bonus_points, stackable
		FROM shop_promotions
		WHERE shop_id = ? AND is_active = 1
		  AND (starts_at IS NULL OR starts_at <= ?)
		  AND (ends_at IS NULL OR ends_at >= ?)
		ORDER BY min_spend_rsd DESC
	`, shopID, now, now)
	return promotions, err
}

func GetCustomerPoints(shopID int64, userPhone string) (loyaltyPoints, error) {
	var points loyaltyPoints
	err := db.DB.Get(&points, `
		SELECT id, shop_id, user_phone, points_balance, is_vip, vip_discount_percent, total_spend_rsd
		FROM shop_loyalty_points
		WHERE shop_id = ? AND user_phone = ?
	`, shopID, userPhone)
	if err == sql.ErrNoRows {
		return points, nil
	}
	return points, err
}

func AddPointsToCustomer(shopID int64, userPhone string, points int64) error {
	if points <= 0 {
		return nil
	}
	_, err := db.DB.Exec(`
		INSERT INTO shop_loyalty_points (shop_id, user_phone, points_balance, is_vip, vip_discount_percent, total_spend_rsd)
		VALUES (?, ?, ?, 0, 100, 0)
		ON CONFLICT(shop_id, user_phone) DO UPDATE SET 
			points_balance = points_balance + ?, updated_at = CURRENT_TIMESTAMP
	`, shopID, userPhone, points, points)
	return err
}

func DeductPointsFromCustomer(shopID int64, userPhone string, points int64) (int64, error) {
	if points <= 0 {
		return 0, nil
	}
	res, err := db.DB.Exec(`
		UPDATE shop_loyalty_points
		SET points_balance = points_balance - ?, updated_at = CURRENT_TIMESTAMP
		WHERE shop_id = ? AND user_phone = ? AND points_balance >= ?
	`, points, shopID, userPhone, points)
	if err != nil {
		return 0, err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		var currentPoints int64
		db.DB.Get(&currentPoints, "SELECT points_balance FROM shop_loyalty_points WHERE shop_id = ? AND user_phone = ?", shopID, userPhone)
		return currentPoints, fmt.Errorf("insufficient points")
	}
	return points, nil
}

func UpdateCustomerSpend(shopID int64, userPhone string, spendAmount int64) error {
	if spendAmount <= 0 {
		return nil
	}
	_, err := db.DB.Exec(`
		INSERT INTO shop_loyalty_points (shop_id, user_phone, points_balance, is_vip, vip_discount_percent, total_spend_rsd)
		VALUES (?, ?, 0, 0, 100, ?)
		ON CONFLICT(shop_id, user_phone) DO UPDATE SET 
			total_spend_rsd = total_spend_rsd + ?, updated_at = CURRENT_TIMESTAMP
	`, shopID, userPhone, spendAmount, spendAmount)
	return err
}

func checkAndUpgradeToVIP(shopID int64, userPhone string) {
	if shopID <= 0 || userPhone == "" {
		return
	}

	settings := getMasterSettingsMap()
	autoVipEnabled := true
	if v, ok := settings["auto_vip_enabled"].(bool); ok {
		autoVipEnabled = v
	}
	if !autoVipEnabled {
		return
	}

	monthlyThreshold := int64(20000)
	if v, ok := settings["auto_vip_monthly_threshold"].(float64); ok {
		monthlyThreshold = int64(v)
	}

	totalThreshold := int64(60000)
	if v, ok := settings["auto_vip_total_threshold"].(float64); ok {
		totalThreshold = int64(v)
	}

	var stats struct {
		TotalSpendRSD int64 `db:"total_spend_rsd"`
		MonthSpendRSD int64 `db:"month_spend_rsd"`
		IsVIP         int   `db:"is_vip"`
	}

	err := db.DB.Get(&stats, `
		SELECT COALESCE(total_spend_rsd, 0) as total_spend_rsd, 
		       COALESCE(month_spend_rsd, 0) as month_spend_rsd,
		       COALESCE(is_vip, 0) as is_vip
		FROM (
		    SELECT lp.total_spend_rsd, lp.is_vip,
		           COALESCE((
		               SELECT SUM(o.total_amount)
		               FROM orders o
		               WHERE o.shop_id = ? AND o.user_phone = ?
		               AND o.status NOT IN ('cancelled', 'rejected', 'deleted')
		               AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')
		       ), 0) as month_spend_rsd
		    FROM shop_loyalty_points lp
		    WHERE lp.shop_id = ? AND lp.user_phone = ?
		)
	`, shopID, userPhone, shopID, userPhone)

	if err != nil || stats.IsVIP == 1 {
		if stats.IsVIP == 1 {
			return
		}
	}

	err = db.DB.Get(&stats, `
		SELECT COALESCE(SUM(total_amount), 0) as total_spend_rsd, 0 as month_spend_rsd, 0 as is_vip
		FROM orders
		WHERE shop_id = ? AND user_phone = ?
		AND status NOT IN ('cancelled', 'rejected', 'deleted')
	`, shopID, userPhone)

	if err != nil {
		return
	}

	shouldUpgrade := false
	if stats.MonthSpendRSD >= monthlyThreshold {
		shouldUpgrade = true
		log.Printf("[AutoVIP] User %s monthly spend %d >= threshold %d", userPhone, stats.MonthSpendRSD, monthlyThreshold)
	}
	if stats.TotalSpendRSD >= totalThreshold {
		shouldUpgrade = true
		log.Printf("[AutoVIP] User %s total spend %d >= threshold %d", userPhone, stats.TotalSpendRSD, totalThreshold)
	}

	if shouldUpgrade {
		_, err := db.DB.Exec(`
			INSERT INTO shop_loyalty_points (shop_id, user_phone, points_balance, is_vip, vip_discount_percent, total_spend_rsd)
			VALUES (?, ?, 0, 1, 95, 0)
			ON CONFLICT(shop_id, user_phone) DO UPDATE SET 
				is_vip = 1, 
				vip_discount_percent = 95,
				updated_at = CURRENT_TIMESTAMP
			WHERE is_vip = 0
		`, shopID, userPhone)
		if err == nil {
			log.Printf("[AutoVIP] Upgraded user %s to VIP (monthly: %d, total: %d)", userPhone, stats.MonthSpendRSD, stats.TotalSpendRSD)
		}
	}
}

func UserListChatMessages(c *gin.Context) {
	userPhone := c.Query("sender_phone")
	if userPhone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "sender_phone required"})
		return
	}
	shopID := strings.TrimSpace(c.Query("shop_id"))

	var messages []chatMessage
	var err error
	if shopID != "" {
		err = db.DB.Select(&messages, `
			SELECT id, shop_id, order_id, sender_role, sender_phone, message, created_at
			FROM chat_messages
			WHERE sender_phone = ? AND shop_id = ?
			ORDER BY created_at ASC
			LIMIT 100
		`, userPhone, shopID)
	} else {
		err = db.DB.Select(&messages, `
			SELECT id, shop_id, order_id, sender_role, sender_phone, message, created_at
			FROM chat_messages
			WHERE sender_phone = ?
			ORDER BY created_at ASC
			LIMIT 100
		`, userPhone)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load messages"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "messages": messages})
}

type userSendChatRequest struct {
	SenderPhone string `json:"sender_phone" binding:"required"`
	Message     string `json:"message" binding:"required"`
	ShopID      *int64 `json:"shop_id"`
}

func UserSendChatMessage(c *gin.Context) {
	var req userSendChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid user chat request"})
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "message is required"})
		return
	}

	if (req.ShopID == nil || *req.ShopID <= 0) && strings.TrimSpace(c.Query("shop_id")) != "" {
		if parsed, err := strconv.ParseInt(strings.TrimSpace(c.Query("shop_id")), 10, 64); err == nil && parsed > 0 {
			req.ShopID = &parsed
		}
	}

	var targetShopID int64
	if req.ShopID != nil && *req.ShopID > 0 {
		targetShopID = *req.ShopID
	} else {
		// Keep behavior consistent with previous SQL (first shop)
		_ = db.DB.Get(&targetShopID, "SELECT id FROM shops LIMIT 1")
	}
	if targetShopID > 0 {
		result, err := db.DB.Exec(`
			INSERT INTO chat_messages (shop_id, sender_role, sender_phone, message)
			VALUES (?, 'user', ?, ?)
		`, targetShopID, req.SenderPhone, req.Message)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to send message"})
			return
		}

		// Best-effort realtime publish (do not affect HTTP response)
		go func(shopID int64, phone string, msg string) {
			payload := gin.H{
				"shop_id":      shopID,
				"sender_role":  "user",
				"sender_phone": strings.TrimSpace(phone),
				"message":      msg,
				"created_at":   time.Now().UTC(),
			}
			if err := mqtt.PublishChatMessage(shopID, strings.TrimSpace(phone), payload); err != nil {
				log.Printf("[MQTT] Publish chat failed (shop_id=%d phone=%s): %v", shopID, strings.TrimSpace(phone), err)
			}
		}(targetShopID, req.SenderPhone, req.Message)

		id, _ := result.LastInsertId()
		c.JSON(http.StatusOK, gin.H{"success": true, "id": id})
		return
	}

	c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid shop"})
}
