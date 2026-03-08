import { useState } from "preact/hooks";
import { saveUserInfo } from "../../lib/userStore";
import { DEFAULT_USER_PASSWORD } from "../../lib/clientConfig";

export interface GoogleUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone?: string;
}

interface ProfileUpdate {
  name?: string;
  phone?: string;
  address?: string;
  addresses?: string[];
}

interface UseAuthStateOptions {
  onProfileUpdate: (update: ProfileUpdate) => void;
  onGoogleSuccess?: () => void;
}

export function useAuthState({
  onProfileUpdate,
  onGoogleSuccess,
}: UseAuthStateOptions) {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [loginAccount, setLoginAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [regAccountType, setRegAccountType] = useState<
    "phone" | "email" | "id"
  >("phone");
  const [regAccount, setRegAccount] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regError, setRegError] = useState("");

  const handleLogin = async () => {
    if (!loginAccount || !password) {
      setLoginError("请输入账号和密码");
      return;
    }
    setAuthLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/user/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_account: loginAccount, password }),
      });
      const data = await res.json();
      if (data.success) {
        saveUserInfo(
          data.user.name,
          data.user.phone || loginAccount,
          password,
          data.user.last_address,
          {
            email: data.user.email,
            avatar: data.user.avatar,
            login_account: loginAccount,
          },
        );
        onProfileUpdate({
          name: data.user.name,
          phone: data.user.phone,
          address: data.user.last_address,
          addresses: data.user.addresses || [],
        });
      } else {
        setLoginError(data.error || "登录失败");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "网络错误";
      setLoginError(message || "网络错误");
    }
    setAuthLoading(false);
  };

  const handleRegister = async () => {
    if (!regAccount || !regPassword || !regName) {
      setRegError("请填写所有信息");
      return;
    }
    setAuthLoading(true);
    setRegError("");

    try {
      const res = await fetch("/api/user/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_type: regAccountType,
          account: regAccount,
          password: regPassword,
          name: regName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        saveUserInfo(
          regName,
          regAccountType === "phone" ? regAccount : "",
          regPassword,
          "",
          { login_account: regAccount },
        );
        onProfileUpdate({ name: regName });
      } else {
        setRegError(data.error || "注册失败");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "网络错误";
      setRegError(message || "网络错误");
    }
    setAuthLoading(false);
  };

  const handleGoogleSuccess = (user: GoogleUser) => {
    saveUserInfo(user.name, user.phone || "", DEFAULT_USER_PASSWORD, "", {
      email: user.email,
      avatar: user.avatar,
      google_id: user.id,
    });
    onProfileUpdate({ name: user.name, phone: user.phone });
    onGoogleSuccess?.();
  };

  const switchToLogin = () => {
    setIsRegisterMode(false);
    setLoginError("");
    setRegError("");
  };

  const switchToRegister = () => {
    setIsRegisterMode(true);
    setLoginError("");
    setRegError("");
  };

  return {
    isRegisterMode,
    authLoading,
    loginAccount,
    password,
    loginError,
    regAccountType,
    regAccount,
    regPassword,
    regName,
    regError,
    setLoginAccount,
    setPassword,
    setRegAccountType,
    setRegAccount,
    setRegPassword,
    setRegName,
    switchToLogin,
    switchToRegister,
    handleLogin,
    handleRegister,
    handleGoogleSuccess,
  };
}
