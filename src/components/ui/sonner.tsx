import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      closeButton
      theme="dark"
      toastOptions={{
        className: "border border-border bg-popover text-popover-foreground",
      }}
    />
  );
}
