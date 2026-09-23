import type { Grid } from "../world/grid.js";
import { searchTargets } from "../world/perception.js";
import type { Survivor } from "../entities/survivor.js";
import type { Zombie } from "../entities/zombie.js";

// ======================================================
// ACTIONS
// ======================================================

export type Direction =
  | "north"
  | "south"
  | "east"
  | "west";

export type SurvivorAction =
  | { type: "openDoor" }
  | { type: "moveToContainer"; range: number }
  | { type: "pickUpItems" }
  | { type: "searchContainer" }
  | { type: "lookFloor"; itemType?: "food" | "weapon" }
  | { type: "chase"; target: "survivor"; range?: number }
  | { type: "wander" }
  | {
      type: "move";
      direction: Direction;
    }
  | {
      type: "moveAway";
      target: "zombie";
    }
  | {
      type: "attack";
      target: "zombie" | "survivor";
    }
  | {
      type: "explore";
    }
  | {
      type: "wait";
    };

// ======================================================
// SCRIPT CONTEXT
// ======================================================

export interface ScriptContext {
  grid: Grid;
  survivor: Survivor | Zombie;
  zombies: Zombie[];
  survivors?: Survivor[];
  detectionRange?: number;
  /** Skip movement rules while on cooldown, allowing later non-movement rules. */
  canMove?: boolean;
}

// ======================================================
// CONDITIONS
// ======================================================

type ComparisonOperator =
  | "<"
  | ">"
  | "<="
  | ">="
  | "=="
  | "!=";

type Condition =
  | { type: "nearbydoor" }
  | { type: "inventoryFull" }
  | { type: "itemsOnFloor" }
  | { type: "containerNearby" }
  | { type: "survivorNearby"; range?: number }
  | {
      type: "zombieNearby";
      range?: number;
    }
  | {
      type: "healthComparison";
      operator: ComparisonOperator;
      value: number;
    }
  | {
      type: "always";
    };

// ======================================================
// RULE
// ======================================================

interface ScriptRule {
  condition: Condition;
  action: SurvivorAction;
}

export interface SurvivorProgram {
  rules: ScriptRule[];
}

// ======================================================
// SCRIPT ERROR
// ======================================================

export class SurvivorScriptError extends Error {
  constructor(
    message: string,
    public lineNumber?: number
  ) {
    super(
      lineNumber !== undefined
        ? `Line ${lineNumber}: ${message}`
        : message
    );

    this.name = "SurvivorScriptError";
  }
}

// ======================================================
// PARSER
// ======================================================

export function parseSurvivorScript(
  script: string,
  actor: "survivor" | "zombie" = "survivor"
): SurvivorProgram {
  const lines = script
    .split("\n")
    .map((line, index) => ({
      text: line.trim(),
      lineNumber: index + 1,
    }))
    .filter(
      (line) =>
        line.text.length > 0 &&
        !line.text.startsWith("#")
    );

  const rules: ScriptRule[] = [];

  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index];

    let condition: Condition;

    if (currentLine.text.startsWith("WHEN ")) {
      const conditionText = currentLine.text
        .substring(5)
        .trim();

      condition = parseCondition(
        conditionText,
        currentLine.lineNumber
      );
    } else if (
      currentLine.text === "OTHERWISE"
    ) {
      condition = {
        type: "always",
      };
    } else {
      throw new SurvivorScriptError(
        `Expected WHEN or OTHERWISE, found "${currentLine.text}"`,
        currentLine.lineNumber
      );
    }

    index++;

    if (index >= lines.length) {
      throw new SurvivorScriptError(
        "Expected an action after condition.",
        currentLine.lineNumber
      );
    }

    const actionLine = lines[index];

    const action = parseAction(
      actionLine.text,
      actionLine.lineNumber
    );

    if (actor === "zombie" && (action.type === "openDoor" || condition.type === "nearbydoor")) {
      throw new SurvivorScriptError("Door commands require a survivor script.", currentLine.lineNumber);
    }

    if (actor === "zombie" && (action.type === "moveToContainer" || action.type === "pickUpItems" || condition.type === "inventoryFull" || condition.type === "itemsOnFloor" || action.type === "searchContainer" || action.type === "lookFloor" || condition.type === "containerNearby")) {
      throw new SurvivorScriptError("Container and floor searches require a survivor script.", currentLine.lineNumber);
    }
    if (action.type === "attack" && action.target === actor) {
      throw new SurvivorScriptError(actor === "zombie" ? "Zombie actions must target a survivor for ATTACK." : "Survivors must ATTACK zombie.", actionLine.lineNumber);
    }
    if (actor === "zombie" && action.type === "moveAway") {
      throw new SurvivorScriptError("Zombie actions: CHASE survivor, WANDER, EXPLORE, MOVE direction, or WAIT.", actionLine.lineNumber);
    }
    if (actor === "survivor" && (action.type === "chase" || condition.type === "survivorNearby")) {
      throw new SurvivorScriptError("CHASE survivor and survivorNearby require a zombie script.", currentLine.lineNumber);
    }

    rules.push({
      condition,
      action,
    });

    index++;
  }

  return {
    rules,
  };
}

