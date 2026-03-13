package db

import (
	"fmt"
	"path/filepath"
	"testing"
)

type tableSpec struct {
	Name    string
	Columns []string
}

type tableColumnInfo struct {
	Name         string  `db:"name"`
	DefaultValue *string `db:"dflt_value"`
}

type indexListItem struct {
	Name   string `db:"name"`
	Unique int    `db:"unique"`
}

type indexInfoItem struct {
	Name string `db:"name"`
}

func TestMigrationsCreateBillingTables(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "migrations-test.db")

	if err := Init(dbPath); err != nil {
		t.Fatalf("Init() error = %v", err)
	}
	t.Cleanup(Close)

	tables := []tableSpec{
		{Name: "billing_accounts", Columns: []string{"shop_id", "plan_type", "pending_plan_type", "balance_rsd", "next_charge_date", "grace_until", "billing_status", "created_at", "updated_at"}},
		{Name: "billing_ledger", Columns: []string{"shop_id", "entry_type", "amount_rsd", "source_currency", "source_amount", "fx_rate", "note", "created_at"}},
		{Name: "commission_refund_requests", Columns: []string{"shop_id", "order_id", "commission_record_id", "commission_amount", "reason", "status", "review_note", "reviewed_by", "reviewed_at", "created_at", "updated_at"}},
		{Name: "order_daily_stats", Columns: []string{"shop_id", "stat_date", "order_type", "order_count", "total_rsd", "created_at", "updated_at"}},
		{Name: "shop_loyalty_points", Columns: []string{"shop_id", "user_phone", "points_balance", "is_vip", "vip_discount_percent", "total_spend_rsd", "created_at", "updated_at"}},
		{Name: "shop_promotions", Columns: []string{"shop_id", "name", "promo_type", "stackable", "is_active", "created_at", "updated_at"}},
		{Name: "chat_messages", Columns: []string{"shop_id", "order_id", "sender_role", "sender_phone", "message", "created_at"}},
	}

	for _, table := range tables {
		if !tableExists(t, table.Name) {
			t.Fatalf("expected table %s to exist", table.Name)
		}

		for _, columnName := range table.Columns {
			if !columnExists(t, table.Name, columnName) {
				t.Fatalf("expected column %s.%s to exist", table.Name, columnName)
			}
		}
	}

	assertColumnDefault(t, "billing_accounts", "balance_rsd", "0")
	assertColumnDefault(t, "billing_accounts", "billing_status", "'active'")
	assertColumnDefault(t, "order_daily_stats", "order_count", "0")
	assertColumnDefault(t, "order_daily_stats", "total_rsd", "0")

	assertUniqueIndexByColumns(t, "billing_accounts", []string{"shop_id"})
	assertUniqueIndexByColumns(t, "order_daily_stats", []string{"shop_id", "stat_date", "order_type"})

	assertIndexByNameAndColumns(t, "billing_accounts", "idx_billing_accounts_status_next_charge", []string{"billing_status", "next_charge_date"})
	assertIndexByNameAndColumns(t, "billing_ledger", "idx_billing_ledger_shop_created", []string{"shop_id", "created_at"})
	assertIndexByNameAndColumns(t, "billing_ledger", "idx_billing_ledger_shop_type_note", []string{"shop_id", "entry_type", "note"})
	assertIndexByNameAndColumns(t, "commission_refund_requests", "idx_commission_refund_shop_status", []string{"shop_id", "status"})
	assertIndexByNameAndColumns(t, "commission_refund_requests", "idx_commission_refund_commission_record", []string{"commission_record_id"})
	assertIndexByNameAndColumns(t, "order_daily_stats", "idx_order_daily_stats_shop_type_date", []string{"shop_id", "order_type", "stat_date"})
	assertIndexByNameAndColumns(t, "shop_loyalty_points", "idx_loyalty_shop_phone", []string{"shop_id", "user_phone"})
	assertIndexByNameAndColumns(t, "shop_promotions", "idx_promo_shop_active", []string{"shop_id", "is_active", "starts_at", "ends_at"})
	assertIndexByNameAndColumns(t, "chat_messages", "idx_chat_shop_created", []string{"shop_id", "created_at"})

	if !columnExists(t, "orders", "scheduled_for") {
		t.Fatalf("expected column orders.scheduled_for to exist")
	}
	if !columnExists(t, "commission_records", "refund_status") {
		t.Fatalf("expected column commission_records.refund_status to exist")
	}
}

