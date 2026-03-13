package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"meituan-go/internal/config"
	"meituan-go/internal/db"
	"meituan-go/internal/security"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestHasMasterAuthRejectsLegacyQueryAndBodyToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	queryReq := httptest.NewRequest(http.MethodGet, "/api/master/init?token=master-token", nil)
	queryCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	queryCtx.Request = queryReq
	if hasMasterAuth(queryCtx) {
		t.Fatalf("expected legacy query token auth to be rejected")
	}

	bodyReq := httptest.NewRequest(http.MethodPost, "/api/master/manage", strings.NewReader(`{"token":"master-token"}`))
	bodyReq.Header.Set("Content-Type", "application/json")
	bodyCtx, _ := gin.CreateTestContext(httptest.NewRecorder())
	bodyCtx.Request = bodyReq
	if hasMasterAuth(bodyCtx) {
		t.Fatalf("expected legacy body token auth to be rejected")
	}
}

func TestHasMasterAuthAcceptsValidMasterJWT(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := config.LoadConfig()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"role": "master",
	})
	signed, err := token.SignedString([]byte(cfg.JWT.Secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/master/init", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = req

	if !hasMasterAuth(ctx) {
		t.Fatalf("expected signed master jwt to be accepted")
	}
}

func TestMasterLoginReturnsSignedMasterJWT(t *testing.T) {
	gin.SetMode(gin.TestMode)

	token, err := generateMasterToken("admin")
	if err != nil {
		t.Fatalf("generateMasterToken returned error: %v", err)
	}

	parsed, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
		cfg := config.LoadConfig()
		return []byte(cfg.JWT.Secret), nil
	})
	if err != nil {
		t.Fatalf("expected generated token to parse, got %v", err)
	}
	if !parsed.Valid {
		t.Fatalf("expected generated token to be valid")
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatalf("expected jwt.MapClaims")
	}
	if claims["role"] != "master" {
		t.Fatalf("expected role=master, got %v", claims["role"])
	}
	if claims["username"] != "admin" {
		t.Fatalf("expected username=admin, got %v", claims["username"])
	}

	b, _ := json.Marshal(claims)
	if strings.Contains(string(b), "master-token") {
		t.Fatalf("expected generated token payload to not contain legacy constant token")
	}
}

func setupMasterAuthDB(t *testing.T) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "master-auth.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)
	if _, err := db.DB.Exec("UPDATE master_admin SET username = 'admin', password = 'secret' WHERE id = 1"); err != nil {
		t.Fatalf("seed master admin failed: %v", err)
	}
}

func TestMasterLoginDoesNotLeakUserExistence(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMasterAuthDB(t)

	r := gin.New()
	r.POST("/api/master/login", MasterLogin)

	req := httptest.NewRequest(http.MethodPost, "/api/master/login", strings.NewReader(`{"username":"missing","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "user not found") {
		t.Fatalf("expected generic auth error, got %s", w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "Invalid credentials") {
		t.Fatalf("expected invalid credentials message, got %s", w.Body.String())
	}
}

func TestMasterLoginAcceptsDefaultAdminFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMasterAuthDB(t)

	r := gin.New()
	r.POST("/api/master/login", MasterLogin)

	req := httptest.NewRequest(http.MethodPost, "/api/master/login", strings.NewReader(`{"username":"","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"token"`) {
		t.Fatalf("expected token in response, got %s", w.Body.String())
	}
}

func TestMasterLoginUpgradesPlaintextPasswordToHash(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMasterAuthDB(t)

	r := gin.New()
	r.POST("/api/master/login", MasterLogin)

	req := httptest.NewRequest(http.MethodPost, "/api/master/login", strings.NewReader(`{"username":"admin","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var stored string
	if err := db.DB.Get(&stored, "SELECT password FROM master_admin WHERE username = 'admin'"); err != nil {
		t.Fatalf("load upgraded master password failed: %v", err)
	}
	if !security.LooksLikeBcryptHash(stored) {
		t.Fatalf("expected master password to be upgraded to bcrypt hash, got %s", stored)
	}
}

func TestMasterLoginAcceptsBcryptPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMasterAuthDB(t)
	hash, err := security.HashPassword("secret")
	if err != nil {
		t.Fatalf("hash password failed: %v", err)
	}
	if _, err := db.DB.Exec("UPDATE master_admin SET password = ? WHERE username = 'admin'", hash); err != nil {
		t.Fatalf("seed hashed master password failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/master/login", MasterLogin)

	req := httptest.NewRequest(http.MethodPost, "/api/master/login", strings.NewReader(`{"username":"admin","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
}
