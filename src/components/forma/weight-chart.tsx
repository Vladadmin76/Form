import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, fmtShort } from "@/lib/format";

export default function WeightChart({ points }: { points: { date: string; kg: number }[] }) {
  const data = points.map((point) => ({ label: fmtShort(point.date), kg: point.kg }));
  return (
    <div className="h-48 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            domain={["dataMin - 1", "dataMax + 1"]}
            width={36}
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [`${fmt(Number(value), 1)} кг`, "Вес"]}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              color: "var(--color-fg)",
            }}
          />
          <Area type="monotone" dataKey="kg" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.18} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
