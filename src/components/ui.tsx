import clsx from "clsx";

export function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#ef174b]">Onboard Travel & Tourism</p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("rounded-lg border border-white/10 bg-zinc-950 p-5 shadow-2xl shadow-black/40", className)}>{children}</div>;
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card>
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-xs text-[#ef174b]">{hint}</p>
    </Card>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "red" | "green" | "amber" | "neutral" }) {
  const tones = {
    red: "border-red-500/30 bg-red-500/10 text-red-200",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    neutral: "border-white/10 bg-white/5 text-zinc-200",
  };
  return <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-zinc-950/60 p-10 text-center">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm text-zinc-400">{text}</p>
    </div>
  );
}

export function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row, index) => (
              <tr key={index} className="bg-zinc-950/70">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap px-4 py-3 text-zinc-200">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
