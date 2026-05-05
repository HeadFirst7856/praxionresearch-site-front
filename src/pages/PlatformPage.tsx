import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PlatformPage() {
  return (
    <div className="page-container py-14">
      <section className="grid gap-5 lg:grid-cols-[1.3fr_0.9fr]">
        <article className="glass-panel p-8">
          <p className="mb-4 text-xs uppercase tracking-[0.14em] text-sky-300">
            Systematic Research, Live Execution, Operational Clarity
          </p>
          <h1 className="text-[clamp(2.8rem,7vw,4.8rem)] leading-[0.9] font-semibold tracking-tight">
            Build the edge.<br />Track the truth.
          </h1>
          <p className="mt-4 max-w-3xl text-slate-300">
            Praxion Research is building a disciplined trading operation around research-first strategy design, live shadow
            benchmarking, and clean execution infrastructure.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className={cn(
                buttonVariants({ variant: "default" }),
                "rounded-full bg-sky-500/20 px-4 text-sky-100 hover:bg-sky-500/30",
              )}
            >
              View Dashboard Mockup
            </Link>
            <a
              href="mailto:enri@praxionresearch.com"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "rounded-full border-sky-400/35 bg-transparent px-4 text-slate-200 hover:bg-slate-800",
              )}
            >
              Contact Praxion
            </a>
          </div>
        </article>

        <aside className="grid gap-3">
          {[
            {
              label: "Current Build Focus",
              value: "Live Benchmarking",
              text: "Track multiple strategies side by side, live-test one at a time, and keep the decision surface clean.",
            },
            {
              label: "Operating Style",
              value: "Research First",
              text: "Signal quality, execution discipline, and operator visibility are all treated as first-class problems.",
            },
            {
              label: "Dashboard Direction",
              value: "Private For The Team",
              text: "Secure login, live P&L, shadow curves, heartbeat status, and strategy-by-strategy benchmarking.",
            },
          ].map((item) => (
            <article key={item.label} className="glass-panel p-5">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold">{item.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
            </article>
          ))}
        </aside>
      </section>

      <section id="research" className="pt-10">
        <h2 className="text-3xl font-semibold">What Praxion Is Building</h2>
        <p className="mt-3 max-w-5xl text-muted-foreground">
          The site should present Praxion as a serious research and execution shop: a clear public face up front, then a
          private operator dashboard behind login.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Strategy Research",
              body: "Develop and rank live-viable strategies with emphasis on robustness, operational simplicity, and deployability.",
            },
            {
              title: "Execution Infrastructure",
              body: "Bridge signal generation into broker-specific execution with shared credentials, logging, heartbeats, and kill switches.",
            },
            {
              title: "Live Benchmarking",
              body: "Benchmark live and shadow strategies side by side so decisions are based on current reality.",
            },
          ].map((card) => (
            <article key={card.title} className="glass-panel p-6">
              <h3 className="text-xl font-semibold">{card.title}</h3>
              <p className="mt-3 text-muted-foreground">{card.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
