import CardDelete from './CardDelete';
import { CATEGORY_LABEL, CATEGORY_TONE } from '@/lib/categories';
import { activityEmoji, num, setLabel } from '@/lib/format';
import type { ActivityRow, SetRow, TrainingCard } from '@/lib/queries';
import type { WUnit } from '@/lib/units';

const TONE_CLASS = { purple: 't-purple', abs: 't-abs', act: 't-act' } as const;

function Sets({ sets, unit, start = 0 }: { sets: SetRow[]; unit: WUnit; start?: number }) {
  return (
    <>
      {sets.map((s, i) => (
        <span key={s.id} style={{ display: 'contents' }}>
          <span className="n">{start + i + 1}</span>
          <span>{setLabel(s, unit)}</span>
        </span>
      ))}
    </>
  );
}

const weighted = (sets: SetRow[]) => sets.some((s) => s.weight_kg != null && s.reps != null);

/**
 * One card per core movement (or superset) for the day, then activities.
 * One or two cards sit side by side; more fill two rows and scroll sideways.
 */
export default function TrainingCards({ date, cards, activities, unit }: { date: string; cards: TrainingCard[]; activities: ActivityRow[]; unit: WUnit }) {
  const total = cards.length + activities.length;
  if (!total) return null;
  const rows = total <= 2 ? 1 : 2;
  const cols = Math.ceil(total / rows);
  const style = { '--rows': rows, '--colw': cols > 2 ? 'calc(50% - 26px)' : 'calc(50% - 5px)' } as React.CSSProperties;

  return (
    <>
      <div className="tscroll" style={style}>
        {cards.map((c) => {
          if (c.kind === 'exercise') {
            const variations = c.groups.map((g) => g.variation).filter((v) => v.toLowerCase() !== c.movement.toLowerCase());
            const allSets = c.groups.flatMap((g) => g.sets);
            let n = 0;
            return (
              <article key={c.key} className={`xcard ${TONE_CLASS[CATEGORY_TONE[c.category]]}`}>
                <div className="top">
                  <span className="label">{CATEGORY_LABEL[c.category]}</span>
                  <CardDelete target={{ date, movement: c.movement }} label={`${c.movement} for this day`} />
                </div>
                <h3 className="ttl">{c.movement}</h3>
                {variations.length > 0 && c.groups.length === 1 && <div className="sub">{variations[0]}</div>}
                <div className="count">{c.setCount} set{c.setCount === 1 ? '' : 's'}{weighted(allSets) ? ` · ${unit}` : ''}</div>
                <div className="setlist">
                  {c.groups.length === 1 ? (
                    <Sets sets={c.groups[0].sets} unit={unit} />
                  ) : (
                    c.groups.map((g) => {
                      const start = n;
                      n += g.sets.length;
                      return (
                        <span key={g.variation} style={{ display: 'contents' }}>
                          <span className="vg">{g.variation}</span>
                          <Sets sets={g.sets} unit={unit} start={start} />
                        </span>
                      );
                    })
                  )}
                </div>
              </article>
            );
          }
          const names = [...new Set(c.members.map((m) => m.movement))];
          const allSets = c.members.flatMap((m) => m.sets);
          return (
            <article key={c.key} className={`xcard ${TONE_CLASS[CATEGORY_TONE[c.category]]}`}>
              <div className="top">
                <span className="label">Superset</span>
                <CardDelete target={{ workoutId: c.workoutId, letter: c.letter }} label="this superset" />
              </div>
              <h3 className="ttl">{names.join(' + ')}</h3>
              <div className="count">{c.setCount} sets{weighted(allSets) ? ` · ${unit}` : ''}</div>
              <div className="setlist">
                {c.members.map((m) => (
                  <span key={m.variation} style={{ display: 'contents' }}>
                    <span className="vg">{m.variation}</span>
                    <Sets sets={m.sets} unit={unit} />
                  </span>
                ))}
              </div>
            </article>
          );
        })}
        {activities.map((a) => (
          <article key={`a${a.id}`} className="xcard t-act">
            <div className="top">
              <span className="label">Activity</span>
              <CardDelete target={{ activityId: a.id }} label={a.name} />
            </div>
            <h3 className="ttl">{activityEmoji(a.name)} {a.name}</h3>
            <div className="sub">
              {[a.duration_min != null ? `${a.duration_min} min` : null, a.distance_km != null ? `${num(a.distance_km)} km` : null].filter(Boolean).join(' · ') || 'Logged'}
            </div>
            {a.notes && <div className="sub">{a.notes}</div>}
          </article>
        ))}
      </div>
      {cols > 2 && <div className="scrollhint">Swipe for more →</div>}
    </>
  );
}
