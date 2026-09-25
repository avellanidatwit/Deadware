import type { SurvivorAction } from "../language/types.js";
import { SurvivorScriptError } from "../language/errors.js";
import { parseTarget } from "./targets.js";
import { ITEM_TYPES } from "../../data/itemCatalog.js";
import type { ItemType } from "../../entities/item.js";
export function parseAction(
  text: string,
  lineNumber: number
): SurvivorAction {
  const parts = text.split(/\s+/);

  const command = parts[0];
  if (["WAIT", "EXPLORE", "WANDER", "RELOAD"].includes(command) && parts.length !== 1 || command === "MOVE" && parts.length !== 2 || command === "MOVE_AWAY" && parts.length < 2) {
    throw new SurvivorScriptError(`Unexpected arguments for ${command}.`, lineNumber);
  }
  if (command === "RELOAD") return { type: "reload" };
  const remember = text.match(/^(?:REMEMBER (.+) AS (home|target|lastZombie|lastContainer)|SET (home|target|lastZombie|lastContainer) = (.+))$/);
  if (remember) {
    const source = remember[1] ?? remember[4];
    return { type: "remember", slot: (remember[2] ?? remember[3]) as "home", target: source === "position" ? "position" : parseTarget(source, lineNumber) };
  }
  if (["PICK_UP", "DROP", "EAT", "USE", "EQUIP"].includes(command) && parts.length === 2 && ITEM_TYPES.includes(parts[1] as ItemType)) {
    const itemType = parts[1] as ItemType;
    if (command === "EAT" && itemType !== "food" || command === "USE" && !["bandage", "water"].includes(itemType) || command === "EQUIP" && !["weapon", "gun"].includes(itemType)) {
      throw new SurvivorScriptError(`Unsupported item for ${command}.`, lineNumber);
    }
    return { type: "item", verb: command as "PICK_UP", itemType };
  }
  const legacy = /^(MOVE_TO container(?:\s+\S+)?|MOVE_AWAY zombie|ATTACK (zombie|survivor)|SEARCH container|OPEN door)$/.test(text);
  if (!legacy && ["MOVE_TO", "MOVE_AWAY", "ATTACK", "SHOOT", "SEARCH", "OPEN", "FOLLOW", "RETURN", "PATROL"].includes(command)) {
    const target = parseTarget(parts.slice(1).join(" "), lineNumber);
    if (["ATTACK", "SHOOT", "MOVE_AWAY"].includes(command) && target.type !== "zombie" ||
        command === "FOLLOW" && target.type !== "survivor" || command === "OPEN" && target.type !== "door" ||
        command === "SEARCH" && !["container", ...ITEM_TYPES].includes(target.type) ||
        ["RETURN", "PATROL"].includes(command) && !["home", "target", "lastZombie", "lastContainer"].includes(target.type)) {
      throw new SurvivorScriptError(`Invalid target for ${command}.`, lineNumber);
    }
    return { type: "targeted", verb: command as "MOVE_TO", target };
  }
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
      (parts.length === 2 || (parts.length === 3 && ITEM_TYPES.includes(parts[2] as ItemType)))) {
    return { type: "lookFloor", itemType: parts[2] as ItemType | undefined };
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
