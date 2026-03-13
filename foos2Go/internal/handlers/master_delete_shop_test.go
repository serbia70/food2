package handlers

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func TestMasterManageDeleteShop(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "master-delete-shop.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	res, err := db.DB.Exec("INSERT INTO shops (name, slug, password, status) VALUES ('Delete Me', 'delete-me', 'pass', 'active')")
	if err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}
	shopID, _ := res.LastInsertId()

	r := gin.New()
	r.DELETE("/api/master/shops/:id", MasterDeleteShop)

	req := httptest.NewRequest(http.MethodDelete, "/api/master/shops/1", nil)
	req.Header.Set("Authorization", mustMasterAuthHeader(t))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var count int
	if err := db.DB.Get(&count, "SELECT COUNT(*) FROM shops WHERE id = ?", shopID); err != nil {
		t.Fatalf("count deleted shop failed: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected shop to be deleted, count=%d", count)
	}
}
