package middleware

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"meituan-go/internal/config"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/spf13/cast"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}

		tokenString := parts[1]
		cfg := config.LoadConfig()

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(cfg.JWT.Secret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}

		// Set shop_id in context safely using cast
		shopID := cast.ToInt64(claims["shop_id"])
		if shopID == 0 && claims["shop_id"] != nil && claims["shop_id"] != 0 && claims["shop_id"] != "0" {
			// casting failed for non-zero value
			log.Printf("Failed to cast shop_id: %v (%T)", claims["shop_id"], claims["shop_id"])
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token shop_id"})
			c.Abort()
			return
		}

		c.Set("shop_id", shopID)
		c.Next()
	}
}

func GenerateToken(shopID int64) (string, error) {
	cfg := config.LoadConfig()
	claims := jwt.MapClaims{
		"shop_id": shopID,
		"exp":     time.Now().Add(time.Hour * time.Duration(cfg.JWT.Expire)).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.Secret))
}