// ======================================================
// CONDITION PARSING
// ======================================================

function parseCondition(
  text: string,
  lineNumber: number
): Condition {
  if (text === "nearbydoor") return { type: "nearbydoor" };
  if (text === "inventoryFull") return { type: "inventoryFull" };
  if (text === "itemsOnFloor") return { type: "itemsOnFloor" };
  if (text === "containerNearby") return { type: "containerNearby" };
  const nearbyMatch = text.match(/^(zombieNearby|survivorNearby)(?:\s+(.*))?$/);
  if (nearbyMatch) {
    const value = nearbyMatch[2];
    const range = value === undefined ? undefined : Number(value);
    if (value !== undefined && (!/^\d+$/.test(value) || !Number.isSafeInteger(range))) {
      throw new SurvivorScriptError("Nearby range must be a nonnegative whole number, for example zombieNearby 10.", lineNumber);
    }
    return { type: nearbyMatch[1] as "zombieNearby" | "survivorNearby", range };
  }

  const healthMatch = text.match(
    /^health\s*(<=|>=|==|!=|<|>)\s*(\d+)$/
  );

  if (healthMatch) {
    return {
      type: "healthComparison",

      operator:
        healthMatch[1] as ComparisonOperator,

      value: Number(healthMatch[2]),
    };
  }

  throw new SurvivorScriptError(
    `Unknown condition "${text}"`,
    lineNumber
  );
}

// ======================================================
// ACTION PARSING
// ======================================================

function parseAction(
  text: string,
  lineNumber: number
): SurvivorAction {
  const parts = text.split(/\s+/);

  const command = parts[0];
  if (command === "OPEN" && parts.length === 2 && parts[1] === "door") return { type: "openDoor" };

  if (command === "PICK_UP" && parts.length === 2 && parts[1] === "items") return { type: "pickUpItems" };
  if (command === "MOVE_TO" && parts[1] === "container") {
    const range = parts[2] === undefined ? 10 : Number(parts[2]);
    if (parts.length > 3 || (parts[2] !== undefined && !/^\d+$/.test(parts[2])) || !Number.isSafeInteger(range)) {
      throw new SurvivorScriptError("Use MOVE_TO container with an optional nonnegative whole-number range.", lineNumber);
    }
    return { type: "moveToContainer", range };
  }

  if (command === "SEARCH" && parts.length === 2 && parts[1] === "container") return { type: "searchContainer" };
  if (command === "LOOK" && parts[1] === "floor" &&
      (parts.length === 2 || (parts.length === 3 && (parts[2] === "food" || parts[2] === "weapon")))) {
    return { type: "lookFloor", itemType: parts[2] as "food" | "weapon" | undefined };
  }

  if (command === "CHASE") {
    if (parts.length !== 2 || parts[1] !== "survivor") {
      throw new SurvivorScriptError("CHASE requires survivor.", lineNumber);
    }
    return { type: "chase", target: "survivor" };
  }
  if (command === "WANDER") return { type: "wander" };

  if (command === "MOVE") {
    const direction = parts[1];

    if (
      direction !== "north" &&
      direction !== "south" &&
      direction !== "east" &&
      direction !== "west"
    ) {
      throw new SurvivorScriptError(
        `Invalid direction "${direction}".`,
        lineNumber
      );
    }

    return {
      type: "move",
      direction,
    };
  }

  if (command === "MOVE_AWAY") {
    if (parts[1] !== "zombie") {
      throw new SurvivorScriptError(
        "MOVE_AWAY currently requires zombie.",
        lineNumber
      );
    }

    return {
      type: "moveAway",
      target: "zombie",
    };
  }

  if (command === "ATTACK") {
    if (parts.length !== 2 || (parts[1] !== "zombie" && parts[1] !== "survivor")) {
      throw new SurvivorScriptError(
        "ATTACK requires zombie or survivor.",
        lineNumber
      );
    }

    return {
      type: "attack",
      target: parts[1],
    };
  }

  if (command === "EXPLORE") {
    return {
      type: "explore",
    };
  }

  if (command === "WAIT") {
    return {
      type: "wait",
    };
  }

  throw new SurvivorScriptError(
    `Unknown action "${text}"`,
    lineNumber
  );
}

