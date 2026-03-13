package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

func TestPublicHomeDataDoesNotRequireMasterAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dbPath := filepath.Join(t.TempDir(), "public-home.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)

	// Seed master settings with both public and sensitive keys to ensure public home filters secrets.
	if _, err := db.DB.Exec("UPDATE master_admin SET settings = ? WHERE id = 1", `{
		"categories":[{"id":"food","name":"外卖美食"}],
		"backup_user":"should-not-leak",
		"backup_pass":"should-not-leak",
		"backup_endpoint":"https://s3.example.invalid",
		"mqtt_username":"should-not-leak",
		"mqtt_password":"should-not-leak",
		"footer_text":"平台热线"
	}`); err != nil {
		t.Fatalf("seed master settings failed: %v", err)
	}

	// Seed shop settings with sensitive data (drivers, telegram token) and public data (city, delivery zones).
	if _, err := db.DB.Exec("INSERT INTO shops (name, slug, address, status, settings) VALUES ('Shop A', 'a', 'Addr A', 'active', '{\"city\":\"Belgrade\",\"delivery\":{\"zones\":\"Zone A\"},\"drivers\":[{\"name\":\"Alice\",\"phone\":\"123\"}],\"telegram\":{\"token\":\"secret\",\"chat_id\":\"-1\"}}')"); err != nil {
		t.Fatalf("seed active shop failed: %v", err)
	}
	if _, err := db.DB.Exec("INSERT INTO shops (name, slug, address, status, settings) VALUES ('Shop B', 'b', 'Addr B', 'disabled', '{}')"); err != nil {
		t.Fatalf("seed disabled shop failed: %v", err)
	}

	r := gin.New()
	r.GET("/api/home", PublicHomeData)

	req := httptest.NewRequest(http.MethodGet, "/api/home", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}

	var resp struct {
		Shops    []map[string]any `json:"shops"`
		Settings map[string]any   `json:"settings"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response failed: %v", err)
	}
	if len(resp.Shops) != 1 {
		t.Fatalf("expected only active shops, got %d", len(resp.Shops))
	}
	if resp.Shops[0]["slug"] != "a" {
		t.Fatalf("expected slug a, got %v", resp.Shops[0]["slug"])
	}
	if _, ok := resp.Shops[0]["settings"]; !ok {
		t.Fatalf("expected settings field in shop payload")
	}
	if _, ok := resp.Settings["categories"]; !ok {
		t.Fatalf("expected categories in settings payload")
	}

	// Security: public home response must not leak master secrets / infrastructure credentials.
	for _, forbidden := range []string{
		"backup_pass",
		"backup_user",
		"backup_endpoint",
		"backup_bucket",
		"backup_path",
		"backup_host",
		"mqtt_username",
		"mqtt_password",
	} {
		if _, ok := resp.Settings[forbidden]; ok {
			t.Fatalf("settings must not include %s", forbidden)
		}
	}

	// Shop settings are included as a raw string; it must keep only the public subset.
	settingsRaw, _ := resp.Shops[0]["settings"].(string)
	var shopSettings map[string]any
	if err := json.Unmarshal([]byte(settingsRaw), &shopSettings); err != nil {
		t.Fatalf("decode shop settings failed: %v raw=%q", err, settingsRaw)
	}
	if shopSettings["city"] != "Belgrade" {
		t.Fatalf("expected shop settings city Belgrade, got %v", shopSettings["city"])
	}
	if del, ok := shopSettings["delivery"].(map[string]any); !ok {
		t.Fatalf("expected delivery object in shop settings")
	} else if del["zones"] != "Zone A" {
		t.Fatalf("expected delivery.zones Zone A, got %v", del["zones"])
	}

	for _, forbidden := range []string{"drivers", "telegram", "mqtt_username", "mqtt_password", "backup_user", "backup_pass", "backup_endpoint"} {
		if _, ok := shopSettings[forbidden]; ok {
			t.Fatalf("shop settings must not include %s in public response", forbidden)
		}
	}

	// Quick string-level guard (belt & suspenders)
	if strings.Contains(settingsRaw, "\"backup_") || strings.Contains(settingsRaw, "\"telegram\"") {
		t.Fatalf("shop settings must not include backup_* or telegram in public response")
	}
}
