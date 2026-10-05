import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { request, ApiError } from './api/client.js';
import { drawWorld } from './ui/worldRenderer.js';
import type { User, ProgrammingState, WorldResponse } from '../../shared/src/types/api.js';
import './style.css';

function MapView({ world }: { world: WorldResponse | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!world || !canvas.current) return;
    const cells = new Map(world.cells.map(cell => [`${cell.x},${cell.y}`, cell]));
    const context = canvas.current.getContext('2d');
    if (context) drawWorld(context, { width: world.width, height: world.height, getCell: (x, y) => cells.get(`${x},${y}`) ?? null },
      { canSee: (x, y) => cells.get(`${x},${y}`)?.visible ?? false, hasExplored: (x, y) => cells.get(`${x},${y}`)?.explored ?? false });
  }, [world]);
  return <div className="map"><canvas ref={canvas} width={(world?.width ?? 30) * 16} height={(world?.height ?? 20) * 16} aria-label="World as seen by your selected entity"/></div>;
}

function App() {
  const [user, setUser] = useState<User | null>(null), [register, setRegister] = useState(false);
  const [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [programming, setProgramming] = useState<ProgrammingState | null>(null), [world, setWorld] = useState<WorldResponse | null>(null);
  const [selected, setSelected] = useState(''), [name, setName] = useState('Scout');
  const [script, setScript] = useState('OTHERWISE\n    EXPLORE'), [zombieScript, setZombieScript] = useState('OTHERWISE\n    WANDER');
  const [connection, setConnection] = useState('Connecting…');
  function clearSession() { setUser(null); setProgramming(null); setWorld(null); setSelected(''); setScript('OTHERWISE\n    EXPLORE'); setZombieScript('OTHERWISE\n    WANDER'); }
  function failure(error: unknown) {
    if (error instanceof ApiError && error.status === 401) clearSession();
    setMessage(error instanceof Error ? error.message : 'Request failed.');
  }
  useEffect(() => {
    const controller = new AbortController();
    void request<User>('/me', 'GET', undefined, controller.signal).then(setUser).catch(error => {
      if (!controller.signal.aborted && !(error instanceof ApiError && error.status === 401)) failure(error);
    }).finally(() => setChecking(false));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = 1000;
      try {
        const [p, w] = await Promise.all([
          request<ProgrammingState>('/programming', 'GET', undefined, controller.signal),
          request<WorldResponse>(`/world${selected ? `?entity=${encodeURIComponent(selected)}` : ''}`, 'GET', undefined, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setProgramming(p); setWorld(w); delay = w.pollMs; setConnection(`Connected · tick ${w.tick}`);
      } catch (error) {
        if (controller.signal.aborted) return;
        setConnection('Connection lost · retrying');
        if (error instanceof ApiError && error.status === 401) { failure(error); return; }
      }
      timer = setTimeout(() => void poll(), delay);
    }
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [user, selected]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    setBusy(true); setMessage('');
    try {
      const body = { email: fields.get('email'), password: fields.get('password'), ...(register ? { username: fields.get('username') } : {}) };
      setUser(await request<User>(register ? '/auth/register' : '/auth/login', 'POST', body)); form.reset();
    } catch (error) { failure(error); } finally { setBusy(false); }
  }
  function select(id: string) {
    setSelected(id); setWorld(null); setMessage('');
    const entity = programming?.entities.find(e => e.id === id);
    setName(entity?.name ?? 'Scout');
    setScript(entity?.program ?? programming?.defaults.script ?? 'OTHERWISE\n    EXPLORE');
    setZombieScript(entity?.zombieScript ?? programming?.defaults.zombieScript ?? 'OTHERWISE\n    WANDER');
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    const entity = programming?.entities.find(e => e.id === selected);
    try {
      await request(selected ? `/${entity?.kind === 'zombie' ? 'zombies' : 'survivors'}/${selected}/script` : '/survivors', selected ? 'PUT' : 'POST',
        { script, ...(entity?.kind !== 'zombie' ? { zombieScript } : {}), ...(!selected ? { name } : {}) });
      setMessage(selected ? 'Script deployed. Previous versions are preserved.' : 'Survivor queued. The server chooses its spawn.');
    } catch (error) { failure(error); } finally { setBusy(false); }
  }
  const entity = programming?.entities.find(e => e.id === selected);
  return <main><header><p className="eyebrow">PERSISTENT SURVIVAL / PROGRAMMABLE BEHAVIOR</p><h1>DEADWARE<span> / console</span></h1>
    <p>Write the rules. Your survivors face the world.</p></header>
    <p role="status" className="feedback">{message}</p>
    {checking ? <p>Checking session…</p> : !user ? <section className="login"><h2>{register ? 'Create an account' : 'Enter the world'}</h2>
      <form onSubmit={login}>{register && <label>Username<input name="username" required pattern="[a-zA-Z0-9_]{3,32}" autoComplete="username"/></label>}
        <label>Email<input name="email" type="email" maxLength={254} required autoComplete="email"/></label>
        <label>Password<input name="password" type="password" minLength={12} maxLength={128} required autoComplete={register ? 'new-password' : 'current-password'}/></label>
        <button disabled={busy}>{busy ? 'Connecting…' : register ? 'Register' : 'Log in'}</button></form>
      <button className="secondary" disabled={busy} onClick={() => { setRegister(!register); setMessage(''); }}>{register ? 'Already have an account? Log in' : 'Create an account'}</button>
    </section> : <><nav><span>{user.username} · {connection}</span><button disabled={busy} onClick={async () => {
      setBusy(true); try { await request('/auth/logout', 'POST'); clearSession(); setMessage('Logged out.'); } catch (error) { failure(error); } finally { setBusy(false); }
    }}>Log out</button></nav>
      <div className="layout"><section><h2>Your survivors</h2><label>Entity / new survivor<select value={selected} onChange={e => select(e.target.value)}>
        <option value="">Create a survivor</option>{programming?.entities.map(e => <option key={e.id} value={e.id}>{e.name} · {e.kind} · {e.health} HP</option>)}
      </select></label>
        {!!programming?.queue.length && <p>Queued: {programming.queue.map(q => q.name).join(', ')}</p>}
        <form onSubmit={submit}>{!selected && <label>Name<input value={name} onChange={e => setName(e.target.value)} maxLength={64} required/></label>}
          <label>{entity?.kind === 'zombie' ? 'ZombieScript' : 'SurvivorScript'}<textarea spellCheck={false} value={script} onChange={e => setScript(e.target.value)} required maxLength={16384}/></label>
          {entity?.kind !== 'zombie' && <label>After death · ZombieScript<textarea spellCheck={false} value={zombieScript} onChange={e => setZombieScript(e.target.value)} required maxLength={16384}/></label>}
          <button disabled={busy || (!!selected && !entity)}>{busy ? 'Saving…' : selected ? 'Deploy behavior' : 'Inject survivor'}</button>
        </form>
        <label>Load saved programs<select defaultValue="" onChange={e => { const pair = programming?.scripts.find(p => p.id === e.target.value); if (pair) { setScript(pair.script); setZombieScript(pair.zombieScript); } }}>
          <option value="">Choose a saved pair</option>{programming?.scripts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="secondary" disabled={busy} onClick={async () => { setBusy(true); try { await request('/scripts', 'POST', { name, script, zombieScript }); setMessage('Programs saved to your library.'); } catch (error) { failure(error); } finally { setBusy(false); } }}>Save programs to library</button>
      </section><section><h2>World view</h2><p>{world?.observer ? `${world.observer.name} · ${world.observer.health}/${world.observer.maxHealth} HP · ${world.observer.message}` : 'Inject a survivor to begin exploring.'}</p>
        <MapView world={world}/><p className="muted">Only your entity’s perception and explored terrain are shown.</p>
        {world?.observer?.kind === 'survivor' && <section className="history" aria-labelledby="history-heading">
          <h3 id="history-heading">Survivor history</h3>
          {world.observer.history?.length ? <ol>{[...world.observer.history].reverse().map((event, index) => <li key={`${event.tick}-${index}`}><span>Decision {event.tick}</span>{event.message}</li>)}</ol> : <p className="muted">No decisions recorded yet.</p>}
        </section>}
      </section></div></>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
