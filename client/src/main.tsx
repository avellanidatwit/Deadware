import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { request, ApiError } from './api/client.js';
import type { User, ProgrammingState, WorldResponse, ScriptPair } from '../../shared/src/types/api.js';
import './style.css';
import tutorial from './content/tutorial.html?raw';
import wiki from './content/wiki.html?raw';
import { Notification } from './ui/Notification.js';
import { SavedPrograms } from './ui/SavedPrograms.js';
import { Account } from './ui/Account.js';
import { WorldView } from './ui/WorldView.js';

const pages = ['view', 'code', 'tutorial', 'wiki', 'account'] as const;
type Page = typeof pages[number];
function currentPage(): Page { const name = location.hash.slice(1).split('/')[0]; return pages.includes(name as Page) ? name as Page : 'view'; }
function App() {
  const [page, setPage] = useState<Page>(currentPage);
  const [editingId, setEditingId] = useState('');
  const libraryRevision = useRef(0);
  const [savedId, setSavedId] = useState(''), [libraryName, setLibraryName] = useState('');
  useEffect(() => {
    function navigate() { setPage(currentPage()); }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    document.title = `${page[0].toUpperCase() + page.slice(1)} | Deadware`;
    function scroll() { const id = location.hash.split('/')[1]; if (id) document.getElementById(id)?.scrollIntoView(); }
    scroll(); window.addEventListener('hashchange', scroll);
    return () => window.removeEventListener('hashchange', scroll);
  }, [page]);
  const [user, setUser] = useState<User | null>(null), [register, setRegister] = useState(false);
  const [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [message, setMessageText] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');
  function setMessage(text: string) { setMessageText(text); setMessageTone('success'); }
  const [programming, setProgramming] = useState<ProgrammingState | null>(null), [world, setWorld] = useState<WorldResponse | null>(null);
  const [allZombies, setAllZombies] = useState(false);
  const [selected, setSelected] = useState(''), [name, setName] = useState('Scout');
  const [script, setScript] = useState('OTHERWISE\n    EXPLORE'), [zombieScript, setZombieScript] = useState('OTHERWISE\n    WANDER');
  const [connection, setConnection] = useState('Connecting...');
  function clearSession() { setAllZombies(false); setUser(null); setProgramming(null); setWorld(null); setSelected(''); setSavedId(''); setEditingId(''); setLibraryName(''); setScript('OTHERWISE\n    EXPLORE'); setZombieScript('OTHERWISE\n    WANDER'); }
  function failure(error: unknown) {
    if (error instanceof ApiError && error.status === 401) clearSession();
    setMessage(error instanceof Error ? error.message : 'Request failed.');
    setMessageTone('error');
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
        const revision = libraryRevision.current;
        const [p, w] = await Promise.all([
          request<ProgrammingState>('/programming', 'GET', undefined, controller.signal),
          request<WorldResponse>(`/world${allZombies ? '?view=zombies' : selected ? `?entity=${encodeURIComponent(selected)}` : ''}`, 'GET', undefined, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        if (revision === libraryRevision.current) setProgramming(p); setWorld(w); delay = w.pollMs; setConnection(`Connected - tick ${w.tick}`);
      } catch (error) {
        if (controller.signal.aborted) return;
        setConnection('Connection lost - retrying');
        if (error instanceof ApiError && error.status === 401) { failure(error); return; }
      }
      timer = setTimeout(() => void poll(), delay);
    }
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [user, selected, allZombies]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
    setBusy(true); setMessage('');
    try {
      const body = { email: fields.get('email'), password: fields.get('password'), ...(register ? { username: fields.get('username') } : {}) };
      setUser(await request<User>(register ? '/auth/register' : '/auth/login', 'POST', body)); form.reset();
    } catch (error) { failure(error); } finally { setBusy(false); }
  }
  function select(id: string) {
    setAllZombies(false);
    setEditingId(''); setSelected(id); setWorld(null); setMessage('');
    const entity = programming?.entities.find(e => e.id === id);
    setName(entity?.name ?? 'Scout');
    setScript(entity?.program ?? programming?.defaults.script ?? 'OTHERWISE\n    EXPLORE');
    setZombieScript(entity?.zombieScript ?? programming?.defaults.zombieScript ?? 'OTHERWISE\n    WANDER');
  }
  async function saveProgram(id = '') {
    setBusy(true); setMessage(''); libraryRevision.current++;
    try {
      const pair = await request<ScriptPair>(id ? `/scripts/${id}` : '/scripts', id ? 'PUT' : 'POST', { name: libraryName.trim() || name, script, zombieScript });
      setProgramming(current => current && ({ ...current, scripts: id ? current.scripts.map(item => item.id === id ? pair : item) : [...current.scripts, pair] }));
      setSavedId(pair.id); setMessage(id ? 'Saved program updated.' : 'Program saved to your library.');
    } catch (error) { failure(error); } finally { libraryRevision.current++; setBusy(false); }
  }
  async function deleteProgram(pair: ScriptPair) {
    if (!window.confirm(`Delete saved program "${pair.name}"? Deployed survivor and zombie behavior will not change.`)) return;
    setBusy(true); libraryRevision.current++;
    try {
      await request(`/scripts/${pair.id}`, 'DELETE');
      setProgramming(current => current && ({ ...current, scripts: current.scripts.filter(item => item.id !== pair.id) }));
      if (savedId === pair.id) setSavedId('');
      if (editingId === pair.id) setEditingId('');
      setMessage('Saved program deleted.');
    } catch (error) { failure(error); } finally { libraryRevision.current++; setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (editingId) { await saveProgram(editingId); return; }
    setBusy(true); setMessage('');
    const entity = programming?.entities.find(e => e.id === selected);
    try {
      await request(selected ? `/${entity?.kind === 'zombie' ? 'zombies' : 'survivors'}/${selected}/script` : '/survivors', selected ? 'PUT' : 'POST',
        { script, ...(entity?.kind !== 'zombie' ? { zombieScript } : {}), ...(!selected ? { name } : {}) });
      setMessage(selected ? 'Behavior updated.' : 'Survivor added to the spawn queue.');
    } catch (error) { failure(error); } finally { setBusy(false); }
  }
  const entity = programming?.entities.find(e => e.id === selected);
  const survivorCount = (programming?.entities.filter(entity => entity.kind === 'survivor' && entity.health > 0).length ?? 0) + (programming?.queue.length ?? 0);
  const saved = programming?.scripts.find(pair => pair.id === savedId);
  const logout = async () => {
    setBusy(true); try { await request('/auth/logout', 'POST'); clearSession(); setMessage('Logged out.'); }
    catch (error) { failure(error); } finally { setBusy(false); }
  };
  return <><a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <header className="site-header"><a className="brand" href="#view">DEADWARE<span>Program. Adapt. Survive.</span></a>
      <nav aria-label="Main navigation">{pages.map(item => <a key={item} href={`#${item}`} aria-current={page === item ? 'page' : undefined}>{item[0].toUpperCase() + item.slice(1)}</a>)}</nav>
      {user && <div className="account-controls"><a href="#account">{user.username}</a><button disabled={busy} onClick={logout}>Log out</button></div>}
    </header>
    <main id="main-content" tabIndex={-1} className={['wiki', 'tutorial', 'account'].includes(page) ? 'reading-page' : undefined}>
    <Notification message={message} tone={messageTone} onClose={() => setMessage('')}/>
    {page === 'wiki' || page === 'tutorial' ? <div dangerouslySetInnerHTML={{ __html: page === 'wiki' ? wiki : tutorial }}/>
    : checking ? <p>Checking session...</p> : !user ? <section className="status-panel login-panel">
      <p className="eyebrow">Welcome to Deadware</p><h1>{register ? 'Create an account' : 'Log in to Deadware'}</h1>
      <p>Your world keeps running. Sign in to manage your survivors and zombies.</p>
      <form onSubmit={login}>{register && <label>Username<input name="username" required pattern="[a-zA-Z0-9_]{3,32}" autoComplete="username"/></label>}
        <label>Email<input name="email" type="email" maxLength={254} required autoComplete="email"/></label>
        <label>Password<input name="password" type="password" minLength={12} maxLength={128} required autoComplete={register ? 'new-password' : 'current-password'}/></label>
        <button disabled={busy}>{busy ? 'Connecting...' : register ? 'Register' : 'Log in'}</button></form>
      <button disabled={busy} onClick={() => { setRegister(!register); setMessage(''); }}>{register ? 'Already have an account? Log in' : 'Create an account'}</button>
    </section> : page === 'account' ? <Account user={user} onSignedOut={message => { clearSession(); setMessage(message); }}/>
    : page === 'view' ? <><h1>Your world</h1><div className="status-panel view-toolbar"><div><label>View one of your entities<select value={allZombies ? 'all-zombies' : selected || world?.observer?.id || ''} onChange={e => { if (e.target.value === 'all-zombies') { setAllZombies(true); setWorld(null); } else select(e.target.value); }}>
      <option value="" disabled>Select an entity</option>{['survivor', 'zombie'].map(kind => <optgroup key={kind} label={kind === 'survivor' ? 'Survivors' : 'Zombies'}>{kind === 'zombie' && <option value="all-zombies">All zombies</option>}{programming?.entities.filter(e => e.kind === kind).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>)}</select></label></div><p className="connection">{connection}</p></div>
      {!allZombies && !world?.observer && <p>You have no selected entity. <a href="#code">Open Code to create a survivor.</a></p>}
      {allZombies && <p>{world?.zombieObservers?.length ?? 0} active zombies. Hover over one of your zombies to see its stats.</p>}<WorldView key={allZombies ? 'all-zombies' : world?.observer?.id ?? 'empty'} world={world} allZombies={allZombies}/></>
    : <><h1>Survivor programming</h1><p>Create a survivor with two programs: one for life, one for when it rises as a zombie.</p><p>{survivorCount} / 10 survivor slots used (including queued spawns). Zombies have no limit.</p>
      <div className="status-panel"><label>Create or reprogram an entity<select value={selected} onChange={e => select(e.target.value)}>
        <option value="">Create a survivor</option>{programming?.entities.filter(e => e.health > 0).map(e => <option key={e.id} value={e.id}>{e.name} - {e.kind}</option>)}</select></label>
        <p className="connection">{connection}</p>{!!programming?.queue.length && <p>Queued: {programming.queue.map(q => q.name).join(', ')}</p>}</div>
      <div className="programming-layout"><section className="script-panel"><h2>{editingId ? 'Edit saved program' : 'Program editor'}</h2>{editingId && <p>Changes update the library only. <button type="button" disabled={busy} onClick={() => select('')}>Cancel editing</button></p>}
        <form onSubmit={submit}>{!selected && !editingId && <label>Survivor name<input value={name} onChange={e => setName(e.target.value)} maxLength={64} required/></label>}
          <label>{entity?.kind === 'zombie' ? 'Zombie behavior' : 'Survivor behavior'}<textarea id="main-script" rows={16} spellCheck={false} value={script} onChange={e => setScript(e.target.value)} required maxLength={16384}/></label>
          {entity?.kind !== 'zombie' && <label>Zombie behavior after death<textarea rows={10} spellCheck={false} value={zombieScript} onChange={e => setZombieScript(e.target.value)} required maxLength={16384}/></label>}
          <button disabled={busy || (!selected && !editingId && survivorCount >= 10) || (!!selected && (!entity || entity.health <= 0))}>{busy ? 'Saving...' : editingId ? 'Save changes to saved program' : selected ? 'Update behavior' : 'Inject survivor'}</button>
        </form><label>Library name<input value={libraryName} onChange={e => setLibraryName(e.target.value)} maxLength={64} placeholder="Scavenger strategy"/></label>
        <button disabled={busy} onClick={() => void saveProgram()}>{editingId ? 'Save as a new program' : 'Save survivor and zombie scripts'}</button>
        <p><a href="#wiki">SurvivorScript reference</a></p></section>
      <section className="status-panel library-preview"><h2>Saved scripts</h2><p>Saved programs are independent of entities. Final programs are archived when a survivor dies.</p>
        <SavedPrograms programs={programming?.scripts ?? []} selectedId={savedId} busy={busy} onSelect={setSavedId} onDelete={pair => void deleteProgram(pair)}/>
        <label>Saved survivor script<textarea readOnly value={saved?.script ?? ''}/></label><label>Saved zombie script<textarea readOnly value={saved?.zombieScript ?? ''}/></label>
        <button disabled={!saved || busy} onClick={() => { if (saved) { select(''); setEditingId(saved.id); setLibraryName(saved.name); setScript(saved.script); setZombieScript(saved.zombieScript); document.getElementById('main-script')?.focus(); } }}>Edit saved program</button>
      </section></div></>}
    </main></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
