package handlers

import (
	"testing"
	"time"
)

func TestResolveBusinessDay_BeforeFiveBelongsToPreviousDay(t *testing.T) {
	ts := time.Date(2026, 3, 10, 2, 30, 0, 0, time.UTC)
	if got := resolveBusinessDay(ts); got != "2026-03-09" {
		t.Fatalf("expected previous business day, got %s", got)
	}
}

func TestResolveBusinessDay_AfterFiveBelongsToSameDay(t *testing.T) {
	ts := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	if got := resolveBusinessDay(ts); got != "2026-03-10" {
		t.Fatalf("expected same business day, got %s", got)
	}
}

func TestResolveDeliveryFulfillmentDay_UsesScheduledTimeWhenPresent(t *testing.T) {
	createdAt := time.Date(2026, 3, 10, 9, 0, 0, 0, time.UTC)
	scheduledAt := time.Date(2026, 3, 11, 1, 30, 0, 0, time.UTC)
	if got := resolveDeliveryFulfillmentDay(&createdAt, &scheduledAt); got != "2026-03-10" {
		t.Fatalf("expected scheduled business day, got %s", got)
	}
}

func TestResolveAutoCompleteAt_EndsAtNextFiveAfterBusinessDay(t *testing.T) {
	createdAt := time.Date(2026, 3, 10, 9, 0, 0, 0, time.UTC)
	scheduledAt := time.Date(2026, 3, 11, 1, 30, 0, 0, time.UTC)
	got := resolveAutoCompleteAt(&createdAt, &scheduledAt)
	want := time.Date(2026, 3, 11, 5, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("expected auto complete at %s, got %s", want.Format(time.RFC3339), got.Format(time.RFC3339))
	}
}
