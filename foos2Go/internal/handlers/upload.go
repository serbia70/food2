package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"meituan-go/internal/db"
	"meituan-go/internal/services/r2"

	"github.com/gin-gonic/gin"
)

type UploadHandler struct{}

// inMemoryMultipartFile wraps bytes.Reader to satisfy multipart.File.
type inMemoryMultipartFile struct {
	*bytes.Reader
}

func (f *inMemoryMultipartFile) Close() error { return nil }

// UploadImage handles image upload for Shops (AuthMiddleware protected)
func (h *UploadHandler) UploadImage(c *gin.Context) {
	// Standard shop upload
	performUpload(c)
}

// MasterUploadImage handles image upload for Master Admin (Token check)
func MasterUploadImage(c *gin.Context) {
	// Verify Master Token
	if !hasMasterAuth(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	performUpload(c)
}

// Shared upload logic
func performUpload(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File required"})
		return
	}
	defer file.Close()

	if header.Size > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large (max 5MB)"})
		return
	}

	// Read once so we can retry/fallback without depending on stream position.
	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read upload"})
		return
	}

	// 1. Get Settings
	var settingsStr string
	var settings map[string]interface{}
	// We query master_admin settings for storage config
	err = db.DB.QueryRow("SELECT settings FROM master_admin WHERE id = 1").Scan(&settingsStr)
	if err == nil {
		json.Unmarshal([]byte(settingsStr), &settings)
	}

	storageType := getAnyString(settings, "image_storage", "imageStorage")
	if storageType == "" {
		storageType = "local"
	}
	storageType = strings.ToLower(strings.TrimSpace(storageType))
	useR2 := storageType == "r2" || storageType == "s3" || storageType == "cloudflare" || storageType == "cf"
	backupTarget := strings.ToLower(strings.TrimSpace(getAnyString(settings, "backup_target", "backupTarget")))
	if !useR2 && (backupTarget == "s3" || backupTarget == "r2" || backupTarget == "cloudflare" || backupTarget == "cf") {
		useR2 = true
	}
	strictR2 := getAnyBool(settings, "upload_strict_r2", "uploadStrictR2", "r2_strict", "r2Strict")
	if !strictR2 {
		strictR2 = getEnvBool("UPLOAD_STRICT_R2")
	}

	if useR2 {
		// --- R2 Storage ---
		keyPrefix := "images"
		if sid, ok := c.Get("shop_id"); ok {
			var shopID int64
			switch v := sid.(type) {
			case int64:
				shopID = v
			case int:
				shopID = int64(v)
			case float64:
				shopID = int64(v)
			}
			if shopID > 0 {
				var slug string
				if err := db.DB.QueryRow("SELECT slug FROM shops WHERE id = ?", shopID).Scan(&slug); err == nil {
					slug = sanitizePathSegment(slug)
					if slug != "" {
						keyPrefix = "images/" + slug
					}
				}
			}
		}

		publicDomain := getAnyString(
			settings,
			"r2_public_domain",
			"r2PublicDomain",
			"public_domain",
			"publicDomain",
			"cdn_domain",
			"cdnDomain",
			"backup_public_domain",
			"backupPublicDomain",
			"r2_public_url",
			"r2PublicUrl",
		)
		if publicDomain == "" {
			publicDomain = inferR2PublicDomain(settings)
		}
		if publicDomain == "" {
			publicDomain = os.Getenv("R2_PUBLIC_DOMAIN")
		}

		cfg := r2.Config{
			AccessKey:    getAnyString(settings, "backup_user", "backupUser"),
			SecretKey:    getAnyString(settings, "backup_pass", "backupPass"),
			Endpoint:     getAnyString(settings, "backup_endpoint", "backupEndpoint"),
			Bucket:       getAnyString(settings, "backup_bucket", "backupBucket"),
			PublicDomain: publicDomain,
			KeyPrefix:    keyPrefix,
		}

		log.Printf("[Upload] storage=%s useR2=%v endpoint_set=%v bucket_set=%v public_domain_set=%v", storageType, useR2, cfg.Endpoint != "", cfg.Bucket != "", cfg.PublicDomain != "")

		// If using R2 but reusing backup creds, ensure they are set
		// Fallback to env vars if settings are empty (legacy support)
		if cfg.AccessKey == "" {
			cfg.AccessKey = os.Getenv("R2_ACCESS_KEY")
		}
		if cfg.SecretKey == "" {
			cfg.SecretKey = os.Getenv("R2_SECRET_KEY")
		}
		if cfg.Endpoint == "" {
			cfg.Endpoint = os.Getenv("LITESTREAM_ENDPOINT")
		}
		if cfg.Bucket == "" {
			cfg.Bucket = os.Getenv("LITESTREAM_BUCKET")
		}

		url, err := r2.UploadFile(&inMemoryMultipartFile{bytes.NewReader(data)}, header, cfg)
		if err != nil {
			log.Printf("R2 Upload failed: %v", err)
			if strictR2 {
				c.JSON(http.StatusBadGateway, gin.H{
					"error":   "R2 上传失败，严格模式已禁止本地回退",
					"storage": "r2",
					"success": false,
				})
				return
			}

			// Graceful fallback: if R2 is unavailable, store locally instead of failing upload.
			localURL, localErr := saveLocalUpload(c, data, header)
			if localErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error":   "R2 上传失败，且本地保存也失败",
					"success": false,
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"message": "R2 上传失败，已自动回退到本地存储",
				"warning": "R2 unavailable, fallback to local storage",
				"url":     localURL,
				"storage": "local_fallback",
				"success": true,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Upload successful", "url": url, "storage": "r2", "success": true})

	} else {
		localURL, localErr := saveLocalUpload(c, data, header)
		if localErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file", "success": false})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Upload successful", "url": localURL, "storage": "local", "success": true})
	}
}

