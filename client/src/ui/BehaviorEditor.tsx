import { useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { NotebookRuleRow } from './NotebookRuleRow.js';
import { reorderRules } from '../../../shared/src/behaviorEditing.js';

import type {
  Condition,
  SurvivorAction,
  SurvivorProgram,
  ComparisonOperator,
} from '../../../server/src/scripting/language/types.js';
import {
  selectors,
  targetTypes,
  type Target,
} from '../../../server/src/scripting/language/selectors.js';
import {
  actionTargets,
  actionItems,
  memorySlots,
} from '../../../server/src/scripting/language/options.js';
import { isMovement } from '../../../server/src/scripting/language/actions.js';
import { parseSurvivorScript } from '../../../server/src/scripting/parser/parser.js';
import {
  builderCompatible,
  serializeProgram,
  renameMode,
} from '../../../server/src/scripting/language/serializer.js';
import { ITEM_TYPES } from '../../../server/src/data/itemCatalog.js';
const label = (s: string) =>
  ({
    and: 'AND',
    or: 'OR',
    'SPRINT MOVE_TO': 'Sprint toward',
    'SPRINT MOVE_AWAY': 'Sprint away from',
    'SPRINT MOVE': 'Sprint',
    'SPRINT EXPLORE': 'Sprint and explore',
    'SPRINT FOLLOW': 'Sprint after',
    'SPRINT RETURN': 'Sprint back to',
    'SPRINT PATROL': 'Sprint patrol',
    'SPRINT FIND': 'Sprint to find',
    hasItem: 'Carrying',
    equipped: 'Equipped item',
    itemCount: 'Inventory quantity',
    inventoryFull: 'Inventory is full',
    inventorySpace: 'Inventory has space',
    itemsOnFloor: 'Items at current position',
    remembered: 'Remembered',
    visible: 'Can see',
    distance: 'Distance to',
    count: 'Number of',
    stat: 'Stat',
    mode: 'Current behavior',
    lastZombie: 'Last zombie',
    lastContainer: 'Last container',
    MOVE_TO: 'Move toward',
    MOVE_AWAY: 'Move away from',
    SET_MODE: 'Change mode to',
    PICK_UP: 'Pick up',
    REMEMBER: 'Remember',
    LOOK: 'Look at floor',
    RETURN: 'Return to',
    PATROL: 'Patrol between home and',
    FIND: 'Find',
    SEARCH: 'Search',
    EXPLORE: 'Explore',
    WAIT: 'Wait',
    RELOAD: 'Reload',
  })[s] ?? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replaceAll('_', ' ');
function Choice({
  value,
  options,
  onChange,
  title,
  plural = false,
}: {
  value: string;
  options: readonly string[];
  onChange: (s: string) => void;
  title: string;
  plural?: boolean;
}) {
  return (
    <select
      style={{ width: `${Math.max(10, label(value).length + 7 + (plural ? 1 : 0))}ch` }}
      aria-label={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {label(s)}
          {plural && ['zombie', 'survivor'].includes(s) ? 's' : ''}
        </option>
      ))}
    </select>
  );
}
function NumberField({
  value,
  onChange,
  title,
}: {
  value: number;
  onChange: (n: number) => void;
  title: string;
}) {
  return (
    <input
      aria-label={title}
      type="number"
      min={0}
      max={Number.MAX_SAFE_INTEGER}
      step={1}
      value={value}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isSafeInteger(n) && n >= 0) onChange(n);
      }}
    />
  );
}
const comparisons: Record<string, string> = {
  '<': 'is below',
  '>': 'is above',
  '<=': 'is at most',
  '>=': 'is at least',
  '==': 'is exactly',
  '!=': 'is not',
};
function Compare({
  value,
  onChange,
  mode = false,
  distance = false,
}: {
  value: string;
  onChange: (s: ComparisonOperator) => void;
  mode?: boolean;
  distance?: boolean;
}) {
  return (
    <select
      style={{ width: `${(comparisons[value]?.length ?? 10) + 7}ch` }}
      aria-label="Comparison"
      value={value}
      onChange={(e) => onChange(e.target.value as ComparisonOperator)}
    >
      {(mode ? ['==', '!='] : Object.keys(comparisons)).map((s) => (
        <option key={s} value={s}>
          {distance && s === '<'
            ? 'is closer than'
            : distance && s === '<='
              ? 'is within'
              : comparisons[s]}
        </option>
      ))}
    </select>
  );
}
function TargetFields({
  value,
  options = targetTypes,
  onChange,
  count = false,
}: {
  value: Target;
  options?: readonly string[];
  onChange: (t: Target) => void;
  count?: boolean;
}) {
  const allowed = ['zombie', 'survivor'].includes(value.type) ? selectors : selectors.slice(0, 2);
  return (
    <>
      {!count && (
        <Choice
          title="Target selection"
          value={value.selector}
          options={allowed}
          onChange={(s) => onChange({ ...value, selector: s as Target['selector'] })}
        />
      )}
      <Choice
        title="Target"
        plural={count}
        value={value.type}
        options={options}
        onChange={(s) =>
          onChange({
            ...value,
            type: s as Target['type'],
            selector: ['zombie', 'survivor'].includes(s) ? value.selector : 'nearest',
          })
        }
      />
      {count ? (
        <>
          within{' '}
          <NumberField
            title="Range in tiles"
            value={value.range ?? 6}
            onChange={(range) => onChange({ ...value, range })}
          />{' '}
          tiles
        </>
      ) : (
        <>
          <details className="sentence-options">
            <summary aria-label="Target search options">&#8943;</summary>
            <label className="range-toggle">
              <input
                type="checkbox"
                checked={value.range !== undefined}
                onChange={(e) => onChange({ ...value, range: e.target.checked ? 6 : undefined })}
              />
              Limit search range
            </label>
          </details>
          {value.range !== undefined && (
            <>
              within{' '}
              <NumberField
                title="Search range"
                value={value.range}
                onChange={(range) => onChange({ ...value, range })}
              />
              tiles
            </>
          )}
        </>
      )}
    </>
  );
}
const defaultTarget: Target = { type: 'zombie', selector: 'nearest' };
function defaultCondition(type: string, modes: string[]): Condition {
  switch (type) {
    case 'stat':
      return { type, stat: 'health', operator: '<', value: 30 };
    case 'mode':
      return { type, operator: '==', value: modes[0] };
    case 'hasItem':
    case 'equipped':
      return { type, itemType: 'food' };
    case 'itemCount':
      return { type, itemType: 'food', operator: '>=', value: 1 };
    case 'distance':
      return { type, target: defaultTarget, operator: '<=', value: 4 };
    case 'count':
      return { type, target: { ...defaultTarget, range: 6 }, operator: '>=', value: 3 };
    case 'visible':
      return { type, target: defaultTarget };
    case 'remembered':
      return { type, slot: 'target' };
    default:
      return { type: type as 'inventoryFull' };
  }
}
function ConditionFields({
  value,
  modes,
  onChange,
}: {
  value: Condition;
  modes: string[];
  onChange: (c: Condition) => void;
}) {
  const negated = value.type === 'not',
    c = negated ? value.condition : value;
  const change = (next: Condition) => onChange(negated ? { type: 'not', condition: next } : next);
  const picker = (
    <Choice
      title="Condition"
      value={c.type === 'stat' ? c.stat : c.type}
      options={[
        'health',
        'hunger',
        'thirst',
        'stamina',
        'ammo',
        'distance',
        'count',
        'visible',
        'hasItem',
        'equipped',
        'itemCount',
        'remembered',
        'inventoryFull',
        'inventorySpace',
        'itemsOnFloor',
        ...(modes.length ? ['mode'] : []),
      ]}
      onChange={(s) =>
        change(
          ['health', 'hunger', 'thirst', 'stamina', 'ammo'].includes(s)
            ? { type: 'stat', stat: s as 'health', operator: '<', value: 30 }
            : defaultCondition(s, modes),
        )
      }
    />
  );
  return (
    <span className="behavior-sentence">
      {negated && <strong>NOT</strong>}
      {c.type === 'distance' ? (
        <details className="sentence-options">
          <summary aria-label="Change condition type">&#8943;</summary>
          {picker}
        </details>
      ) : (
        picker
      )}
      {'target' in c && (
        <TargetFields
          count={c.type === 'count'}
          value={c.target}
          options={
            c.type === 'count' || c.type === 'visible'
              ? targetTypes.filter((t) => !memorySlots.includes(t as 'home'))
              : targetTypes
          }
          onChange={(target) => change({ ...c, target })}
        />
      )}
      {'itemType' in c && (
        <Choice
          title="Item"
          value={c.itemType}
          options={ITEM_TYPES}
          onChange={(s) => change({ ...c, itemType: s as 'food' })}
        />
      )}
      {c.type === 'remembered' && (
        <Choice
          title="Memory"
          value={c.slot}
          options={memorySlots}
          onChange={(s) => change({ ...c, slot: s as 'home' })}
        />
      )}
      {'operator' in c && (
        <Compare
          distance={c.type === 'distance'}
          mode={c.type === 'mode'}
          value={c.operator}
          onChange={(operator) => change({ ...c, operator } as Condition)}
        />
      )}
      {c.type === 'mode' ? (
        <Choice
          title="Mode"
          value={c.value}
          options={modes}
          onChange={(value) => change({ ...c, value })}
        />
      ) : (
        'value' in c && (
          <NumberField
            title={c.type === 'distance' ? 'Distance in tiles' : 'Threshold'}
            value={c.value}
            onChange={(value) => change({ ...c, value })}
          />
        )
      )}
      {c.type === 'distance' && <span>tiles</span>}
      <details className="sentence-options">
        <summary aria-label="Condition options">&#8943;</summary>
        <label className="range-toggle">
          <input
            type="checkbox"
            checked={negated}
            onChange={(e) => onChange(e.target.checked ? { type: 'not', condition: c } : c)}
          />
          Opposite condition
        </label>
      </details>
    </span>
  );
}
const targetedVerbs = [
  'MOVE_TO',
  'MOVE_AWAY',
  'ATTACK',
  'SHOOT',
  'SEARCH',
  'FIND',
  'OPEN',
  'FOLLOW',
  'RETURN',
  'PATROL',
];
const itemVerbs = ['PICK_UP', 'DROP', 'EAT', 'USE', 'EQUIP'];
function newAction(s: string, modes: string[]): SurvivorAction {
  if (targetedVerbs.includes(s))
    return {
      type: 'targeted',
      verb: s as 'ATTACK',
      target: { type: actionTargets(s)[0], selector: 'nearest' },
    };
  if (itemVerbs.includes(s)) return { type: 'item', verb: s as 'EAT', itemType: actionItems(s)[0] };
  if (s === 'SET_MODE') return { type: 'setMode', mode: modes[0] };
  if (s === 'REMEMBER') return { type: 'remember', slot: 'home', target: 'position' };
  if (s === 'MOVE') return { type: 'move', direction: 'north' };
  if (s === 'LOOK') return { type: 'lookFloor' };
  if (s === 'PICK_UP_ALL') return { type: 'pickUpItems' };
  return { type: s.toLowerCase() as 'wait' };
}
function ActionFields({
  value,
  modes,
  onChange,
}: {
  value: SurvivorAction;
  modes: string[];
  onChange: (a: SurvivorAction) => void;
}) {
  const sprint = value.type === 'sprint',
    a = sprint ? value.action : value;
  const change = (next: SurvivorAction) =>
    onChange(sprint && isMovement(next) ? { type: 'sprint', action: next } : next);
  const command =
    a.type === 'targeted' || a.type === 'item'
      ? a.verb
      : ((
          {
            setMode: 'SET_MODE',
            remember: 'REMEMBER',
            lookFloor: 'LOOK',
            pickUpItems: 'PICK_UP_ALL',
          } as Record<string, string>
        )[a.type] ?? a.type.toUpperCase());
  return (
    <div className="behavior-sentence">
      <Choice
        title="Action"
        value={sprint ? `SPRINT ${command}` : command}
        options={[
          'SPRINT MOVE_TO',
          'SPRINT MOVE_AWAY',
          'SPRINT MOVE',
          'SPRINT EXPLORE',
          'SPRINT FOLLOW',
          'SPRINT RETURN',
          'SPRINT PATROL',
          'SPRINT FIND',
          ...targetedVerbs,
          ...itemVerbs,
          'PICK_UP_ALL',
          'REMEMBER',
          'LOOK',
          'MOVE',
          'WAIT',
          'EXPLORE',
          'RELOAD',
          ...(modes.length ? ['SET_MODE'] : []),
        ]}
        onChange={(s) => {
          const next = newAction(s.replace('SPRINT ', ''), modes);
          onChange(
            s.startsWith('SPRINT ') && isMovement(next) ? { type: 'sprint', action: next } : next,
          );
        }}
      />
      {a.type === 'targeted' && (
        <TargetFields
          value={a.target}
          options={actionTargets(a.verb)}
          onChange={(target) => change({ ...a, target })}
        />
      )}
      {a.type === 'item' && (
        <Choice
          title="Item to use"
          value={a.itemType}
          options={actionItems(a.verb)}
          onChange={(s) => change({ ...a, itemType: s as 'food' })}
        />
      )}
      {a.type === 'setMode' && (
        <Choice
          title="New mode"
          value={a.mode}
          options={modes}
          onChange={(mode) => change({ ...a, mode })}
        />
      )}
      {a.type === 'move' && (
        <Choice
          title="Direction"
          value={a.direction}
          options={['north', 'south', 'east', 'west']}
          onChange={(s) => change({ ...a, direction: s as 'north' })}
        />
      )}
      {a.type === 'lookFloor' && (
        <Choice
          title="Floor items"
          value={a.itemType ?? 'all'}
          options={['all', ...ITEM_TYPES]}
          onChange={(s) => change({ ...a, itemType: s === 'all' ? undefined : (s as 'food') })}
        />
      )}
      {a.type === 'remember' && (
        <>
          <Choice
            title="Remember what"
            value={a.target === 'position' ? 'position' : 'target'}
            options={['position', 'target']}
            onChange={(s) =>
              change({ ...a, target: s === 'position' ? 'position' : defaultTarget })
            }
          />
          {a.target !== 'position' && (
            <TargetFields value={a.target} onChange={(target) => change({ ...a, target })} />
          )}
          as
          <Choice
            title="Memory slot"
            value={a.slot}
            options={memorySlots}
            onChange={(s) => change({ ...a, slot: s as 'home' })}
          />
        </>
      )}
    </div>
  );
}
export function BehaviorEditor({
  script,
  onChange,
  disabled = false,
  deploymentError = '',
}: {
  script: string;
  onChange: (s: string) => void;
  disabled?: boolean;
  deploymentError?: string;
}) {
  const ids = useRef<string[]>([]),
    lastScript = useRef<string | undefined>(undefined),
    sequence = useRef(0),
    committedIds = useRef<string[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [view, setView] = useState<'builder' | 'script'>('builder'),
    [error, setError] = useState('');
  let program: SurvivorProgram | undefined,
    issue = '';
  try {
    const p = parseSurvivorScript(script);
    if (builderCompatible(p)) program = p;
    else
      issue =
        'This script uses advanced SurvivorScript features that the Behavior Builder cannot safely edit. Continue editing in SurvivorScript.';
  } catch (e) {
    issue = (e as Error).message;
  }
  if (lastScript.current !== script) {
    ids.current = (program?.rules ?? []).map(() => `rule-${++sequence.current}`);
    lastScript.current = script;
    committedIds.current = [...ids.current];
  }
  function update(p: SurvivorProgram) {
    try {
      const text = serializeProgram(p);
      parseSurvivorScript(text);
      lastScript.current = text;
      committedIds.current = [...ids.current];
      onChange(text);
      setError('');
    } catch (e) {
      ids.current = [...committedIds.current];
      setError((e as Error).message);
    }
  }
  const reportedError = error || deploymentError;
  return (
    <fieldset className="behavior-editor" disabled={disabled}>
      <legend>Survivor behavior</legend>
      <div className="behavior-toolbar" role="group" aria-label="Editing view">
        <button
          type="button"
          aria-pressed={view === 'builder'}
          onClick={() => {
            if (program) {
              setView('builder');
              setError('');
            } else setError(issue);
          }}
        >
          Behavior
        </button>
        <button
          type="button"
          aria-pressed={view === 'script'}
          onClick={() => {
            setView('script');
            setError('');
          }}
        >
          Script
        </button>
      </div>
      {(reportedError || (view === 'builder' && issue)) && (
        <p role="alert" className="behavior-error">
          {reportedError || issue}
        </p>
      )}
      {view === 'script' || !program ? (
        <>
          <label>
            SurvivorScript
            <textarea
              id="main-script"
              rows={16}
              spellCheck={false}
              value={script}
              onChange={(e) => {
                onChange(e.target.value);
                setError('');
              }}
              required
              maxLength={16384}
            />
          </label>
          {issue && view === 'script' && !reportedError && <p role="status">{issue}</p>}
        </>
      ) : (
        <>
          <details className="behavior-modes">
            <summary>
              Modes{' '}
              {program.modes.length ? ` - ${program.modes.map(label).join(' / ')}` : ' - optional'}
            </summary>
            {program.modes.map((mode, i) => (
              <div key={mode} className="behavior-toolbar">
                <span>
                  {label(mode)}
                  {i === 0 ? ' (default)' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const name = window.prompt('New mode name', mode);
                    if (name)
                      try {
                        update(renameMode(program!, mode, name.trim().toLowerCase()));
                      } catch (e) {
                        setError((e as Error).message);
                      }
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reduced = {
                      ...program!,
                      modes: program!.modes.filter((m) => m !== mode),
                    };
                    try {
                      parseSurvivorScript(serializeProgram(reduced));
                      update(reduced);
                    } catch {
                      setError('Remove rules using ' + label(mode) + ' before deleting this mode.');
                    }
                  }}
                >
                  Delete mode
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={program.modes.length >= 16}
              onClick={() => {
                const mode = window.prompt('Mode name (letters, numbers and underscores)');
                if (mode) {
                  const normalized = mode.trim().toLowerCase();
                  if (
                    !/^[a-z][a-z0-9_]{0,31}$/.test(normalized) ||
                    program!.modes.includes(normalized)
                  )
                    setError('Choose a unique mode name starting with a letter.');
                  else update({ ...program!, modes: [...program!.modes, normalized] });
                }
              }}
            >
              + Add Mode
            </button>
          </details>
          <h3 className="notebook-heading">Survival rules</h3>
          <p className="rule-explanation">
            Your survivor reads these from top to bottom and follows the first one that matches.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (disabled || !over || active.id === over.id) return;
              const from = ids.current.indexOf(String(active.id)),
                to = ids.current.indexOf(String(over.id));
              const rules = reorderRules(program!.rules, from, to);
              if (rules === program!.rules) return;
              const moved = ids.current.splice(from, 1)[0];
              ids.current.splice(to, 0, moved);
              update({ ...program!, rules });
            }}
          >
            <SortableContext items={ids.current} strategy={verticalListSortingStrategy}>
              <div className="survival-checklist">
                {program.rules.map((rule, i) => {
                  const ruleLines = script
                    .split('\n')
                    .map((text, index) => ({ text: text.trim(), line: index + 1 }))
                    .filter(({ text }) => text.startsWith('WHEN ') || text === 'OTHERWISE')
                    .map(({ line }) => line);
                  const lineStart = ruleLines[i],
                    lineEnd = (ruleLines[i + 1] ?? script.split('\n').length + 1) - 1;
                  const errorLine = Number(reportedError.match(/Line (\d+):/)?.[1]);
                  const fallback = rule.condition.type === 'always',
                    conditions =
                      rule.condition.type === 'and' || rule.condition.type === 'or'
                        ? rule.condition.conditions
                        : [rule.condition];
                  const replace = (condition: Condition) =>
                    update({
                      ...program!,
                      rules: program!.rules.map((r, j) => (j === i ? { ...r, condition } : r)),
                    });
                  const combine = (cs: Condition[], type = 'and') =>
                    replace(cs.length === 1 ? cs[0] : { type: type as 'and', conditions: cs });
                  const move = (delta: number) => {
                    const to = i + delta,
                      rules = reorderRules(program!.rules, i, to);
                    if (rules === program!.rules) return;
                    const id = ids.current.splice(i, 1)[0];
                    ids.current.splice(to, 0, id);
                    update({ ...program!, rules });
                  };
                  return (
                    <NotebookRuleRow
                      key={ids.current[i]}
                      id={ids.current[i]}
                      index={i}
                      pinned={fallback}
                      disabled={disabled}
                    >
                      <div className="behavior-conditions">
                        <strong className="when-marker">{fallback ? 'OTHERWISE' : 'WHEN'}</strong>
                        {!fallback &&
                          conditions.map((c, j) => (
                            <span className="condition-clause" key={j}>
                              {j > 0 && (
                                <Choice
                                  title="Join conditions"
                                  value={rule.condition.type === 'or' ? 'or' : 'and'}
                                  options={['and', 'or']}
                                  onChange={(s) => combine(conditions, s)}
                                />
                              )}
                              <ConditionFields
                                value={c}
                                modes={program!.modes}
                                onChange={(next) =>
                                  combine(
                                    conditions.map((old, k) => (j === k ? next : old)),
                                    rule.condition.type === 'or' ? 'or' : 'and',
                                  )
                                }
                              />
                            </span>
                          ))}
                      </div>
                      <div className="behavior-action">
                        <span className="action-arrow" aria-label="Then">
                          &#8594;
                        </span>
                        <ActionFields
                          value={rule.action}
                          modes={program!.modes}
                          onChange={(action) =>
                            update({
                              ...program!,
                              rules: program!.rules.map((r, j) => (j === i ? { ...r, action } : r)),
                            })
                          }
                        />
                      </div>
                      <details className="rule-menu">
                        <summary aria-label={`Options for rule ${i + 1}`}>&#8943;</summary>
                        <div className="rule-menu-content">
                          {!fallback && (
                            <>
                              <button type="button" disabled={i === 0} onClick={() => move(-1)}>
                                Move up
                              </button>
                              <button
                                type="button"
                                disabled={
                                  i === program!.rules.length - 1 ||
                                  program!.rules[i + 1].condition.type === 'always'
                                }
                                onClick={() => move(1)}
                              >
                                Move down
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const rules = [...program!.rules];
                                  rules.splice(i + 1, 0, structuredClone(rule));
                                  ids.current.splice(i + 1, 0, `rule-${++sequence.current}`);
                                  update({ ...program!, rules });
                                }}
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  combine(
                                    [...conditions, defaultCondition('hasItem', program!.modes)],
                                    rule.condition.type === 'or' ? 'or' : 'and',
                                  )
                                }
                              >
                                + Condition
                              </button>
                              {conditions.length > 1 &&
                                conditions.map((_, j) => (
                                  <button
                                    type="button"
                                    key={j}
                                    onClick={() =>
                                      combine(
                                        conditions.filter((_, k) => k !== j),
                                        rule.condition.type === 'or' ? 'or' : 'and',
                                      )
                                    }
                                  >
                                    Remove condition {j + 1}
                                  </button>
                                ))}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              ids.current.splice(i, 1);
                              update({
                                ...program!,
                                rules: program!.rules.filter((_, j) => i !== j),
                              });
                            }}
                          >
                            Delete rule
                          </button>
                        </div>
                      </details>
                      {errorLine >= lineStart && errorLine <= lineEnd && (
                        <p role="alert" className="behavior-error">
                          {reportedError}
                        </p>
                      )}
                    </NotebookRuleRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          <div className="behavior-toolbar add-rule-controls">
            <button
              type="button"
              onClick={() => {
                const rules = [...program!.rules],
                  fallbackAt = rules.findIndex((r) => r.condition.type === 'always'),
                  at = fallbackAt < 0 ? rules.length : fallbackAt;
                rules.splice(at, 0, {
                  condition: defaultCondition('distance', program!.modes),
                  action: newAction('MOVE_AWAY', program!.modes),
                });
                ids.current.splice(at, 0, `rule-${++sequence.current}`);
                update({ ...program!, rules });
                requestAnimationFrame(() => {
                  const row = document.querySelectorAll<HTMLElement>('.behavior-rule')[at];
                  Array.from(row?.querySelectorAll<HTMLSelectElement>('select') ?? [])
                    .find(
                      (control) =>
                        !control.closest('details:not([open])') &&
                        control.getClientRects().length > 0,
                    )
                    ?.focus();
                });
              }}
            >
              + Add rule
            </button>
            <button
              type="button"
              disabled={program.rules.some((r) => r.condition.type === 'always')}
              onClick={() => {
                ids.current.push(`rule-${++sequence.current}`);
                update({
                  ...program!,
                  rules: [
                    ...program!.rules,
                    { condition: { type: 'always' }, action: { type: 'explore' } },
                  ],
                });
              }}
            >
              + Add OTHERWISE
            </button>
          </div>
          <details>
            <summary>View generated SurvivorScript</summary>
            <pre>{script}</pre>
          </details>
        </>
      )}
    </fieldset>
  );
}
