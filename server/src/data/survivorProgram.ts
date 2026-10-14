/** Editable starting priorities: survive, scavenge, open buildings, explore. */
export const survivorCode = `WHEN health < 40 AND hasItem bandage
    USE bandage

WHEN count zombie 1 > 0
    ATTACK zombie

WHEN count zombie 6 > 0
    MOVE_AWAY nearest zombie

WHEN thirst > 70 AND hasItem water
    USE water

WHEN hunger > 70 AND hasItem food
    EAT food

WHEN hasItem weapon AND NOT equipped weapon
    EQUIP weapon

WHEN itemsOnFloor AND inventorySpace
    PICK_UP items

WHEN count container 1 > 0 AND inventorySpace
    SEARCH nearest container

WHEN distance nearest door <= 1
    OPEN door

WHEN count container 8 > 0 AND inventorySpace
    MOVE_TO nearest container

WHEN distance nearest door > 1
    MOVE_TO nearest door

OTHERWISE
    EXPLORE`;
