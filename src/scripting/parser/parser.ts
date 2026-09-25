import type { Condition, ScriptRule, SurvivorProgram } from "../language/types.js";
import { SurvivorScriptError } from "../language/errors.js";
import { parseCondition } from "./conditions.js";
import { parseAction } from "./actions.js";
import { conditionLeaves } from "../language/conditions.js";
import { requiredCapabilities, type Capability } from "../language/progression.js";

export interface CompileOptions { maxRules?: number; memoryBudget?: number; unlockedCapabilities?: readonly Capability[] }
export function parseSurvivorScript(
  script: string,
  actor: "survivor" | "zombie" = "survivor",
  options: CompileOptions = {}
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

    const conditions = conditionLeaves(condition);
    if (options.unlockedCapabilities) {
      for (const capability of requiredCapabilities(condition, action)) {
        if (!options.unlockedCapabilities.includes(capability)) throw new SurvivorScriptError(`Capability locked: ${capability}.`, currentLine.lineNumber);
      }
    }
    if (actor === "zombie" && (["targeted", "item", "remember", "reload"].includes(action.type) || conditions.some(part => ["stat", "hasItem", "equipped", "count", "visible", "distance", "remembered"].includes(part.type)))) {
      throw new SurvivorScriptError("This capability requires a survivor script.", currentLine.lineNumber);
    }
    if (actor === "zombie" && (action.type === "openDoor" || conditions.some(part => part.type === "nearbydoor"))) {
      throw new SurvivorScriptError("Door commands require a survivor script.", currentLine.lineNumber);
    }

    if (actor === "zombie" && (action.type === "moveToContainer" || action.type === "pickUpItems" || conditions.some(part => part.type === "inventoryFull" || part.type === "inventorySpace") || conditions.some(part => part.type === "itemsOnFloor") || action.type === "searchContainer" || action.type === "lookFloor" || conditions.some(part => part.type === "containerNearby"))) {
      throw new SurvivorScriptError("Container and floor searches require a survivor script.", currentLine.lineNumber);
    }
    if (action.type === "attack" && action.target === actor) {
      throw new SurvivorScriptError(actor === "zombie" ? "Zombie actions must target a survivor for ATTACK." : "Survivors must ATTACK zombie.", actionLine.lineNumber);
    }
    if (actor === "zombie" && action.type === "moveAway") {
      throw new SurvivorScriptError("Zombie actions: CHASE survivor, WANDER, EXPLORE, MOVE direction, or WAIT.", actionLine.lineNumber);
    }
    if (actor === "survivor" && action.type === "chase") {
      throw new SurvivorScriptError("CHASE survivor requires a zombie script; use FOLLOW survivor.", currentLine.lineNumber);
    }

    rules.push({
      condition,
      action,
    });

    index++;
  }

  const memoryCost = rules.reduce((sum, rule) => sum + conditionLeaves(rule.condition).reduce((cost, part) => cost + (part.type === "count" ? 2 : 1), 0) +
    (rule.action.type === "remember" ? 3 : rule.action.type === "targeted" ? 2 : 1), 0);
  for (const limit of [options.maxRules, options.memoryBudget]) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) throw new SurvivorScriptError("Program limits must be nonnegative whole numbers.");
  }
  if (options.maxRules !== undefined && rules.length > options.maxRules) throw new SurvivorScriptError(`Program uses ${rules.length} rules; limit is ${options.maxRules}.`);
  if (options.memoryBudget !== undefined && memoryCost > options.memoryBudget) throw new SurvivorScriptError(`Program Memory: ${memoryCost} / ${options.memoryBudget}.`);
  return { rules, memoryCost };
}
