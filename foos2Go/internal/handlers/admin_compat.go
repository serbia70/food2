package handlers

import (
	"database/sql"
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

// Legacy admin compatibility layer.
//
// Boundary rules:
// 1. This file exists only to keep old admin clients working.
// 2. Do not add new product behavior here.
// 3. New admin features must go to dedicated handlers and explicit routes.
// 4. When a legacy action has no remaining client dependency, remove it here
//    instead of extending this compatibility surface.

type adminUpdateRequest struct {
	Action       string          `json:"action"`
	ID           int64           `json:"id"`
	OrderID      int64           `json:"orderId"`
	Status       string          `json:"status"`
	CourierName  string          `json:"courier_name"`
	CourierPhone string          `json:"courier_phone"`
	Reason       string          `json:"reason"`
	TableNum     string          `json:"tableNum"`
	ShopID       string          `json:"shopId"`
	Payload      json.RawMessage `json:"payload"`
}

type actionProductPayload struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	SubName    string `json:"sub_name"`
	Price      int64  `json:"price"`
	Img        string `json:"img"`
	Stock      int64  `json:"stock"`
	CategoryID int64  `json:"category_id"`
}

type actionCategoryPayload struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	SubName   string `json:"sub_name"`
	Direction string `json:"direction"`
	CID       int64  `json:"cid"`
}

type actionOrderPayload struct {
	ID        int64  `json:"id"`
	ItemsJSON string `json:"items_json"`
	Total     int64  `json:"total_amount"`
}

func AdminRiders(c *gin.Context) {
	riders := []db.Rider{}
	if err := db.DB.Select(&riders, "SELECT * FROM riders ORDER BY id DESC"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to load riders"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "riders": riders})
}

func AdminStats(c *gin.Context) {
	shopID, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopIDInt, _ := shopID.(int64)

	start := strings.TrimSpace(c.Query("start"))
	end := strings.TrimSpace(c.Query("end"))
	orderType := strings.TrimSpace(c.Query("type"))

	query := "SELECT * FROM orders WHERE shop_id = ?"
	args := []interface{}{shopIDInt}
	if start != "" && end != "" {
		query += " AND date(created_at) >= date(?) AND date(created_at) <= date(?)"
		args = append(args, start, end)
	}
	if orderType != "" && orderType != "all" {
		query += " AND order_type = ?"
		args = append(args, orderType)
	}
	query += " ORDER BY created_at DESC"

	orders := []db.Order{}
	if err := db.DB.Select(&orders, query, args...); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "query failed"})
		return
	}

	totalOrders := 0
	totalRevenue := int64(0)

	type topAgg struct {
		Count     int64
		Amount    int64
		Name      string
		ProductID int64
	}

	top := map[string]*topAgg{}
	productIDs := map[int64]struct{}{}

	addItem := func(item map[string]interface{}) {
		pid := utils.Int64(item["product_id"])
		if pid <= 0 {
			pid = utils.Int64(item["id"])
		}

		name := strings.TrimSpace(utils.String(item["name"]))
		if pid <= 0 && name == "" {
			return
		}

		key := ""
		if pid > 0 {
			key = "product:" + strconv.FormatInt(pid, 10)
			productIDs[pid] = struct{}{}
		} else {
			key = "name:" + name
		}

		qty := utils.Int64(item["quantity"])
		price := utils.Int64(item["price"])
		if qty <= 0 {
			qty = 1
		}
		amount := price * qty

		entry, ok := top[key]
		if !ok {
			entry = &topAgg{Name: name, ProductID: pid}
			top[key] = entry
		}
		if entry.Name == "" && name != "" {
			entry.Name = name
		}
		if entry.ProductID <= 0 && pid > 0 {
			entry.ProductID = pid
		}
		entry.Count += qty
		entry.Amount += amount
	}

	for _, o := range orders {
		if o.Status == "cancelled" {
			continue
		}
		totalOrders++
		totalRevenue += o.TotalAmount

		var list []map[string]interface{}
		if err := json.Unmarshal([]byte(o.ItemsJSON), &list); err == nil {
			for _, item := range list {
				addItem(item)
			}
			continue
		}

		var obj map[string]map[string]interface{}
		if err := json.Unmarshal([]byte(o.ItemsJSON), &obj); err == nil {
			for _, item := range obj {
				addItem(item)
			}
		}
	}

	type productRow struct {
		ID      int64   `db:"id"`
		Name    string  `db:"name"`
		SubName *string `db:"sub_name"`
	}

	productMap := map[int64]productRow{}
	if len(productIDs) > 0 {
		ids := make([]int64, 0, len(productIDs))
		for id := range productIDs {
			ids = append(ids, id)
		}
		ph := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
		args := make([]interface{}, 0, len(ids)+1)
		args = append(args, shopIDInt)
		for _, id := range ids {
			args = append(args, id)
		}
		rows := []productRow{}
		if err := db.DB.Select(&rows, "SELECT id, name, sub_name FROM products WHERE shop_id = ? AND id IN ("+ph+")", args...); err == nil {
			for _, row := range rows {
				productMap[row.ID] = row
			}
		}
	}

	type topItem struct {
		Name        string `json:"name"`
		DisplayName string `json:"display_name"`
		Count       int64  `json:"count"`
		Amount      int64  `json:"amount"`
	}
	topItems := make([]topItem, 0, len(top))
	for _, v := range top {
		name := strings.TrimSpace(v.Name)
		subName := ""
		if v.ProductID > 0 {
			if meta, ok := productMap[v.ProductID]; ok {
				if strings.TrimSpace(meta.Name) != "" {
					name = strings.TrimSpace(meta.Name)
				}
				if meta.SubName != nil && strings.TrimSpace(*meta.SubName) != "" {
					subName = strings.TrimSpace(*meta.SubName)
				}
			}
		}
		displayName := name
		if subName != "" {
			if displayName != "" {
				displayName += " / " + subName
			} else {
				displayName = subName
			}
		}
		topItems = append(topItems, topItem{Name: name, DisplayName: displayName, Count: v.Count, Amount: v.Amount})
	}
	// small-sort without extra deps
	for i := 0; i < len(topItems); i++ {
		for j := i + 1; j < len(topItems); j++ {
			if topItems[j].Count > topItems[i].Count {
				topItems[i], topItems[j] = topItems[j], topItems[i]
			}
		}
	}
	if len(topItems) > 20 {
		topItems = topItems[:20]
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"stats": gin.H{
			"totalOrders":  totalOrders,
			"totalRevenue": totalRevenue,
		},
		"topItems": topItems,
	})
}

