package utils

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

func StringPtr(s string) *string {
	t := strings.TrimSpace(s)
	if t == "" {
		return nil
	}
	return &t
}

func Int64Ptr(i int64) *int64 {
	if i == 0 {
		return nil
	}
	return &i
}

func JSONString(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func String(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case []byte:
		return string(t)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(t), 'f', -1, 32)
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case int32:
		return strconv.FormatInt(int64(t), 10)
	case json.Number:
		return t.String()
	default:
		b, _ := json.Marshal(v)
		return strings.Trim(string(b), `"`)
	}
}

func Int64(v any) int64 {
	switch t := v.(type) {
	case int:
		return int64(t)
	case int64:
		return t
	case int32:
		return int64(t)
	case float64:
		return int64(t)
	case float32:
		return int64(t)
	case json.Number:
		x, _ := t.Int64()
		return x
	case string:
		raw := strings.TrimSpace(t)
		if raw == "" {
			return 0
		}
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil {
			return n
		}
		if f, err := strconv.ParseFloat(raw, 64); err == nil {
			return int64(f)
		}
		return 0
	default:
		var n int64
		_, _ = fmt.Sscanf(strings.TrimSpace(fmt.Sprintf("%v", v)), "%d", &n)
		return n
	}
}

// Add helper function for parsing json numbers to float64
func GetFloat64(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(t, 64)
		return f
	default:
		return 0
	}
}
