import type { Condition, ScriptRule, SurvivorProgram } from '../language/types.js';
import { SurvivorScriptError } from '../language/errors.js';
import { parseCondition } from './conditions.js';
import { parseAction } from './actions.js';
import { conditionLeaves, conditionNodeCount } from '../language/conditions.js';
import { requiredCapabilities, type Capability } from '../language/progression.js';

export interface CompileOptions {
  maxRules?: number;
  maxConditionNodes?: number;
  memoryBudget?: number;
  unlockedCapabilities?: readonly Capability[];
}
export function parseSurvivorScript(
  script: string,
  actor: 'survivor' | 'zombie' = 'survivor',
  options: CompileOptions = {},
): SurvivorProgram {
  if (new TextEncoder().encode(script).length > 16384)
    throw new SurvivorScriptError('Script must contain at most 16 KiB.');
  if (script.split('\n').some((line) => line.length > 512))
    throw new SurvivorScriptError('Script lines may contain at most 512 characters.');
  const maxNodes = options.maxConditionNodes ?? 250;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 0)
    throw new SurvivorScriptError('Condition node budget must be a nonnegative whole number.');
  let nodes = 0;
  const lines = script
    .split('\n')
    .map((line, index) => ({
      text: line.trim(),
      lineNumber: index + 1,
    }))
    .filter((line) => line.text.length > 0 && !line.text.startsWith('#'));

  const rules: ScriptRule[] = [];
  const modes: string[] = [];

  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index];

    if (currentLine.text.startsWith('MODE ')) {
      const name = currentLine.text.slice(5);
      if (
        rules.length ||
        !/^[a-z][a-z0-9_]{0,31}$/.test(name) ||
        modes.includes(name) ||
        modes.length >= 16
      )
        throw new SurvivorScriptError(
          'Declare up to 16 unique MODE names before rules (lowercase letters, digits, underscores; max 32 characters).',
          currentLine.lineNumber,
        );
      modes.push(name);
      index++;
      continue;
    }
    let condition: Condition;

    if (currentLine.text.startsWith('WHEN ')) {
      const conditionText = currentLine.text.substring(5).trim();

      condition = parseCondition(conditionText, currentLine.lineNumber);
    } else if (currentLine.text === 'OTHERWISE') {
      condition = {
        type: 'always',
      };
    } else {
      throw new SurvivorScriptError(
        `Expected WHEN or OTHERWISE, found "${currentLine.text}"`,
        currentLine.lineNumber,
      );
    }

    index++;

    if (index >= lines.length) {
      throw new SurvivorScriptError('Expected an action after condition.', currentLine.lineNumber);
    }

    const actionLine = lines[index];

    const action = parseAction(actionLine.text, actionLine.lineNumber);

    nodes += conditionNodeCount(condition);
    if (nodes > maxNodes)
      throw new SurvivorScriptError(
        `Program uses ${nodes} condition nodes; limit is ${maxNodes}.`,
        currentLine.lineNumber,
      );
    const conditions = conditionLeaves(condition);
    if (options.unlockedCapabilities) {
      for (const capability of requiredCapabilities(condition, action)) {
        if (!options.unlockedCapabilities.includes(capability))
          throw new SurvivorScriptError(
            `Capability locked: ${capability}.`,
            currentLine.lineNumber,
          );
      }
    }
    for (const part of conditions) {
      if (part.type === 'mode' && !modes.includes(part.value))
        throw new SurvivorScriptError(`Undeclared mode "${part.value}".`, currentLine.lineNumber);
    }
    if (action.type === 'setMode' && !modes.includes(action.mode))
      throw new SurvivorScriptError(`Undeclared mode "${action.mode}".`, actionLine.lineNumber);
    const inner = action.type === 'sprint' ? action.action : action;
    if (
      inner.type === 'targeted' &&
      ['ATTACK', 'SHOOT'].includes(inner.verb) &&
      inner.target.type === actor
    )
      throw new SurvivorScriptError(
        'Combat must target the opposing actor type.',
        actionLine.lineNumber,
      );
    if (actor === 'zombie') {
      const legalAction =
        ['move', 'explore', 'wait', 'setMode'].includes(action.type) ||
        (action.type === 'targeted' &&
          ['MOVE_TO', 'MOVE_AWAY', 'ATTACK', 'FOLLOW'].includes(action.verb) &&
          ['survivor', 'zombie'].includes(action.target.type));
      const legalConditions = conditions.every(
        (part) =>
          ['always', 'mode'].includes(part.type) ||
          (part.type === 'stat' && part.stat === 'health') ||
          ((part.type === 'count' || part.type === 'distance' || part.type === 'visible') &&
            ['survivor', 'zombie'].includes(part.target.type)),
      );
      if (!legalAction || !legalConditions)
        throw new SurvivorScriptError(
          'This capability requires a survivor script.',
          currentLine.lineNumber,
        );
    }

    rules.push({
      actionSource: actionLine.text,
      condition,
      action,
    });

    index++;
  }

  const memoryCost = rules.reduce(
    (sum, rule) =>
      sum +
      conditionLeaves(rule.condition).reduce(
        (cost, part) => cost + (part.type === 'count' ? 2 : 1),
        0,
      ) +
      (rule.action.type === 'remember' ? 3 : rule.action.type === 'targeted' ? 2 : 1),
    0,
  );
  for (const limit of [options.maxRules, options.memoryBudget]) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0))
      throw new SurvivorScriptError('Program limits must be nonnegative whole numbers.');
  }
  if (rules.length > (options.maxRules ?? 100))
    throw new SurvivorScriptError(
      `Program uses ${rules.length} rules; limit is ${options.maxRules ?? 100}.`,
    );
  if (options.memoryBudget !== undefined && memoryCost > options.memoryBudget)
    throw new SurvivorScriptError(`Program Memory: ${memoryCost} / ${options.memoryBudget}.`);
  return { rules, modes, memoryCost };
}
