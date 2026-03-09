import GoogleLoginButton from "../GoogleLoginButton";

type AuthState = {
  isRegisterMode: boolean;
  authLoading: boolean;
  loginAccount: string;
  password: string;
  loginError: string;
  regAccountType: "phone" | "email" | "id";
  regAccount: string;
  regPassword: string;
  regName: string;
  regError: string;
  setLoginAccount: (value: string) => void;
  setPassword: (value: string) => void;
  setRegAccountType: (value: "phone" | "email" | "id") => void;
  setRegAccount: (value: string) => void;
  setRegPassword: (value: string) => void;
  setRegName: (value: string) => void;
  switchToLogin: () => void;
  switchToRegister: () => void;
  handleLogin: () => void;
  handleRegister: () => void;
  handleGoogleSuccess: (user: any) => void;
};

interface CartAuthPanelProps {
  auth: AuthState;
}

export default function CartAuthPanel({ auth }: CartAuthPanelProps) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: "12px",
        padding: "20px",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "15px",
          gap: "10px",
        }}
      >
        <button
          style={{
            padding: "8px 20px",
            border: !auth.isRegisterMode ? "2px solid #2196f3" : "1px solid #ddd",
            background: !auth.isRegisterMode ? "#e3f2fd" : "#fff",
            borderRadius: "20px",
            cursor: "pointer",
            fontSize: "14px",
            color: !auth.isRegisterMode ? "#2196f3" : "#666",
          }}
          onClick={auth.switchToLogin}
        >
          登录
        </button>
        <button
          style={{
            padding: "8px 20px",
            border: auth.isRegisterMode ? "2px solid #00b140" : "1px solid #ddd",
            background: auth.isRegisterMode ? "#f0fff4" : "#fff",
            borderRadius: "20px",
            cursor: "pointer",
            fontSize: "14px",
            color: auth.isRegisterMode ? "#00b140" : "#666",
          }}
          onClick={auth.switchToRegister}
        >
          注册
        </button>
      </div>

      {!auth.isRegisterMode ? (
        <>
          <input
            type="text"
            className="form-field"
            placeholder="账号 (ID/邮箱/手机号)"
            style={{ marginBottom: "10px" }}
            value={auth.loginAccount}
            onInput={(e) => auth.setLoginAccount((e.target as HTMLInputElement).value)}
          />
          <input
            type="password"
            className="form-field"
            placeholder="密码"
            style={{ marginBottom: "10px" }}
            value={auth.password}
            onInput={(e) => auth.setPassword((e.target as HTMLInputElement).value)}
          />
          {auth.loginError && (
            <div
              style={{
                color: "#f56565",
                fontSize: "12px",
                marginBottom: "10px",
              }}
            >
              {auth.loginError}
            </div>
          )}
          <button
            className="cart-btn-delivery"
            onClick={auth.handleLogin}
            disabled={auth.authLoading}
            style={{ width: "100%", marginBottom: "15px" }}
          >
            {auth.authLoading ? "..." : "登录"}
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              marginBottom: "10px",
              display: "flex",
              gap: "8px",
            }}
          >
            {([
              ["phone", "手机号"],
              ["email", "邮箱"],
              ["id", "ID"],
            ] as const).map(([type, label]) => (
              <button
                key={type}
                style={{
                  flex: 1,
                  padding: "6px",
                  border: auth.regAccountType === type ? "2px solid #00b140" : "1px solid #ddd",
                  background: auth.regAccountType === type ? "#f0fff4" : "#fff",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: auth.regAccountType === type ? "#00b140" : "#666",
                }}
                onClick={() => auth.setRegAccountType(type)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="form-field"
            placeholder="昵称 / Name"
            style={{ marginBottom: "10px" }}
            value={auth.regName}
            onInput={(e) => auth.setRegName((e.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            className="form-field"
            placeholder={
              auth.regAccountType === "phone"
                ? "手机号"
                : auth.regAccountType === "email"
                  ? "邮箱"
                  : "自定义 ID"
            }
            style={{ marginBottom: "10px" }}
            value={auth.regAccount}
            onInput={(e) => auth.setRegAccount((e.target as HTMLInputElement).value)}
          />
          <input
            type="password"
            className="form-field"
            placeholder="密码"
            style={{ marginBottom: "10px" }}
            value={auth.regPassword}
            onInput={(e) => auth.setRegPassword((e.target as HTMLInputElement).value)}
          />
          {auth.regError && (
            <div
              style={{
                color: "#f56565",
                fontSize: "12px",
                marginBottom: "10px",
              }}
            >
              {auth.regError}
            </div>
          )}
          <button
            className="cart-btn-delivery"
            onClick={auth.handleRegister}
            disabled={auth.authLoading}
            style={{ width: "100%", marginBottom: "15px", background: "#00b140" }}
          >
            {auth.authLoading ? "..." : "注册并继续"}
          </button>
        </>
      )}

      <div style={{ margin: "12px 0", color: "#999", fontSize: "12px", textAlign: "center" }}>
        或使用 Google / Continue with Google
      </div>
      <GoogleLoginButton onSuccess={auth.handleGoogleSuccess} />
    </div>
  );
}
