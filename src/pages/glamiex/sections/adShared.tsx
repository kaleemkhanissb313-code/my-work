import { Field, Input, Select } from '@/components/ui'

export const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'CAD', 'AUD']
export const PLATFORMS = ['YouTube', 'Google AdSense', 'Facebook / Meta', 'Instagram', 'TikTok', 'Google Ads', 'Snapchat', 'X / Twitter', 'Daraz', 'Website', 'Other']

/** Currency + exchange-rate inputs; the rate is required for non-PKR amounts. */
export function CurrencyRate({ currency, rate, onCurrency, onRate, idPrefix }: { currency: string; rate: string; onCurrency: (c: string) => void; onRate: (r: string) => void; idPrefix: string }) {
  return <>
    <Field label="Currency" htmlFor={`${idPrefix}-cur`}><Select id={`${idPrefix}-cur`} value={currency} onChange={(e) => { onCurrency(e.target.value); if (e.target.value === 'PKR') onRate('1') }}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
    {currency !== 'PKR' && <Field label={`Exchange rate (1 ${currency} = ? PKR)`} htmlFor={`${idPrefix}-rate`} hint="Use the rate actually received / charged">
      <Input id={`${idPrefix}-rate`} inputMode="decimal" value={rate} onChange={(e) => onRate(e.target.value.replace(/[^\d.]/g, ''))} />
    </Field>}
  </>
}
export const validRate = (currency: string, rate: string) => currency === 'PKR' || (Number(rate) > 0 && Number.isFinite(Number(rate)))
