package handlers

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"meituan-go/internal/config"
	"meituan-go/internal/db"
	"meituan-go/internal/security"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// MasterManage handles all master admin actions
func MasterManage(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}

	var req struct {
		Action  string          `json:"action"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	switch req.Action {
	case "impersonate_shop":
		handleImpersonateShop(c, req.Payload)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown action"})
	}
}

func MasterUpdatePassword(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleUpdateMasterPassword(c, mustReadRawJSONPayload(c))
}

func MasterTopupShopBalance(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleAdjustShopBalance(c, mustReadRawJSONPayload(c))
}

func MasterCreateShop(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleCreateShop(c, mustReadRawJSONPayload(c))
}

func MasterUpdateShop(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	payload := mustReadRawJSONPayload(c)
	if len(payload) == 0 {
		return
	}
	var body map[string]interface{}
	if err := json.Unmarshal(payload, &body); err == nil {
		body["id"] = c.Param("id")
		payload, _ = json.Marshal(body)
	}
	handleUpdateShop(c, payload)
}

func MasterDeleteShop(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid shop id"})
		return
	}
	payload, _ := json.Marshal(map[string]interface{}{"id": id})
	handleDeleteShop(c, payload)
}

func MasterUpdateSettings(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleUpdateSettings(c, mustReadRawJSONPayload(c))
}

func MasterUpdateCategories(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleUpdateCategories(c, mustReadRawJSONPayload(c))
}

func MasterSetShopPlan(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleSetShopPlan(c, mustReadRawJSONPayload(c))
}

func MasterGetShopBilling(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleGetShopBilling(c, mustReadRawJSONPayload(c))
}

func MasterRenewShop(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleRenewShop(c, mustReadRawJSONPayload(c))
}

func MasterApproveRenew(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleApproveRenew(c, mustReadRawJSONPayload(c))
}

func MasterRejectRenew(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleRejectRenew(c, mustReadRawJSONPayload(c))
}

func MasterUpdateRateCenter(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleUpdateRateCenter(c, mustReadRawJSONPayload(c))
}

func MasterBatchUpdateCommission(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleBatchUpdateCommission(c, mustReadRawJSONPayload(c))
}

func MasterTriggerBackup(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}
	handleTriggerBackup(c)
}

func mustReadRawJSONPayload(c *gin.Context) json.RawMessage {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return nil
	}
	return body
}

// Action Handlers

func handleUpdateCategories(c *gin.Context, payload json.RawMessage) {
	var cats interface{}
	if err := json.Unmarshal(payload, &cats); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid categories JSON"})
		return
	}
	updateMasterSettingKey("categories", cats)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func handleTriggerBackup(c *gin.Context) {
	filename, err := performDataBackup()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Backup failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Backup created: " + filename})
}

func handleUpdateMasterPassword(c *gin.Context, payload json.RawMessage) {
	var p struct {
		NewPassword string `json:"newPassword"`
	}
	json.Unmarshal(payload, &p)
	hash, hashErr := security.HashPassword(p.NewPassword)
	if hashErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update master password"})
		return
	}
	_, err := db.DB.Exec("UPDATE master_admin SET password = ? WHERE id = 1", hash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update master password"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// MasterBackupCode handles code backups
func MasterBackupCode(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}

	var req struct {
		Action     string `json:"action"`
		BackupName string `json:"backupName"`
	}
	c.ShouldBindJSON(&req)

	backupDir := "code_backups"
	os.MkdirAll(backupDir, 0755)

	switch req.Action {
	case "list":
		files, _ := ioutil.ReadDir(backupDir)
		var backups []gin.H
		for _, f := range files {
			if !f.IsDir() && strings.HasSuffix(f.Name(), ".zip") {
				backups = append(backups, gin.H{"name": f.Name(), "created": f.ModTime(), "displayName": f.Name()})
			}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "backups": backups})

	case "create":
		if req.BackupName == "" {
			req.BackupName = "backup"
		}
		safeName := strings.ReplaceAll(req.BackupName, " ", "_")
		timestamp := time.Now().Format("20060102-150405")
		filename := fmt.Sprintf("%s-%s.zip", timestamp, safeName)
		path := filepath.Join(backupDir, filename)

		// Exclude known temporary or large dirs
		excludes := []string{".git", "node_modules", "dist", "tmp", "code_backups", "backups", "meituan.db"}
		err := zipDirectory(".", path, excludes)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Backup failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Code backup created"})

	case "delete":
		err := os.Remove(filepath.Join(backupDir, req.BackupName))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete backup"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Backup deleted"})

	case "restore":
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Restore simulated (not safe to self-overwrite while running)"})

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown action"})
	}
}

// MasterRestore handles system data restore
func MasterRestore(c *gin.Context) {
	if !checkMasterAuth(c) {
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	// Save uploaded file temporarily
	tempFile := filepath.Join("data", "restore_temp.zip")
	if err := c.SaveUploadedFile(file, tempFile); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save upload"})
		return
	}
	defer os.Remove(tempFile)

	// Close DB to release lock (Windows mostly)
	if err := db.DB.Close(); err != nil {
		log.Printf("Warning: Failed to close DB before restore: %v", err)
	}

	// Unzip to data directory
	err = unzipToDir(tempFile, "data")

	// Re-init DB
	cfg := config.LoadConfig()
	if dbErr := db.Init(cfg.Database.Path); dbErr != nil {
		log.Printf("CRITICAL: Failed to re-init DB after restore: %v", dbErr)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Restore completed but DB re-init failed. Please restart server."})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Restore failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Restore successful. Database reloaded."})
}

// Helpers

func performDataBackup() (string, error) {
	timestamp := time.Now().Format("20060102-150405")
	filename := fmt.Sprintf("backup-%s.zip", timestamp)
	outDir := "backups"
	os.MkdirAll(outDir, 0755)
	outPath := filepath.Join(outDir, filename)

	return filename, zipDirectory("data", outPath, nil)
}

func zipDirectory(source, target string, excludes []string) error {
	zipfile, err := os.Create(target)
	if err != nil {
		return err
	}
	defer zipfile.Close()

	archive := zip.NewWriter(zipfile)
	defer archive.Close()

	return filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip sub-directories of the target itself (e.g., if target is inside source)
		// and check explicitly passed excludes
		for _, ex := range excludes {
			if strings.Contains(path, ex) {
				if info.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
		}

		// Avoid recursive zip if target is inside source
		if path == target {
			return nil
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}

		// Make path relative to source
		relPath, _ := filepath.Rel(source, path)
		header.Name = strings.ReplaceAll(relPath, "\\", "/")

		if info.IsDir() {
			header.Name += "/"
		} else {
			header.Method = zip.Deflate
		}

		writer, err := archive.CreateHeader(header)
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(writer, file)
		return err
	})
}

func unzipToDir(zipFile, destDir string) error {
	r, err := zip.OpenReader(zipFile)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		fpath := filepath.Join(destDir, f.Name)
		if !strings.HasPrefix(fpath, filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal file path: %s", fpath)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, os.ModePerm)
			continue
		}

		if err = os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}

		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}
