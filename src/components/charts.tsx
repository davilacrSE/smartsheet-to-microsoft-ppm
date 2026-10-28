import { CircleCheck, CircleAlert, CircleHelp } from 'lucide-react';
import { fmtMoney, monthLabel } from '../domain/calc';
import type { TeamRow } from '../services/rcp';
import { utilization } from '../services/rcp';
import { useTip } from './ui';

/** Single-series horizontal bars (one hue, title names the series — no legend). */
export function HBarList({ data, onSelect }: { data: { label: string; value: number }[]; onSelect?: (label: string) => void }) {
  const { handlers, node } = useTip();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      {data.map((d) => (
        <div key={d.label} className="hbar" style={{ cursor: onSelect ? 'pointer' : undefined }} onClick={() => onSelect?.(d.label)} {...handlers(`${d.label}: ${d.value} project${d.value === 1 ? '' : 's'}`)}>
          <span className="lbl">{d.label}</span>
          <span className="track">{d.value > 0 && <span className="fill" style={{ width: `${(d.value / max) * 100}%`, display: 'block' }} />}</span>
          <span className="val">{d.value}</span>
        </div>
      ))}
      {node}
    </div>
  );
}

const STATUS_FILL: Record<string, string> = { Green: 'var(--good)', Yellow: 'var(--warn)', Red: 'var(--crit)', 'Not reported': 'var(--border-strong)' };
const STATUS_ICON: Record<string, typeof CircleCheck> = { Green: CircleCheck, Red: CircleAlert, Yellow: CircleAlert, 'Not reported': CircleHelp };

/** Status distribution: status colors always paired with icon + label. */
export function StatusStack({ data }: { data: { health: string; count: number }[] }) {
  const { handlers, node } = useTip();
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  return (
    <div className="stack">
      <div className="stackbar" role="img" aria-label={data.map((d) => `${d.health}: ${d.count}`).join(', ')}>
        {data.filter((d) => d.count).map((d) => (
          <span key={d.health} style={{ width: `${(d.count / total) * 100}%`, background: STATUS_FILL[d.health] }} {...handlers(`${d.health}: ${d.count} project(s)`)} />
        ))}
      </div>
      <div className="legend">
        {data.map((d) => {
          const Icon = STATUS_ICON[d.health];
          return (
            <span key={d.health} className="row" style={{ gap: 6 }}>
              <Icon size={14} color={STATUS_FILL[d.health]} />
              <b className="num">{d.count}</b> {d.health === 'Red' ? 'Red (any Red/Yellow component)' : d.health}
            </span>
          );
        })}
      </div>
      {node}
    </div>
  );
}

/** Grouped columns for ≤ 3 series (validated slots s1–s3), legend + value table for accessibility. */
export function GroupedColumns({ groups, series }: { groups: { label: string; values: number[] }[]; series: { name: string; color: string }[] }) {
  const { handlers, node } = useTip();
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const ticks = [0.5, 1].map((f) => top * f);
  return (
    <div className="stack">
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
        ))}
      </div>
      <div style={{ paddingLeft: 40 }}>
        <div className="cols">
          {ticks.map((t) => (
            <div key={t} className="gridline" style={{ bottom: `${(t / top) * 100}%` }}><span style={{ left: -40 }}>{fmtMoney(t, true)}</span></div>
          ))}
          {groups.map((g) => (
            <div key={g.label} className="grp">
              {g.values.map((v, i) => (
                <div key={i} className="bar" style={{ height: `${(v / top) * 100}%`, background: series[i].color }} {...handlers(`${g.label}\n${series[i].name}: ${fmtMoney(v)}`)} />
              ))}
            </div>
          ))}
        </div>
        <div className="cols-labels">{groups.map((g) => <span key={g.label} title={g.label}>{g.label}</span>)}</div>
      </div>
      {node}
    </div>
  );
}

const heatColor = (u: number) => (u <= 0 ? 'var(--seq-0)' : u < 0.5 ? 'var(--seq-1)' : u < 0.75 ? 'var(--seq-2)' : u < 0.9 ? 'var(--seq-3)' : u <= 1 ? 'var(--seq-4)' : 'var(--seq-5)');
const heatInk = (u: number) => (u >= 0.75 ? 'var(--on-seq-hi)' : 'var(--text)');

/** Capacity heatmap: sequential teal by utilization; over-allocation (>100%) gets a red ring + bold label. */
export function CapacityHeatmap({ months, teams, compare, onCell }: { months: string[]; teams: TeamRow[]; compare?: TeamRow[]; onCell?: (team: TeamRow, month: string) => void }) {
  const { handlers, node } = useTip();
  return (
    <div className="table-wrap">
      <table className="heat">
        <thead>
          <tr>
            <th className="team">Team</th>
            {months.map((m) => <th key={m}>{monthLabel(m)}</th>)}
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => {
            const base = compare?.find((b) => b.id === t.id);
            return (
              <tr key={t.id}>
                <td className="team">{t.name}<div className="small muted">{t.pillar}</div></td>
                {months.map((m) => {
                  const u = utilization(t, m);
                  const pctTxt = isFinite(u) ? `${Math.round(u * 100)}%` : '∞';
                  const delta = base ? Math.round((utilization(t, m) - utilization(base, m)) * 100) : 0;
                  const tip = `${t.name} · ${monthLabel(m)}\nCapacity ${Math.round(t.capacity[m] || 0)} h\nConfirmed ${Math.round(t.confirmed[m] || 0)} h · Pending ${Math.round(t.pending[m] || 0)} h · Gap ${Math.round(t.gap[m] || 0)} h\nUtilization ${pctTxt}${base ? `\nvs official plan: ${delta >= 0 ? '+' : ''}${delta} pts` : ''}`;
                  return (
                    <td key={m} className={u > 1 ? 'over' : ''} style={{ background: heatColor(u), color: heatInk(u), cursor: onCell ? 'pointer' : undefined }} onClick={() => onCell?.(t, m)} {...handlers(tip)}>
                      {t.demand[m] ? pctTxt : '–'}
                      {base && delta !== 0 && <div style={{ fontSize: 10, opacity: 0.9 }}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</div>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="legend mt">
        <span><i style={{ background: 'var(--seq-1)' }} />&lt; 50%</span>
        <span><i style={{ background: 'var(--seq-2)' }} />50–75%</span>
        <span><i style={{ background: 'var(--seq-3)' }} />75–90%</span>
        <span><i style={{ background: 'var(--seq-4)' }} />90–100%</span>
        <span><i style={{ background: 'var(--seq-5)', boxShadow: 'inset 0 0 0 2px var(--crit)' }} />Over capacity</span>
      </div>
      {node}
    </div>
  );
}
