import { selectors, targetTypes, type Target } from "../language/selectors.js";
import { SurvivorScriptError } from "../language/errors.js";

export function parseTarget(text: string, line: number): Target {
  const parts = text.trim().split(/\s+/);
  const selector = selectors.includes(parts[0] as Target["selector"]) ? parts.shift()! as Target["selector"] : "nearest";
  const type = parts.shift() as Target["type"];
  const rawRange = parts.shift();
  if (!targetTypes.includes(type) || parts.length || (rawRange !== undefined && (!/^\d+$/.test(rawRange) || !Number.isSafeInteger(Number(rawRange))))) {
    throw new SurvivorScriptError(`Invalid target "${text}". Use [selector] target [range].`, line);
  }
  if ((selector === "weakest" || selector === "strongest") && type !== "zombie" && type !== "survivor") {
    throw new SurvivorScriptError("weakest and strongest require a living target.", line);
  }
  return { type, selector, ...(rawRange === undefined ? {} : { range: Number(rawRange) }) };
}
