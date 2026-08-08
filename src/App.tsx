import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { HomePage } from "@/pages/HomePage";
import { StrategyLabPage } from "@/pages/StrategyLabPage";
import { AboutPage } from "@/pages/AboutPage";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { Toaster } from "@/components/ui/sonner";
import { isSignupEnabled } from "@/lib/features";

function App() {
  const signupEnabled = isSignupEnabled();

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            {signupEnabled ? <Route path="/signup" element={<SignupPage />} /> : null}
            <Route path="/about" element={<AboutPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/strategy-lab" element={<StrategyLabPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
