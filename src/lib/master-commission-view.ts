import { formatOrderChannelFeeRule } from './order-channel-fees-view.ts';

export function formatCommissionRule(type: string, value: number): string {
  return formatOrderChannelFeeRule(type, value);
}
