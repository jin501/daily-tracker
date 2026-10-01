'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/lib/categories';

type Props = {
  movement: { id: number; name: string; category: Category };
  variations: { id: number; name: string }[];
  others: { id: number; name: string }[];
};

/** Fix how an exercise is grouped: rename the core movement, change its category, or move a variation elsewhere. */
export default function MovementEditor({ movement, variations, others }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(movement.name);
  const [category, setCategory] = useState<Category>(movement.category);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function post(body: object, goTo?: (id: number) => string) {
    setMsg(null);
    const res = await fetch('/api/movements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(json.error ?? 'Saving failed');
    setMsg('Saved.');
    start(() => (goTo ? router.push(goTo(json.movementId)) : router.refresh()));
  }

  async function move(exerciseId: number, value: string) {
    let target = value;
    if (value === '__new') {
      const n = prompt('New movement name');
      if (!n?.trim()) return;
      target = n.trim();
    }
    await post({ exerciseId, movementName: target }, (id) => `/lifts?m=${id}&v=${exerciseId}`);
  }

  if (!open) {
    return (
      <button type="button" className="linkbtn" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start', padding: '0 6px' }}>
        Wrong grouping or category? Edit
      </button>
    );
  }

  const changed = name.trim() !== movement.name || category !== movement.category;
  return (
    <section className="card" aria-label="Edit movement">
      <div className="row" style={{ paddingBottom: 8 }}>
        <h2 className="h2">Edit {movement.name}</h2>
        <button type="button" className="x" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>
      <label className="field">
        <span>Core name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 170, textAlign: 'left' }} />
      </label>
      <label className="field">
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="tag" style={{ minHeight: 38, background: 'var(--pale)' }}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </label>
      <div className="actions" style={{ padding: '10px 0' }}>
        <button type="button" className="btn btn-dark" disabled={!changed || !name.trim() || pending}
          onClick={() => post({ id: movement.id, name: name.trim(), category }, (id) => `/lifts?m=${id}`)}>
          Save
        </button>
      </div>
      <p className="small muted" style={{ margin: '0 0 4px' }}>Renaming to an existing movement merges them.</p>
      {variations.map((v) => (
        <label className="field" key={v.id}>
          <span style={{ minWidth: 0 }}>{v.name}</span>
          <select className="tag" style={{ minHeight: 38, background: 'var(--pale)', maxWidth: 170 }} value="" onChange={(e) => e.target.value && move(v.id, e.target.value)} aria-label={`Move ${v.name}`}>
            <option value="">Move to…</option>
            {others.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
            <option value="__new">New movement…</option>
          </select>
        </label>
      ))}
      {msg && <div className="small muted" role="status" style={{ paddingTop: 6 }}>{msg}</div>}
    </section>
  );
}