// ======================================================
// INTERPRETER
// ======================================================

export function runSurvivorProgram(
  program: SurvivorProgram,
  context: ScriptContext
): SurvivorAction {
  // Rules execute from top to bottom.
  // First matching rule wins.

  for (const rule of program.rules) {
    const movement = rule.action.type === "move" || rule.action.type === "moveAway" ||
      rule.action.type === "moveToContainer" || rule.action.type === "explore" ||
      rule.action.type === "wander" || rule.action.type === "chase";
    if (context.canMove === false && movement) continue;
    if (
      evaluateCondition(
        rule.condition,
        context
      )
    ) {
      // Use the matched detection radius for this chase only, without changing the entity default.
      if (rule.action.type === "chase" && rule.condition.type === "survivorNearby") {
        return { ...rule.action, range: rule.condition.range ?? context.detectionRange ?? 5 };
      }
      return rule.action;
    }
  }

  return {
    type: "wait",
  };
}

// ======================================================
// CONDITION EVALUATION
// ======================================================

function evaluateCondition(
  condition: Condition,
  context: ScriptContext
): boolean {
  switch (condition.type) {
    case "nearbydoor":
      return "findNearbyDoors" in context.survivor && context.survivor.findNearbyDoors(context.grid).length > 0;
    case "inventoryFull":
      return "inventory" in context.survivor && context.survivor.inventory.length >= context.survivor.inventoryCapacity;
    case "itemsOnFloor":
      return "lookAtFloor" in context.survivor && context.survivor.lookAtFloor(context.grid).length > 0;
    case "containerNearby":
      return "findContainers" in context.survivor && context.survivor.findContainers(context.grid)
        .some(container => container.contents.length > 0);
    case "always":
      return true;

    case "zombieNearby":
      return isZombieNearby(context, condition.range ?? 5);

    case "survivorNearby":
      return searchTargets(context.grid, context.survivor, context.survivors ?? [], {
        range: condition.range ?? context.detectionRange ?? 5,
        predicate: survivor => survivor.id !== context.survivor.id && survivor.isAlive(),
      }).length > 0;

    case "healthComparison":
      return compareNumbers(
        context.survivor.health,
        condition.operator,
        condition.value
      );
  }
}

// ======================================================
// ZOMBIE DETECTION
// ======================================================

function isZombieNearby(
  context: ScriptContext,
  range = 5
): boolean {
  return searchTargets(context.grid, context.survivor, context.zombies, {
    range,
    predicate: zombie => zombie.id !== context.survivor.id && zombie.isAlive(),
  }).length > 0;
}

// ======================================================
// COMPARISON
// ======================================================

function compareNumbers(
  left: number,
  operator: ComparisonOperator,
  right: number
): boolean {
  switch (operator) {
    case "<":
      return left < right;

    case ">":
      return left > right;

    case "<=":
      return left <= right;

    case ">=":
      return left >= right;

    case "==":
      return left === right;

    case "!=":
      return left !== right;
  }
}
