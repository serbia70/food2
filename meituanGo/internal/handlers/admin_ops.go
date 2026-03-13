package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/services/mqtt"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

type archiveRequest struct {
	Action       string `json:"action"`
	RestaurantID string `json:"restaurantId"`
	Months       int    `json:"months"`
}

type reprintRequest struct {
	OrderID  int64  `json:"orderId"`
	ShopSlug string `json:"shopSlug"`
	TableNum string `json:"tableNum"`
}

type localizeImagesRequest struct {
	ShopID string `json:"shopId"`
}

type tableCheckoutRequest struct {
	RestaurantID string   `json:"restaurantId"`
	TableNumber  string   `json:"tableNumber"`
	OrderIDs     []string `json:"orderIds"`
}

type remarksRequest struct {
	OrderID     string   `json:"orderId"`
	TableNumber string   `json:"tableNumber"`
	Remarks     []string `json:"remarks"`
}

func AdminOrdersArchive(c *gin.Context) {
	shopID, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopIDInt, _ := shopID.(int64)

	var req archiveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}

	switch strings.TrimSpace(req.Action) {
	case "stats":
		var stats struct {
			Total     int64 `db:"total"`
			Archived  int64 `db:"archived"`
			Completed int64 `db:"completed"`
		}
		err := db.DB.Get(&stats, `
			SELECT
				COUNT(*) AS total,
				COALESCE(SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END), 0) AS archived,
				COALESCE(SUM(CASE WHEN status = 'completed' AND (archived = 0 OR archived IS NULL) THEN 1 ELSE 0 END), 0) AS completed
			FROM orders
			WHERE shop_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
		`, shopIDInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to query stats"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "stats": stats})
	case "archive":
		months := req.Months
		if months <= 0 {
			months = 3
		}

		result, err := db.DB.Exec(`
			UPDATE orders
			SET archived = 1, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
			WHERE shop_id = ?
				AND status = 'completed'
				AND (archived = 0 OR archived IS NULL)
				AND (is_deleted = 0 OR is_deleted IS NULL)
				AND created_at < datetime('now', ?)
		`, shopIDInt, fmt.Sprintf("-%d months", months))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "archive failed"})
			return
		}
		changed, _ := result.RowsAffected()
		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"message":  fmt.Sprintf("已归档 %d 条订单", changed),
			"archived": changed,
		})
	case "delete_archived":
		var archivedOrders []db.Order
		if err := db.DB.Select(&archivedOrders, `
			SELECT * FROM orders
			WHERE shop_id = ? AND archived = 1 AND (is_deleted = 0 OR is_deleted IS NULL)
		`, shopIDInt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "load archived orders failed"})
			return
		}
		if len(archivedOrders) == 0 {
			c.JSON(http.StatusOK, gin.H{"success": true, "message": "没有已归档订单", "deleted": 0})
			return
		}

		backupDir := filepath.Join(".", "backup")
		if err := os.MkdirAll(backupDir, 0o755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "create backup dir failed"})
			return
		}
		backupFile := filepath.Join(backupDir, fmt.Sprintf("archived_orders_shop%d_%d.json", shopIDInt, time.Now().UnixMilli()))
		buf, _ := json.MarshalIndent(archivedOrders, "", "  ")
		if err := os.WriteFile(backupFile, buf, 0o644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "write backup failed"})
			return
		}

		result, err := db.DB.Exec(`
			DELETE FROM orders
			WHERE shop_id = ? AND archived = 1
		`, shopIDInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "delete archived failed"})
			return
		}
		changed, _ := result.RowsAffected()
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": fmt.Sprintf("已删除 %d 条归档订单", changed),
			"deleted": changed,
			"backup":  backupFile,
		})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "unknown action"})
	}
}

