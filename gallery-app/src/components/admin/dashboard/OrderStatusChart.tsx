import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const COLORS: Record<string, string> = {
  Pending: '#F59E0B',
  Preparing: '#3B82F6',
  Shipped: '#8B5CF6',
  Delivered: '#10B981',
  Cancelled: '#EF4444',
};
const ORDER = ['Pending', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'];

interface OrderStatusChartProps {
  data: { name: string; value: number; color: string }[];
  total: number;
  updatedAt?: Date;
}

function formatUpdated(d?: Date) {
  const date = d || new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hh}:${m} ${ampm}`;
}

export default function OrderStatusChart({ data, total, updatedAt }: OrderStatusChartProps) {
  const rows = ORDER.map(name => {
    const found = (data || []).find(d => d.name === name);
    return { name, value: found?.value ?? 0, color: COLORS[name] };
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#fff', borderRadius: '14px', padding: '20px 22px',
      border: '1px solid #E9DED2',
      boxShadow: '0 2px 8px rgba(147,67,8,0.04)',
      height: '100%', boxSizing: 'border-box',
    }}>
      <h3 style={{ fontWeight: 700, color: '#1F1F1F', fontSize: '0.95rem', marginBottom: '16px' }}>Order Status</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(150px, 0.9fr) minmax(180px, 1.1fr)',
        alignItems: 'center',
        gap: '24px',
        flex: 1,
      }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '170px', aspectRatio: '1/1', justifySelf: 'center' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                cx="50%"
                cy="50%"
                innerRadius="68%"
                outerRadius="96%"
                paddingAngle={2}
                cornerRadius={6}
                dataKey="value"
                stroke="none"
              >
                {rows.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
            <p style={{ fontSize: '1.55rem', fontWeight: 700, color: '#1F1F1F', lineHeight: 1 }}>{total}</p>
            <p style={{ fontSize: '0.75rem', color: '#A89688', marginTop: '3px' }}>Total Orders</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 32px 58px', columnGap: '14px', rowGap: '8px', alignItems: 'center', minWidth: 0 }}>
          {rows.map((item, i) => {
            const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0';
            return (
              <div key={i} style={{ display: 'contents' }}>
                {i > 0 && <span style={{ gridColumn: '1 / -1', height: '1px', background: '#F0EAE1' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', color: '#1F1F1F', whiteSpace: 'nowrap' }}>{item.name}</span>
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1F1F1F', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
                <span style={{ fontSize: '0.75rem', color: '#A89688', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
      <p style={{ fontSize: '0.75rem', color: '#A89688', margin: '12px 0 0', alignSelf: 'flex-end' }}>
        Updated: {formatUpdated(updatedAt ? new Date(updatedAt) : undefined)}
      </p>
    </div>
  );
}