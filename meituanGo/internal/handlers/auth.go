package handlers

import (
	"database/sql"
	"log"
	"net/http"

	"meituan-go/internal/db"
	"meituan-go/internal/middleware"
	"meituan-go/internal/security"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct{}

type LoginRequest struct {
	Slug     string `json:"slug" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	log.Printf("Login attempt for slug: %s", req.Slug)

	shop, err := getShopBasicAuthBySlug(req.Slug)
	if err != nil {
		log.Printf("Login error: Shop not found or DB error: %v", err)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}

	ok, needsUpgrade := security.VerifyPassword(shop.Password, req.Password)
	if !ok {
		log.Printf("Login error: Password mismatch for shop %s", req.Slug)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	if needsUpgrade {
		if hash, err := security.HashPassword(req.Password); err == nil {
			_, _ = db.DB.Exec("UPDATE shops SET password = ? WHERE id = ?", hash, shop.ID)
		}
	}

	token, err := middleware.GenerateToken(shop.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
	})
}
