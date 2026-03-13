package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"meituan-go/internal/db"
	"meituan-go/internal/utils"

	"github.com/gin-gonic/gin"
)

type MenuHandler struct{}

type ProductRequest struct {
	ID          int64  `json:"id"` // 0 for create
	CategoryID  int64  `json:"category_id"`
	Name        string `json:"name"`
	SubName     string `json:"sub_name"`
	Price       int64  `json:"price"` // in cents
	Img         string `json:"img"`
	Description string `json:"description"`
	Stock       int64  `json:"stock"`
}

type CategoryRequest struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	SubName string `json:"sub_name"`
}

type MoveRequest struct {
	Direction string `json:"direction" binding:"required,oneof=up down"`
}

func isMissingColumnErr(err error, col string) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	c := strings.ToLower(strings.TrimSpace(col))
	if c == "" {
		return false
	}
	// SQLite errors commonly look like: "no such column: sub_name"
	return strings.Contains(s, "no such column") && strings.Contains(s, c)
}

// appendMenuDebugLine was used for temporary debugging and is intentionally removed.

// getTableColumns queries SQLite schema for the current columns.
// Avoid caching here because the schema can change (ALTER TABLE) between deployments.
func getTableColumns(table string) map[string]bool {
	rows := []struct {
		Name string `db:"name"`
	}{}
	query := fmt.Sprintf("PRAGMA table_info(%s)", table)
	if err := db.DB.Select(&rows, query); err != nil {
		log.Printf("getTableColumns failed for %s: %v", table, err)
		return map[string]bool{}
	}

	cols := map[string]bool{}
	for _, r := range rows {
		cols[strings.ToLower(strings.TrimSpace(r.Name))] = true
	}

	return cols
}

