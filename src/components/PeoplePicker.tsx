import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { DirectoryPerson, Role, User } from '../domain/types';
import { ROLE_SHORT } from '../domain/constants';
import { db, searchDirectory, userById } from '../data/store';
import { ensureProfile } from '../services/workflow';
import { Avatar, toast, useAction, useDebounced, useMe } from './ui';
import { BRAND } from '../brand';

/** A PPM profile, or a directory person who has no PPM profile yet. */
type Candidate = { key: string; user?: User; person?: DirectoryPerson };
const nameOf = (c: Candidate) => c.user?.name ?? c.person!.name;
const emailOf = (c: Candidate) => c.user?.email ?? c.person!.email;
const titleOf = (c: Candidate) => c.user?.title ?? c.person?.title;
const externalOf = (c: Candidate) => c.user?.external ?? c.person!.guest;

interface SearchOptions {
  roles?: Role[];
  includeExternal?: boolean;
  /** search the organization directory as well as PPM profiles */
  directory: boolean;
}

/**
 * PPM profiles that match the query, plus (from 2 characters) people in the organization directory
 * (Dataverse Users, synced from Entra ID) who have no PPM profile yet.
 */
function usePeopleSearch(query: string, open: boolean, { roles, includeExternal, directory }: SearchOptions) {
  const q = useDebounced(query.trim(), 250);
  const [found, setFound] = useState<{ q: string; people: DirectoryPerson[]; error?: boolean }>({ q: '', people: [] });
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const profiles: Candidate[] = db.users
    .filter((u) => u.active && (includeExternal || !u.external) && (!roles || roles.some((r) => u.roles.includes(r))))
    .filter((u) => {
      const words = [u.name, u.email, ...`${u.name} ${u.email}`.split(/[\s.@_,()-]+/)].map((w) => w.toLowerCase());
      return tokens.every((t) => words.some((w) => w.startsWith(t)));
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, tokens.length ? 20 : 50)
    .map((u) => ({ key: u.id, user: u }));
  const useDirectory = directory && open && q.length >= 2;

  useEffect(() => {
    if (!useDirectory) return;
    let live = true;
    searchDirectory(q)
      .then((people) => live && setFound({ q, people }))
      .catch(() => live && setFound({ q, people: [], error: true }));
    return () => void (live = false);
  }, [q, useDirectory]);

  const known = new Set(db.users.map((u) => u.email.toLowerCase()));
  const fresh: Candidate[] = useDirectory && found.q === q
    ? found.people.filter((p) => !known.has(p.email) && (includeExternal || !p.guest)).map((p) => ({ key: `dir:${p.email}`, person: p }))
    : [];
  const searching = useDirectory && (found.q !== q || q !== query.trim());
  return { profiles, fresh, searching, error: useDirectory && found.q === q && found.error };
}

/** Keeps the suggestion list next to its input even inside a scrolling dialog. */
function usePopoverPosition(anchor: React.RefObject<HTMLElement>, open: boolean) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(r.width, 300);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom;
      setStyle(below < 240 && r.top > below ? { left, width, bottom: window.innerHeight - r.top + 4 } : { left, width, top: r.bottom + 4 });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchor, open]);
  return style;
}

function PersonLine({ c }: { c: Candidate }) {
  const sub = [titleOf(c), emailOf(c)].filter(Boolean).join(' · ');
  return (
    <>
      <Avatar user={{ name: nameOf(c), external: externalOf(c) } as User} />
      <span className="pp-text">
        <span className="pp-name">{nameOf(c)}{externalOf(c) && <span className="muted"> (external)</span>}</span>
        <span className="pp-sub">{sub}</span>
      </span>
      {c.user && c.user.roles.length > 0 && <span className="pp-tag">{c.user.roles.map((r) => ROLE_SHORT[r]).join(', ')}</span>}
      {c.person && <span className="pp-tag" title={`Not in ${BRAND.appName} yet. Picking this person creates their PPM profile.`}>Directory</span>}
    </>
  );
}

