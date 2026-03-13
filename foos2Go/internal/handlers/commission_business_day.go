package handlers

import "time"

const businessDayCutoffHour = 5

func resolveBusinessDay(ts time.Time) string {
	base := ts
	if ts.Hour() < businessDayCutoffHour {
		base = ts.AddDate(0, 0, -1)
	}
	return base.Format("2006-01-02")
}

func resolveDeliveryFulfillmentDay(createdAt, scheduledAt *time.Time) string {
	if scheduledAt != nil && !scheduledAt.IsZero() {
		return resolveBusinessDay(*scheduledAt)
	}
	if createdAt != nil && !createdAt.IsZero() {
		return resolveBusinessDay(*createdAt)
	}
	return resolveBusinessDay(time.Now())
}

func resolveAutoCompleteAt(createdAt, scheduledAt *time.Time) time.Time {
	ref := time.Now()
	if scheduledAt != nil && !scheduledAt.IsZero() {
		ref = *scheduledAt
	} else if createdAt != nil && !createdAt.IsZero() {
		ref = *createdAt
	}

	businessDay := ref
	if ref.Hour() < businessDayCutoffHour {
		businessDay = ref.AddDate(0, 0, -1)
	}
	nextDay := time.Date(businessDay.Year(), businessDay.Month(), businessDay.Day()+1, businessDayCutoffHour, 0, 0, 0, businessDay.Location())
	return nextDay
}
