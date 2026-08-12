import { CheckCircle2, CircleX, CreditCard, PackageCheck, PackageOpen, Truck } from 'lucide-react';
import type { PurchaseDetail } from '../../types/purchases';
import { deriveOrderMilestones, type OrderMilestoneKey } from './orderMilestones';

const ICONS: Record<OrderMilestoneKey, typeof PackageCheck> = {
  placed: PackageCheck,
  payment: CreditCard,
  preparing: PackageOpen,
  shipped: Truck,
  final: CheckCircle2,
};

export default function OrderStatusTracker({ detail }: { detail: PurchaseDetail }) {
  const milestones = deriveOrderMilestones(detail);
  return <section className="order-tracker" aria-labelledby={`order-progress-${detail.id}`}>
    <h3 id={`order-progress-${detail.id}`}>Order progress</h3>
    <div className="order-tracker__scroll" tabIndex={0} aria-label="Scrollable order progress">
      <ol className="order-tracker__steps">
        {milestones.map((milestone, index) => {
          const Icon = milestone.state === 'cancelled' ? CircleX : ICONS[milestone.key];
          const stateLabel = milestone.state === 'complete' ? 'Completed'
            : milestone.state === 'current' ? 'Current status'
            : milestone.state === 'cancelled' ? 'Order cancelled'
            : 'Upcoming';
          return <li className={`order-tracker__step is-${milestone.state}`} key={milestone.key} aria-label={`${milestone.label}: ${stateLabel}`} aria-current={milestone.state === 'current' || milestone.state === 'cancelled' ? 'step' : undefined}>
            {index > 0 ? <span className="order-tracker__connector" aria-hidden="true" /> : null}
            <span className="order-tracker__icon" aria-hidden="true"><Icon size={20} strokeWidth={2.2} /></span>
            <strong>{milestone.label}</strong>
            <span className="order-tracker__state">{stateLabel}</span>
            {milestone.timestamp ? <time dateTime={milestone.timestamp}>{new Date(milestone.timestamp).toLocaleString()}</time> : null}
          </li>;
        })}
      </ol>
    </div>
  </section>;
}
