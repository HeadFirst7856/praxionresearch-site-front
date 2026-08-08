import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const principles = [
  {
    title: "Research first",
    body: "Every system starts as a hypothesis, gets tested against historical data, and only earns a place at the desk after surviving honest validation. No narrative trading, no gut calls.",
  },
  {
    title: "Internal capital only",
    body: "We do not manage outside money, take external investors, or sell access. The desk trades its own capital, which keeps incentives aligned and removes every conflict of interest that comes with client funds.",
  },
  {
    title: "Low profile by design",
    body: "The best research shops are the quiet ones. We do not market, publish performance, or chase attention. Our edge is built quietly, protected internally, and judged only by results.",
  },
  {
    title: "Systematic and disciplined",
    body: "Models, risk limits, and execution rules are written down and enforced mechanically. Discretion is reserved for research direction — never for risk-taking.",
  },
];

export function AboutPage() {
  return (
    <div className="page-container py-14">
      <section className="rounded-[32px] border border-sky-500/20 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_42%),linear-gradient(180deg,rgba(9,18,32,0.98),rgba(7,12,23,0.98))] px-6 py-10 shadow-[0_30px_120px_rgba(2,6,23,0.45)] md:px-10">
        <div className="max-w-4xl">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">About Praxion Research</p>
          <h1 className="mt-3 text-[clamp(2.7rem,7vw,5rem)] leading-[0.92] font-semibold tracking-tight text-slate-50">
            A private research desk. Nothing else.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            Praxion Research is a quantitative research desk focused on systematic trading. We operate like a research
            laboratory: long-horizon development, rigorous backtesting, and constant questioning of every edge we think
            we have found. The difference from a traditional fund is simple — we trade only our own capital.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            That decision shapes everything. With no external investors, no mandates, and no one to report to but
            ourselves, we can afford the two things real research requires: time, and the willingness to be wrong in
            private. We model the kind of desk we admire — small, obsessive, and quiet — where the work matters more
            than the narrative around it.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {principles.map((item) => (
            <div key={item.title} className="rounded-3xl border border-white/10 bg-[#091221]/80 p-6">
              <h2 className="text-lg font-semibold text-slate-50">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-[#07111f]/80 p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Our stance</p>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">
            We are not a fund, and we are not a service. We do not solicit capital, offer signals, or run subscriptions.
            The desk exists to research and trade — nothing more. If you are looking for investment products or
            performance reporting, we are deliberately not that. If you are interested in the ideas behind systematic
            research and disciplined execution, we are happy to share the philosophy — but the specifics stay internal.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/regime.html" className={cn(buttonVariants({ variant: "default" }), "rounded-full bg-sky-500/20 px-4 text-sky-100 hover:bg-sky-500/30")}>
            Open Regime
          </a>
          <Link to="/" className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-white/15 bg-transparent px-4 text-slate-100 hover:bg-white/5")}>
            Back Home
          </Link>
        </div>
      </section>
    </div>
  );
}
