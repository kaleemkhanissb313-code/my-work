import type { RecurrenceRule } from '@/types/models'
import { Input, Select } from './ui'
import { describeRecurrence } from '@/lib/dates'
import { cn } from '@/lib/cn'

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function RecurrenceEditor({ value, onChange }: { value: RecurrenceRule | null; onChange: (r: RecurrenceRule | null) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Repeat" className="w-auto" value={value?.freq ?? 'none'}
          onChange={(e) => onChange(e.target.value === 'none' ? null : { interval: value?.interval ?? 1, until: value?.until ?? null, freq: e.target.value as RecurrenceRule['freq'] })}>
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </Select>
        {value && <>
          <span className="text-sm text-muted">every</span>
          <Input aria-label="Interval" type="number" min={1} max={365} className="w-20" value={value.interval}
            onChange={(e) => onChange({ ...value, interval: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
          <span className="text-sm text-muted">until</span>
          <Input aria-label="Repeat until" type="date" className="w-auto" value={value.until ?? ''} onChange={(e) => onChange({ ...value, until: e.target.value || null })} />
        </>}
      </div>
      {value?.freq === 'weekly' && (
        <div className="flex gap-1" role="group" aria-label="Repeat on days">
          {DAYS.map((d, i) => {
            const on = value.byWeekday?.includes(i)
            return (
              <button key={i} type="button" aria-pressed={on} aria-label={DAY_NAMES[i]}
                className={cn('h-8 w-8 rounded-lg border text-xs font-semibold', on ? 'border-accent bg-accent text-onaccent' : 'border-line text-muted')}
                onClick={() => onChange({ ...value, byWeekday: on ? value.byWeekday!.filter((x) => x !== i) : [...(value.byWeekday ?? []), i].sort() })}>{d}</button>
            )
          })}
        </div>
      )}
      {value && <p className="text-xs text-muted">{describeRecurrence(value)}</p>}
    </div>
  )
}
