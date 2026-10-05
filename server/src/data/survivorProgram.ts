/** Editable starting priorities: survive, scavenge, open buildings, explore. */
export const survivorCode = `WHEN health < 40 AND hasItem bandage
    USE bandage

WHEN zombieNearby 1
    ATTACK zombie

WHEN zombieNearby 6
    MOVE_AWAY nearest zombie

WHEN thirsty AND hasItem water
    USE water

WHEN hungry AND hasItem food
    EAT food

WHEN hasItem weapon AND NOT equipped weapon
    EQUIP weapon

WHEN itemsOnFloor AND inventorySpace
    PICK_UP items

WHEN containerNearby AND inventorySpace
    SEARCH nearest container

WHEN doorNearby
    OPEN door

WHEN containerNearby 8 AND inventorySpace
    MOVE_TO nearest container

WHEN distance nearest door > 1
    MOVE_TO nearest door

OTHERWISE
    EXPLORE`;
