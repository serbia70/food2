package cron

import (
	"fmt"
	"strings"
	"time"

	"meituan-go/internal/db"
)

func runOrderRetentionAt(now time.Time, settings map[string]interface{}) error {
	dineInCutoff := retentionCutoff(now, settings, "retention_dine_in_days", 7)
	deliveryCutoff := retentionCutoff(now, settings, "retention_delivery_days", 90)

	if err := snapshotAndDeleteOldOrdersWithCutoff(now, "dine_in", dineInCutoff); err != nil {
		return err
	}
	if err := snapshotAndDeleteOldOrdersWithCutoff(now, "delivery", deliveryCutoff); err != nil {
		return err
	}

	// 佣金明细跟随 delivery 口径保留较长周期，避免过早丢失月度对账依据。
	db.DB.Exec("DELETE FROM commission_records WHERE datetime(created_at) < datetime(?)", deliveryCutoff)

	mode := strings.TrimSpace(fmt.Sprintf("%v", settings["stats_retention_mode"]))
	if mode == "3y" {
		cutoff := now.AddDate(-3, 0, 0).Format("2006-01-02")
		if _, err := db.DB.Exec("DELETE FROM order_daily_stats WHERE date(stat_date) < date(?)", cutoff); err != nil {
			return err
		}
	}

	return nil
}

func retentionCutoff(now time.Time, settings map[string]interface{}, key string, defaultDays int) string {
	days := defaultDays
	if raw, ok := settings[key]; ok {
		switch v := raw.(type) {
		case int:
			if v > 0 {
				days = v
			}
		case int64:
			if v > 0 {
				days = int(v)
			}
		case float64:
			if v > 0 {
				days = int(v)
			}
		}
	}
	return now.AddDate(0, 0, -days).Format("2006-01-02 15:04:05")
}

func snapshotAndDeleteOldOrdersWithCutoff(now time.Time, orderType string, cutoff string) error {
	tx, err := db.DB.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO order_daily_stats (shop_id, stat_date, order_type, order_count, total_rsd)
		SELECT
			shop_id,
			date(created_at) AS stat_date,
			order_type,
			COUNT(*) AS order_count,
			COALESCE(SUM(total_amount), 0) AS total_rsd
		FROM orders
		WHERE order_type = ?
		  AND datetime(created_at) < datetime(?)
		  AND status IN ('completed', 'paid', 'archived')
		GROUP BY shop_id, date(created_at), order_type
		ON CONFLICT(shop_id, stat_date, order_type) DO UPDATE SET
			order_count = order_daily_stats.order_count + excluded.order_count,
			total_rsd = order_daily_stats.total_rsd + excluded.total_rsd,
			updated_at = CURRENT_TIMESTAMP
	`, orderType, cutoff)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`
		DELETE FROM orders
		WHERE order_type = ?
		  AND datetime(created_at) < datetime(?)
		  AND status IN ('completed', 'paid', 'archived')
	`, orderType, cutoff)
	if err != nil {
		return err
	}

	return tx.Commit()
}
