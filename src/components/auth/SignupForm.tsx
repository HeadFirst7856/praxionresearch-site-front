import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { signup } from "@/api/auth";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignupForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      toast.success("Account created successfully. Please sign in to continue.");
      navigate("/login", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected signup error";
      if (message.includes("signup_disabled:")) {
        toast.error("Signup is disabled on the server.");
      } else if (message.includes("409")) {
        toast.error("Email is already in use.");
      } else {
        toast.error(`Sign-up failed: ${message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="mt-6 space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <label htmlFor="name" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Name
        </label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoComplete="name"
          placeholder="Enter your name"
          disabled={submitting}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="email" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          disabled={submitting}
        />
      </div>
      <PasswordField value={password} onChange={setPassword} disabled={submitting} />
      <Button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-sky-500/20 text-sky-100 hover:bg-sky-500/30 disabled:opacity-60"
      >
        {submitting ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
