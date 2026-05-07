import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { PasswordField } from "@/components/auth/PasswordField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type LocationState = {
  from?: string;
};

export function LoginForm() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from || "/";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected login error";
      toast.error(`Sign-in failed: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label htmlFor="username" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Username
        </label>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          autoComplete="username"
          placeholder="Enter your username"
          disabled={submitting}
        />
      </div>
      <PasswordField value={password} onChange={setPassword} disabled={submitting} />
      <Button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-sky-500/20 text-sky-100 hover:bg-sky-500/30 disabled:opacity-60"
      >
        {submitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
