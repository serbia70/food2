package handlers

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"meituan-go/internal/db"
)

// Helper func exposed for reservation.go
func generateOrderNo(shopID int64) string {
	prefix := time.Now().In(orderNoLocation).Format("060102")
	pattern := prefix + "%"

	var lastOrderNo string
	err := db.DB.Get(&lastOrderNo, "SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1", pattern)
	if err != nil {
		return fmt.Sprintf("%s%03d", prefix, 1)
	}

	seq := 1
	if strings.HasPrefix(lastOrderNo, prefix) && len(lastOrderNo) >= 9 {
		lastSeq, convErr := strconv.Atoi(lastOrderNo[len(lastOrderNo)-3:])
		if convErr == nil {
			seq = lastSeq + 1
		}
	}

	if seq > 999 {
		return fmt.Sprintf("%s%04d", prefix, seq)
	}

	return fmt.Sprintf("%s%03d", prefix, seq)
}

func nextDailyOrderNo() (string, error) {
	return generateOrderNo(0), nil
}

func loadOrderNoLocation() *time.Location {
	loc, err := time.LoadLocation("Europe/Belgrade")
	if err != nil {
		return time.FixedZone("CET", 3600)
	}
	return loc
}
