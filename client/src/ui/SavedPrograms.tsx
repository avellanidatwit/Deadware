import { useRef } from 'react';
import type { ScriptPair } from '../../../shared/src/types/api.js';

export function SavedPrograms({ programs, selectedId, busy, onSelect, onDelete }: {
  programs: ScriptPair[]; selectedId: string; busy: boolean;
  onSelect: (id: string) => void; onDelete: (program: ScriptPair) => void;
}) {
  const dropdown = useRef<HTMLDetailsElement>(null);
  return <div className="saved-programs"><span id="saved-programs-label">Saved programs</span>
    <details ref={dropdown} onKeyDown={event => {
      if (event.key === 'Escape' && dropdown.current) { dropdown.current.open = false; dropdown.current.querySelector('summary')?.focus(); }
    }}><summary aria-labelledby="saved-programs-label saved-programs-value"><span id="saved-programs-value">{programs.find(p => p.id === selectedId)?.name ?? 'Choose a saved program'}</span></summary>
      <ul aria-label="Saved programs">{programs.length ? programs.map(program => <li key={program.id}>
        <button type="button" className="program-choice" disabled={busy} aria-pressed={selectedId === program.id} onClick={() => {
          onSelect(program.id); if (dropdown.current) { dropdown.current.open = false; dropdown.current.querySelector('summary')?.focus(); }
        }}>{program.name}</button>
        <button type="button" className="delete-program" disabled={busy} aria-label={`Delete ${program.name}`} title={`Delete ${program.name}`} onClick={() => onDelete(program)}>×</button>
      </li>) : <li>No saved programs yet.</li>}</ul>
    </details>
  </div>;
}
