import type { SurvivorProgram, SurvivorAction } from "../language/types.js";
import type { ScriptContext } from "./context.js";
import { Survivor } from "../../entities/survivor.js";
import { runSurvivorProgram } from "./interpreter.js";
import { executeSurvivorAction } from "./actionExecutor.js";

export function runSurvivorTick(program: SurvivorProgram, context: ScriptContext): { action: SurvivorAction; message: string } {
  const actor = context.survivor;
  if (actor instanceof Survivor) {
    const beforeHealth = actor.health;
    actor.updateNeeds();
    if (actor.health < beforeHealth) actor.recordEvent(context.tick ?? 0, `Needs caused ${beforeHealth - actor.health} damage.`);
  }
  if (!actor.isAlive()) {
    context.grid.removeEntity(actor.id);
    if (actor instanceof Survivor) actor.recordEvent(context.tick ?? 0, "Died before taking an action.");
    return { action: { type: "wait" }, message: "Survivor is dead." };
  }
  const action = runSurvivorProgram(program, context);
  const message = executeSurvivorAction(action, context);
  if (actor instanceof Survivor) {
    const label = action.type === "targeted" || action.type === "item" ? action.verb : action.type;
    actor.recordEvent(context.tick ?? 0, `${label}: ${message}`);
  }
  return { action, message };
}
