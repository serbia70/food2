package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"

	"meituan-go/internal/config"
	"meituan-go/internal/db"
	"meituan-go/internal/handlers"
	"meituan-go/internal/middleware"
	"meituan-go/internal/services/cron"
	"meituan-go/internal/services/mqtt"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

func init() {
	// Enable ANSI color support on Windows
	if runtime.GOOS == "windows" {
		os.Setenv("TERM", "xterm-256color")
	}
}

func main() {
	// 1. Load Config
	cfg := config.LoadConfig()
	log.Printf("Database path: %s", cfg.Database.Path)

	// 2. Initialize Database
	if err := db.Init(cfg.Database.Path); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// 3. Initialize MQTT
	if err := mqtt.Init(); err != nil {
		log.Printf("Warning: Failed to initialize MQTT: %v", err)
	}

	// 3.1 Start Cron Scheduler
	cron.Start()

	// 4. Setup Router
	if cfg.Server.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.Default()

	// CORS Middleware (origin allowlist)
	allowed := map[string]bool{}
	if raw := os.Getenv("MEITUAN_ALLOWED_ORIGINS"); strings.TrimSpace(raw) != "" {
		for _, o := range strings.Split(raw, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				allowed[o] = true
			}
		}
	}
	if len(allowed) == 0 {
		allowed["http://localhost:3000"] = true
		allowed["http://localhost:3001"] = true
	}
	frontendBase := strings.TrimRight(os.Getenv("MEITUAN_FRONTEND_URL"), "/")
	if frontendBase == "" {
		frontendBase = "http://localhost:3000"
	}

	r.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && allowed[origin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 4. Initialize Handlers
	shopHandler := &handlers.ShopHandler{}
	menuHandler := &handlers.MenuHandler{}
	orderHandler := &handlers.OrderHandler{}
	authHandler := &handlers.AuthHandler{}
	reservationHandler := &handlers.ReservationHandler{}

	// 5. Register Routes
	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "running",
			"service": "MeituanGo API",
			"version": "1.0.0",
		})
	})

	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"message": "pong",
		})
	})

	// Static Files (Must be before /:slug to avoid conflict)
	// Legacy HTML entrypoints must never be served by the Go origin.
	r.GET("/admin.html", func(c *gin.Context) {
		c.AbortWithStatus(http.StatusNotFound)
	})
	r.GET("/master.html", func(c *gin.Context) {
		c.AbortWithStatus(http.StatusNotFound)
	})
	r.GET("/favicon.ico", func(c *gin.Context) {
		target := frontendBase + "/favicon.ico"
		if raw := c.Request.URL.RawQuery; raw != "" {
			target += "?" + raw
		}
		c.Redirect(http.StatusPermanentRedirect, target)
	})
	r.GET("/assets/*path", func(c *gin.Context) {
		path := c.Param("path")
		target := frontendBase + "/assets" + path
		if raw := c.Request.URL.RawQuery; raw != "" {
			target += "?" + raw
		}
		c.Redirect(http.StatusPermanentRedirect, target)
	})

	r.GET("/api/debug-orders", func(c *gin.Context) {
		type orderRow struct {
			ID          int64  `db:"id" json:"id"`
			CreatedAt   string `db:"created_at" json:"created_at"`
			OrderType   string `db:"order_type" json:"order_type"`
			TotalAmount int64  `db:"total_amount" json:"total_amount"`
			ShopID      int64  `db:"shop_id" json:"shop_id"`
		}
		var rows []orderRow
		_ = db.DB.Select(&rows, "SELECT id, created_at, order_type, total_amount, shop_id FROM orders ORDER BY id DESC LIMIT 10")

		now := time.Now()
		todayPattern := now.Format("2006-01-02") + "%"

		var debugStats struct {
			Total   int64 `db:"total"`
			Del     int64 `db:"del"`
			Dine    int64 `db:"dine"`
			Unknown int64 `db:"unknown"`
		}
		_ = db.DB.Get(&debugStats, `
			SELECT 
				COALESCE(SUM(total_amount), 0) as total,
				COALESCE(SUM(CASE WHEN order_type='delivery' THEN total_amount ELSE 0 END), 0) as del,
				COALESCE(SUM(CASE WHEN order_type='dine_in' THEN total_amount ELSE 0 END), 0) as dine,
				COALESCE(SUM(CASE WHEN order_type NOT IN ('delivery', 'dine_in') THEN total_amount ELSE 0 END), 0) as unknown
			FROM orders 
			WHERE created_at LIKE ? AND shop_id = 1
		`, todayPattern)

		c.JSON(200, gin.H{
			"server_time":   now.Format(time.RFC3339),
			"today_pattern": todayPattern,
			"latest_orders": rows,
			"shop_1_stats":  debugStats,
		})
	})

	// Public Shop Pages & API
	// e.g., /myshop -> redirect to frontend storefront
	// e.g., /myshop/info -> Get Shop Info (JSON)
	// e.g., /myshop/menu -> Get Menu (JSON)
	r.GET("/:slug/admin.html", func(c *gin.Context) {
		slug := c.Param("slug")
		target := fmt.Sprintf("%s/admin/%s", frontendBase, url.PathEscape(slug))
		if raw := c.Request.URL.RawQuery; raw != "" {
			target += "?" + raw
		}
		c.Redirect(http.StatusFound, target)
	})
	r.GET("/:slug", func(c *gin.Context) {
		slug := c.Param("slug")
		target := fmt.Sprintf("%s/%s", frontendBase, url.PathEscape(slug))
		if raw := c.Request.URL.RawQuery; raw != "" {
			target += "?" + raw
		}
		c.Redirect(http.StatusPermanentRedirect, target)
	})
	r.GET("/:slug/info", shopHandler.GetShopBySlug)
	r.GET("/:slug/menu", menuHandler.GetMenu)
	r.POST("/:slug/order", orderHandler.CreateOrder)
	r.GET("/:slug/order/:order_no", orderHandler.GetOrder)
	r.POST("/:slug/reservation", reservationHandler.CreateReservation)

	// Admin API
	api := r.Group("/api")
	{
		api.POST("/login", authHandler.Login)
		api.POST("/rider/auth", handlers.RiderAuth)
		api.POST("/rider/status", handlers.RiderStatus)
		api.GET("/rider/orders", handlers.RiderOrders)
		api.POST("/user/register", handlers.UserRegister)
		api.POST("/user/history", handlers.UserHistory)
		api.GET("/user/history", handlers.UserHistory)
		api.POST("/user/address", handlers.UserAddress)
		api.POST("/user/update", handlers.UserUpdate)
		api.GET("/home", handlers.PublicHomeData)
		api.GET("/user/chat", handlers.UserListChatMessages)
		api.POST("/user/chat", handlers.UserSendChatMessage)
		api.POST("/order/update_status", handlers.OrderUpdateStatus)
		api.GET("/order/status", handlers.PublicOrderStatus)
		api.GET("/order/by_table", handlers.PublicOrdersByTable)
		api.GET("/stream/:slug", handlers.StreamBySlug)
		api.GET("/cron/daily-report", handlers.DailyReportCron)

		// Master Admin API
		master := api.Group("/master")
		{
			master.POST("/login", handlers.MasterLogin)
			master.POST("/manage", handlers.MasterManage)
			master.POST("/password", handlers.MasterUpdatePassword)
			master.POST("/shop-balance", handlers.MasterTopupShopBalance)
			master.POST("/shops", handlers.MasterCreateShop)
			master.PUT("/shops/:id", handlers.MasterUpdateShop)
			master.DELETE("/shops/:id", handlers.MasterDeleteShop)
			master.POST("/settings", handlers.MasterUpdateSettings)
			master.POST("/categories", handlers.MasterUpdateCategories)
			master.POST("/shop-plan", handlers.MasterSetShopPlan)
			master.POST("/shop-billing", handlers.MasterGetShopBilling)
			master.POST("/shop-renew", handlers.MasterRenewShop)
			master.POST("/shop-renew/approve", handlers.MasterApproveRenew)
			master.POST("/shop-renew/reject", handlers.MasterRejectRenew)
			master.POST("/rate-center", handlers.MasterUpdateRateCenter)
			master.POST("/commission-batch", handlers.MasterBatchUpdateCommission)
			master.POST("/commission-refund/review", handlers.MasterReviewCommissionRefund)
			master.GET("/commission-refund/requests", handlers.MasterListCommissionRefundRequests)
			master.POST("/trigger-backup", handlers.MasterTriggerBackup)
			master.POST("/restore", handlers.MasterRestore)
			master.GET("/init", handlers.MasterInitData)
			master.GET("/shop-detail", handlers.MasterShopDetail)
			master.GET("/impersonate-shop", handlers.MasterImpersonateShop)
			master.POST("/backup", handlers.MasterBackupCode)
			master.POST("/upload", handlers.MasterUploadImage)
		}

		admin := api.Group("/admin")
		admin.Use(middleware.AuthMiddleware())
		{
			admin.GET("/status", func(c *gin.Context) {
				shopID, _ := c.Get("shop_id")
				c.JSON(http.StatusOK, gin.H{
					"status":  "ok",
					"shop_id": shopID,
				})
			})

			// Order Management
			admin.GET("/orders", orderHandler.ListOrders)
			admin.PUT("/orders/:id", orderHandler.UpdateOrderStatus)
			// Deprecated: backward-compatible order status path for legacy admin clients only.
			admin.PUT("/orders/:id/status", orderHandler.UpdateOrderStatus)
			admin.POST("/orders/:id/mark-paid", handlers.AdminMarkPaid)
			admin.POST("/orders/:id/reject", handlers.AdminRejectOrder)
			admin.PUT("/orders/:id/edit", handlers.AdminEditOrder)
			// Deprecated: compatibility action multiplexer for legacy admin clients only.
			// New admin behavior must be added as explicit routes instead of extending this endpoint.
			admin.POST("/update", handlers.AdminUpdateCompat)
			admin.GET("/riders", handlers.AdminRiders)
			admin.GET("/stats", handlers.AdminStats)
			admin.GET("/rate", handlers.AdminRate)
			admin.GET("/billing", handlers.AdminBillingStatus)
			admin.GET("/billing/records", handlers.AdminBillingRecords)
			admin.POST("/commission-refund/request", handlers.AdminCreateCommissionRefundRequest)
			admin.GET("/commission-refund/list", handlers.AdminListCommissionRefundRequests)
			admin.GET("/plan/upgrade-quote", handlers.AdminPlanQuoteUpgrade)
			admin.POST("/plan/upgrade", handlers.AdminPlanUpgrade)
			admin.POST("/plan/downgrade", handlers.AdminPlanScheduleDowngrade)
			admin.POST("/plan/downgrade/cancel", handlers.AdminPlanCancelDowngrade)
			admin.POST("/orders/archive", handlers.AdminOrdersArchive)
			admin.POST("/orders/remarks", handlers.AdminOrderRemarks)
			admin.POST("/reprint", handlers.AdminReprint)
			admin.POST("/localize-images", handlers.AdminLocalizeImages)
			admin.POST("/tables/checkout", handlers.AdminTablesCheckout)
			admin.POST("/tables/:table/reviews/approve", handlers.AdminApproveTableReviews)
			admin.POST("/tables/:table/reviews/reject", handlers.AdminRejectTableReviews)
			admin.POST("/settings/table-config", handlers.AdminUpdateTableConfig)
			admin.POST("/settings/password", handlers.AdminUpdatePassword)
			admin.POST("/settings", handlers.AdminUpdateSettings)
			admin.POST("/settings/master", handlers.AdminUpdateMasterSettings)
			admin.POST("/renew/approve", handlers.AdminApproveRenew)

			// Promotions & Marketing
			admin.GET("/promotions", handlers.AdminListPromotions)
			admin.POST("/promotions", handlers.AdminCreatePromotion)
			admin.PUT("/promotions/:id", handlers.AdminUpdatePromotion)
			admin.DELETE("/promotions/:id", handlers.AdminDeletePromotion)
			admin.POST("/promotions/:id/toggle", handlers.AdminTogglePromotion)

			// Customers & Loyalty
			admin.GET("/customers", handlers.AdminListCustomers)
			admin.GET("/customers/export", handlers.AdminExportCustomersCSV)
			admin.POST("/customers", handlers.AdminCreateCustomer)
			admin.POST("/customers/points", handlers.AdminModifyCustomerPoints)
			admin.POST("/customers/vip", handlers.AdminSetCustomerVIP)

			// Chat
			admin.GET("/chat", handlers.AdminListChatMessages)
			admin.POST("/chat", handlers.AdminSendChatMessage)

			admin.GET("/reservations", reservationHandler.ListReservations)
			admin.PUT("/reservations/:id", reservationHandler.UpdateReservationStatus)
			admin.POST("/reservations/:id/checkin", reservationHandler.CheckinReservation)
			admin.POST("/reservations/:id/print", reservationHandler.PrintReservation)

			admin.GET("/reservations/stats", reservationHandler.GetReservationStats)

			// Menu Management
			admin.POST("/products", menuHandler.UpsertProduct)
			admin.DELETE("/products/:id", menuHandler.DeleteProduct)
			admin.POST("/products/:id/move", menuHandler.MoveProduct)

			admin.POST("/categories", menuHandler.UpsertCategory)
			admin.DELETE("/categories/:id", menuHandler.DeleteCategory)
			admin.POST("/categories/:id/move", menuHandler.MoveCategory)

			// Upload
			uploadHandler := &handlers.UploadHandler{}
			admin.POST("/upload", uploadHandler.UploadImage)
		}
	}

	// Unknown routes:
	// - /api/* => JSON 404
	// - otherwise => redirect to frontendBase preserving path + query
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/") || path == "/api" {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{
				"error": "not found",
			})
			return
		}

		target := frontendBase + path
		if raw := c.Request.URL.RawQuery; raw != "" {
			target += "?" + raw
		}
		c.Redirect(http.StatusPermanentRedirect, target)
	})

	// 6. Start Server
	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Server starting on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
