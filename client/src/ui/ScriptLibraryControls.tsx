import { useState } from 'react';
import type { SavedBehavior, ScriptKind } from '../../../shared/src/types/api.js';
import { behaviorPresets, zombieBehaviorPresets } from '../../../shared/src/behaviorPresets.js';

export function ScriptLibraryControls({
  kind,
  code,
  programs,
  busy,
  onChange,
  onSave,
  onDelete,
}: {
  kind: ScriptKind;
  code: string;
  programs: SavedBehavior[];
  busy: boolean;
  onChange: (code: string) => void;
  onSave: (
    kind: ScriptKind,
    name: string,
    code: string,
    id?: string,
  ) => Promise<SavedBehavior | undefined>;
  onDelete: (entry: SavedBehavior) => Promise<boolean>;
}) {
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const presets = kind === 'survivor' ? behaviorPresets : zombieBehaviorPresets;
  const savedPrograms = programs.filter((entry) => entry.kind === kind);
  const saved = savedPrograms.find((entry) => `saved:${entry.id}` === source);
  const sourceExists = source === 'custom' || source.startsWith('preset:') || !!saved;
  function choose(value: string) {
    if (value.startsWith('saved:')) {
      const entry = savedPrograms.find((item) => `saved:${item.id}` === value);
      if (!entry) return;
      onChange(entry.code);
      setName(entry.name);
    } else {
      const preset = presets.find((item) => `preset:${item.name}` === value);
      onChange(preset?.script ?? 'OTHERWISE\n    EXPLORE');
      setName(preset?.name ?? '');
    }
    setSource(value);
  }
  async function save(id?: string) {
    const entry = await onSave(kind, name.trim() || `My ${kind} behavior`, code, id);
    if (entry) {
      setSource(`saved:${entry.id}`);
      setName(entry.name);
    }
  }
  return (
    <div className="script-library-controls">
      {kind === 'survivor' && (
        <div className="preset-notes" role="group" aria-label="Behavior presets">
          {presets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              disabled={busy}
              aria-pressed={source === `preset:${preset.name}`}
              onClick={() => choose(`preset:${preset.name}`)}
            >
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      )}
      <label>
        Starting {kind} behavior
        <select
          value={sourceExists ? source : ''}
          disabled={busy}
          onChange={(event) => choose(event.target.value)}
        >
          <option value="" disabled>
            Choose a preset or saved script
          </option>
          <optgroup label="Basic behaviors">
            {presets.map((preset) => (
              <option key={preset.name} value={`preset:${preset.name}`}>
                {preset.name}: {preset.description}
              </option>
            ))}
          </optgroup>
          <option value="custom">Custom: Start with Explore</option>
          <optgroup label={`Your saved ${kind} scripts`}>
            {savedPrograms.length ? (
              savedPrograms.map((entry) => (
                <option key={entry.id} value={`saved:${entry.id}`}>
                  {entry.name}
                </option>
              ))
            ) : (
              <option disabled>No saved {kind} scripts yet</option>
            )}
          </optgroup>
        </select>
      </label>
      <div className="script-save-controls">
        <label>
          {kind === 'survivor' ? 'Survivor' : 'Zombie'} script name
          <input
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            maxLength={64}
            placeholder={`My ${kind} behavior`}
          />
        </label>
        <div className="behavior-toolbar">
          <button type="button" disabled={busy} onClick={() => void save()}>
            Save {kind} script{saved ? ' as new' : ''}
          </button>
          {saved && (
            <>
              <button type="button" disabled={busy} onClick={() => void save(saved.id)}>
                Update saved {kind} script
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await onDelete(saved)) {
                    setSource('');
                    setName('');
                  }
                }}
              >
                Delete saved {kind} script
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
