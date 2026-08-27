import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { HomePage } from "@/pages/HomePage";
import { StrategyLabPage } from "@/pages/StrategyLabPage";
import { AboutPage } from "@/pages/AboutPage";
import { PolyquantPage } from "@/pages/PolyquantPage";
import { LoginPage } from "@/pages/LoginPage";
import { SignupPage } from "@/pages/SignupPage";
import { Toaster } from "@/components/ui/sonner";
import { isSignupEnabled } from "@/lib/features";

// Heavy WebGL terminal — loaded only when an operator opens it explicitly.
// NOTE: no auto-redirect from "/" to "/terminal"; operators reach the terminal
// via the nav link. This keeps navigation intuitive (no more "every page dumps
// me in /terminal").
const TerminalPage = lazy(() => import("@/pages/TerminalPage"));

function App() {
  const signupEnabled = isSignupEnabled();

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Fullscreen terminal — rendered OUTSIDE the site shell (no header/footer). */}
          <Route element={<RequireAuth />}>
            <Route
              path="/terminal"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-screen items-center justify-center bg-black text-[#ffd700]">
                      INITIALIZING TERMINAL...
                    </div>
                  }
                >
                  <TerminalPage />
                </Suspense>
              }
            />
          </Route>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            {signupEnabled ? <Route path="/signup" element={<SignupPage />} /> : null}
            <Route path="/about" element={<AboutPage />} />
            <Route path="/polyquant" element={<PolyquantPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/strategy-lab" element={<StrategyLabPage />} />
            </Route>
            {/* Unknown routes -> home, NOT /terminal (see note above). */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
