package handlers

import "testing"

func TestBillingAlertLevelThresholds(t *testing.T) {
	fee := int64(1280)

	if got := billingAlertLevel("subscription", 1500, fee, "active"); got != "normal" {
		t.Fatalf("expected normal for healthy balance, got %s", got)
	}
	if got := billingAlertLevel("subscription", 900, fee, "active"); got != "warning" {
		t.Fatalf("expected warning for balance < 1000, got %s", got)
	}
	if got := billingAlertLevel("subscription", 150, fee, "active"); got != "critical" {
		t.Fatalf("expected critical for balance < 200, got %s", got)
	}
	if got := billingAlertLevel("subscription", 5000, fee, "grace"); got != "overdue" {
		t.Fatalf("expected overdue when billing status is grace, got %s", got)
	}
	if got := billingAlertLevel("business", 5000, fee, "grace"); got != "overdue" {
		t.Fatalf("expected business plan grace status to be overdue, got %s", got)
	}
	if got := billingAlertLevel("business", 150, fee, "active"); got != "critical" {
		t.Fatalf("expected business plan to use balance thresholds, got %s", got)
	}
}