func AdminReprint(c *gin.Context) {
	shopID, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopIDInt, _ := shopID.(int64)

	var req reprintRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}

	var shop struct {
		ID         int64  `db:"id"`
		Slug       string `db:"slug"`
		Name       string `db:"name"`
		MQTTSecret string `db:"mqtt_secret"`
	}
	if err := db.DB.Get(&shop, "SELECT id, slug, name, mqtt_secret FROM shops WHERE id = ?", shopIDInt); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "shop not found"})
		return
	}
	if strings.TrimSpace(req.ShopSlug) != "" && req.ShopSlug != shop.Slug {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "shop mismatch"})
		return
	}

	var orders []db.Order
	if req.OrderID > 0 {
		if err := db.DB.Select(&orders, "SELECT * FROM orders WHERE id = ? AND shop_id = ?", req.OrderID, shopIDInt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "query order failed"})
			return
		}
	} else if strings.TrimSpace(req.TableNum) != "" {
		tableNum := strings.TrimSpace(req.TableNum)
		log.Printf("[Reprint] Querying orders for table: %s, shopID: %d", tableNum, shopIDInt)
		if err := db.DB.Select(&orders, `
			SELECT * FROM orders
			WHERE shop_id = ?
				AND table_info LIKE ?
				AND status NOT IN ('completed', 'cancelled', 'archived', 'paid')
				AND (is_deleted = 0 OR is_deleted IS NULL)
		`, shopIDInt, tableNum+"%"); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "query orders failed"})
			return
		}
		log.Printf("[Reprint] Found %d orders with LIKE query", len(orders))
		filtered := make([]db.Order, 0, len(orders))
		for _, o := range orders {
			if o.TableInfo == nil {
				log.Printf("[Reprint] Skipping order %d: table_info is nil", o.ID)
				continue
			}
			parts := strings.Split(strings.TrimSpace(*o.TableInfo), " ")
			if len(parts) > 0 && parts[0] == tableNum {
				log.Printf("[Reprint] Including order %d: table=%s, total=%d", o.ID, *o.TableInfo, o.TotalAmount)
				filtered = append(filtered, o)
			} else {
				log.Printf("[Reprint] Filtering out order %d: table=%s, expected=%s", o.ID, *o.TableInfo, tableNum)
			}
		}
		orders = filtered
		log.Printf("[Reprint] After filtering: %d orders", len(orders))
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "orderId or tableNum required"})
		return
	}

	if len(orders) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "No orders found"})
		return
	}
	if strings.TrimSpace(shop.MQTTSecret) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "shop mqtt_secret not configured"})
		return
	}

	type itemPrint struct {
		Name  string `json:"name"`
		Qty   int64  `json:"quantity"`
		Price int64  `json:"price"`
		Total int64  `json:"total"`
	}

	allItems := make([]itemPrint, 0)
	orderNos := make([]string, 0, len(orders))
	allRemarks := make([]string, 0, len(orders))
	total := int64(0)
	table := strings.TrimSpace(req.TableNum)
	orderType := orders[0].OrderType

	for _, o := range orders {
		orderNos = append(orderNos, o.OrderNo)
		allRemarks = append(allRemarks, extractOrderRemarks(o.RemarksJSON)...)
		total += o.TotalAmount
		log.Printf("[Reprint] Adding order %s total: %d, running total: %d", o.OrderNo, o.TotalAmount, total)
		if table == "" && o.TableInfo != nil {
			table = *o.TableInfo
		}

		raw := strings.TrimSpace(o.ItemsJSON)
		if raw == "" {
			continue
		}
		var list []map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &list); err == nil {
			for _, it := range list {
				name := strings.TrimSpace(utils.String(it["name"]))
				sub := strings.TrimSpace(utils.String(it["sub_name"]))
				if sub == "" {
					sub = strings.TrimSpace(utils.String(it["subName"]))
				}
				display := name
				if sub != "" {
					display = display + " " + sub
				}
				qty := utils.Int64(it["quantity"])
				if qty <= 0 {
					qty = 1
				}
				price := utils.Int64(it["price"])
				allItems = append(allItems, itemPrint{Name: display, Qty: qty, Price: price, Total: price * qty})
			}
			continue
		}
		var obj map[string]map[string]interface{}
		if err := json.Unmarshal([]byte(raw), &obj); err == nil {
			for _, it := range obj {
				name := strings.TrimSpace(utils.String(it["name"]))
				sub := strings.TrimSpace(utils.String(it["sub_name"]))
				if sub == "" {
					sub = strings.TrimSpace(utils.String(it["subName"]))
				}
				display := name
				if sub != "" {
					display = display + " " + sub
				}
				qty := utils.Int64(it["quantity"])
				if qty <= 0 {
					qty = 1
				}
				price := utils.Int64(it["price"])
				allItems = append(allItems, itemPrint{Name: display, Qty: qty, Price: price, Total: price * qty})
			}
		}
	}

	pickup := "000"
	if len(orderNos) > 0 && len(orderNos[0]) >= 3 {
		pickup = orderNos[0][len(orderNos[0])-3:]
	}
	remarksText := strings.Join(uniqueNonEmptyRemarks(allRemarks), " | ")

	log.Printf("[Reprint] Final total: %d, items count: %d, orders: %v", total, len(allItems), orderNos)

	payload := gin.H{
		"id":           strings.Join(orderNos, ", "),
		"pickup_no":    pickup,
		"shop":         shop.Name,
		"date":         time.Now().Format("2006-01-02 15:04:05"),
		"type":         orderType,
		"table_info":   table,
		"total_amount": total,
		"items":        allItems,
		"remarks":      remarksText,
	}

	log.Printf("[Reprint] Sending print payload: total=%d", total)
	if err := mqtt.PublishOrderForPrinter(shop.Slug, shop.MQTTSecret, payload); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "print publish failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Print command sent"})
}