func tableExists(t *testing.T, tableName string) bool {
	t.Helper()

	var count int
	err := DB.Get(&count, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?", tableName)
	if err != nil {
		t.Fatalf("failed checking table %s: %v", tableName, err)
	}

	return count == 1
}

func columnExists(t *testing.T, tableName, columnName string) bool {
	t.Helper()

	var columns []tableColumnInfo
	err := DB.Select(&columns, fmt.Sprintf("SELECT name, dflt_value FROM pragma_table_info('%s')", tableName))
	if err != nil {
		t.Fatalf("failed checking columns for table %s: %v", tableName, err)
	}

	for _, column := range columns {
		if column.Name == columnName {
			return true
		}
	}

	return false
}

func assertColumnDefault(t *testing.T, tableName, columnName, expectedDefault string) {
	t.Helper()

	columns := getTableColumns(t, tableName)
	for _, column := range columns {
		if column.Name != columnName {
			continue
		}

		if column.DefaultValue == nil {
			t.Fatalf("expected default for %s.%s, got nil", tableName, columnName)
		}

		if *column.DefaultValue != expectedDefault {
			t.Fatalf("unexpected default for %s.%s: got %s want %s", tableName, columnName, *column.DefaultValue, expectedDefault)
		}

		return
	}

	t.Fatalf("column %s.%s not found when checking defaults", tableName, columnName)
}

func assertUniqueIndexByColumns(t *testing.T, tableName string, expectedColumns []string) {
	t.Helper()

	indexes := getIndexes(t, tableName)
	for _, index := range indexes {
		if index.Unique != 1 {
			continue
		}

		if sameColumns(getIndexColumns(t, index.Name), expectedColumns) {
			return
		}
	}

	t.Fatalf("expected unique index on %s for columns %v", tableName, expectedColumns)
}

func assertIndexByNameAndColumns(t *testing.T, tableName, indexName string, expectedColumns []string) {
	t.Helper()

	indexes := getIndexes(t, tableName)
	for _, index := range indexes {
		if index.Name != indexName {
			continue
		}

		actualColumns := getIndexColumns(t, indexName)
		if !sameColumns(actualColumns, expectedColumns) {
			t.Fatalf("unexpected columns for index %s: got %v want %v", indexName, actualColumns, expectedColumns)
		}

		return
	}

	t.Fatalf("expected index %s on table %s", indexName, tableName)
}

func getTableColumns(t *testing.T, tableName string) []tableColumnInfo {
	t.Helper()

	var columns []tableColumnInfo
	err := DB.Select(&columns, fmt.Sprintf("SELECT name, dflt_value FROM pragma_table_info('%s')", tableName))
	if err != nil {
		t.Fatalf("failed checking columns for table %s: %v", tableName, err)
	}

	return columns
}

func getIndexes(t *testing.T, tableName string) []indexListItem {
	t.Helper()

	var indexes []indexListItem
	err := DB.Select(&indexes, fmt.Sprintf("SELECT name, `unique` FROM pragma_index_list('%s')", tableName))
	if err != nil {
		t.Fatalf("failed checking indexes for table %s: %v", tableName, err)
	}

	return indexes
}

func getIndexColumns(t *testing.T, indexName string) []string {
	t.Helper()

	var items []indexInfoItem
	err := DB.Select(&items, fmt.Sprintf("SELECT name FROM pragma_index_info('%s') ORDER BY seqno", indexName))
	if err != nil {
		t.Fatalf("failed checking index columns for index %s: %v", indexName, err)
	}

	columns := make([]string, 0, len(items))
	for _, item := range items {
		columns = append(columns, item.Name)
	}

	return columns
}

func sameColumns(actual, expected []string) bool {
	if len(actual) != len(expected) {
		return false
	}

	for i := range actual {
		if actual[i] != expected[i] {
			return false
		}
	}

	return true
}