func saveLocalUpload(c *gin.Context, data []byte, header *multipart.FileHeader) (string, error) {
	slugSegment := ""
	if sid, ok := c.Get("shop_id"); ok {
		var shopID int64
		switch v := sid.(type) {
		case int64:
			shopID = v
		case int:
			shopID = int64(v)
		case float64:
			shopID = int64(v)
		}
		if shopID > 0 {
			var slug string
			if err := db.DB.QueryRow("SELECT slug FROM shops WHERE id = ?", shopID).Scan(&slug); err == nil {
				slugSegment = sanitizePathSegment(slug)
			}
		}
	}

	uploadDir := "./static/assets/uploads"
	if slugSegment != "" {
		uploadDir = filepath.Join(uploadDir, slugSegment)
	}
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return "", fmt.Errorf("create upload dir: %w", err)
	}

	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)
	dstPath := filepath.Join(uploadDir, filename)

	out, err := os.Create(dstPath)
	if err != nil {
		return "", fmt.Errorf("create file: %w", err)
	}
	defer out.Close()

	if _, err = io.Copy(out, bytes.NewReader(data)); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}

	if slugSegment != "" {
		return fmt.Sprintf("/assets/uploads/%s/%s", slugSegment, filename), nil
	}
	return fmt.Sprintf("/assets/uploads/%s", filename), nil
}

func sanitizePathSegment(raw string) string {
	v := strings.TrimSpace(strings.ToLower(raw))
	if v == "" {
		return ""
	}
	b := strings.Builder{}
	for i := 0; i < len(v); i++ {
		ch := v[i]
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' {
			b.WriteByte(ch)
		}
	}
	return b.String()
}

func getAnyString(m map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if v, ok := m[key].(string); ok {
			vv := strings.TrimSpace(v)
			if vv != "" {
				return vv
			}
		}
	}
	return ""
}

func getAnyBool(m map[string]interface{}, keys ...string) bool {
	for _, key := range keys {
		v, ok := m[key]
		if !ok || v == nil {
			continue
		}
		switch vv := v.(type) {
		case bool:
			return vv
		case string:
			b, err := strconv.ParseBool(strings.TrimSpace(vv))
			if err == nil {
				return b
			}
		case float64:
			return vv != 0
		case int:
			return vv != 0
		case int64:
			return vv != 0
		}
	}
	return false
}

func getEnvBool(key string) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return false
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false
	}
	return b
}

func inferR2PublicDomain(settings map[string]interface{}) string {
	keys := []string{
		"backup_host",
		"backupHost",
		"wechat_contact_qr",
		"wechat_payment_qr",
		"alipay_payment_qr",
		"wechat_qr",
		"logo",
		"logo_url",
		"favicon",
	}
	for _, key := range keys {
		raw := getAnyString(settings, key)
		if raw == "" {
			continue
		}
		if domain := toPublicDomain(raw); domain != "" {
			return domain
		}
	}
	return ""
}

func toPublicDomain(raw string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return ""
	}
	if !strings.Contains(v, "://") {
		v = "https://" + strings.Trim(v, "/")
	}
	u, err := url.Parse(v)
	if err != nil || strings.TrimSpace(u.Host) == "" {
		return ""
	}
	host := strings.TrimSpace(u.Host)
	if !strings.Contains(host, ".") && !strings.Contains(host, ":") {
		return ""
	}
	scheme := u.Scheme
	if scheme == "" {
		scheme = "https"
	}
	return scheme + "://" + host
}
