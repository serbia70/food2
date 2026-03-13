package handlers

import (
	"fmt"
	"net/http"
	"time"

	"meituan-go/internal/services/realtime"

	"github.com/gin-gonic/gin"
)

func StreamBySlug(c *gin.Context) {
	slug := c.Param("slug")
	shopID, err := getShopIDBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "shop not found"})
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "stream unsupported"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ch := realtime.Subscribe(shopID)
	defer realtime.Unsubscribe(shopID, ch)

	fmt.Fprintf(c.Writer, "event: ready\ndata: {\"ok\":true}\n\n")
	flusher.Flush()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case msg := <-ch:
			fmt.Fprintf(c.Writer, "event: update\ndata: %s\n\n", msg)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprint(c.Writer, ": keep-alive\n\n")
			flusher.Flush()
		}
	}
}
