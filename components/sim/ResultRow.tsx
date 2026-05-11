type Accent = "red" | "green" | "blue" | "amber" | undefined;

export function ResultRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: Accent;
}) {
  const color =
    accent === "red"
      ? "text-red-700"
      : accent === "green"
        ? "text-emerald-700"
        : accent === "blue"
          ? "text-blue-700"
          : accent === "amber"
            ? "text-amber-700"
            : "text-neutral-900";
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 last:border-b-0">
      <span className="text-base text-neutral-600">{label}</span>
      <span className={`text-base font-medium ${color}`}>{value}</span>
    </div>
  );
}

export function Note({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "blue" | "red" }) {
  const cls =
    tone === "blue"
      ? "bg-blue-50 text-blue-900"
      : tone === "red"
        ? "bg-red-50 text-red-900"
        : "bg-amber-50 text-amber-900";
  return <p className={`rounded-md px-3 py-2 text-base ${cls}`}>{children}</p>;
}
