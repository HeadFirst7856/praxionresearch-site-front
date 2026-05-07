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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signup({
        name: name.trim(),
        username: username.trim(),
        password,
      });
      toast.success("Account created successfully. Please sign in to continue.");
      navigate("/login", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected signup error";
      if (message.includes("signup_disabled:")) {
        toast.error("Signup is disabled on the server.");
      } else if (message.includes("409")) {
        toast.error("Username is already in use.");
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
          placeholder="Choose a username"
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
