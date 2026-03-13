package handlers

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"meituan-go/internal/db"
	"meituan-go/internal/security"

	"github.com/gin-gonic/gin"
)

func setupShopAuthDB(t *testing.T, storedPassword string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "shop-auth.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)
	if _, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status) VALUES ('Test Shop', 'test-shop', ?, 'active')", storedPassword); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}
}

func TestShopLoginUpgradesPlaintextPasswordToHash(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupShopAuthDB(t, "secret")

	r := gin.New()
	r.POST("/api/login", (&AuthHandler{}).Login)

	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"slug":"test-shop","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var stored string
	if err := db.DB.Get(&stored, "SELECT password FROM shops WHERE slug = 'test-shop'"); err != nil {
		t.Fatalf("load upgraded password failed: %v", err)
	}
	if !security.LooksLikeBcryptHash(stored) {
		t.Fatalf("expected password to be upgraded to bcrypt hash, got %s", stored)
	}
}

func TestShopLoginAcceptsBcryptPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	hash, err := security.HashPassword("secret")
	if err != nil {
		t.Fatalf("hash password failed: %v", err)
	}
	setupShopAuthDB(t, hash)

	r := gin.New()
	r.POST("/api/login", (&AuthHandler{}).Login)

	req := httptest.NewRequest(http.MethodPost, "/api/login", strings.NewReader(`{"slug":"test-shop","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
}
