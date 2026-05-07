import { Link } from "react-router-dom";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { LoginForm } from "@/components/auth/LoginForm";
import { isSignupEnabled } from "@/lib/features";

export function LoginPage() {
  const signupEnabled = isSignupEnabled();

  return (
    <div className="page-container py-14">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="glass-panel p-8">
          <p className="text-xs uppercase tracking-[0.14em] text-sky-300">Praxion Research</p>
          <h2 className="mt-2 text-[clamp(2.2rem,5vw,3.6rem)] leading-tight font-semibold tracking-tight">
            Operator simulations access
          </h2>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Access is restricted to authenticated operators. Sign in to review live benchmark metrics and simulation state.
          </p>
          <Link to="/" className="mt-6 inline-flex text-sm text-sky-300 hover:text-sky-200">
            Back to home
          </Link>
        </section>

        <AuthCard>
          <AuthHeader title="Sign in" description="Use your Praxion operator credentials to continue." />
          <LoginForm />
          {signupEnabled ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Need an account?{" "}
              <Link to="/signup" className="text-sky-300 hover:text-sky-200">
                Create one
              </Link>
            </p>
          ) : null}
        </AuthCard>
      </div>
    </div>
  );
}
