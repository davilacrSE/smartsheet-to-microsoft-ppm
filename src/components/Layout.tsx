import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ClipboardCheck, FilePlus2, FolderKanban, Gauge, History, LayoutDashboard, Moon, Search, Settings, Sun, Users } from 'lucide-react';
import { ROLE_SHORT } from '../domain/constants';
import { fmtDateTime } from '../domain/calc';
import { dataMode, db, projectByCode, setActingUser, signedInUser } from '../data/store';
import { rememberPersona } from '../data/persona';
import { host } from '../host';
import { canSeeProject, hasRole, isAdmin, isPmo, isPmoDirector } from '../services/rules';
import { inboxCount } from '../pages/Approvals';
import { markNotificationsRead } from '../services/workflow';
import { audit } from '../services/events';
import { Avatar, BrandLogo, NdaBadge, StagePill, useDebounced, useMe, useStore } from './ui';
import { BRAND, DATAVERSE } from '../brand';

const RECENT_KEY = 'ppm-recent';
export function rememberRecent(code: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    localStorage.setItem(RECENT_KEY, JSON.stringify([code, ...list.filter((c) => c !== code)].slice(0, 8)));
  } catch {
    /* per-viewer convenience only */
  }
}
function recentCodes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function useTheme() {
  const [theme, setTheme] = useState<string>(() => {
    if (host.theme) return host.theme; // inside Teams, follow the Teams client theme
    try {
      return localStorage.getItem('ppm-theme') || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('ppm-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return { dark, toggle: () => setTheme(dark ? 'light' : 'dark') };
}

export function Layout({ children }: { children: ReactNode }) {
  useStore();
  const me = useMe();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 120);
  const [showNotes, setShowNotes] = useState(false);
  const [showPersona, setShowPersona] = useState(false);
  const { dark, toggle } = useTheme();
  const real = signedInUser();
  const impersonating = dataMode() === 'dataverse' && real && real.id !== me.id;
  const canSwitch = dataMode() === 'mock' || (real && isAdmin(real));

  useEffect(() => {
    setQ('');
  }, [loc.pathname]);

  // SEC-FR-013: search only ever returns projects the user can see.
  const results = useMemo(() => {
    const n = dq.trim().toLowerCase();
    if (n.length < 2) return [];
    return db.projects
      .filter((p) => canSeeProject(me, p))
      .filter((p) => [p.code, p.name, p.ndaCodename, p.businessArea, p.pillar].some((s) => s?.toLowerCase().includes(n)))
      .slice(0, 12);
  }, [dq, me, db.projects.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const myNotes = db.notifications
    .filter((n) => n.userId === me.id && (!n.projectId || (db.projects.find((p) => p.id === n.projectId) && canSeeProject(me, db.projects.find((p) => p.id === n.projectId)!))))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const unread = myNotes.filter((n) => !n.read).length;
  const recent = recentCodes().map(projectByCode).filter((p) => p && canSeeProject(me, p)).slice(0, 5);
  const inbox = inboxCount(me);

  const links: { to: string; label: string; icon: ReactNode; show?: boolean; count?: number }[] = [
    { to: '/', label: 'Portfolio', icon: <LayoutDashboard size={18} /> },
    { to: '/projects', label: 'Projects', icon: <FolderKanban size={18} /> },
    { to: '/intake/new', label: 'New Intake', icon: <FilePlus2 size={18} />, show: hasRole(me, 'BRM') },
    { to: '/approvals', label: 'My Approvals', icon: <ClipboardCheck size={18} />, show: !me.external, count: inbox },
    { to: '/resources', label: 'Resource Capacity', icon: <Users size={18} />, show: !me.external },
    { to: '/reports', label: 'Reports', icon: <Gauge size={18} />, show: !me.external },
    { to: '/audit', label: 'Audit Log', icon: <History size={18} />, show: isPmo(me) || isAdmin(me) },
    { to: '/admin', label: 'Administration', icon: <Settings size={18} />, show: isAdmin(me) || isPmoDirector(me) },
  ];

  const switchTo = async (id: string) => {
    setShowPersona(false);
    if (dataMode() === 'mock') rememberPersona(id);
    else await audit({ action: 'TEST_AS_PERSONA', entity: 'PPM User', entityId: id, details: `Administrator testing as ${db.users.find((u) => u.id === id)?.email}` }, real!);
    setActingUser(id);
    nav('/');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandLogo size={26} />
          <small>{BRAND.tagline}</small>
        </div>
        <nav aria-label="Main">
          {links.filter((l) => l.show !== false).map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}>
              {l.icon}
              <span>{l.label}</span>
              {!!l.count && <span className="count">{l.count}</span>}
            </NavLink>
          ))}
        </nav>
        {recent.length > 0 && (
          <>
            <div className="section-label">Recent</div>
            <nav className="recent" aria-label="Recent projects">
              {recent.map((p) => (
                <NavLink key={p!.id} to={`/projects/${p!.code}`}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p!.ndaActive ? p!.ndaCodename || p!.code : p!.name}</span>
                </NavLink>
              ))}
            </nav>
          </>
        )}
        <div className="foot">
          {dataMode() === 'dataverse' ? `Data: Microsoft Dataverse · ${DATAVERSE.solution.uniqueName} solution` : 'Demo · sample data in this browser'}
        </div>
      </aside>
      <div className="main">
        {impersonating && (
          <div className="mode-banner">Testing as <b>{me.name}</b> ({me.roles.map((r) => ROLE_SHORT[r]).join(', ')}). Dataverse security still applies to your own account. <button className="btn sm" onClick={() => switchTo(real!.id)}>Stop testing</button></div>
        )}
        <header className="topbar">
          <div className="search">
            <Search size={16} />
            <input type="search" placeholder="Search projects by ID, name, business, pillar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search projects" />
            {results.length > 0 && (
              <div className="search-results">
                {results.map((p) => (
                  <a key={p.id} href={`#/projects/${p.code}`} onClick={() => setQ('')}>
                    <div className="row"><b className="num">{p.code}</b> {p.name} <NdaBadge p={p} /></div>
                    <div className="row small muted"><StagePill stage={p.stage} /> {p.businessArea} · {p.pillar}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="spacer" />
          <button className="icon-btn" title={dark ? 'Light theme' : 'Dark theme'} onClick={toggle} aria-label="Toggle theme">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icon-btn" aria-label={`Notifications (${unread} unread)`} onClick={() => setShowNotes(true)}>
            <Bell size={18} />
            {unread > 0 && <span className="dot">{unread}</span>}
          </button>
          <div style={{ position: 'relative' }}>
            <button className="persona" onClick={() => canSwitch && setShowPersona((x) => !x)} aria-haspopup={canSwitch ? 'menu' : undefined}>
              <Avatar user={me} />
              <span style={{ textAlign: 'left', lineHeight: 1.15 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{me.name}</span>
                <span className="small muted">{me.roles.map((r) => ROLE_SHORT[r]).join(' · ') || 'No roles'}</span>
              </span>
              {canSwitch && <ChevronDown size={14} />}
            </button>
            {showPersona && <PersonaMenu onPick={switchTo} onClose={() => setShowPersona(false)} />}
          </div>
        </header>
        {dataMode() === 'mock' && <div className="mode-banner">Demo with sample data stored in your browser. Switch personas (top right) to see each role's view. The deployed app reads and writes Microsoft Dataverse.</div>}
        <main className="content">{children}</main>
      </div>
      {showNotes && (
        <>
          <div className="overlay" style={{ background: 'transparent' }} onClick={() => setShowNotes(false)} />
          <aside className="drawer" aria-label="Notifications">
            <div className="modal-head">
              <h2>Notifications</h2>
              {unread > 0 && <button className="btn sm" onClick={() => markNotificationsRead(myNotes.filter((n) => !n.read).map((n) => n.id))}>Mark all read</button>}
              <button className="btn sm" onClick={() => setShowNotes(false)}>Close</button>
            </div>
            <div className="list">
              {myNotes.length === 0 && <div className="empty">No notifications.</div>}
              {myNotes.slice(0, 60).map((n) => (
                <div key={n.id} className="note" onClick={() => { void markNotificationsRead([n.id]); setShowNotes(false); if (n.link) nav(n.link); }}>
                  <span className={n.read ? '' : 'unread'} />
                  <div>
                    <div style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                    <div className="small muted">{n.body}</div>
                    <div className="small muted">{fmtDateTime(n.sentAt)} · {n.channels.length ? `also via ${n.channels.join(' & ')}` : 'in-app'}</div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function PersonaMenu({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    setTimeout(() => window.addEventListener('mousedown', h), 0);
    return () => window.removeEventListener('mousedown', h);
  }, [onClose]);
  const users = [...db.users].filter((u) => u.active).sort((a, b) => Number(a.external) - Number(b.external) || a.name.localeCompare(b.name));
  return (
    <div className="menu" ref={ref} role="menu">
      <div className="small muted" style={{ padding: '10px 12px' }}>{dataMode() === 'mock' ? 'View the app as…' : 'Test as another PPM user (administrators only, audited)'}</div>
      {users.map((u) => (
        <button key={u.id} role="menuitem" onClick={() => onPick(u.id)}>
          <Avatar user={u} />
          <span>
            <span style={{ display: 'block', fontWeight: 600 }}>{u.name}</span>
            <span className="small muted">{u.roles.map((r) => ROLE_SHORT[r]).join(', ')}{u.title ? ` · ${u.title}` : ''}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
