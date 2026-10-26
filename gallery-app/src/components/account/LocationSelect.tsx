import { useId, useState } from 'react';
import type { AddressPlace } from '../../lib/profileAddress';

export default function LocationSelect({ label, value, options, disabled, onChange }: {
  label: string; value: AddressPlace | null; options: AddressPlace[]; disabled?: boolean;
  onChange: (place: AddressPlace) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const filtered = options.filter(p => fold(p.name).includes(fold(query)));
  function choose(place: AddressPlace) { onChange(place); setOpen(false); setQuery(''); }
  return <div className="profile-location-select" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>{label}</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
      aria-activedescendant={open && filtered[active] ? `${id}-${filtered[active].code}` : undefined}
      autoComplete="off" disabled={disabled} placeholder={`Search ${label.toLowerCase()}`}
      value={open ? query : value?.name || ''}
      onFocus={() => { setOpen(true); setQuery(''); setActive(0); }}
      onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true);
          setActive(i => Math.max(0, Math.min(filtered.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1))));
        }
        if (event.key === 'Enter' && open) { event.preventDefault(); if (filtered[active]) choose(filtered[active]); }
      }} />
    {open && !disabled && <ul id={`${id}-list`} role="listbox" aria-label={label}>
      {filtered.map((p, index) => <li key={p.code} id={`${id}-${p.code}`} role="option" aria-selected={value?.code === p.code}
        className={index === active ? 'is-active' : ''} onMouseDown={event => event.preventDefault()} onClick={() => choose(p)}>{p.name}</li>)}
      {!filtered.length && <li role="presentation">No matching locations</li>}
    </ul>}
  </div>;
}
