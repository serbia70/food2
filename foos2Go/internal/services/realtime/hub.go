package realtime

import (
	"encoding/json"
	"fmt"
	"sync"
)

var (
	mu   sync.RWMutex
	subs = map[int64]map[chan string]struct{}{}
)

func Subscribe(shopID int64) chan string {
	ch := make(chan string, 16)
	mu.Lock()
	defer mu.Unlock()
	if subs[shopID] == nil {
		subs[shopID] = map[chan string]struct{}{}
	}
	subs[shopID][ch] = struct{}{}
	return ch
}

func Unsubscribe(shopID int64, ch chan string) {
	mu.Lock()
	defer mu.Unlock()
	if m := subs[shopID]; m != nil {
		delete(m, ch)
		if len(m) == 0 {
			delete(subs, shopID)
		}
	}
	close(ch)
}

func Publish(shopID int64, payload interface{}) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal realtime payload: %w", err)
	}
	msg := string(raw)
	mu.RLock()
	defer mu.RUnlock()
	for ch := range subs[shopID] {
		select {
		case ch <- msg:
		default:
		}
	}
	return nil
}
