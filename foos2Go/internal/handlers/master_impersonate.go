package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"meituan-go/internal/db"
	"meituan-go/internal/middleware"

	"github.com/gin-gonic/gin"
)

func handleImpersonateShop(c *gin.Context, payload json.RawMessage) {
	var p struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(payload, &p); err != nil || p.ID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid shop id"})
		return
	}

	var shop struct {
		Slug string `db:"slug"`
	}
	err := db.DB.Get(&shop, "SELECT slug FROM shops WHERE id = ?", p.ID)
	if err != nil || strings.TrimSpace(shop.Slug) == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "shop not found"})
		return
	}

	var token string
	err = db.DB.QueryRow("SELECT token FROM admin_tokens WHERE shop_id = ? ORDER BY id DESC LIMIT 1", p.ID).Scan(&token)
	if err != nil || strings.TrimSpace(token) == "" {
		generatedToken, genErr := middleware.GenerateToken(p.ID)
		if genErr != nil || strings.TrimSpace(generatedToken) == "" {
			c.JSON(http.StatusNotFound, gin.H{"error": "shop admin token not found"})
			return
		}
		token = generatedToken
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"slug":         shop.Slug,
		"token":        token,
		"impersonated": true,
	})
}

func MasterImpersonateShop(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}

	id := c.Query("id")
	shopID, err := strconv.ParseInt(id, 10, 64)
	if err != nil || shopID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid shop id"})
		return
	}

	handleImpersonateShop(c, json.RawMessage([]byte(`{"id":`+strconv.FormatInt(shopID, 10)+`}`)))
}