func extractOrderRemarks(raw *string) []string {
	if raw == nil {
		return nil
	}
	v := strings.TrimSpace(*raw)
	if v == "" {
		return nil
	}

	var arr []string
	if err := json.Unmarshal([]byte(v), &arr); err == nil {
		return arr
	}

	var mixed []interface{}
	if err := json.Unmarshal([]byte(v), &mixed); err == nil {
		out := make([]string, 0, len(mixed))
		for _, it := range mixed {
			s := strings.TrimSpace(utils.String(it))
			if s != "" {
				out = append(out, s)
			}
		}
		if len(out) > 0 {
			return out
		}
	}

	return []string{v}
}

func uniqueNonEmptyRemarks(remarks []string) []string {
	seen := make(map[string]struct{}, len(remarks))
	out := make([]string, 0, len(remarks))
	for _, r := range remarks {
		s := strings.TrimSpace(r)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func AdminLocalizeImages(c *gin.Context) {
	shopID, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopIDInt, _ := shopID.(int64)

	var req localizeImagesRequest
	_ = c.ShouldBindJSON(&req)
	if strings.TrimSpace(req.ShopID) != "" {
		if v, err := strconv.ParseInt(req.ShopID, 10, 64); err == nil && v != shopIDInt {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "shop mismatch"})
			return
		}
	}

	products := []db.Product{}
	if err := db.DB.Select(&products, "SELECT id, img, shop_id FROM products WHERE shop_id = ?", shopIDInt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "load products failed"})
		return
	}

	uploadDir := filepath.Join(".", "static", "assets", "uploads")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "create upload dir failed"})
		return
	}

	client := &http.Client{Timeout: 15 * time.Second}
	processed := 0
	errors := []string{}
	for _, p := range products {
		if p.Img == nil {
			continue
		}
		img := strings.TrimSpace(*p.Img)
		if img == "" || strings.HasPrefix(img, "/assets/uploads/") {
			continue
		}
		if !strings.HasPrefix(img, "http://") && !strings.HasPrefix(img, "https://") {
			continue
		}

		resp, err := client.Get(img)
		if err != nil {
			errors = append(errors, fmt.Sprintf("ID %d: %v", p.ID, err))
			continue
		}
		func() {
			defer resp.Body.Close()
			if resp.StatusCode < 200 || resp.StatusCode >= 300 {
				errors = append(errors, fmt.Sprintf("ID %d: download status %d", p.ID, resp.StatusCode))
				return
			}

			name := fmt.Sprintf("local_%d_%d_%d.jpg", shopIDInt, p.ID, time.Now().UnixMilli())
			dst := filepath.Join(uploadDir, name)

			raw, err := io.ReadAll(io.LimitReader(resp.Body, 20*1024*1024))
			if err != nil {
				errors = append(errors, fmt.Sprintf("ID %d: read failed", p.ID))
				return
			}

			imgObj, _, err := image.Decode(bytes.NewReader(raw))
			if err != nil {
				errors = append(errors, fmt.Sprintf("ID %d: decode failed", p.ID))
				return
			}

			bounds := imgObj.Bounds()
			w := bounds.Dx()
			h := bounds.Dy()
			if w <= 0 || h <= 0 {
				errors = append(errors, fmt.Sprintf("ID %d: invalid image size", p.ID))
				return
			}

			maxW := 500
			nw, nh := w, h
			if w > maxW {
				nw = maxW
				nh = int(float64(h) * (float64(maxW) / float64(w)))
				if nh < 1 {
					nh = 1
				}
			}

			dstImg := image.NewRGBA(image.Rect(0, 0, nw, nh))
			draw.CatmullRom.Scale(dstImg, dstImg.Bounds(), imgObj, bounds, draw.Over, nil)

			f, err := os.Create(dst)
			if err != nil {
				errors = append(errors, fmt.Sprintf("ID %d: create file failed", p.ID))
				return
			}
			defer f.Close()

			if err := jpeg.Encode(f, dstImg, &jpeg.Options{Quality: 82}); err != nil {
				errors = append(errors, fmt.Sprintf("ID %d: encode failed", p.ID))
				_ = os.Remove(dst)
				return
			}

			newURL := "/assets/uploads/" + name
			if _, err = db.DB.Exec("UPDATE products SET img = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?", newURL, p.ID, shopIDInt); err != nil {
				errors = append(errors, fmt.Sprintf("ID %d: db update failed", p.ID))
				_ = os.Remove(dst)
				return
			}
			processed++
		}()
	}

	resp := gin.H{
		"success":   true,
		"processed": processed,
		"errors":    nil,
	}
	if len(errors) > 0 {
		resp["errors"] = errors
	}
	c.JSON(http.StatusOK, resp)
}

