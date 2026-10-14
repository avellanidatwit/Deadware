export const behaviorPresets = [
  {
    name: 'Coward',
    description: 'Avoids danger and prioritizes survival.',
    script: `WHEN distance nearest zombie <= 5
    SPRINT MOVE_AWAY nearest zombie
WHEN health < 40 AND hasItem bandage
    USE bandage`,
  },
  {
    name: 'Scavenger',
    description: 'Searches aggressively for supplies.',
    script: `WHEN count zombie 6 >= 3
    MOVE_AWAY nearest zombie
WHEN health < 30 AND hasItem bandage
    USE bandage
WHEN itemsOnFloor AND inventorySpace
    PICK_UP items
WHEN distance nearest container <= 1 AND inventorySpace
    SEARCH nearest container
WHEN visible nearest container AND inventorySpace
    MOVE_TO nearest container`,
  },
  {
    name: 'Fighter',
    description: 'Engages isolated zombies and avoids large groups.',
    script: `WHEN health < 30 AND hasItem bandage
    USE bandage
WHEN count zombie 6 >= 3
    SPRINT MOVE_AWAY nearest zombie
WHEN distance nearest zombie <= 1
    ATTACK weakest zombie
WHEN distance nearest zombie <= 6 AND equipped gun AND ammo > 0
    SHOOT nearest zombie
WHEN equipped gun AND ammo == 0 AND hasItem ammo
    RELOAD`,
  },
  {
    name: 'Explorer',
    description: 'Prioritizes revealing the world.',
    script: `WHEN distance nearest zombie <= 3
    MOVE_AWAY nearest zombie
WHEN health < 30 AND hasItem bandage
    USE bandage`,
  },
].map((p) => ({
  ...p,
  script: `${p.script}\nWHEN hunger > 70 AND hasItem food\n    EAT food\nWHEN thirst > 70 AND hasItem water\n    USE water\nOTHERWISE\n    EXPLORE`,
}));

export const zombieBehaviorPresets = [
  {
    name: 'Hunter',
    description: 'Attacks nearby survivors and pursues those in sight.',
    script: `WHEN distance nearest survivor <= 1
    ATTACK nearest survivor
WHEN visible nearest survivor
    MOVE_TO nearest survivor
OTHERWISE
    EXPLORE`,
  },
  {
    name: 'Pack follower',
    description: 'Hunts survivors and stays near other zombies.',
    script: `WHEN distance nearest survivor <= 1
    ATTACK weakest survivor
WHEN visible nearest survivor
    MOVE_TO nearest survivor
WHEN visible nearest zombie
    FOLLOW nearest zombie
OTHERWISE
    EXPLORE`,
  },
  {
    name: 'Cautious',
    description: 'Retreats when injured, otherwise hunts.',
    script: `WHEN health < 30 AND visible nearest survivor
    MOVE_AWAY nearest survivor
WHEN distance nearest survivor <= 1
    ATTACK nearest survivor
WHEN visible nearest survivor
    MOVE_TO nearest survivor
OTHERWISE
    EXPLORE`,
  },
  {
    name: 'Roamer',
    description: 'Explores and attacks survivors within reach.',
    script: `WHEN distance nearest survivor <= 1
    ATTACK nearest survivor
OTHERWISE
    EXPLORE`,
  },
  {
    name: 'Guard',
    description: 'Waits until a survivor comes into view.',
    script: `WHEN distance nearest survivor <= 1
    ATTACK nearest survivor
WHEN visible nearest survivor
    MOVE_TO nearest survivor
OTHERWISE
    WAIT`,
  },
];
