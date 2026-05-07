export function isSignupEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_SIGNUP === "true";
}
