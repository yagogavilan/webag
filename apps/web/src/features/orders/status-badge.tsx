import { CheckCircle, Clock, Hourglass, Package, Storefront, Truck, XCircle } from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import { Badge } from '@/components/ui';
import type { OrderStatus } from '@/lib/api/orders';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '@/lib/orders/status';

type IconType = ComponentType<{ size?: number; weight?: 'regular' | 'fill'; 'aria-hidden'?: boolean | 'true' }>;

const ICON: Record<OrderStatus, IconType> = {
  awaiting_payment: Clock,
  received: Hourglass,
  accepted: CheckCircle,
  in_preparation: Package,
  ready_for_collection: Package,
  out_for_delivery: Truck,
  ready_for_pickup: Storefront,
  delivered: CheckCircle,
  cancelled: XCircle,
  refused: XCircle,
  expired: Clock,
};

/** StatusBadge do pedido (design-system.md): ícone + texto, nunca só cor. */
export function OrderStatusBadge({ status, testId, label }: { status: OrderStatus; testId?: string; label?: string }) {
  const Icon = ICON[status];
  return (
    <Badge tone={ORDER_STATUS_TONE[status]} icon={<Icon size={16} weight={status === 'delivered' ? 'fill' : 'regular'} aria-hidden="true" />} testId={testId}>
      {label ?? ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Selo de tipo: Entrega ou Retirada. */
export function ModeBadge({ mode }: { mode: 'delivery' | 'pickup' }) {
  const Icon = mode === 'delivery' ? Truck : Storefront;
  return (
    <Badge tone="neutral" icon={<Icon size={16} aria-hidden="true" />}>
      {mode === 'delivery' ? 'Entrega' : 'Retirada'}
    </Badge>
  );
}
