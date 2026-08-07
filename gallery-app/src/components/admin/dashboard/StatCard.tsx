import { motion } from 'framer-motion';

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  sub?: string;
  index?: number;
}

export default function StatCard({ label, value, icon, trend, trendUp = true, sub, index = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(147,67,8,0.1)' }}
      style={{
        background: '#fff',
        border: '1px solid #E9DED2',
        borderRadius: '14px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(147,67,8,0.04)',
        cursor: 'default',
        transition: 'box-shadow 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: '#F8EFE5', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid #E9DED2',
        }}>
          {icon}
        </div>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#77716B', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
          {label}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1F1F1F', lineHeight: 1 }}>
          {value}
        </span>
        {trend && (
          <span style={{
            fontSize: '0.72rem', fontWeight: 700,
            color: trendUp ? '#16A34A' : '#DC2626',
            background: trendUp ? '#F0FDF4' : '#FEF2F2',
            padding: '2px 7px', borderRadius: '999px',
          }}>
            {trendUp ? '\u2191' : '\u2193'} {trend}
          </span>
        )}
      </div>
      <span style={{ fontSize: '0.75rem', color: '#A89688' }}>{sub}</span>
    </motion.div>
  );
}