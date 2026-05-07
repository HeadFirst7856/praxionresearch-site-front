import { apiFetch } from "@/lib/api";

export type LoginPayload = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  username: string;
  name: string;
};

export type SignupPayload = {
  username: string;
  name: string;
  password: string;
};

export type SignupResponse = {
  username: string;
  name: string;
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
