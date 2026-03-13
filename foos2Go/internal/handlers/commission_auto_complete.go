package handlers

import (
	"database/sql"
	"strings"
	"time"

	"meituan-go/internal/db"
)

type autoCompleteCandidate struct {
	ID           int64          `db:"id"`
	ShopID       int64          `db:"shop_id"`
	Status       string         `db:"status"`
	CreatedAt    sql.NullString `db:"created_at"`
	ScheduledFor sql.NullString `db:"scheduled_for"`
}

func AutoCompleteDeliveryOrders(now time.Time) (int, error) {
	var rows []autoCompleteCandidate
	err := db.DB.Select(&rows, `
		SELECT id, shop_id, status, created_at, scheduled_for
		FROM orders
		WHERE order_type = 'delivery'
		  AND status NOT IN ('completed', 'cancelled', 'rejected', 'refunded', 'paid')
	`)
	if err != nil {
		return 0, err
	}

	completed := 0
	for _, row := range rows {
		createdAt := parseAutoCompleteTime(row.CreatedAt)
		scheduledAt := parseAutoCompleteTime(row.ScheduledFor)
		autoCompleteAt := resolveAutoCompleteAt(createdAt, scheduledAt)
		if now.Before(autoCompleteAt) {
			continue
		}

		if _, err := db.DB.Exec(`
			UPDATE orders
			SET status = 'completed', updated_at = CURRENT_TIMESTAMP
			WHERE id = ? AND shop_id = ?
		`, row.ID, row.ShopID); err != nil {
			return completed, err
		}

		RecordCommissionForOrder(row.ShopID, row.ID)
		completed++
	}

	return completed, nil
}

func parseAutoCompleteTime(value sql.NullString) *time.Time {
	if !value.Valid || strings.TrimSpace(value.String) == "" {
		return nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05"} {
		if ts, err := time.Parse(layout, strings.TrimSpace(value.String)); err == nil {
			return &ts
		}
	}
	return nil
}
