import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { login as loginRequest } from "@/api/auth";
import { clearAuthSession, loadAuthSession, saveAuthSession } from "@/lib/authStorage";
import { setTokenProvider, setUnauthorizedHandler } from "@/lib/api";

type AuthContextValue = {
  token: string | null;
  name: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const storedOnMount = useMemo(() => loadAuthSession(), []);
  const [token, setToken] = useState<string | null>(storedOnMount?.token ?? null);
  const [name, setName] = useState<string | null>(storedOnMount?.name ?? null);

  const logout = useCallback(() => {
    clearAuthSession();
    setToken(null);
    setName(null);
    navigate("/login", { replace: true });
    toast.info("Session ended.");
  }, [navigate]);

  useEffect(() => {
    setTokenProvider(() => token);
    setUnauthorizedHandler(() => {
      clearAuthSession();
      setToken(null);
      setName(null);
      navigate("/login", { replace: true });
      toast.error("Session expired. Please sign in again.");
    });
  }, [navigate, token]);

  const login = useCallback(async (usernameInput: string, passwordInput: string) => {
    const payload = await loginRequest({ username: usernameInput.trim(), password: passwordInput });
    saveAuthSession(payload.access_token, payload.name || payload.username);
    setToken(payload.access_token);
    setName(payload.name || payload.username);
    toast.success("Signed in successfully.");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      name,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [login, logout, token, name],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
