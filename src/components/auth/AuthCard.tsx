import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <Card className="glass-panel border-white/10 bg-[#081325]/90 py-0">
      <CardContent className="p-8">{children}</CardContent>
    </Card>
  );
}
