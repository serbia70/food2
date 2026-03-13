package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func setupMasterCreateShopTestDB(t *testing.T) {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "master-create-shop.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)
}

func TestMasterCreateShopUsesProvidedSlug(t *testing.T) {
	setupMasterCreateShopTestDB(t)

	r := gin.New()
	r.POST("/api/master/shops", MasterCreateShop)

	body, _ := json.Marshal(map[string]interface{}{
		"name":     "007",
		"slug":     "007",
		"password": "pass",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/master/shops", bytes.NewReader(body))
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Success bool   `json:"success"`
		Slug    string `json:"slug"`
		Error   string `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if !resp.Success {
		t.Fatalf("expected success true, got false error=%q body=%s", resp.Error, w.Body.String())
	}
	if resp.Slug != "007" {
		t.Fatalf("expected response slug 007, got %q", resp.Slug)
	}

	var stored struct {
		Slug string `db:"slug"`
		Name string `db:"name"`
	}
	if err := db.DB.Get(&stored, "SELECT slug, name FROM shops WHERE slug = ?", "007"); err != nil {
		t.Fatalf("expected shop slug 007 to exist: %v", err)
	}
	if stored.Slug != "007" {
		t.Fatalf("expected stored slug 007, got %q", stored.Slug)
	}
}

func TestMasterCreateShopRejectsDuplicateSlug(t *testing.T) {
	setupMasterCreateShopTestDB(t)

	// seed an existing shop with the same slug
	if _, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status) VALUES ('Existing', '007', 'x', 'active')"); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/master/shops", MasterCreateShop)

	body, _ := json.Marshal(map[string]interface{}{
		"name":     "New",
		"slug":     "007",
		"password": "pass",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/master/shops", bytes.NewReader(body))
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code == http.StatusOK {
		t.Fatalf("expected non-200 for duplicate slug, got 200 body=%s", w.Body.String())
	}
}

func TestMasterCreateShopRejectsInvalidSlug(t *testing.T) {
	setupMasterCreateShopTestDB(t)

	r := gin.New()
	r.POST("/api/master/shops", MasterCreateShop)

	body, _ := json.Marshal(map[string]interface{}{
		"name":     "Bad",
		"slug":     "a/b",
		"password": "pass",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/master/shops", bytes.NewReader(body))
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code == http.StatusOK {
		t.Fatalf("expected non-200 for invalid slug, got 200 body=%s", w.Body.String())
	}
}
