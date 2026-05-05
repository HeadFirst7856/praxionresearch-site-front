import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HomePage() {
  return (
    <div>
      <section className="py-24">
        <div className="page-container">
          <div className="glass-panel mx-auto max-w-5xl px-6 py-14 text-center md:px-12">
            <p className="mb-4 text-xs uppercase tracking-[0.14em] text-sky-300">Research-Driven Trading Infrastructure</p>
            <h1 className="mb-5 text-[clamp(3rem,8vw,5.8rem)] leading-[0.92] font-semibold tracking-tight">
              Modern systematic trading,<br />built with discipline.
            </h1>
            <p className="mx-auto max-w-3xl text-lg leading-relaxed text-slate-300">
              Praxion Research develops research-led trading systems, live monitoring, and execution infrastructure with
              an institutional standard for clarity, risk, and operational control.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/dashboard"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "rounded-full bg-sky-500/20 px-4 text-sky-100 hover:bg-sky-500/30",
                )}
              >
                Dashboard
              </Link>
              <Link
                to="/platform"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "rounded-full border-sky-400/35 bg-transparent px-4 text-slate-200 hover:bg-slate-800",
                )}
              >
                View Platform
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-8">
        <div className="page-container">
          <div className="glass-panel p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Approach", value: "Research First" },
                { label: "Focus", value: "Live Benchmarking" },
                { label: "Build", value: "Execution Stack" },
                { label: "Access", value: "Private Dashboard", tone: "text-amber-300" },
              ].map((kpi) => (
                <div key={kpi.label} className="kpi-card">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{kpi.label}</div>
                  <div className={`mt-2 text-2xl font-semibold ${kpi.tone ?? ""}`}>{kpi.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
