package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"meituan-go/internal/db"
	"meituan-go/internal/security"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
)

type riderAuthRequest struct {
	Action   string `json:"action"`
	Name     string `json:"name"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

type riderStatusRequest struct {
	ID     int64  `json:"id"`
	Status string `json:"status"`
}

type userRegisterRequest struct {
	AccountType string `json:"account_type"`
	Account     string `json:"account"`
	Password    string `json:"password"`
	Name        string `json:"name"`
}

type userHistoryRequest struct {
	LoginAccount string `json:"login_account"`
	Password     string `json:"password"`
	SessionToken string `json:"sessionToken"`
}

type userAddressRequest struct {
	Action       string `json:"action"`
	SessionToken string `json:"sessionToken"`
	Address      string `json:"address"`
}

type userUpdateRequest struct {
	LoginAccount string `json:"login_account"`
	Phone        string `json:"phone"`
}

type orderStatusRequest struct {
	ID           int64  `json:"id"`
	Status       string `json:"status"`
	CourierName  string `json:"courier_name"`
	CourierPhone string `json:"courier_phone"`
}

func mustHashPassword(password string) string {
	hash, err := security.HashPassword(password)
	if err != nil {
		return password
	}
	return hash
}

func RiderAuth(c *gin.Context) {
	var req riderAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}

	req.Action = strings.TrimSpace(req.Action)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Password = strings.TrimSpace(req.Password)

	switch req.Action {
	case "register":
		if req.Name == "" || req.Phone == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "name/phone/password required"})
			return
		}

		_, err := db.DB.Exec(
			"INSERT INTO riders (name, phone, password, status) VALUES (?, ?, ?, 'offline')",
			req.Name, req.Phone, mustHashPassword(req.Password),
		)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "phone already exists"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true})
	case "login":
		if req.Phone == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "phone/password required"})
			return
		}

		var rider db.Rider
		err := db.DB.Get(&rider, "SELECT * FROM riders WHERE phone = ? LIMIT 1", req.Phone)
		stored := ""
		if rider.Password != nil {
			stored = *rider.Password
		}
		ok, needsUpgrade := security.VerifyPassword(stored, req.Password)
		if err != nil || !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "invalid credentials"})
			return
		}
		if needsUpgrade {
			if hash, err := security.HashPassword(req.Password); err == nil {
				_, _ = db.DB.Exec("UPDATE riders SET password = ? WHERE id = ?", hash, rider.ID)
			}
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "rider": rider})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "unknown action"})
	}
}

func RiderStatus(c *gin.Context) {
	var req riderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}
	if req.ID == 0 || req.Status == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id/status required"})
		return
	}

	_, err := db.DB.Exec("UPDATE riders SET status = ? WHERE id = ?", req.Status, req.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func RiderOrders(c *gin.Context) {
	phone := strings.TrimSpace(c.Query("phone"))
	if phone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "phone required"})
		return
	}

	type riderOrder struct {
		db.Order
		ShopName *string `db:"shop_name" json:"shop_name"`
	}
	orders := []riderOrder{}
	err := db.DB.Select(&orders, `
		SELECT o.*, s.name AS shop_name
		FROM orders o
		LEFT JOIN shops s ON s.id = o.shop_id
		WHERE
			(o.order_type = 'delivery' AND (o.status IN ('pending','confirmed') AND (o.courier_phone IS NULL OR o.courier_phone = '')))
			OR
			(o.order_type = 'delivery' AND o.courier_phone = ?)
		ORDER BY
			CASE
				WHEN o.courier_phone = ? THEN 0
				ELSE 1
			END,
			o.created_at DESC
		LIMIT 100
	`, phone, phone)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "query failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "orders": orders})
}

func UserRegister(c *gin.Context) {
	var req userRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}

	account := strings.TrimSpace(req.Account)
	name := strings.TrimSpace(req.Name)
	password := strings.TrimSpace(req.Password)

	if account == "" || name == "" || password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "account/name/password required"})
		return
	}

	var phone *string
	if req.AccountType == "phone" {
		phone = &account
	}

	_, err := db.DB.Exec(`
		INSERT INTO users (phone, name, password, login_account)
		VALUES (?, ?, ?, ?)
	`, phone, name, mustHashPassword(password), account)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "account already exists"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "sessionToken": account})
}

func UserHistory(c *gin.Context) {
	if c.Request.Method == "GET" {
		phone := c.Query("phone")
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "phone required"})
			return
		}
		var orders []db.Order
		err := db.DB.Select(&orders, "SELECT * FROM orders WHERE user_phone = ? ORDER BY created_at DESC LIMIT 50", phone)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to fetch history"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "orders": orders})
		return
	}

	var req userHistoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}

	// New flow: sessionToken -> delivery-only order history
	token := strings.TrimSpace(req.SessionToken)
	if token != "" {
		var user db.User
		err := db.DB.Get(&user, `
			SELECT id, phone, name, password, login_account, last_address, email, avatar, created_at
			FROM users
			WHERE login_account = ?
			LIMIT 1
		`, token)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "invalid session"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to load session"})
			return
		}

		keys := []any{token}
		if user.Phone != nil {
			p := strings.TrimSpace(*user.Phone)
			if p != "" && p != token {
				keys = append(keys, p)
			}
		}

		var orders []db.Order
		if len(keys) == 2 {
			err = db.DB.Select(&orders, `
				SELECT *
				FROM orders
				WHERE order_type = 'delivery'
				  AND user_phone IN (?, ?)
				ORDER BY created_at DESC
				LIMIT 50
			`, keys[0], keys[1])
		} else {
			err = db.DB.Select(&orders, `
				SELECT *
				FROM orders
				WHERE order_type = 'delivery'
				  AND user_phone = ?
				ORDER BY created_at DESC
				LIMIT 50
			`, keys[0])
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to fetch history"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "orders": orders})
		return
	}

	// Legacy flow: login_account + password -> return sessionToken + user
	acc := strings.TrimSpace(req.LoginAccount)
	pwd := strings.TrimSpace(req.Password)
	if acc == "" || pwd == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "login_account/password required"})
		return
	}

	var user db.User
	err := db.DB.Get(&user, `
		SELECT id, phone, name, password, login_account
		FROM users
		WHERE login_account = ? OR phone = ?
		LIMIT 1
	`, acc, acc)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "invalid credentials"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "login failed"})
		return
	}

	storedPwd := ""
	if user.Password != nil {
		storedPwd = *user.Password
	}

	ok, needsUpgrade := security.VerifyPassword(storedPwd, pwd)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "invalid credentials"})
		return
	}
	if needsUpgrade {
		if hash, err := security.HashPassword(pwd); err == nil {
			_, _ = db.DB.Exec("UPDATE users SET password = ? WHERE id = ?", hash, user.ID)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"sessionToken": acc,
		"user":         user,
	})
}

func UserAddress(c *gin.Context) {
	var req userAddressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}

	token := strings.TrimSpace(req.SessionToken)
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "sessionToken required"})
		return
	}

	switch req.Action {
	case "get":
		var addr *string
		err := db.DB.Get(&addr, `
			SELECT last_address FROM users
			WHERE login_account = ? OR phone = ?
			LIMIT 1
		`, token, token)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": true, "address": ""})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "address": valueOr("", addr)})
	case "update":
		_, err := db.DB.Exec(`
			UPDATE users SET last_address = ?
			WHERE login_account = ? OR phone = ?
		`, req.Address, token, token)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "unknown action"})
	}
}

func UserUpdate(c *gin.Context) {
	var req userUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}
	if strings.TrimSpace(req.LoginAccount) == "" || strings.TrimSpace(req.Phone) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "login_account/phone required"})
		return
	}

	_, err := db.DB.Exec(`
		UPDATE users SET phone = ?
		WHERE login_account = ? OR phone = ?
	`, req.Phone, req.LoginAccount, req.LoginAccount)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "phone already in use"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func OrderUpdateStatus(c *gin.Context) {
	var req orderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}
	if req.ID == 0 || strings.TrimSpace(req.Status) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id/status required"})
		return
	}

	if req.CourierName != "" || req.CourierPhone != "" {
		_, err := db.DB.Exec(`
			UPDATE orders
			SET status = ?, courier_name = ?, courier_phone = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, req.Status, utils.StringPtr(req.CourierName), utils.StringPtr(req.CourierPhone), req.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update failed"})
			return
		}
		var shopID int64
		if err := db.DB.Get(&shopID, "SELECT shop_id FROM orders WHERE id = ? LIMIT 1", req.ID); err == nil {
			publishOrderAsync(shopID, gin.H{
				"event":         "status_update",
				"order_id":      req.ID,
				"status":        req.Status,
				"courier_phone": req.CourierPhone,
			})
			publishRealtimeAsync(shopID, gin.H{
				"event":    "status_update",
				"order_id": req.ID,
				"status":   req.Status,
			})
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}

	_, err := db.DB.Exec("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", req.Status, req.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update failed"})
		return
	}
	var shopID int64
	if err := db.DB.Get(&shopID, "SELECT shop_id FROM orders WHERE id = ? LIMIT 1", req.ID); err == nil {
		publishOrderAsync(shopID, gin.H{
			"event":    "status_update",
			"order_id": req.ID,
			"status":   req.Status,
		})
		publishRealtimeAsync(shopID, gin.H{
			"event":    "status_update",
			"order_id": req.ID,
			"status":   req.Status,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func PublicOrderStatus(c *gin.Context) {
	id := strings.TrimSpace(c.Query("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id required"})
		return
	}

	var row struct {
		Status      string  `db:"status"`
		RemarksJSON *string `db:"remarks_json"`
	}
	if err := db.DB.Get(&row, `
		SELECT status, remarks_json
		FROM orders
		WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
	`, id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "order not found"})
		return
	}

	remarks := []string{}
	if row.RemarksJSON != nil && strings.TrimSpace(*row.RemarksJSON) != "" {
		_ = json.Unmarshal([]byte(*row.RemarksJSON), &remarks)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  row.Status,
		"remarks": remarks,
	})
}

