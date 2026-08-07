import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type RevenuePeriod = 'monthly' | 'quarterly' | 'yearly';

interface RevenueDataPoint {
  label: string;
  fullLabel: string;
  value: number;
  key: string;
  year: number;
}

interface RevenueChartProps {
  data: RevenueDataPoint[];
  period: RevenuePeriod;
  onPeriodChange: (p: RevenuePeriod) => void;
}

const PERIOD_OPTIONS: { key: RevenuePeriod; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'yearly', label: 'Yearly' },
];

function fmtShort(n: number) {
  if (n >= 1000000) return '\u20B1' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '\u20B1' + (n / 1000).toFixed(0) + 'k';
  return '\u20B1' + n.toLocaleString();
}

function fmtPeso(n: number) {
  return '\u20B1' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function niceCeil(v: number) {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / pow;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 2.5) nice = 2.5;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

function RevenueTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  const value = payload[0].value;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #E9DED2',
      borderRadius: '10px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      padding: '10px 14px',
      minWidth: '150px',
    }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1F1F1F', margin: 0, marginBottom: '6px' }}>
        {item?.fullLabel || ''}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#934308', flexShrink: 0 }} />
        <span style={{ fontSize: '0.78rem', color: '#77716B' }}>Revenue</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#934308', marginLeft: 'auto' }}>{fmtPeso(value)}</span>
      </div>
    </div>
  );
}

export default function RevenueChart({ data, period, onPeriodChange }: RevenueChartProps) {
  const chartData = useMemo(() => (data || []).map((d, i) => ({ ...d, index: i })), [data]);

  const values = useMemo(() => chartData.map(d => Number(d.value) || 0), [chartData]);
  const allZero = values.every(v => v <= 0);
  const maxValue = Math.max(...values, 0);
  const yMax = niceCeil(maxValue);

  if (allZero) {
    return (
      <Card>
        <Header period={period} onPeriodChange={onPeriodChange} />
        <div style={{ height: '230px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#C9BEB3" strokeWidth="1.5" style={{ width: '36px', height: '36px' }}>
            <line x1="3" y1="12" x2="6" y2="12" /><line x1="6" y1="12" x2="9" y2="8" /><line x1="9" y1="8" x2="12" y2="14" /><line x1="12" y1="14" x2="15" y2="10" /><line x1="15" y1="10" x2="18" y2="12" /><line x1="18" y1="12" x2="21" y2="12" />
          </svg>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#77716B', margin: 0 }}>No revenue data yet</p>
          <p style={{ fontSize: '0.75rem', color: '#A89688', margin: 0 }}>Charts will appear once orders are recorded.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Header period={period} onPeriodChange={onPeriodChange} />
      <div style={{ height: '230px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D9781E" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#D9781E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 4" stroke="#EFE7DC" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#A89688' }}
              tickLine={false}
              axisLine={{ stroke: '#E9DED2' }}
              interval="preserveStartEnd"
              padding={{ left: 6, right: 6 }}
            />
            <YAxis
              domain={[0, yMax]}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#A89688' }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: any) => fmtShort(Number(v))}
            />
            <Tooltip content={<RevenueTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#934308"
              strokeWidth={2.5}
              fill="url(#revenueGradient)"
              dot={{ r: 3.5, fill: '#934308', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#D9781E', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#fff', borderRadius: '14px', padding: '20px 22px',
      border: '1px solid #E9DED2',
      boxShadow: '0 2px 8px rgba(147,67,8,0.04)',
      height: '100%', boxSizing: 'border-box',
    }}>
      {children}
    </div>
  );
}

function Header({ period, onPeriodChange }: { period: RevenuePeriod; onPeriodChange: (p: RevenuePeriod) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <h3 style={{ fontWeight: 700, color: '#1F1F1F', fontSize: '0.95rem' }}>Revenue Overview</h3>
        <svg viewBox="0 0 24 24" fill="none" stroke="#A89688" strokeWidth="2" style={{ width: '14px', height: '14px', cursor: 'pointer' }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </div>
      <div style={{ position: 'relative' }}>
        <select
          value={period}
          onChange={e => onPeriodChange(e.target.value as RevenuePeriod)}
          style={{
            appearance: 'none',
            padding: '6px 28px 6px 10px', border: '1px solid #E9DED2', borderRadius: '8px',
            background: '#fff', fontSize: '0.78rem', color: '#77716B', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {PERIOD_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '12px', height: '12px', position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}