func (h *MenuHandler) GetMenu(c *gin.Context) {
	slug := c.Param("slug")

	// 1. Get Shop ID
	shopID, err := getShopIDBySlug(slug)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Shop not found"})
			return
		}
		log.Printf("Error fetching shop ID: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}

	// 2. Get Categories
	var categories []db.Category
	err = db.DB.Select(&categories, "SELECT * FROM categories WHERE shop_id = ? ORDER BY sort_order ASC", shopID)
	if err != nil {
		log.Printf("Error fetching categories for shop %d: %v", shopID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch categories"})
		return
	}

	// 3. Get Products
	var products []db.Product
	err = db.DB.Select(&products, "SELECT * FROM products WHERE shop_id = ? AND is_available = 1 ORDER BY sort_order ASC", shopID)
	if err != nil {
		log.Printf("Error fetching products for shop %d: %v", shopID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch products"})
		return
	}

	// 4. Assemble Menu
	if categories == nil {
		categories = []db.Category{}
	}

	for i := range categories {
		categories[i].Products = []db.Product{} // Initialize empty slice
		for _, p := range products {
			if p.CategoryID != nil && *p.CategoryID == categories[i].ID {
				categories[i].Products = append(categories[i].Products, p)
			}
		}
	}

	c.JSON(http.StatusOK, categories)
}

// Admin: Upsert Product
func (h *MenuHandler) UpsertProduct(c *gin.Context) {
	shopIDInterface, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	shopID := shopIDInterface.(int64)

	var req ProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("UpsertProduct bind error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product data"})
		return
	}

	if strings.TrimSpace(req.SubName) == "" {
		req.SubName = strings.TrimSpace(req.Name)
	}

	log.Printf("Upserting product: %+v", req)

	var err error
	productCols := getTableColumns("products")
	withSubName := productCols["sub_name"]
	withDescription := productCols["description"]
	withStock := productCols["stock"]

	if req.ID == 0 {
		insertCols := []string{"shop_id", "category_id", "name", "price", "img", "is_available"}
		placeholders := []string{"?", "?", "?", "?", "?", "1"}
		args := []interface{}{shopID, utils.Int64Ptr(req.CategoryID), req.Name, req.Price, utils.StringPtr(req.Img)}

		// Always try to write sub_name first; fallback if schema rejects it.
		insertColsWithSub := append(append([]string{}, insertCols...), "sub_name")
		placeholdersWithSub := append(append([]string{}, placeholders...), "?")
		argsWithSub := append(append([]interface{}{}, args...), req.SubName)
		if withDescription {
			insertCols = append(insertCols, "description")
			placeholders = append(placeholders, "?")
			args = append(args, utils.StringPtr(req.Description))
		}
		if withStock {
			insertCols = append(insertCols, "stock")
			placeholders = append(placeholders, "?")
			args = append(args, req.Stock)
		}

		queryWithSub := fmt.Sprintf("INSERT INTO products (%s) VALUES (%s)", strings.Join(insertColsWithSub, ", "), strings.Join(placeholdersWithSub, ", "))
		_, err = db.DB.Exec(queryWithSub, argsWithSub...)
		if err != nil && (isMissingColumnErr(err, "sub_name") || !withSubName) {
			query := fmt.Sprintf("INSERT INTO products (%s) VALUES (%s)", strings.Join(insertCols, ", "), strings.Join(placeholders, ", "))
			_, err = db.DB.Exec(query, args...)
		}
	} else {
		setParts := []string{"category_id=?", "name=?", "price=?", "img=?", "updated_at=CURRENT_TIMESTAMP"}
		args := []interface{}{utils.Int64Ptr(req.CategoryID), req.Name, req.Price, utils.StringPtr(req.Img)}

		// Always try to write sub_name first; fallback if schema rejects it.
		setPartsWithSub := append(append([]string{}, setParts...), "sub_name=?")
		argsWithSub := append(append([]interface{}{}, args...), req.SubName)
		if withDescription {
			setParts = append(setParts, "description=?")
			args = append(args, utils.StringPtr(req.Description))
		}
		if withStock {
			setParts = append(setParts, "stock=?")
			args = append(args, req.Stock)
		}

		args = append(args, req.ID, shopID)
		argsWithSub = append(argsWithSub, req.ID, shopID)
		queryWithSub := fmt.Sprintf("UPDATE products SET %s WHERE id=? AND shop_id=?", strings.Join(setPartsWithSub, ", "))
		_, err = db.DB.Exec(queryWithSub, argsWithSub...)
		if err != nil && (isMissingColumnErr(err, "sub_name") || !withSubName) {
			query := fmt.Sprintf("UPDATE products SET %s WHERE id=? AND shop_id=?", strings.Join(setParts, ", "))
			_, err = db.DB.Exec(query, args...)
		}
	}

	if err != nil {
		log.Printf("Error upserting product: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save product"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Product saved"})
}

// Admin: Delete Product
func (h *MenuHandler) DeleteProduct(c *gin.Context) {
	shopIDInterface, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	shopID := shopIDInterface.(int64)

	id := c.Param("id")
	_, err := db.DB.Exec("DELETE FROM products WHERE id = ? AND shop_id = ?", id, shopID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete product"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Product deleted"})
}

// Admin: Upsert Category
func (h *MenuHandler) UpsertCategory(c *gin.Context) {
	shopIDInterface, exists := c.Get("shop_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	shopID := shopIDInterface.(int64)

	var req CategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("UpsertCategory JSON bind error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category data"})
		return
	}

	// Keep backward compatibility: if sub_name is missing, default to name
	if strings.TrimSpace(req.SubName) == "" {
		req.SubName = strings.TrimSpace(req.Name)
	}

	log.Printf("Upserting category: %+v for shop %v", req, shopID)

	var err error
	categoryCols := getTableColumns("categories")
	withCategorySubName := categoryCols["sub_name"]
	if req.ID == 0 {
		// Insert
		var maxSort int
		_ = db.DB.Get(&maxSort, "SELECT COALESCE(MAX(sort_order), 0) FROM categories WHERE shop_id = ?", shopID)

		query := "INSERT INTO categories (shop_id, name, sort_order) VALUES (?, ?, ?)"
		args := []interface{}{shopID, req.Name, maxSort + 1}
		// Always try to write sub_name first; fallback if schema rejects it.
		queryWithSub := "INSERT INTO categories (shop_id, name, sub_name, sort_order) VALUES (?, ?, ?, ?)"
		argsWithSub := []interface{}{shopID, req.Name, req.SubName, maxSort + 1}

		res, execErr := db.DB.Exec(queryWithSub, argsWithSub...)
		err = execErr
		if err != nil && (isMissingColumnErr(err, "sub_name") || !withCategorySubName) {
			res, err = db.DB.Exec(query, args...)
		}
		if err == nil {
			id, _ := res.LastInsertId()
			log.Printf("Created category ID: %d", id)
			c.JSON(http.StatusOK, gin.H{"success": true, "id": id, "message": "Category saved"})
			return
		}
	} else {
		// Update
		query := "UPDATE categories SET name = ? WHERE id = ? AND shop_id = ?"
		args := []interface{}{req.Name, req.ID, shopID}
		// Always try to write sub_name first; fallback if schema rejects it.
		queryWithSub := "UPDATE categories SET name = ?, sub_name = ? WHERE id = ? AND shop_id = ?"
		argsWithSub := []interface{}{req.Name, req.SubName, req.ID, shopID}

		res, execErr := db.DB.Exec(queryWithSub, argsWithSub...)
		err = execErr
		if err != nil && (isMissingColumnErr(err, "sub_name") || !withCategorySubName) {
			res, err = db.DB.Exec(query, args...)
		}
		if err == nil {
			rows, _ := res.RowsAffected()
			log.Printf("Updated category ID: %d, Rows affected: %d", req.ID, rows)
		}
	}

	if err != nil {
		log.Printf("UpsertCategory DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save category"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Category saved"})
}

// Admin: Delete Category
func (h *MenuHandler) DeleteCategory(c *gin.Context) {
	shopIDInterface, _ := c.Get("shop_id")
	shopID := shopIDInterface.(int64)
	id := c.Param("id")
	log.Printf("Deleting category %s for shop %v", id, shopID)

	tx, err := db.DB.Beginx()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}

	if _, err = tx.Exec("DELETE FROM products WHERE category_id = ? AND shop_id = ?", id, shopID); err != nil {
		_ = tx.Rollback()
		log.Printf("DeleteCategory products cleanup error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cleanup category products"})
		return
	}

	res, err := tx.Exec("DELETE FROM categories WHERE id = ? AND shop_id = ?", id, shopID)
	if err != nil {
		_ = tx.Rollback()
		log.Printf("DeleteCategory error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete category"})
		return
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		_ = tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"error": "Category not found"})
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("DeleteCategory commit error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete category"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Category deleted"})
}

