import { apiFetch } from "@/lib/api";

// Backend contract (app/api/routes/auth.py):
//   POST /auth/login  {name?, email, password}  -> {token, user:{id,name,email,created_at_utc}}
//   POST /auth/signup {name, email, password}   -> {token, user:{...}}
// Frontend sends the email field; the backend derives username/display from user.name.

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  created_at_utc?: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type SignupPayload = {
  name: string;
  email: string;
  password: string;
};

export type SignupResponse = {
  token: string;
  user: AuthUser;
};

export function extractApiError(text: string): string {
  let detail = text;
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (j.detail == null) {
      return detail;
    }
    if (typeof j.detail === "string") {
      return j.detail;
    }
    if (typeof j.detail === "object") {
      const asRecord = j.detail as { error?: unknown; message?: unknown };
      const error = typeof asRecord.error === "string" ? asRecord.error : null;
      const message = typeof asRecord.message === "string" ? asRecord.message : JSON.stringify(j.detail);
      return error ? `${error}:${message}` : message;
    }
    return String(j.detail);
  } catch {
    return detail;
  }
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const res = await apiFetch(
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    false,
  );

  if (!res.ok) {
    const text = await res.text();
    const detail = extractApiError(text);
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return (await res.json()) as LoginResponse;
}

export async function signup(payload: SignupPayload): Promise<SignupResponse> {
  const res = await apiFetch(
    "/api/v1/auth/signup",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    false,
  );

  if (!res.ok) {
    const text = await res.text();
    const detail = extractApiError(text);
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return (await res.json()) as SignupResponse;
}
