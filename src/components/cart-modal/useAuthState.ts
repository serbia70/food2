import { useState } from "preact/hooks";
import { DEFAULT_USER_PASSWORD } from "../../lib/clientConfig";
import { loginUser, persistGoogleUserAuth, persistUserAuth, registerUser } from "../../lib/user-auth";
import { saveUserInfo } from "../../lib/userStore";

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
      const data = await loginUser({ loginAccount, password });
      if (data.success) {
        const auth = persistUserAuth(data, { loginAccount, password });
        onProfileUpdate({
          name: auth.user.name,
          phone: auth.user.phone,
          address: auth.user.last_address,
          addresses: auth.user.addresses || [],
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
      const data = await registerUser({
        accountType: regAccountType,
        account: regAccount,
        password: regPassword,
        name: regName,
      });
      if (data.success) {
        const auth = persistUserAuth(data, {
          accountType: regAccountType,
          account: regAccount,
          password: regPassword,
          name: regName,
        });
        onProfileUpdate({
          name: auth.user.name,
          phone: auth.user.phone,
          address: auth.user.last_address,
          addresses: auth.user.addresses || [],
        });
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
    const auth = persistGoogleUserAuth(user);
    onProfileUpdate({ name: auth.user.name, phone: auth.user.phone });
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