// Admin: Move Category
func (h *MenuHandler) MoveCategory(c *gin.Context) {
	shopIDInterface, _ := c.Get("shop_id")
	shopID := shopIDInterface.(int64)
	id := c.Param("id")

	var req MoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid move request"})
		return
	}

	log.Printf("Moving category %s %s", id, req.Direction)

	// 1. Get all categories ordered
	var cats []db.Category
	err := db.DB.Select(&cats, "SELECT id, sort_order FROM categories WHERE shop_id = ? ORDER BY sort_order ASC", shopID)
	if err != nil {
		log.Printf("MoveCategory fetch error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch categories"})
		return
	}

	// 2. Find target index
	targetIdx := -1
	targetIDInt, _ := strconv.ParseInt(id, 10, 64)

	for i, cat := range cats {
		if cat.ID == targetIDInt {
			targetIdx = i
			break
		}
	}

	if targetIdx == -1 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Category not found"})
		return
	}

	// 3. Swap
	if req.Direction == "up" && targetIdx > 0 {
		cats[targetIdx], cats[targetIdx-1] = cats[targetIdx-1], cats[targetIdx]
	} else if req.Direction == "down" && targetIdx < len(cats)-1 {
		cats[targetIdx], cats[targetIdx+1] = cats[targetIdx+1], cats[targetIdx]
	} else {
		log.Println("No move needed")
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "No move"})
		return
	}

	// 4. Update all sort orders (re-index)
	tx, err := db.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		return
	}
	for i, cat := range cats {
		_, err = tx.Exec("UPDATE categories SET sort_order = ? WHERE id = ?", i+1, cat.ID)
		if err != nil {
			log.Printf("Error updating sort order for cat %d: %v", cat.ID, err)
		}
	}
	err = tx.Commit()
	if err != nil {
		log.Printf("Commit error: %v", err)
	}

	log.Println("Category move completed")
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Moved"})
}

// Admin: Move Product
func (h *MenuHandler) MoveProduct(c *gin.Context) {
	shopIDInterface, _ := c.Get("shop_id")
	shopID := shopIDInterface.(int64)
	id := c.Param("id")

	var req MoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid move request"})
		return
	}

	// 1. Get product to find its category
	var product db.Product
	err := db.DB.Get(&product, "SELECT * FROM products WHERE id = ? AND shop_id = ?", id, shopID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	}

	// 2. Get all products in that category ordered
	var prods []db.Product
	if product.CategoryID != nil {
		err = db.DB.Select(&prods, "SELECT id, sort_order FROM products WHERE shop_id = ? AND category_id = ? ORDER BY sort_order ASC", shopID, *product.CategoryID)
	} else {
		err = db.DB.Select(&prods, "SELECT id, sort_order FROM products WHERE shop_id = ? AND category_id IS NULL ORDER BY sort_order ASC", shopID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch products"})
		return
	}

	// 3. Find target index
	targetIdx := -1
	for i, p := range prods {
		if p.ID == product.ID {
			targetIdx = i
			break
		}
	}

	if targetIdx == -1 {
		return
	}

	// 4. Swap
	if req.Direction == "up" && targetIdx > 0 {
		prods[targetIdx], prods[targetIdx-1] = prods[targetIdx-1], prods[targetIdx]
	} else if req.Direction == "down" && targetIdx < len(prods)-1 {
		prods[targetIdx], prods[targetIdx+1] = prods[targetIdx+1], prods[targetIdx]
	} else {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "No move"})
		return
	}

	// 5. Update
	tx, _ := db.DB.Begin()
	for i, p := range prods {
		_, _ = tx.Exec("UPDATE products SET sort_order = ? WHERE id = ?", i+1, p.ID)
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Moved"})
}
