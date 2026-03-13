package db

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
)

var DB *sqlx.DB

func OpenDB(dataSourceName string) (*sqlx.DB, error) {
	// Ensure directory exists
	dir := filepath.Dir(dataSourceName)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	journalMode := "WAL"
	if gin.Mode() == gin.TestMode || os.Getenv("GIN_MODE") == "test" {
		journalMode = "DELETE"
	}
	dbConn, err := sqlx.Connect("sqlite3", dataSourceName+"?_journal_mode="+journalMode+"&_foreign_keys=on&_charset=utf8&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	dbConn.SetMaxOpenConns(25)
	dbConn.SetMaxIdleConns(25)

	if err := dbConn.Ping(); err != nil {
		dbConn.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return dbConn, nil
}

func Init(dataSourceName string) error {
	var err error
	DB, err = OpenDB(dataSourceName)
	if err != nil {
		return err
	}

	log.Println("Database connected successfully")
	return RunMigrations()
}

func Close() {
	if DB != nil {
		_, _ = DB.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
		_ = DB.Close()
		DB = nil
	}
}
