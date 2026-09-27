import type { RawSms } from '../types';

export const T0 = new Date(2026, 8, 15, 10, 0).getTime();
export const MIN = 60_000;
export const DAY = 86_400_000;

let n = 0;
export const sms = (body: string, extra: Partial<RawSms> = {}): RawSms => ({
  id: extra.id ?? `m${++n}`,
  address: 'VM-HDFCBK',
  date: T0,
  body,
  ...extra,
});
