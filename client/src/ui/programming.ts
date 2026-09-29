type Entity = { id: string; name: string; kind: 'survivor' | 'zombie'; health: number; program: string; zombieScript?: string };
type SavedScript = { id: string; name: string; script: string; zombieScript: string; sourceSurvivorId?: string };
type Workspace = { entities: Entity[]; scripts: SavedScript[]; queue: { id: string; name: string }[]; defaults: { script: string; zombieScript: string } };
type Request = (path: string, method?: string, body?: object) => Promise<any>;

export function setupProgramming(request: Request) {
  const get = <T extends HTMLElement>(id: string) => document.querySelector<T>(id)!;
  const select = get<HTMLSelectElement>('#program-entity');
  const name = get<HTMLInputElement>('#survivor-name');
  const script = get<HTMLTextAreaElement>('#survivor-script');
  const zombie = get<HTMLTextAreaElement>('#zombie-script');
  const library = get<HTMLSelectElement>('#saved-script');
  const libraryName = get<HTMLInputElement>('#script-name');
  const feedback = get('#program-feedback');
  const inject = get<HTMLButtonElement>('#inject-survivor');
  const deploy = get<HTMLButtonElement>('#deploy-program');
  const save = get<HTMLButtonElement>('#save-program');
  let workspace: Workspace | undefined, selected = '', epoch = 0, busy = false;
  const drafts = new Map<string, { name: string; script: string; zombieScript: string }>();
  const capture = () => drafts.set(selected, { name: name.value, script: script.value, zombieScript: zombie.value });
  const actor = () => workspace?.entities.find(e => e.id === selected);
  function controls(): void {
    const isZombie = actor()?.kind === 'zombie';
    get('#future-zombie-panel').hidden = !!isZombie;
    get('#primary-script-label').textContent = isZombie ? 'Zombie behavior' : 'Survivor behavior';
    name.disabled = !!selected;
    inject.hidden = !!selected; deploy.hidden = !selected;
    inject.disabled = deploy.disabled = busy || !workspace;
    save.disabled = busy || !workspace || !!isZombie;
  }
  function showDraft(): void {
    const entity = actor();
    const draft = drafts.get(selected);
    name.value = draft?.name ?? entity?.name ?? 'New survivor';
    script.value = draft?.script ?? entity?.program ?? workspace?.defaults.script ?? '';
    zombie.value = draft?.zombieScript ?? entity?.zombieScript ?? workspace?.defaults.zombieScript ?? '';
    controls();
  }
  function preview(): void {
    const entry = workspace?.scripts.find(e => e.id === library.value);
    get<HTMLTextAreaElement>('#saved-survivor-code').value = entry?.script ?? '';
    get<HTMLTextAreaElement>('#saved-zombie-code').value = entry?.zombieScript ?? '';
    get<HTMLButtonElement>('#load-program').disabled = !entry;
  }
  async function refresh(): Promise<void> {
    const current = epoch;
    const next: Workspace = await request('/api/programming');
    if (current !== epoch) return;
    if (workspace) capture();
    workspace = next;
    select.replaceChildren();
    const fresh = document.createElement('option'); fresh.value = ''; fresh.textContent = 'Create a survivor'; select.append(fresh);
    for (const entity of next.entities) {
      const option = document.createElement('option'); option.value = entity.id; option.textContent = `${entity.kind}: ${entity.name}`; select.append(option);
    }
    if (selected && !actor()) {
      const previous = drafts.get(selected); selected = '';
      if (previous) drafts.set('', previous);
      feedback.textContent = 'That entity is no longer active. Your draft is preserved here; survivor scripts are also archived on death.';
    }
    select.value = selected;
    const savedId = library.value; library.replaceChildren();
    for (const entry of next.scripts) {
      const option = document.createElement('option'); option.value = entry.id;
      option.textContent = `${entry.name}${entry.sourceSurvivorId ? ' (death archive)' : ''}`; library.append(option);
    }
    library.value = next.scripts.some(e => e.id === savedId) ? savedId : next.scripts[0]?.id ?? '';
    library.disabled = !next.scripts.length;
    get('#queue-status').textContent = next.queue.length ? `Queued survivors: ${next.queue.map(q => q.name).join(', ')}` : 'No survivors waiting for injection.';
    preview(); showDraft();
  }
  async function operation(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true; controls(); const current = epoch;
    try { await action(); if (current === epoch) await refresh(); }
    catch (error) { if (current === epoch) feedback.textContent = error instanceof Error ? error.message : String(error); }
    finally { if (current === epoch) { busy = false; controls(); } }
  }
  select.addEventListener('change', () => { capture(); selected = select.value; showDraft(); feedback.textContent = ''; });
  library.addEventListener('change', preview);
  get('#load-program').addEventListener('click', () => {
    const entry = workspace?.scripts.find(e => e.id === library.value); if (!entry) return;
    capture(); selected = ''; select.value = '';
    drafts.set('', { name: entry.name, script: entry.script, zombieScript: entry.zombieScript }); showDraft();
    feedback.textContent = 'Saved scripts loaded into a new survivor draft. Review them before injection.';
  });
  inject.addEventListener('click', () => operation(async () => {
    const current = epoch;
    const result = await request('/api/survivors', 'POST', { name: name.value, script: script.value, zombieScript: zombie.value });
    if (current === epoch) feedback.textContent = `Survivor queued (${result.id}). The server chooses a random free tile.`;
  }));
  deploy.addEventListener('click', () => operation(async () => {
    const entity = actor(); if (!entity) return;
    const current = epoch;
    const result = await request(`/api/${entity.kind}s/${encodeURIComponent(entity.id)}/script`, 'PUT', { script: script.value, ...(entity.kind === 'survivor' ? { zombieScript: zombie.value } : {}) });
    if (current === epoch) feedback.textContent = `Behavior updated (version ${result.scriptVersion}).`;
  }));
  save.addEventListener('click', () => operation(async () => {
    const current = epoch;
    await request('/api/scripts', 'POST', { name: libraryName.value, script: script.value, zombieScript: zombie.value });
    if (current === epoch) feedback.textContent = 'Both scripts saved to your library. They remain available after death.';
  }));
  get('#refresh-programming').addEventListener('click', () => operation(async () => {}));
  controls();
  return { refresh, reset() {
    epoch++; workspace = undefined; selected = ''; busy = false; drafts.clear();
    select.replaceChildren(); library.replaceChildren(); name.value = script.value = zombie.value = '';
    libraryName.value = ''; feedback.textContent = '';
    preview(); controls();
  } };
}
