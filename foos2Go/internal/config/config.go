package config

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	JWT      JWTConfig      `mapstructure:"jwt"`
	MQTT     MQTTConfig     `mapstructure:"mqtt"`
}

type MQTTConfig struct {
	Broker   string `mapstructure:"broker"`
	ClientID string `mapstructure:"client_id"`
	Username string `mapstructure:"username"`
	Password string `mapstructure:"password"`
}

type ServerConfig struct {
	Port int    `mapstructure:"port"`
	Mode string `mapstructure:"mode"`
}

type DatabaseConfig struct {
	Path string `mapstructure:"path"`
}

type JWTConfig struct {
	Secret string `mapstructure:"secret"`
	Expire int    `mapstructure:"expire_hours"`
}

func LoadConfig() *Config {
	viper.SetConfigName("config")
	viper.SetConfigType("json")
	viper.AddConfigPath("./config")
	viper.AddConfigPath(".")

	viper.SetEnvPrefix("MEITUAN")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	// Default values
	viper.SetDefault("server.port", 3030)
	viper.SetDefault("server.mode", "debug")
	viper.SetDefault("database.path", "/opt/api/data/meituan.db")
	viper.SetDefault("jwt.expire_hours", 24)

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			// Config file not found; ignore error if desired
			log.Println("Config file not found, using defaults and environment variables")
		} else {
			// Config file was found but another error was produced
			log.Fatalf("Fatal error config file: %s \n", err)
		}
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		log.Fatalf("Unable to decode into struct: %v", err)
	}

	// Normalize database path to avoid accidental multi-db writes when cwd changes.
	config.Database.Path = resolveDatabasePath(config.Database.Path)

	return &config
}

func resolveDatabasePath(p string) string {
	if filepath.IsAbs(p) {
		return p
	}

	cwd, err := os.Getwd()
	if err != nil {
		return p
	}

	candidates := []string{
		filepath.Join(cwd, p), // ./data/meituan.db
		filepath.Join(cwd, "meituanGo", "data", "meituan.db"), // from repo root
		filepath.Join(cwd, "..", "meituanGo", "data", "meituan.db"),
	}

	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}

	// fallback: absolute path from current working directory
	return filepath.Join(cwd, p)
}
