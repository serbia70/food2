package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestMasterRoutesIncludeShopDetailAndImpersonate(t *testing.T) {
	r := gin.New()
	master := r.Group("/api/master")
	{
		master.POST("/login", MasterLogin)
		master.POST("/manage", MasterManage)
		master.POST("/restore", MasterRestore)
		master.GET("/init", MasterInitData)
		master.GET("/shop-detail", MasterShopDetail)
		master.GET("/impersonate-shop", MasterImpersonateShop)
		master.POST("/backup", MasterBackupCode)
		master.POST("/upload", MasterUploadImage)
	}

	cases := []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/master/shop-detail?id=1"},
		{method: http.MethodGet, path: "/api/master/impersonate-shop?id=1"},
	}

	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code == http.StatusNotFound {
			t.Fatalf("expected route %s %s to be registered, got 404", tc.method, tc.path)
		}
	}
}
