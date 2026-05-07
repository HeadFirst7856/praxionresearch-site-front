import { Link, Navigate } from "react-router-dom";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { SignupForm } from "@/components/auth/SignupForm";
import { isSignupEnabled } from "@/lib/features";

export function SignupPage() {
  if (!isSignupEnabled()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="page-container py-14">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="glass-panel p-8">
          <p className="text-xs uppercase tracking-[0.14em] text-sky-300">Praxion Research</p>
          <h2 className="mt-2 text-[clamp(2.2rem,5vw,3.6rem)] leading-tight font-semibold tracking-tight">Create account</h2>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Register a new operator account and then sign in to access private simulations.
          </p>
          <Link to="/login" className="mt-6 inline-flex text-sm text-sky-300 hover:text-sky-200">
            Already have an account? Sign in
          </Link>
        </section>

        <AuthCard>
          <AuthHeader title="Sign up" description="Create your operator credentials." />
          <SignupForm />
        </AuthCard>
      </div>
    </div>
  );
}