func AdminTablesCheckout(c *gin.Context) {
	shopID, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopIDInt, _ := shopID.(int64)

	var req tableCheckoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}

	totalAmount := int64(0)
	updated := int64(0)

	if len(req.OrderIDs) > 0 {
		ids := make([]int64, 0, len(req.OrderIDs))
		for _, raw := range req.OrderIDs {
			v, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
			if err == nil && v > 0 {
				ids = append(ids, v)
			}
		}
		if len(ids) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "no valid orderIds"})
			return
		}

		ph := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
		args := make([]interface{}, 0, len(ids)+1)
		args = append(args, shopIDInt)
		for _, id := range ids {
			args = append(args, id)
		}

		_ = db.DB.Get(&totalAmount, "SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE shop_id = ? AND id IN ("+ph+")", args...)
		res, err := db.DB.Exec(
			"UPDATE orders SET status='completed', archived=1, archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE shop_id = ? AND id IN ("+ph+")",
			args...,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "checkout failed"})
			return
		}
		updated, _ = res.RowsAffected()
	} else {
		tableNum := strings.TrimSpace(req.TableNumber)
		if tableNum == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "tableNumber required"})
			return
		}
		pattern := tableNum + "%"
		_ = db.DB.Get(&totalAmount, `
			SELECT COALESCE(SUM(total_amount),0) FROM orders
			WHERE shop_id = ? AND table_info LIKE ?
			  AND status NOT IN ('completed','cancelled','archived')
			  AND (is_deleted = 0 OR is_deleted IS NULL)
		`, shopIDInt, pattern)

		res, err := db.DB.Exec(`
			UPDATE orders
			SET status='completed', archived=1, archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
			WHERE shop_id = ? AND table_info LIKE ?
			  AND status NOT IN ('completed','cancelled','archived')
			  AND (is_deleted = 0 OR is_deleted IS NULL)
		`, shopIDInt, pattern)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "checkout failed"})
			return
		}
		updated, _ = res.RowsAffected()
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"updated":     updated,
		"totalAmount": totalAmount,
	})

	publishOrderAsync(shopIDInt, gin.H{
		"event":        "table_checkout",
		"table_number": req.TableNumber,
		"updated":      updated,
		"total_amount": totalAmount,
	})
	publishRealtimeAsync(shopIDInt, gin.H{
		"event":        "table_checkout",
		"table_number": req.TableNumber,
		"updated":      updated,
	})
}

func AdminOrderRemarks(c *gin.Context) {
	shopID, ok := c.Get("shop_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return
	}
	shopIDInt, _ := shopID.(int64)

	var req remarksRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid request"})
		return
	}
	if len(req.Remarks) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "remarks required"})
		return
	}
	buf, _ := json.Marshal(req.Remarks)
	remarksJSON := string(buf)

	if strings.TrimSpace(req.OrderID) != "" {
		id, err := strconv.ParseInt(strings.TrimSpace(req.OrderID), 10, 64)
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "invalid orderId"})
			return
		}
		res, err := db.DB.Exec(`
			UPDATE orders
			SET remarks_json = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ? AND shop_id = ?
		`, remarksJSON, id, shopIDInt)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "save remarks failed"})
			return
		}
		n, _ := res.RowsAffected()
		publishOrderAsync(shopIDInt, gin.H{
			"event":    "remarks_update",
			"order_id": id,
			"updated":  n,
		})
		publishRealtimeAsync(shopIDInt, gin.H{
			"event":    "remarks_update",
			"order_id": id,
			"updated":  n,
		})
		c.JSON(http.StatusOK, gin.H{"success": true, "updated": n})
		return
	}

	tableNum := strings.TrimSpace(req.TableNumber)
	if tableNum == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "tableNumber or orderId required"})
		return
	}
	pattern := tableNum + "%"
	res, err := db.DB.Exec(`
		UPDATE orders
		SET remarks_json = ?, updated_at = CURRENT_TIMESTAMP
		WHERE shop_id = ? AND table_info LIKE ?
		  AND status NOT IN ('completed','cancelled','archived')
		  AND (is_deleted = 0 OR is_deleted IS NULL)
	`, remarksJSON, shopIDInt, pattern)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "save remarks failed"})
		return
	}
	n, _ := res.RowsAffected()
	publishOrderAsync(shopIDInt, gin.H{
		"event":        "remarks_update",
		"table_number": tableNum,
		"updated":      n,
	})
	publishRealtimeAsync(shopIDInt, gin.H{
		"event":        "remarks_update",
		"table_number": tableNum,
		"updated":      n,
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "updated": n})
}
