import type { SurvivorProgram, SurvivorAction } from "../language/types.js";
import type { ScriptContext } from "./context.js";
import { Survivor } from "../../entities/survivor.js";
import { runSurvivorProgram } from "./interpreter.js";
import { executeSurvivorAction } from "./actionExecutor.js";

export function runSurvivorTick(program: SurvivorProgram, context: ScriptContext): { action: SurvivorAction; message: string } {
  const actor = context.survivor;
  if (actor instanceof Survivor) actor.updateNeeds();
  if (!actor.isAlive()) {
    context.grid.removeEntity(actor.id);
    return { action: { type: "wait" }, message: "Survivor is dead." };
  }
  const action = runSurvivorProgram(program, context);
  return { action, message: executeSurvivorAction(action, context) };
}
