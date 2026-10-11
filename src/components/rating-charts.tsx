import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnnualPoint, PricePoint } from "@/lib/rating/types";

const tip = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-line)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--color-ink)",
};

function year(date: string) {
  return date.slice(0, 4);
}

export function PriceChart({ prices, currency }: { prices: PricePoint[]; currency: string }) {
  if (prices.length < 2) return <Empty label="Price history is not available." />;
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={prices} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(2, 7)} tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip contentStyle={tip} formatter={(value) => [Number(value).toFixed(2), currency]} labelFormatter={(label) => String(label)} />
          <Area type="monotone" dataKey="close" stroke="var(--color-ink)" fill="var(--color-bg-deep)" strokeWidth={1.6} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MultipleChart({ rows }: { rows: AnnualPoint[] }) {
  const data = rows.filter((r) => r.pe != null || r.ps != null || r.ev != null);
  if (data.length < 2) return <Empty label="Not enough fiscal years to chart multiples." />;
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={year} tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={tip} formatter={(value, name) => [value == null ? "—" : Number(value).toFixed(1) + "×", String(name)]} />
          <Line type="monotone" dataKey="pe" name="P/E" stroke="var(--color-ink)" strokeWidth={1.8} dot={false} connectNulls />
          <Line type="monotone" dataKey="ps" name="P/S" stroke="var(--color-brass)" strokeWidth={1.8} dot={false} connectNulls />
          <Line type="monotone" dataKey="ev" name="EV/EBITDA" stroke="var(--color-buy)" strokeWidth={1.8} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarginChart({ rows }: { rows: AnnualPoint[] }) {
  const data = rows
    .filter((r) => r.gross != null || r.net != null)
    .map((r) => ({
      ...r,
      grossPct: r.gross == null ? null : r.gross * 100,
      netPct: r.net == null ? null : r.net * 100,
      fcfPct: r.fcfMargin == null ? null : r.fcfMargin * 100,
    }));
  if (data.length < 2) return <Empty label="Not enough fiscal years to chart margins." />;
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={year} tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} unit="%" />
          <Tooltip contentStyle={tip} formatter={(value, name) => [value == null ? "—" : Number(value).toFixed(1) + "%", String(name)]} />
          <Line type="monotone" dataKey="grossPct" name="Gross" stroke="var(--color-ink)" strokeWidth={1.8} dot={false} connectNulls />
          <Line type="monotone" dataKey="netPct" name="Net" stroke="var(--color-brass)" strokeWidth={1.8} dot={false} connectNulls />
          <Line type="monotone" dataKey="fcfPct" name="FCF" stroke="var(--color-buy)" strokeWidth={1.8} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashChart({ rows }: { rows: AnnualPoint[] }) {
  const data = rows.filter((r) => r.fcf != null || r.debt != null);
  if (!data.length) return <Empty label="Cash flow history is not available." />;
  return (
    <div className="h-56 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={year} tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => compact(v)} />
          <Tooltip contentStyle={tip} formatter={(value, name) => [compact(Number(value)), String(name)]} />
          <Bar dataKey="fcf" name="Free cash flow" fill="var(--color-buy)" radius={3} />
          <Bar dataKey="debt" name="Total debt" fill="var(--color-brass)" radius={3} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function compact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

function Empty({ label }: { label: string }) {
  return <p className="flex h-40 items-center text-sm text-muted">{label}</p>;
}
