import {
  readDispatchMetaFromRemarks,
} from './rider-dispatch-meta.ts';
import {
  readRiderDispatchOrderCourierPhone,
  readRiderDispatchOrderRemarksJson,
} from './rider-dispatch-state.ts';
import { resolveRiderDashboardActionState } from './rider-dispatch-dashboard-action-state.ts';

export { resolveRiderDashboardActionState } from './rider-dispatch-dashboard-action-state.ts';

export function resolveRiderUnifiedStatus(input: {
  status?: string | null;
  remarksJson?: string | null;
  remarks_json?: string | null;
  courierPhone?: string | null;
  courier_phone?: string | null;
}, rider: {
  riderId?: string | null;
  riderPhone?: string | null;
  nowIso?: string;
}): {
  statusLabel: string;
  primaryAction: string;
  secondaryAction: string;
  acceptedAt: string;
  pickedUpAt: string;
  completedAt: string;
} {
  const status = String(input.status || '').trim();
  const remarksJson = readRiderDispatchOrderRemarksJson(input);
  const meta = readDispatchMetaFromRemarks(remarksJson);
  const effectiveStatus = meta.completedAt
    ? 'completed'
    : (status === 'picked_up' || (status === 'delivering' && !!meta.pickedUpAt))
      ? 'picked_up'
      : status;
  const state = resolveRiderDashboardActionState({
    order: {
      status: effectiveStatus,
      remarksJson,
      courierPhone: readRiderDispatchOrderCourierPhone(input),
    },
    riderId: rider.riderId,
    riderPhone: rider.riderPhone,
    nowIso: rider.nowIso,
  });

  if (effectiveStatus === 'awaiting_courier') {
    return {
      statusLabel: '待接单',
      primaryAction: state.canAccept ? '接单' : '',
      secondaryAction: state.canDecline ? '暂不接单' : '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  if (effectiveStatus === 'delivering') {
    return {
      statusLabel: '待取餐',
      primaryAction: state.canPickUp ? '取餐' : '',
      secondaryAction: '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  if (effectiveStatus === 'picked_up') {
    return {
      statusLabel: '配送中',
      primaryAction: state.canComplete ? '送达' : '',
      secondaryAction: '',
      acceptedAt: meta.acceptedAt,
      pickedUpAt: meta.pickedUpAt,
      completedAt: meta.completedAt,
    };
  }

  return {
    statusLabel: '已送达',
    primaryAction: '',
    secondaryAction: '',
    acceptedAt: meta.acceptedAt,
    pickedUpAt: meta.pickedUpAt,
    completedAt: meta.completedAt,
  };
}
