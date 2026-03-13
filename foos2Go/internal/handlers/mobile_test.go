package handlers

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"meituan-go/internal/db"
	"meituan-go/internal/security"

	"github.com/gin-gonic/gin"
)

func setupMobileAuthDB(t *testing.T) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "mobile-auth.db")
	if err := db.Init(dbPath); err != nil {
		t.Fatalf("db init failed: %v", err)
	}
	t.Cleanup(db.Close)
}

func TestRiderRegisterStoresHashedPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)
	r := gin.New()
	r.POST("/api/rider/auth", RiderAuth)

	req := httptest.NewRequest(http.MethodPost, "/api/rider/auth", strings.NewReader(`{"action":"register","name":"Rider","phone":"1001","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var stored string
	if err := db.DB.Get(&stored, "SELECT password FROM riders WHERE phone = '1001'"); err != nil {
		t.Fatalf("load rider password failed: %v", err)
	}
	if !security.LooksLikeBcryptHash(stored) {
		t.Fatalf("expected rider password to be hashed, got %s", stored)
	}
}

func TestRiderLoginUpgradesPlaintextPasswordToHash(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)
	if _, err := db.DB.Exec("INSERT INTO riders (name, phone, password, status) VALUES ('Rider', '1002', 'secret', 'offline')"); err != nil {
		t.Fatalf("seed rider failed: %v", err)
	}
	r := gin.New()
	r.POST("/api/rider/auth", RiderAuth)

	req := httptest.NewRequest(http.MethodPost, "/api/rider/auth", strings.NewReader(`{"action":"login","phone":"1002","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var stored string
	if err := db.DB.Get(&stored, "SELECT password FROM riders WHERE phone = '1002'"); err != nil {
		t.Fatalf("load upgraded rider password failed: %v", err)
	}
	if !security.LooksLikeBcryptHash(stored) {
		t.Fatalf("expected rider password to be upgraded, got %s", stored)
	}
}

func TestUserRegisterStoresHashedPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)
	r := gin.New()
	r.POST("/api/user/register", UserRegister)

	req := httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(`{"account_type":"phone","account":"3001","password":"secret","name":"User"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var stored string
	if err := db.DB.Get(&stored, "SELECT password FROM users WHERE login_account = '3001'"); err != nil {
		t.Fatalf("load user password failed: %v", err)
	}
	if !security.LooksLikeBcryptHash(stored) {
		t.Fatalf("expected user password to be hashed, got %s", stored)
	}
}

func TestUserHistoryUpgradesPlaintextPasswordToHash(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)
	if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('2002', 'User', 'secret', '2002')"); err != nil {
		t.Fatalf("seed user failed: %v", err)
	}
	r := gin.New()
	r.POST("/api/user/history", UserHistory)

	req := httptest.NewRequest(http.MethodPost, "/api/user/history", strings.NewReader(`{"login_account":"2002","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	var stored string
	if err := db.DB.Get(&stored, "SELECT password FROM users WHERE login_account = '2002'"); err != nil {
		t.Fatalf("load upgraded user password failed: %v", err)
	}
	if !security.LooksLikeBcryptHash(stored) {
		t.Fatalf("expected user password to be upgraded, got %s", stored)
	}
}

func TestUserHistorySessionTokenReturnsDeliveryOnlyWithCompatibilityMerge(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)

	// Seed users:
	// - login_account=888 with its own phone=888 (legacy/self key)
	// - login_account=0613083899 with phone=NULL so the delivery history key exists
	//   without occupying the unique phone value that 888 will bind to later
	if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('888', 'User', 'secret', '888')"); err != nil {
		t.Fatalf("seed user 888 failed: %v", err)
	}
	if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES (NULL, 'User', 'secret', '0613083899')"); err != nil {
		t.Fatalf("seed user 0613 failed: %v", err)
	}

	// Seed shop (orders.shop_id has FK to shops.id)
	if _, err := db.DB.Exec("INSERT INTO shops (id, name, slug, status) VALUES (1, 'Shop', '01', 'active')"); err != nil {
		t.Fatalf("seed shop failed: %v", err)
	}

	// Seed orders:
	// - delivery for user_phone=888 (will be returned)
	// - delivery for user_phone=0613083899 (will ONLY be returned after binding)
	// - dine_in for user_phone=888 (should always be excluded)
	if _, err := db.DB.Exec("INSERT INTO orders (order_no, shop_id, order_type, status, total_amount, items_json, user_phone) VALUES ('O1', 1, 'delivery', 'completed', 100, '[]', '888')"); err != nil {
		t.Fatalf("seed delivery order (888) failed: %v", err)
	}
	if _, err := db.DB.Exec("INSERT INTO orders (order_no, shop_id, order_type, status, total_amount, items_json, user_phone) VALUES ('O2', 1, 'delivery', 'completed', 200, '[]', '0613083899')"); err != nil {
		t.Fatalf("seed delivery order (0613) failed: %v", err)
	}
	if _, err := db.DB.Exec("INSERT INTO orders (order_no, shop_id, order_type, status, total_amount, items_json, user_phone) VALUES ('O3', 1, 'dine_in', 'completed', 300, '[]', '888')"); err != nil {
		t.Fatalf("seed dine_in order failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/user/history", UserHistory)

	// Before binding: should NOT include O2
	{
		req := httptest.NewRequest(http.MethodPost, "/api/user/history", strings.NewReader(`{"sessionToken":"888"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
		}
		body := w.Body.String()
		if !strings.Contains(body, "\"success\":true") {
			t.Fatalf("expected success true, got %s", body)
		}
		if !strings.Contains(body, "\"order_no\":\"O1\"") {
			t.Fatalf("expected O1, got %s", body)
		}
		if strings.Contains(body, "\"order_no\":\"O2\"") {
			t.Fatalf("did not expect O2 before binding, got %s", body)
		}
		if strings.Contains(body, "\"order_no\":\"O3\"") {
			t.Fatalf("did not expect dine_in order, got %s", body)
		}
		if strings.Contains(body, "\"order_type\":\"dine_in\"") {
			t.Fatalf("did not expect dine_in order_type in response, got %s", body)
		}
	}

	// Bind: allow 888 to see history keyed by 0613083899.
	// The canonical record keeps that value in login_account only, so binding 888.phone
	// does not violate the UNIQUE(users.phone) constraint.
	if _, err := db.DB.Exec("UPDATE users SET phone = '0613083899' WHERE login_account = '888'"); err != nil {
		t.Fatalf("bind phone failed: %v", err)
	}

	// After binding: should include both O1 and O2
	{
		req := httptest.NewRequest(http.MethodPost, "/api/user/history", strings.NewReader(`{"sessionToken":"888"}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
		}
		body := w.Body.String()
		if !strings.Contains(body, "\"success\":true") {
			t.Fatalf("expected success true, got %s", body)
		}
		if !strings.Contains(body, "\"order_no\":\"O1\"") || !strings.Contains(body, "\"order_no\":\"O2\"") {
			t.Fatalf("expected both delivery orders after binding, got %s", body)
		}
		if strings.Contains(body, "\"order_no\":\"O3\"") {
			t.Fatalf("did not expect dine_in order, got %s", body)
		}
		if strings.Contains(body, "\"order_type\":\"dine_in\"") {
			t.Fatalf("did not expect dine_in order_type in response, got %s", body)
		}
	}
}

func TestUserHistorySessionTokenUnknownReturns401(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)

	r := gin.New()
	r.POST("/api/user/history", UserHistory)

	req := httptest.NewRequest(http.MethodPost, "/api/user/history", strings.NewReader(`{"sessionToken":"nope"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "session") {
		// Keep it loose; just ensure we return an auth-like error.
		t.Fatalf("expected session-related error, got %s", w.Body.String())
	}
}

func TestUserHistoryLegacyLoginPhoneInputReturnsCanonicalSessionToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)

	// Seed user: login_account=888, phone=0613083899
	if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('0613083899', 'User', 'secret', '888')"); err != nil {
		t.Fatalf("seed user failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/user/history", UserHistory)

	// Login using phone as login_account input (legacy behavior allows lookup by phone)
	req := httptest.NewRequest(http.MethodPost, "/api/user/history", strings.NewReader(`{"login_account":"0613083899","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, "\"sessionToken\":\"888\"") {
		t.Fatalf("expected canonical sessionToken 888, got %s", body)
	}
}

func TestUserHistoryLegacyLoginDoesNotLeakPasswordField(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)

	if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('0613083899', 'User', 'secret', '888')"); err != nil {
		t.Fatalf("seed user failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/user/history", UserHistory)

	req := httptest.NewRequest(http.MethodPost, "/api/user/history", strings.NewReader(`{"login_account":"888","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
	}
	bodyLower := strings.ToLower(w.Body.String())
	if strings.Contains(bodyLower, "\"password\"") {
		t.Fatalf("did not expect password field in response, got %s", w.Body.String())
	}
}

func TestUserUpdateReturnsReadableErrorWhenPhoneAlreadyExists(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupMobileAuthDB(t)
	if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('1111', 'UserA', 'secret', 'user-a')"); err != nil {
		t.Fatalf("seed user A failed: %v", err)
	}
	if _, err := db.DB.Exec("INSERT INTO users (phone, name, password, login_account) VALUES ('2222', 'UserB', 'secret', 'user-b')"); err != nil {
		t.Fatalf("seed user B failed: %v", err)
	}

	r := gin.New()
	r.POST("/api/user/update", UserUpdate)

	req := httptest.NewRequest(http.MethodPost, "/api/user/update", strings.NewReader(`{"login_account":"user-b","phone":"1111"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "phone already in use") {
		t.Fatalf("expected readable conflict message, got %s", w.Body.String())
	}
}
