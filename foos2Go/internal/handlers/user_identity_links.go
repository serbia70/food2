package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

type userBindIdentityRequest struct {
	SessionToken string `json:"sessionToken"`
	Alias        string `json:"alias"`
}

func UserBindIdentity(c *gin.Context) {
	var req userBindIdentityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request"})
		return
	}

	sessionToken := strings.TrimSpace(req.SessionToken)
	alias := strings.TrimSpace(req.Alias)
	if sessionToken == "" || alias == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "sessionToken/alias required"})
		return
	}

	var id int64
	err := db.DB.Get(&id, `
		SELECT id
		FROM users
		WHERE login_account = ?
		LIMIT 1
	`, sessionToken)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "invalid session"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "failed to load user"})
		return
	}

	_, err = db.DB.Exec(
		"INSERT INTO user_identity_links (canonical_login_account, alias) VALUES (?, ?)",
		sessionToken,
		alias,
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "alias already bound"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "bind failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