func PublicOrdersByTable(c *gin.Context) {
	slug := strings.TrimSpace(c.Query("slug"))
	table := strings.TrimSpace(c.Query("table"))
	if slug == "" || table == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "slug and table required"})
		return
	}

	shopID, err := getShopIDBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "shop not found"})
		return
	}

	var orders []struct {
		ID          int64   `db:"id" json:"id"`
		OrderNo     string  `db:"order_no" json:"order_no"`
		Status      string  `db:"status" json:"status"`
		TotalAmount int64   `db:"total_amount" json:"total_amount"`
		ItemsJSON   string  `db:"items_json" json:"items_json"`
		CreatedAt   *string `db:"created_at" json:"created_at"`
		TableInfo   *string `db:"table_info" json:"table_info"`
	}

	err = db.DB.Select(&orders, `
		SELECT id, order_no, status, total_amount, items_json, created_at, table_info
		FROM orders
		WHERE shop_id = ?
		  AND order_type = 'dine_in'
		  AND (table_info = ? OR table_info LIKE ?)
		  AND (is_deleted = 0 OR is_deleted IS NULL)
		ORDER BY id DESC
		LIMIT 20
	`, shopID, table, table+" %")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "query failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"orders":  orders,
	})
}

func valueOr(fallback string, ptr *string) string {
	if ptr == nil {
		return fallback
	}
	v := strings.TrimSpace(*ptr)
	if v == "" {
		return fallback
	}
	return v
}