interface ComboProps {
  inputRef: React.RefObject<HTMLInputElement>;
  anchorRef: React.RefObject<HTMLDivElement>;
  query: string;
  setQuery: (q: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  options: SearchOptions;
  onPick: (c: Candidate) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onBlur?: () => void;
  autoFocus?: boolean;
  /** free-text entry: show the list only when it has people to offer */
  quietWhenEmpty?: boolean;
}

/** Text input with a people suggestion list (WAI-ARIA combobox). */
function PeopleCombo({ inputRef, anchorRef, query, setQuery, open, setOpen, options, onPick, placeholder, ariaLabel, disabled, onBlur, autoFocus, quietWhenEmpty }: ComboProps) {
  const listId = useId();
  const [active, setActive] = useState(0);
  const { profiles, fresh, searching, error } = usePeopleSearch(query, open, options);
  const items = [...profiles, ...fresh];
  const style = usePopoverPosition(anchorRef, open);
  useEffect(() => setActive(0), [query]);

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (items.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
    } else if (e.key === 'Enter' && open && items[active]) {
      e.preventDefault();
      onPick(items[active]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation(); // keep the surrounding dialog open
      setOpen(false);
    }
  };

  const option = (c: Candidate, i: number) => (
    <div key={c.key} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={`pp-opt ${i === active ? 'active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => onPick(c)}>
      <PersonLine c={c} />
    </div>
  );
  const group = (label: string) => <div className="pp-group" role="presentation">{label}</div>;
  let status: ReactNode = null;
  if (searching) status = 'Searching the directory…';
  else if (error) status = `The directory search is unavailable. Showing ${BRAND.appName} profiles only.`;
  else if (!items.length) status = options.directory && query.trim().length < 2 ? 'Type a name or email address.' : 'No matching people.';
  const showList = open && !(quietWhenEmpty && !items.length && !searching);

  return (
    <>
      <input
        ref={inputRef}
        className="pp-input"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={key}
      />
      {showList && (
        <div className="pp-pop" style={style} id={listId} role="listbox" aria-label={ariaLabel} onMouseDown={(e) => e.preventDefault()}>
          {fresh.length > 0 && profiles.length > 0 && group(BRAND.appName)}
          {profiles.map(option)}
          {fresh.length > 0 && group('Organization directory')}
          {fresh.map((c, i) => option(c, profiles.length + i))}
          {status && <div className="pp-status" role="status">{status}</div>}
        </div>
      )}
    </>
  );
}

/** Returns the PPM profile for a candidate, creating one for a directory person on first use. */
async function profileFor(c: Candidate): Promise<User> {
  if (c.user) return c.user;
  const p = c.person!;
  const u = await ensureProfile(p.email, p.name, p.guest, p.title);
  toast(`${u.name} was added to ${BRAND.appName}`);
  return u;
}

/**
 * People picker for person fields (stored as a PPM user id). Searches PPM profiles and the organization
 * directory. A role-restricted field (e.g. Project Manager) only offers PPM profiles that hold the role.
 */
export function PeoplePicker({ value, onChange, roles, includeExternal = false, allowEmpty = true, disabled, placeholder = 'Search people…', ariaLabel }: { value?: string; onChange: (id: string) => void; roles?: Role[]; includeExternal?: boolean; allowEmpty?: boolean; disabled?: boolean; placeholder?: string; ariaLabel?: string }) {
  const me = useMe();
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { run, busy } = useAction();
  const selected = userById(value);

  const pick = async (c: Candidate) => {
    setOpen(false);
    const u = await run(() => profileFor(c));
    if (!u) return;
    onChange(u.id);
    setEditing(false);
    setQuery('');
    setTimeout(() => boxRef.current?.focus(), 0);
  };

  return (
    <div className="pp" ref={anchorRef}>
      {editing ? (
        <PeopleCombo
          inputRef={inputRef}
          anchorRef={anchorRef}
          query={query}
          setQuery={setQuery}
          open={open}
          setOpen={setOpen}
          options={{ roles, includeExternal, directory: !roles && !me.external }}
          onPick={pick}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          disabled={busy}
          autoFocus
          onBlur={() => !busy && (setEditing(false), setQuery(''))}
        />
      ) : (
        <button ref={boxRef} type="button" className="pp-box" disabled={disabled} aria-label={ariaLabel ? `${ariaLabel}: ${selected?.name ?? 'not assigned'}` : undefined} onClick={() => setEditing(true)}>
          {selected ? (
            <>
              <Avatar user={selected} />
              <span className="pp-text">
                <span className="pp-name">{selected.name}</span>
                <span className="pp-sub">{selected.title || selected.email}</span>
              </span>
            </>
          ) : (
            <span className="pp-placeholder">{disabled ? '—' : value ? 'Unknown person' : allowEmpty ? 'Not assigned' : placeholder}</span>
          )}
        </button>
      )}
      {!editing && !disabled && allowEmpty && value && (
        <button type="button" className="icon-btn pp-clear" title="Remove" aria-label="Remove person" onClick={() => onChange('')}><X size={14} /></button>
      )}
    </div>
  );
}

/**
 * Free-text name field (e.g. Stakeholder Name) with people suggestions. Picking a person fills the name and
 * hands back their email; typing a name that is not in the directory is still allowed. Editing the name of a
 * picked person calls `onUnpick`, so callers can clear the email that the pick filled in.
 */
export function PersonNameInput({ value, onChange, onPick, onUnpick, includeExternal = true, disabled, ariaLabel }: { value: string; onChange: (name: string) => void; onPick: (p: { name: string; email: string; title?: string; external: boolean }) => void; onUnpick?: () => void; includeExternal?: boolean; disabled?: boolean; ariaLabel?: string }) {
  const me = useMe();
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const picked = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const pick = (c: Candidate) => {
    setOpen(false);
    picked.current = nameOf(c);
    onPick({ name: nameOf(c), email: emailOf(c), title: titleOf(c), external: externalOf(c) });
  };
  const type = (name: string) => {
    onChange(name);
    if (picked.current !== null && name !== picked.current) {
      picked.current = null;
      onUnpick?.();
    }
  };
  return (
    <div className="pp" ref={anchorRef}>
      <PeopleCombo
        inputRef={inputRef}
        anchorRef={anchorRef}
        query={value}
        setQuery={type}
        open={open}
        setOpen={setOpen}
        options={{ includeExternal, directory: !me.external }}
        onPick={pick}
        placeholder="Type a name or pick a person"
        ariaLabel={ariaLabel}
        disabled={disabled}
        quietWhenEmpty
      />
    </div>
  );
}
