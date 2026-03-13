package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"meituan-go/internal/config"
	"meituan-go/internal/db"
	"meituan-go/internal/security"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func generateMasterToken(username string) (string, error) {
	cfg := config.LoadConfig()
	claims := jwt.MapClaims{
		"role":     "master",
		"username": strings.TrimSpace(username),
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.Secret))
}

func parseMasterToken(raw string) (jwt.MapClaims, error) {
	cfg := config.LoadConfig()
	token, err := jwt.Parse(raw, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(cfg.JWT.Secret), nil
	})
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}
	if strings.TrimSpace(fmt.Sprint(claims["role"])) != "master" {
		return nil, fmt.Errorf("invalid master role")
	}
	return claims, nil
}

func hasMasterAuth(c *gin.Context) bool {
	authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return false
	}
	token := strings.TrimSpace(authHeader[7:])
	if token == "" {
		return false
	}
	claims, err := parseMasterToken(token)
	if err != nil {
		return false
	}
	c.Set("master_username", strings.TrimSpace(fmt.Sprint(claims["username"])))
	return true
}

// MasterLogin handles master admin login
func MasterLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("MasterLogin: JSON bind error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	var storedPwd string
	var err error
	username := strings.TrimSpace(req.Username)
	if username == "" {
		username = "admin"
	}

	log.Printf("MasterLogin attempt: username=%s", username)
	err = db.DB.QueryRow("SELECT password FROM master_admin WHERE username = ?", username).Scan(&storedPwd)
	if err == sql.ErrNoRows {
		if strings.TrimSpace(req.Username) == "" {
			err = db.DB.QueryRow("SELECT password FROM master_admin ORDER BY id ASC LIMIT 1").Scan(&storedPwd)
		}
		if err == sql.ErrNoRows {
			log.Printf("MasterLogin: User not found in DB: %s", username)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}
	} else if err != nil {
		log.Printf("MasterLogin: Database error querying username=%s: %v", username, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
		return
	}

	log.Printf("MasterLogin: Checking password")
	ok, needsUpgrade := security.VerifyPassword(storedPwd, req.Password)
	if !ok {
		log.Printf("MasterLogin: Password mismatch")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	if needsUpgrade {
		if hash, err := security.HashPassword(req.Password); err == nil {
			_, _ = db.DB.Exec("UPDATE master_admin SET password = ? WHERE username = ?", hash, username)
		}
	}

	log.Printf("MasterLogin: Success for user %s", username)
	token, err := generateMasterToken(username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "success": true})
}

func checkMasterAuth(c *gin.Context) bool {
	if !hasMasterAuth(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		c.Abort()
		return false
	}
	return true
}
