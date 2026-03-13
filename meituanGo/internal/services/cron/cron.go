package cron

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"meituan-go/internal/db"
)

var lastBackupDay string
var lastRateUpdateDay string
var lastReservationCleanupAt time.Time

func Start() {
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for t := range ticker.C {
			checkTasks(t)
		}
	}()
	log.Println("Cron scheduler started")
}

func checkTasks(t time.Time) {
	settingsMap := getMasterSettings()
	today := t.Format("2006-01-02")

	// 1. Automatic Backup
	backupTimeStr, _ := settingsMap["backup_time"].(string) // e.g. "03:00"
	if backupTimeStr != "" {
		if t.Format("15:04") == backupTimeStr && lastBackupDay != today {
			log.Println("Starting scheduled backup...")
			filename, err := performBackup()
			if err != nil {
				log.Printf("Scheduled backup failed: %v", err)
			} else {
				log.Printf("Scheduled backup success: %s", filename)
				lastBackupDay = today
			}
		}
	}

	// 2. Rate Center Auto-Decrement
	// Run at 08:00 fixed time
	if t.Format("15:04") == "08:00" && lastRateUpdateDay != today {
		rateCenter, ok := settingsMap["rate_center"].(map[string]interface{})
		if ok {
			dailyStepStr, _ := rateCenter["daily_step"].(string)
			dailyStep, _ := strconv.ParseFloat(dailyStepStr, 64)

			if dailyStep != 0 {
				manualOffsetStr, _ := rateCenter["manual_offset"].(string) // usually 0 or float string

				offset, _ := strconv.ParseFloat(manualOffsetStr, 64)
				newOffset := offset + dailyStep // dailyStep can be negative

				rateCenter["manual_offset"] = fmt.Sprintf("%.4f", newOffset)
				settingsMap["rate_center"] = rateCenter

				saveMasterSettings(settingsMap)
				log.Printf("Daily rate adjusted by %f. New offset: %s", dailyStep, rateCenter["manual_offset"])
				lastRateUpdateDay = today
			}
		}
	}

	// 3. Reservation cleanup (hourly): auto delete reservations older than 3 days after reserved time
	if lastReservationCleanupAt.IsZero() || t.Sub(lastReservationCleanupAt) >= time.Hour {
		cleanupExpiredReservations()
		lastReservationCleanupAt = t
	}

	// 4. Monthly subscription charge: run once per month with catch-up after downtime
	monthKey := t.Format("2006-01")
	lastBillingCycleMonth := settingsString(settingsMap, "cron_last_billing_cycle_month")
	if t.Format("15:04") >= "00:01" && lastBillingCycleMonth != monthKey {
		if err := runMonthlyBillingCycleAt(t, settingsMap); err != nil {
			log.Printf("Monthly billing cycle failed: %v", err)
		} else if err := applyGraceDowngradesAt(t, settingsMap); err != nil {
			log.Printf("Grace downgrade check failed after billing cycle: %v", err)
		} else {
			settingsMap["cron_last_billing_cycle_month"] = monthKey
			settingsMap["cron_last_grace_downgrade_day"] = today
			saveMasterSettings(settingsMap)
			log.Printf("Monthly billing cycle completed for %s", monthKey)
		}
	}

	// 5. Monthly order retention: tracked separately to avoid repeated billing side effects
	lastRetentionMonth := settingsString(settingsMap, "cron_last_order_retention_month")
	if t.Format("15:04") >= "00:02" && lastRetentionMonth != monthKey {
		if err := runOrderRetentionAt(t, settingsMap); err != nil {
			log.Printf("Monthly order retention failed: %v", err)
		} else {
			settingsMap["cron_last_order_retention_month"] = monthKey
			saveMasterSettings(settingsMap)
		}
	}

	// 6. Daily grace downgrade check at 00:05 with retry until successful
	lastGraceDowngradeDay := settingsString(settingsMap, "cron_last_grace_downgrade_day")
	if t.Format("15:04") >= "00:05" && lastGraceDowngradeDay != today {
		if err := applyGraceDowngradesAt(t, settingsMap); err != nil {
			log.Printf("Daily grace downgrade check failed: %v", err)
		} else {
			settingsMap["cron_last_grace_downgrade_day"] = today
			saveMasterSettings(settingsMap)
		}
	}

	// 7. Weekly chat cleanup every Monday at 05:00
	year, week := t.ISOWeek()
	weekKey := fmt.Sprintf("%d-W%02d", year, week)
	lastChatCleanupWeek := settingsString(settingsMap, "cron_last_chat_cleanup_week")
	if t.Weekday() == time.Monday && t.Format("15:04") >= "05:00" && lastChatCleanupWeek != weekKey {
		if err := cleanupWeeklyChatMessages(t); err != nil {
			log.Printf("Weekly chat cleanup failed: %v", err)
		} else {
			settingsMap["cron_last_chat_cleanup_week"] = weekKey
			saveMasterSettings(settingsMap)
		}
	}
}

func cleanupExpiredReservations() {
	res, err := db.DB.Exec(`
		DELETE FROM reservations
		WHERE datetime(reservation_time) <= datetime('now', 'localtime', '-3 day')
	`)
	if err != nil {
		log.Printf("Reservation cleanup failed: %v", err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("Reservation cleanup removed %d expired rows", n)
	}
}

func cleanupWeeklyChatMessages(now time.Time) error {
	res, err := db.DB.Exec(`
		DELETE FROM chat_messages
		WHERE datetime(created_at) <= datetime(?, '-7 day')
	`, now.Format("2006-01-02 15:04:05"))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("Weekly chat cleanup removed %d rows", n)
	}
	return nil
}

// Helpers duplicated/adapted to avoid cyclic deps and complex refactoring

func getMasterSettings() map[string]interface{} {
	var settingsStr string
	err := db.DB.QueryRow("SELECT settings FROM master_admin WHERE id = 1").Scan(&settingsStr)
	var settings map[string]interface{}
	if err != nil {
		settings = make(map[string]interface{})
	} else {
		json.Unmarshal([]byte(settingsStr), &settings)
	}
	return settings
}

func saveMasterSettings(settings map[string]interface{}) {
	bytes, _ := json.Marshal(settings)
	db.DB.Exec("UPDATE master_admin SET settings = ? WHERE id = 1", string(bytes))
}

func settingsString(settings map[string]interface{}, key string) string {
	if settings == nil {
		return ""
	}
	v, ok := settings[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

func performBackup() (string, error) {
	timestamp := time.Now().Format("20060102-150405")
	filename := fmt.Sprintf("auto-backup-%s.zip", timestamp)
	outDir := "backups"
	os.MkdirAll(outDir, 0755)
	outPath := filepath.Join(outDir, filename)

	err := zipDirectory("data", outPath, nil)
	return filename, err
}

func zipDirectory(source, target string, excludes []string) error {
	zipfile, err := os.Create(target)
	if err != nil {
		return err
	}
	defer zipfile.Close()

	archive := zip.NewWriter(zipfile)
	defer archive.Close()

	return filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if path == target {
			return nil
		}

		for _, ex := range excludes {
			if strings.Contains(path, ex) {
				if info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}

		relPath, _ := filepath.Rel(source, path)
		header.Name = strings.ReplaceAll(relPath, "\\", "/")

		if info.IsDir() {
			header.Name += "/"
		} else {
			header.Method = zip.Deflate
		}

		writer, err := archive.CreateHeader(header)
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(writer, file)
		return err
	})
}
