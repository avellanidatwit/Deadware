import { renderStatus, setupInspector } from './ui/entityDetails.js';
import { drawWorld } from './ui/worldRenderer.js';
import type { WorldSnapshot } from './ui/protocol.js';
import { setupProgramming } from './ui/programming.js';

const get = <T extends HTMLElement>(id: string) => document.querySelector<T>(id)!;
const canvas = get<HTMLCanvasElement>('#world');
const ctx = canvas.getContext('2d')!;
const inspector = setupInspector(canvas);
const loginPage = get('#login-page');
const viewerPage = get('#viewer-page');
const loginForm = get<HTMLFormElement>('#login-form');
const loginButton = get<HTMLButtonElement>('#login');
const email = get<HTMLInputElement>('#email');
const password = get<HTMLInputElement>('#password');
const endpoint = get<HTMLInputElement>('#server-url');
const entitySelect = get<HTMLSelectElement>('#view-entity');
endpoint.value = localStorage.getItem('deadware-server') ?? location.origin;
let base = '', access = '', generation = 0;
let timer: number | undefined;
let controller: AbortController | undefined;

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function request(path: string, method = 'GET', body?: object, signal?: AbortSignal): Promise<any> {
  const response = await fetch(`${base}${path}`, { method,
    headers: { ...(access ? { Authorization: `Bearer ${access}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (response.status === 401 && access) showLogin('Your session expired. Please log in again.');
  if (!response.ok) throw new ApiError(data.error ?? data.errors?.map((e: { message: string }) => e.message).join('\n') ?? 'Request failed.', response.status);
  return data;
}
function stopPolling(): void {
  generation++; window.clearTimeout(timer); controller?.abort();
}
function showLogin(message = ''): void {
  stopPolling(); access = ''; password.value = '';
  programming.reset(); inspector.reset(); renderStatus(null);
  get('#programming-panel').hidden = true; get('#world-panel').hidden = false;
  get('#world-tab').setAttribute('aria-pressed', 'true'); get('#programming-tab').setAttribute('aria-pressed', 'false');
  viewerPage.hidden = true; loginPage.hidden = false;
  entitySelect.replaceChildren(); canvas.width = canvas.width;
  get('#login-feedback').textContent = message;
  email.focus();
}
function render(data: WorldSnapshot): void {
  entitySelect.replaceChildren();
  for (const kind of ['survivor', 'zombie'] as const) {
    const entities = data.entities.filter(e => e.kind === kind);
    if (!entities.length) continue;
    const group = document.createElement('optgroup'); group.label = kind === 'survivor' ? 'My survivors' : 'My zombies';
    for (const entity of entities) {
      const option = document.createElement('option'); option.value = entity.id;
      option.textContent = `${entity.name} (${entity.health > 0 ? 'alive' : 'dead'})`; group.append(option);
    }
    entitySelect.append(group);
  }
  entitySelect.disabled = !data.entities.length;
  entitySelect.value = data.observer?.id ?? '';
  get('#empty-state').hidden = !!data.observer;
  canvas.hidden = !data.observer;
  canvas.width = data.width * 16; canvas.height = data.height * 16;
  const cell = (x: number, y: number) => x >= 0 && y >= 0 && x < data.width && y < data.height ? data.cells[y * data.width + x] : null;
  drawWorld(ctx, { width: data.width, height: data.height, getCell: cell }, { canSee: (x, y) => cell(x, y)?.visible ?? false, hasExplored: (x, y) => cell(x, y)?.explored ?? false });
  get('#world-size').textContent = `${data.width} x ${data.height} tiles | Server tick ${data.tick}`;
  const s = data.observer;
  renderStatus(s); inspector.update(data);
  get('#sight').textContent = s ? `${s.sightRange}-tile sight, blocked by walls and closed doors. ${s.kind === 'survivor' ? 'Gray terrain has been explored.' : 'Zombies see only their current surroundings.'}` : '';
  get('#connection-status').textContent = 'Live view';
  canvas.setAttribute('aria-label', `${s?.name ?? 'World'}. Server tick ${data.tick}. ${s ? `Health ${s.health}/${s.maxHealth}` : 'No entity selected'}`);
}
async function poll(session: number): Promise<void> {
  controller = new AbortController();
  try {
    const id = entitySelect.value;
    const data = await request(`/api/world${id ? `?entity=${encodeURIComponent(id)}` : ''}`, 'GET', undefined, controller.signal);
    if (session !== generation) return;
    render(data);
  } catch (error) {
    if (session !== generation) return;
    if (error instanceof ApiError && error.status === 401) { showLogin('Your session expired. Please log in again.'); return; }
    if (error instanceof ApiError && error.status === 404) entitySelect.value = '';
    get('#connection-status').textContent = `Connection lost. Retrying... ${error instanceof Error ? error.message : String(error)}`;
  }
  if (session === generation) timer = window.setTimeout(() => void poll(session), 1000);
}
entitySelect.addEventListener('change', () => {
  stopPolling(); get('#connection-status').textContent = 'Loading selected entity...';
  canvas.hidden = true; inspector.reset(); renderStatus(null);
  void poll(generation);
});
const programming = setupProgramming(request);
get('#programming-tab').addEventListener('click', async () => {
  get('#world-panel').hidden = true; get('#programming-panel').hidden = false;
  get('#world-tab').setAttribute('aria-pressed', 'false'); get('#programming-tab').setAttribute('aria-pressed', 'true');
  try { await programming.refresh(); }
  catch (error) { get('#program-feedback').textContent = error instanceof Error ? error.message : String(error); }
});
get('#world-tab').addEventListener('click', () => {
  get('#world-panel').hidden = false; get('#programming-panel').hidden = true;
  get('#world-tab').setAttribute('aria-pressed', 'true'); get('#programming-tab').setAttribute('aria-pressed', 'false');
});
loginForm.addEventListener('submit', async event => {
  event.preventDefault(); if (loginButton.disabled) return;
  loginButton.disabled = true; get('#login-feedback').textContent = 'Logging in...';
  try {
    const url = new URL(endpoint.value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Enter an HTTP(S) server URL.');
    base = url.href.replace(/\/$/, '');
    const result = await request('/api/login', 'POST', { email: email.value, password: password.value });
    password.value = ''; access = result.token;
    localStorage.setItem('deadware-server', base);
    loginPage.hidden = true; viewerPage.hidden = false;
    get('#signed-in-email').textContent = result.email;
    get('#login-feedback').textContent = '';
    entitySelect.focus(); stopPolling(); void poll(generation);
  } catch (error) { get('#login-feedback').textContent = error instanceof Error ? error.message : String(error); }
  finally { loginButton.disabled = false; }
});
get('#logout').addEventListener('click', async () => {
  const pending = request('/api/logout', 'POST');
  showLogin();
  try { await pending; } catch { get('#login-feedback').textContent = 'Logged out locally. The server could not be reached to revoke the session.'; }
});
