package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"strings"
	"sync"

	"meituan-go/internal/db"
)

var (
	shopMQTTSecretColumnMu        sync.RWMutex
	shopMQTTSecretColumnCached    bool
	shopMQTTSecretColumnAvailable bool
)

func getShopIDBySlug(slug string) (int64, error) {
	var shopID int64
	err := db.DB.Get(&shopID, "SELECT id FROM shops WHERE slug = ? LIMIT 1", slug)
	return shopID, err
}

func getShopBasicAuthBySlug(slug string) (db.Shop, error) {
	var shop db.Shop
	err := db.DB.Get(&shop, "SELECT id, password FROM shops WHERE slug = ? LIMIT 1", slug)
	return shop, err
}

func getShopSettingsRaw(shopID int64) (string, error) {
	var settingsStr sql.NullString
	err := db.DB.QueryRow("SELECT settings FROM shops WHERE id = ?", shopID).Scan(&settingsStr)
	if err != nil {
		return "", err
	}
	if !settingsStr.Valid {
		return "", nil
	}
	return settingsStr.String, nil
}

func updateShopSettingsRaw(shopID int64, settings string) error {
	_, err := db.DB.Exec(
		"UPDATE shops SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		settings,
		shopID,
	)
	return err
}

func getShopSettings(shopID int64) (map[string]interface{}, error) {
	settingsStr, err := getShopSettingsRaw(shopID)
	if err != nil {
		return map[string]interface{}{}, err
	}
	m := map[string]interface{}{}
	if strings.TrimSpace(settingsStr) != "" {
		_ = json.Unmarshal([]byte(settingsStr), &m)
	}
	return m, nil
}

func resetShopMQTTSecretColumnCache() {
	shopMQTTSecretColumnMu.Lock()
	defer shopMQTTSecretColumnMu.Unlock()
	shopMQTTSecretColumnCached = false
	shopMQTTSecretColumnAvailable = false
}

func hasShopMQTTSecretColumn() bool {
	shopMQTTSecretColumnMu.RLock()
	if shopMQTTSecretColumnCached {
		available := shopMQTTSecretColumnAvailable
		shopMQTTSecretColumnMu.RUnlock()
		return available
	}
	shopMQTTSecretColumnMu.RUnlock()

	shopMQTTSecretColumnMu.Lock()
	defer shopMQTTSecretColumnMu.Unlock()
	if shopMQTTSecretColumnCached {
		return shopMQTTSecretColumnAvailable
	}

	type tableInfoRow struct {
		CID       int            `db:"cid"`
		Name      string         `db:"name"`
		Type      string         `db:"type"`
		NotNull   int            `db:"notnull"`
		DfltValue sql.NullString `db:"dflt_value"`
		PK        int            `db:"pk"`
	}
	var rows []tableInfoRow
	if err := db.DB.Select(&rows, "PRAGMA table_info(shops)"); err != nil {
		log.Printf("[schema] failed to inspect shops columns: %v", err)
		shopMQTTSecretColumnCached = true
		shopMQTTSecretColumnAvailable = false
		return false
	}

	available := false
	for _, row := range rows {
		if strings.EqualFold(strings.TrimSpace(row.Name), "mqtt_secret") {
			available = true
			break
		}
	}

	shopMQTTSecretColumnCached = true
	shopMQTTSecretColumnAvailable = available
	return available
}

func loadShopMQTTSecretBySlug(slug string) (string, error) {
	if !hasShopMQTTSecretColumn() {
		return "", nil
	}

	var mqttSecret sql.NullString
	if err := db.DB.Get(&mqttSecret, "SELECT mqtt_secret FROM shops WHERE slug = ? LIMIT 1", slug); err != nil {
		return "", err
	}
	return strings.TrimSpace(mqttSecret.String), nil
}

func loadShopMQTTTopicInfoByID(shopID int64) (string, string, error) {
	if hasShopMQTTSecretColumn() {
		var shop struct {
			Slug       string         `db:"slug"`
			MQTTSecret sql.NullString `db:"mqtt_secret"`
		}
		if err := db.DB.Get(&shop, "SELECT slug, mqtt_secret FROM shops WHERE id = ? LIMIT 1", shopID); err != nil {
			return "", "", err
		}
		return strings.TrimSpace(shop.Slug), strings.TrimSpace(shop.MQTTSecret.String), nil
	}

	var slug string
	if err := db.DB.Get(&slug, "SELECT slug FROM shops WHERE id = ? LIMIT 1", shopID); err != nil {
		return "", "", err
	}
	return strings.TrimSpace(slug), "", nil
}
