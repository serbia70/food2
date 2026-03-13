package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func TestUserBindCreatesIdentityLink(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)

	// canonical user
	if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('888', 'User', 'secret', '888')"); err != nil {
		t.Fatalf("seed user failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/user/bind", UserBindIdentity)

	req := httptest.NewRequest(http.MethodPost, "/api/user/bind", strings.NewReader(`{"sessionToken":"888","alias":"0613083899"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var count int
	if err := db.DB.Get(&count, "SELECT COUNT(*) FROM user_identity_links WHERE canonical_login_account = '888' AND alias = '0613083899'"); err != nil {
		t.Fatalf("load identity link failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 identity link row, got %d", count)
	}
}
