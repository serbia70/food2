package handlers

import "testing"

func TestApplyMasterSettingsDefaults_WhenMissing(t *testing.T) {
	settings := map[string]interface{}{}

	applyMasterSettingsDefaults(settings)

	assertSettingInt(t, settings, "subscription_fee_rsd", 1200)
	assertSettingInt(t, settings, "business_fee_rsd", 1800)
	assertSettingInt(t, settings, "grace_days", 3)
	assertSettingInt(t, settings, "retention_dine_in_days", 7)
	assertSettingInt(t, settings, "retention_delivery_days", 90)

	if settings["billing_currency"] != "RSD" {
		t.Fatalf("billing_currency should be RSD, got %v", settings["billing_currency"])
	}
	if settings["stats_retention_mode"] != "permanent" {
		t.Fatalf("stats_retention_mode should default to permanent, got %v", settings["stats_retention_mode"])
	}
}

func TestApplyMasterSettingsDefaults_KeepValidAndNormalizeCurrency(t *testing.T) {
	settings := map[string]interface{}{
		"subscription_fee_rsd":    float64(1580),
		"billing_currency":        "CNY",
		"grace_days":              5,
		"retention_dine_in_days":  float64(10),
		"retention_delivery_days": "120",
		"stats_retention_mode":    "3y",
	}

	applyMasterSettingsDefaults(settings)

	assertSettingInt(t, settings, "subscription_fee_rsd", 1580)
	assertSettingInt(t, settings, "grace_days", 5)
	assertSettingInt(t, settings, "retention_dine_in_days", 10)
	assertSettingInt(t, settings, "retention_delivery_days", 120)

	if settings["billing_currency"] != "RSD" {
		t.Fatalf("billing_currency should be normalized to RSD, got %v", settings["billing_currency"])
	}
	if settings["stats_retention_mode"] != "3y" {
		t.Fatalf("stats_retention_mode should keep 3y, got %v", settings["stats_retention_mode"])
	}
}

func TestMasterSettingsKeyMap_IncludesBillingKeys(t *testing.T) {
	keyMap := masterSettingsKeyMap()

	tests := []struct {
		key  string
		want string
	}{
		{key: "subscriptionFeeRsd", want: "subscription_fee_rsd"},
		{key: "businessFeeRsd", want: "business_fee_rsd"},
		{key: "billingCurrency", want: "billing_currency"},
		{key: "graceDays", want: "grace_days"},
		{key: "retentionDineInDays", want: "retention_dine_in_days"},
		{key: "retentionDeliveryDays", want: "retention_delivery_days"},
		{key: "statsRetentionMode", want: "stats_retention_mode"},
	}

	for _, tc := range tests {
		got, ok := keyMap[tc.key]
		if !ok {
			t.Fatalf("expected key map to include %s", tc.key)
		}
		if got != tc.want {
			t.Fatalf("unexpected map target for %s: got %s want %s", tc.key, got, tc.want)
		}
	}
}

func TestMergeMasterSettingsPayload_MapsBillingFields(t *testing.T) {
	settings := map[string]interface{}{}
	payload := map[string]interface{}{
		"subscriptionFeeRsd":    float64(1880),
		"billingCurrency":       "CNY",
		"graceDays":             float64(6),
		"retentionDineInDays":   float64(9),
		"retentionDeliveryDays": float64(120),
		"statsRetentionMode":    "3y",
	}

	mergeMasterSettingsPayload(settings, payload)

	assertSettingInt(t, settings, "subscription_fee_rsd", 1880)
	assertSettingInt(t, settings, "grace_days", 6)
	assertSettingInt(t, settings, "retention_dine_in_days", 9)
	assertSettingInt(t, settings, "retention_delivery_days", 120)

	if settings["billing_currency"] != "RSD" {
		t.Fatalf("billing_currency should be normalized to RSD, got %v", settings["billing_currency"])
	}
	if settings["stats_retention_mode"] != "3y" {
		t.Fatalf("stats_retention_mode should keep 3y, got %v", settings["stats_retention_mode"])
	}

	if _, exists := settings["subscriptionFeeRsd"]; exists {
		t.Fatalf("camelCase key subscriptionFeeRsd should not remain in settings")
	}
}

func TestApplyMasterSettingsDefaults_InvalidNumericFallbacks(t *testing.T) {
	settings := map[string]interface{}{
		"subscription_fee_rsd":    "12abc",
		"grace_days":              "1.5",
		"retention_dine_in_days":  -2,
		"retention_delivery_days": 0,
		"stats_retention_mode":    "forever",
	}

	applyMasterSettingsDefaults(settings)

	assertSettingInt(t, settings, "subscription_fee_rsd", 1200)
	assertSettingInt(t, settings, "business_fee_rsd", 1800)
	assertSettingInt(t, settings, "grace_days", 3)
	assertSettingInt(t, settings, "retention_dine_in_days", 7)
	assertSettingInt(t, settings, "retention_delivery_days", 90)

	if settings["stats_retention_mode"] != "permanent" {
		t.Fatalf("invalid stats_retention_mode should fallback to permanent, got %v", settings["stats_retention_mode"])
	}
}

func TestValueAsInt_StrictStringParsing(t *testing.T) {
	if _, ok := valueAsInt("12abc"); ok {
		t.Fatalf("valueAsInt should reject malformed numeric string")
	}
	if _, ok := valueAsInt("1.5"); ok {
		t.Fatalf("valueAsInt should reject float-like integer string")
	}
	if _, ok := valueAsInt(""); ok {
		t.Fatalf("valueAsInt should reject empty string")
	}

	if n, ok := valueAsInt("42"); !ok || n != 42 {
		t.Fatalf("valueAsInt should parse valid integer string, got (%d, %v)", n, ok)
	}
}

func TestMasterBillingConfig(t *testing.T) {
	settings := map[string]interface{}{}
	applyMasterSettingsDefaults(settings)

	assertSettingInt(t, settings, "subscription_fee_rsd", 1200)
	assertSettingInt(t, settings, "business_fee_rsd", 1800)
	if settings["billing_currency"] != "RSD" {
		t.Fatalf("billing_currency should be RSD, got %v", settings["billing_currency"])
	}

	mergeMasterSettingsPayload(settings, map[string]interface{}{
		"subscriptionFeeRsd": float64(1680),
		"billingCurrency":    "CNY",
	})

	assertSettingInt(t, settings, "subscription_fee_rsd", 1680)
	if settings["billing_currency"] != "RSD" {
		t.Fatalf("billing_currency should remain RSD after payload merge, got %v", settings["billing_currency"])
	}
}

func assertSettingInt(t *testing.T, settings map[string]interface{}, key string, want int) {
	t.Helper()

	got, ok := valueAsInt(settings[key])
	if !ok {
		t.Fatalf("key %s should be an int-compatible value, got %v", key, settings[key])
	}
	if got != want {
		t.Fatalf("unexpected %s: got %d want %d", key, got, want)
	}
}