func AdminRate(c *gin.Context) {
	shopID, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopIDInt, _ := shopID.(int64)

	var settingsStr sql.NullString
	_ = db.DB.QueryRow("SELECT settings FROM shops WHERE id = ?", shopIDInt).Scan(&settingsStr)
	rate := "1"
	if settingsStr.Valid && strings.TrimSpace(settingsStr.String) != "" {
		m := map[string]interface{}{}
		if err := json.Unmarshal([]byte(settingsStr.String), &m); err == nil {
			if currency, ok := m["currency"].(map[string]interface{}); ok {
				if v, ok := currency["rate"]; ok {
					rate = strings.TrimSpace(utils.String(v))
				}
			}
		}
	}
	if rate == "" {
		rate = "1"
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"rate":    rate,
		"date":    time.Now().Format("2006-01-02"),
	})
}

func AdminUpdateCompat(c *gin.Context) {
	shopID, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopIDInt, _ := shopID.(int64)

	var req adminUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}

	action := strings.TrimSpace(req.Action)

	switch action {
	case "update_table_config":
		settings, _ := getShopSettings(shopIDInt)
		payload := map[string]interface{}{}
		if err := decodeActionPayload(req.Payload, &payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
			return
		}
		if tc, ok := payload["table_config"]; ok {
			settings["table_config"] = tc
			if tcObj, ok2 := tc.(map[string]interface{}); ok2 {
				if zones, ok3 := tcObj["zones"]; ok3 {
					settings["tables"] = zones
				}
			}
		}
		buf, _ := json.Marshal(settings)
		_, err := db.DB.Exec("UPDATE shops SET settings = ?, table_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", string(buf), utils.JSONString(settings["table_config"]), shopIDInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "save table config failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	case "create_category":
		var p actionCategoryPayload
		if err := decodeActionPayload(req.Payload, &p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
			return
		}
		if strings.TrimSpace(p.Name) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "name required"})
			return
		}
		var maxSort int
		_ = db.DB.Get(&maxSort, "SELECT COALESCE(MAX(sort_order), 0) FROM categories WHERE shop_id = ?", shopIDInt)
		res, err := db.DB.Exec("INSERT INTO categories (shop_id, name, sort_order) VALUES (?, ?, ?)", shopIDInt, p.Name, maxSort+1)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "create category failed"})
			return
		}
		id, _ := res.LastInsertId()
		c.JSON(http.StatusOK, gin.H{"success": true, "id": id})
	case "create_product":
		var p actionProductPayload
		if err := decodeActionPayload(req.Payload, &p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
			return
		}
		if strings.TrimSpace(p.Name) == "" || p.Price <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "name/price required"})
			return
		}
		var maxSort int
		_ = db.DB.Get(&maxSort, "SELECT COALESCE(MAX(sort_order), 0) FROM products WHERE shop_id = ? AND category_id = ?", shopIDInt, p.CategoryID)
		_, err := db.DB.Exec(`
			INSERT INTO products (shop_id, category_id, name, sub_name, price, img, is_available, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, 1, ?)
		`, shopIDInt, utils.Int64Ptr(p.CategoryID), p.Name, utils.StringPtr(p.SubName), p.Price, utils.StringPtr(p.Img), maxSort+1)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "create product failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	case "update_product":
		var p actionProductPayload
		if err := decodeActionPayload(req.Payload, &p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
			return
		}
		if p.ID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id required"})
			return
		}
		_, err := db.DB.Exec(`
			UPDATE products
			SET category_id=?, name=?, sub_name=?, price=?, img=?, updated_at=CURRENT_TIMESTAMP
			WHERE id=? AND shop_id=?
		`, utils.Int64Ptr(p.CategoryID), p.Name, utils.StringPtr(p.SubName), p.Price, utils.StringPtr(p.Img), p.ID, shopIDInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update product failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	case "delete_product":
		var in struct {
			ID int64 `json:"id"`
		}
		if len(req.Payload) > 0 {
			if err := json.Unmarshal(req.Payload, &in); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
				return
			}
		}
		if in.ID == 0 {
			in.ID = req.ID
		}
		if in.ID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id required"})
			return
		}
		_, err := db.DB.Exec("DELETE FROM products WHERE id = ? AND shop_id = ?", in.ID, shopIDInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "delete product failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	case "move_category":
		var p actionCategoryPayload
		if err := decodeActionPayload(req.Payload, &p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
			return
		}
		if err := moveCategory(shopIDInt, p.ID, p.Direction); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "move category failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	case "move_product":
		var p actionCategoryPayload
		if err := decodeActionPayload(req.Payload, &p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
			return
		}
		if err := moveProduct(shopIDInt, p.ID, p.Direction); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "move product failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	case "update_order":
		var p actionOrderPayload
		if err := decodeActionPayload(req.Payload, &p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
			return
		}
		if p.ID == 0 || strings.TrimSpace(p.ItemsJSON) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "id/items_json required"})
			return
		}
		_, err := db.DB.Exec(`
			UPDATE orders
			SET items_json = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ? AND shop_id = ?
		`, p.ItemsJSON, p.Total, p.ID, shopIDInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update order failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	case "update_password":
		var p struct {
			NewPassword string `json:"new_password"`
		}
		if err := decodeActionPayload(req.Payload, &p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid payload"})
			return
		}
		p.NewPassword = strings.TrimSpace(p.NewPassword)
		if len(p.NewPassword) < 4 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "password too short"})
			return
		}
		_, err := db.DB.Exec(`
			UPDATE shops
			SET password = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, p.NewPassword, shopIDInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "update password failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "unsupported action"})
	}
}

func publishOrderStatusAsync(shopID, orderID int64, status, courierPhone string) {
	payload := gin.H{
		"event":    "status_update",
		"order_id": orderID,
		"status":   status,
	}
	if strings.TrimSpace(courierPhone) != "" {
		payload["courier_phone"] = courierPhone
	}
	publishOrderAsync(shopID, payload)
	publishRealtimeAsync(shopID, payload)
}

func publishTableRefreshAsync(shopID int64, tableNum, status string) {
	publishOrderAsync(shopID, gin.H{
		"event":  "table_orders_refresh",
		"table":  tableNum,
		"status": status,
	})
	publishRealtimeAsync(shopID, gin.H{
		"event":  "table_orders_refresh",
		"table":  tableNum,
		"status": status,
	})
}

func decodeActionPayload(raw json.RawMessage, out interface{}) error {
	if len(raw) == 0 {
		return errors.New("payload required")
	}
	return json.Unmarshal(raw, out)
}

func moveCategory(shopID, catID int64, direction string) error {
	cats := []db.Category{}
	if err := db.DB.Select(&cats, "SELECT id, sort_order FROM categories WHERE shop_id = ? ORDER BY sort_order ASC", shopID); err != nil {
		return err
	}
	idx := -1
	for i := range cats {
		if cats[i].ID == catID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil
	}
	if direction == "up" && idx > 0 {
		cats[idx], cats[idx-1] = cats[idx-1], cats[idx]
	} else if direction == "down" && idx < len(cats)-1 {
		cats[idx], cats[idx+1] = cats[idx+1], cats[idx]
	} else {
		return nil
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	for i, c := range cats {
		if _, err = tx.Exec("UPDATE categories SET sort_order = ? WHERE id = ?", i+1, c.ID); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func moveProduct(shopID, prodID int64, direction string) error {
	var prod db.Product
	if err := db.DB.Get(&prod, "SELECT * FROM products WHERE id = ? AND shop_id = ?", prodID, shopID); err != nil {
		return err
	}

	prods := []db.Product{}
	var err error
	if prod.CategoryID != nil {
		err = db.DB.Select(&prods, "SELECT id, sort_order, category_id, shop_id FROM products WHERE shop_id = ? AND category_id = ? ORDER BY sort_order ASC", shopID, *prod.CategoryID)
	} else {
		err = db.DB.Select(&prods, "SELECT id, sort_order, category_id, shop_id FROM products WHERE shop_id = ? AND category_id IS NULL ORDER BY sort_order ASC", shopID)
	}
	if err != nil {
		return err
	}

	idx := -1
	for i := range prods {
		if prods[i].ID == prodID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil
	}
	if direction == "up" && idx > 0 {
		prods[idx], prods[idx-1] = prods[idx-1], prods[idx]
	} else if direction == "down" && idx < len(prods)-1 {
		prods[idx], prods[idx+1] = prods[idx+1], prods[idx]
	} else {
		return nil
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	for i, p := range prods {
		if _, err = tx.Exec("UPDATE products SET sort_order = ? WHERE id = ?", i+1, p.ID); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
