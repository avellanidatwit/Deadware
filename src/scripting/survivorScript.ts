/** Public compatibility facade. Parsing and execution live in focused modules. */
export * from "./language/types.js";
export { SurvivorScriptError } from "./language/errors.js";
export type { ScriptContext } from "./runtime/context.js";
export { parseSurvivorScript } from "./parser/parser.js";
export { runSurvivorProgram } from "./runtime/interpreter.js";
export { runSurvivorTick } from "./runtime/survivorTick.js";
export { executeSurvivorAction } from "./runtime/actionExecutor.js";
export type { CompileOptions } from "./parser/parser.js";
export { progressionStages } from "./language/progression.js";
export type { Capability } from "./language/progression.js";
