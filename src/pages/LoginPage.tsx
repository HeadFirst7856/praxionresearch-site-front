import { Link } from "react-router-dom";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { LoginForm } from "@/components/auth/LoginForm";
import { isSignupEnabled } from "@/lib/features";

// NanoQuant operator login — terminal-themed (black + gold) on all screens.
export function LoginPage() {
  const signupEnabled = isSignupEnabled();

  return (
    <div className="min-h-screen bg-black text-[#ffd700]">
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.05]"
        style={{
          background:
            "repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.9) 3px)",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-[0.3em] text-[#ffd700]">NANOQUANT</div>
          <div className="mt-1 text-[10px] tracking-[0.35em] text-[#8a7a2a]">
            SECURE TERMINAL // OPERATOR ACCESS
          </div>
        </div>

        <div className="w-full max-w-sm border-2 border-[#ffd700]/40 bg-[#0a0800]/90 p-6 shadow-[0_0_30px_rgba(255,215,0,0.08)]">
          <AuthHeader
            title="Sign in"
            description="Enter your operator credentials to open the terminal."
          />
          <div className="mt-5">
            <LoginForm />
          </div>
          {signupEnabled ? (
            <p className="mt-4 text-center text-xs tracking-wider text-[#8a7a2a]">
              Need an account?{" "}
              <Link to="/signup" className="text-[#ffd700] underline-offset-2 hover:underline">
                Create one
              </Link>
            </p>
          ) : null}
        </div>

        <Link
          to="/"
          className="mt-6 text-[11px] tracking-[0.2em] text-[#6b5d1f] hover:text-[#c9a92c]"
        >
          ⌂ BACK TO HOME
        </Link>
      </div>
    </div>
  );
}
