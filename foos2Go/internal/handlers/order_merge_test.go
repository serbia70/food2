package handlers

import (
	"encoding/json"
	"testing"

	"meituan-go/internal/utils"
)

func decodeMergedItems(t *testing.T, raw string) []map[string]interface{} {
	t.Helper()
	var items []map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		t.Fatalf("failed to decode merged items: %v", err)
	}
	return items
}

func TestMergeOrderItems_MergeByProductIDAndSubName(t *testing.T) {
	existing := `[{"product_id":1,"name":"Fish","sub_name":"Hot","price":100,"quantity":2}]`
	incoming := `[{"product_id":1,"name":"Fish","sub_name":"Hot","price":100,"quantity":3}]`

	mergedRaw, total := mergeOrderItems(existing, incoming, 200, 300)
	items := decodeMergedItems(t, mergedRaw)

	if len(items) != 1 {
		t.Fatalf("expected 1 merged item, got %d", len(items))
	}
	if qty := utils.Int64(items[0]["quantity"]); qty != 5 {
		t.Fatalf("expected merged quantity=5, got %d", qty)
	}
	if total != 500 {
		t.Fatalf("expected merged total=500, got %d", total)
	}
}

func TestMergeOrderItems_FallbackKeyAndQtyAlias(t *testing.T) {
	existing := `{"a":{"name":"Noodle","sub_name":"","price":80,"qty":1}}`
	incoming := `[{"name":"Noodle","sub_name":"","price":80,"quantity":2}]`

	mergedRaw, _ := mergeOrderItems(existing, incoming, 80, 160)
	items := decodeMergedItems(t, mergedRaw)

	if len(items) != 1 {
		t.Fatalf("expected fallback merge into 1 item, got %d", len(items))
	}
	if qty := utils.Int64(items[0]["quantity"]); qty != 3 {
		t.Fatalf("expected fallback merged quantity=3, got %d", qty)
	}
}

func TestMergeOrderItems_ZeroQuantityDefaultsToOne(t *testing.T) {
	existing := `[{"name":"Rice","sub_name":"","price":30,"quantity":0}]`
	incoming := `[{"name":"Rice","sub_name":"","price":30,"quantity":2}]`

	mergedRaw, _ := mergeOrderItems(existing, incoming, 30, 60)
	items := decodeMergedItems(t, mergedRaw)
	if len(items) != 1 {
		t.Fatalf("expected one merged rice item, got %d", len(items))
	}
	if qty := utils.Int64(items[0]["quantity"]); qty != 3 {
		t.Fatalf("expected normalized quantity=3, got %d", qty)
	}
}

func TestMergeOrderItems_DifferentPriceShouldNotMerge(t *testing.T) {
	existing := `[{"name":"Soup","sub_name":"","price":50,"quantity":1}]`
	incoming := `[{"name":"Soup","sub_name":"","price":70,"quantity":1}]`

	mergedRaw, _ := mergeOrderItems(existing, incoming, 50, 70)
	items := decodeMergedItems(t, mergedRaw)

	if len(items) != 2 {
		t.Fatalf("expected 2 separate items, got %d", len(items))
	}
}

func TestMergeOrderItems_InvalidJSONReturnsEmptyList(t *testing.T) {
	mergedRaw, total := mergeOrderItems("{bad-json}", "{also-bad}", 10, 20)
	items := decodeMergedItems(t, mergedRaw)

	if len(items) != 0 {
		t.Fatalf("expected no items for invalid JSON, got %d", len(items))
	}
	if total != 30 {
		t.Fatalf("expected totals still summed to 30, got %d", total)
	}
}
