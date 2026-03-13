package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/utils"
)

var errScheduledForDineInOnly = fmt.Errorf("scheduled_for_delivery_only")

func parseOrderScheduledFor(raw string) (time.Time, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return time.Time{}, fmt.Errorf("empty scheduled_for")
	}

	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t, nil
	}

	layouts := []string{
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}

	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, v, orderNoLocation); err == nil {
			return t, nil
		}
	}

	return time.Time{}, fmt.Errorf("invalid scheduled_for format")
}

func normalizeScheduledFor(orderType, raw string) (*string, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return nil, nil
	}

	if strings.EqualFold(strings.TrimSpace(orderType), "dine_in") {
		return nil, errScheduledForDineInOnly
	}

	t, err := parseOrderScheduledFor(v)
	if err != nil {
		return nil, err
	}
	formatted := t.Format("2006-01-02 15:04:05")
	return &formatted, nil
}

func normalizeItemList(raw string) []map[string]interface{} {
	var parsed interface{}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return []map[string]interface{}{}
	}

	out := make([]map[string]interface{}, 0)
	appendOne := func(v interface{}) {
		if m, ok := v.(map[string]interface{}); ok {
			item := map[string]interface{}{}
			for k, vv := range m {
				item[k] = vv
			}
			if _, ok := item["quantity"]; !ok {
				if q, ok2 := item["qty"]; ok2 {
					item["quantity"] = q
				} else {
					item["quantity"] = 1
				}
			}
			out = append(out, item)
		}
	}

	switch t := parsed.(type) {
	case []interface{}:
		for _, v := range t {
			appendOne(v)
		}
	case map[string]interface{}:
		for _, v := range t {
			appendOne(v)
		}
	}

	return out
}

func mergeOrderItems(existingRaw, incomingRaw string, existingTotal, incomingTotal int64) (string, int64) {
	existing := normalizeItemList(existingRaw)
	incoming := normalizeItemList(incomingRaw)
	merged := make([]map[string]interface{}, 0, len(existing)+len(incoming))
	index := map[string]int{}

	buildKey := func(it map[string]interface{}) string {
		pid := fmt.Sprintf("%v", it["product_id"])
		name := strings.TrimSpace(fmt.Sprintf("%v", it["name"]))
		sub := strings.TrimSpace(fmt.Sprintf("%v", it["sub_name"]))
		price := fmt.Sprintf("%v", it["price"])
		if pid != "" && pid != "<nil>" && pid != "0" {
			return "pid:" + pid + "|sub:" + sub
		}
		return "name:" + name + "|sub:" + sub + "|price:" + price
	}

	appendOrMerge := func(it map[string]interface{}) {
		key := buildKey(it)
		qty := utils.Int64(it["quantity"])
		if qty <= 0 {
			qty = 1
		}

		if idx, ok := index[key]; ok {
			prev := merged[idx]
			prevQty := utils.Int64(prev["quantity"])
			if prevQty <= 0 {
				prevQty = 1
			}
			prev["quantity"] = prevQty + qty
			merged[idx] = prev
			return
		}

		copyIt := map[string]interface{}{}
		for k, v := range it {
			copyIt[k] = v
		}
		copyIt["quantity"] = qty
		index[key] = len(merged)
		merged = append(merged, copyIt)
	}

	for _, it := range existing {
		appendOrMerge(it)
	}
	for _, it := range incoming {
		appendOrMerge(it)
	}

	sort.SliceStable(merged, func(i, j int) bool {
		ni := strings.TrimSpace(fmt.Sprintf("%v", merged[i]["name"]))
		nj := strings.TrimSpace(fmt.Sprintf("%v", merged[j]["name"]))
		return ni < nj
	})

	buf, _ := json.Marshal(merged)
	return string(buf), existingTotal + incomingTotal
}

func mergeRemarks(existing *string, incoming string) string {
	oldV := strings.TrimSpace("")
	if existing != nil {
		oldV = strings.TrimSpace(*existing)
	}
	newV := strings.TrimSpace(incoming)
	if oldV == "" {
		return newV
	}
	if newV == "" {
		return oldV
	}
	if strings.Contains(oldV, newV) {
		return oldV
	}
	return oldV + ", " + newV
}

func buildPrinterItems(shopID int64, rawItemsJSON string) []map[string]interface{} {
	items := normalizeItemList(rawItemsJSON)
	if len(items) == 0 {
		return []map[string]interface{}{}
	}

	ids := make([]int64, 0, len(items))
	for _, it := range items {
		pid := utils.Int64(it["product_id"])
		if pid <= 0 {
			pid = utils.Int64(it["id"])
		}
		if pid > 0 {
			ids = append(ids, pid)
		}
	}

	type productNameRow struct {
		ID      int64   `db:"id"`
		Name    string  `db:"name"`
		SubName *string `db:"sub_name"`
	}
	nameMap := map[int64]productNameRow{}
	if len(ids) > 0 {
		ph := strings.TrimRight(strings.Repeat("?,", len(ids)), ",")
		args := make([]interface{}, 0, len(ids)+1)
		args = append(args, shopID)
		for _, id := range ids {
			args = append(args, id)
		}
		rows := []productNameRow{}
		if err := db.DB.Select(&rows, "SELECT id, name, sub_name FROM products WHERE shop_id = ? AND id IN ("+ph+")", args...); err == nil {
			for _, r := range rows {
				nameMap[r.ID] = r
			}
		}
	}

	out := make([]map[string]interface{}, 0, len(items))
	for _, it := range items {
		pid := utils.Int64(it["product_id"])
		if pid <= 0 {
			pid = utils.Int64(it["id"])
		}

		name := strings.TrimSpace(utils.String(it["name"]))
		sub := strings.TrimSpace(utils.String(it["sub_name"]))
		if sub == "" {
			sub = strings.TrimSpace(utils.String(it["subName"]))
		}

		if meta, ok := nameMap[pid]; ok {
			if strings.TrimSpace(meta.Name) != "" {
				name = strings.TrimSpace(meta.Name)
			}
			if meta.SubName != nil && strings.TrimSpace(*meta.SubName) != "" {
				sub = strings.TrimSpace(*meta.SubName)
			}
		}

		display := strings.TrimSpace(name)
		if sub != "" {
			if display != "" {
				display += " " + sub
			} else {
				display = sub
			}
		}

		qty := utils.Int64(it["quantity"])
		if qty <= 0 {
			qty = utils.Int64(it["qty"])
		}
		if qty <= 0 {
			qty = 1
		}

		price := utils.Int64(it["price"])
		out = append(out, map[string]interface{}{
			"name":     display,
			"quantity": qty,
			"price":    price,
			"total":    price * qty,
		})
	}

	return out
}

func pickupNoFromOrderNo(orderNo string) string {
	v := strings.TrimSpace(orderNo)
	if len(v) <= 3 {
		if v == "" {
			return "000"
		}
		return v
	}
	return v[len(v)-3:]
}

func errorsIsNoRows(err error) bool {
	if err == nil {
		return false
	}
	return err == sql.ErrNoRows || strings.Contains(strings.ToLower(err.Error()), "no rows")
}
