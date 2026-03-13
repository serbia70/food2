package handlers

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"
	"time"

	"meituan-go/internal/db"

	"github.com/gin-gonic/gin"
)

type dailyReportRow struct {
	ShopID        int64  `db:"shop_id" json:"shop_id"`
	ShopSlug      string `db:"shop_slug" json:"shop_slug"`
	ShopName      string `db:"shop_name" json:"shop_name"`
	OrderCount    int64  `db:"order_count" json:"order_count"`
	RevenueRSD    int64  `db:"revenue_rsd" json:"revenue_rsd"`
	DeliveryCount int64  `db:"delivery_count" json:"delivery_count"`
	DineInCount   int64  `db:"dine_in_count" json:"dine_in_count"`
}

func DailyReportCron(c *gin.Context) {
	if !checkCronToken(c) {
		return
	}

	settings := getMasterSettingsMap()
	timezone := resolveReportTimezone(settings)
	dateStr, err := resolveReportDate(c.Query("date"), timezone)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid date format, use YYYY-MM-DD"})
		return
	}

	startAt, endAt, err := reportDateRange(dateStr, timezone)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to resolve report date range"})
		return
	}

	rows := []dailyReportRow{}
	err = db.DB.Select(&rows, `
		SELECT
			s.id AS shop_id,
			s.slug AS shop_slug,
			s.name AS shop_name,
			COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN 1 ELSE 0 END), 0) AS order_count,
			COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_amount ELSE 0 END), 0) AS revenue_rsd,
			COALESCE(SUM(CASE WHEN o.status != 'cancelled' AND o.order_type = 'delivery' THEN 1 ELSE 0 END), 0) AS delivery_count,
			COALESCE(SUM(CASE WHEN o.status != 'cancelled' AND o.order_type = 'dine_in' THEN 1 ELSE 0 END), 0) AS dine_in_count
		FROM shops s
		LEFT JOIN orders o ON o.shop_id = s.id
			AND datetime(o.created_at) >= datetime(?)
			AND datetime(o.created_at) < datetime(?)
		GROUP BY s.id, s.slug, s.name
		ORDER BY s.slug ASC
	`, startAt, endAt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate daily report"})
		return
	}

	var totalRevenue, totalOrders, totalDelivery int64
	shops := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		avg := int64(0)
		if row.OrderCount > 0 {
			avg = row.RevenueRSD / row.OrderCount
		}
		deliveryRatio := 0.0
		if row.OrderCount > 0 {
			deliveryRatio = float64(row.DeliveryCount) / float64(row.OrderCount)
		}

		totalRevenue += row.RevenueRSD
		totalOrders += row.OrderCount
		totalDelivery += row.DeliveryCount

		shops = append(shops, gin.H{
			"shop_id":            row.ShopID,
			"shop_slug":          row.ShopSlug,
			"shop_name":          row.ShopName,
			"order_count":        row.OrderCount,
			"revenue_rsd":        row.RevenueRSD,
			"avg_order_rsd":      avg,
			"delivery_count":     row.DeliveryCount,
			"dine_in_count":      row.DineInCount,
			"delivery_ratio":     deliveryRatio,
			"delivery_ratio_pct": int(deliveryRatio * 100),
		})
	}

	totalAvg := int64(0)
	if totalOrders > 0 {
		totalAvg = totalRevenue / totalOrders
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"date":         dateStr,
		"timezone":     timezone,
		"shops":        shops,
		"generated_at": time.Now().UTC().Format(time.RFC3339),
		"totals": gin.H{
			"order_count":          totalOrders,
			"revenue_rsd":          totalRevenue,
			"avg_order_rsd":        totalAvg,
			"delivery_order_count": totalDelivery,
		},
	})
}

func checkCronToken(c *gin.Context) bool {
	expected := strings.TrimSpace(os.Getenv("MEITUAN_CRON_TOKEN"))
	if expected == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "error": "Cron token not configured"})
		return false
	}

	authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
	provided := ""
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		provided = strings.TrimSpace(authHeader[7:])
	}

	if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Unauthorized"})
		return false
	}

	return true
}

func resolveReportTimezone(settings map[string]interface{}) string {
	if settings != nil {
		if tz, ok := settings["report_timezone"].(string); ok && strings.TrimSpace(tz) != "" {
			if _, err := time.LoadLocation(strings.TrimSpace(tz)); err == nil {
				return strings.TrimSpace(tz)
			}
		}
	}
	return "Europe/Belgrade"
}

func resolveReportDate(rawDate string, timezone string) (string, error) {
	if strings.TrimSpace(rawDate) != "" {
		t, err := time.Parse("2006-01-02", strings.TrimSpace(rawDate))
		if err != nil {
			return "", err
		}
		return t.Format("2006-01-02"), nil
	}

	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	yesterday := time.Now().In(loc).AddDate(0, 0, -1)
	return yesterday.Format("2006-01-02"), nil
}

func reportDateRange(dateStr, timezone string) (string, string, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}

	day, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(dateStr), loc)
	if err != nil {
		return "", "", err
	}

	startAt := day.Format("2006-01-02 15:04:05")
	endAt := day.AddDate(0, 0, 1).Format("2006-01-02 15:04:05")
	return startAt, endAt, nil
}
