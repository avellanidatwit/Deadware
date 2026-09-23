import type { Item } from "../entities/item.js";

export type TileType =
  | "empty"
  | "road"
  | "buildingWall"
  | "buildingFloor"
  | "door"
  | "openDoor";

export interface GridEntity {
  id: string;
  x: number;
  y: number;
  symbol: string;
  blocksMovement?: boolean;
}

export interface GridCell {
  x: number;
  y: number;
  tileType: TileType;
  entities: GridEntity[];
  items: Item[];
}

export class Grid {
  public readonly width: number;
  public readonly height: number;

  private cells: GridCell[][];

  constructor(width = 50, height = 50) {
    this.width = width;
    this.height = height;

    this.cells = [];

    for (let y = 0; y < height; y++) {
      const row: GridCell[] = [];

      for (let x = 0; x < width; x++) {
        row.push({
          x,
          y,
          tileType: "empty",
          entities: [],
          items: [],
        });
      }

      this.cells.push(row);
    }
  }

  // Get a tile from the grid
  getCell(x: number, y: number): GridCell | null {
    if (!this.isValidPosition(x, y)) {
      return null;
    }

    return this.cells[y][x];
  }

  // Check whether coordinates are inside the map
  isValidPosition(x: number, y: number): boolean {
    return (
      x >= 0 &&
      x < this.width &&
      y >= 0 &&
      y < this.height
    );
  }

  // Check whether an entity can walk onto a tile
  isWalkable(x: number, y: number): boolean {
    const cell = this.getCell(x, y);

    if (!cell) {
      return false;
    }

    return cell.tileType !== "buildingWall" && cell.tileType !== "door" && !cell.entities.some(entity => entity.blocksMovement);
  }

  // Add an entity to the grid
  addEntity(entity: GridEntity): boolean {
    const cell = this.getCell(entity.x, entity.y);

    if (!cell) {
      console.error(
        `Cannot add ${entity.id}: position is outside the grid.`
      );

      return false;
    }

    if (!this.isWalkable(entity.x, entity.y)) {
      console.error(
        `Cannot add ${entity.id}: position is blocked.`
      );

      return false;
    }

    cell.entities.push(entity);

    return true;
  }

  // Remove an entity from the grid
  removeEntity(entityId: string): boolean {
    for (const row of this.cells) {
      for (const cell of row) {
        const index = cell.entities.findIndex(
          (entity) => entity.id === entityId
        );

        if (index !== -1) {
          cell.entities.splice(index, 1);
          return true;
        }
      }
    }

    return false;
  }

  // Move an entity to another tile
  moveEntity(
    entity: GridEntity,
    newX: number,
    newY: number
  ): boolean {
    if (!this.isWalkable(newX, newY)) {
      return false;
    }

    const oldCell = this.getCell(entity.x, entity.y);
    const newCell = this.getCell(newX, newY);

    if (!oldCell || !newCell) {
      return false;
    }

    const entityIndex = oldCell.entities.findIndex(
      (currentEntity) => currentEntity.id === entity.id
    );

    if (entityIndex === -1) {
      return false;
    }

    oldCell.entities.splice(entityIndex, 1);

    entity.x = newX;
    entity.y = newY;

    newCell.entities.push(entity);

    return true;
  }

  // Create a simple rectangular building
  createBuilding(
    startX: number,
    startY: number,
    width: number,
    height: number
  ): boolean {
    // Buildings need enough space for walls and an interior
    if (width < 3 || height < 3) {
      console.error(
        "Buildings must be at least 3x3."
      );

      return false;
    }

    // Make sure the building fits inside the map
    if (
      startX < 0 ||
      startY < 0 ||
      startX + width > this.width ||
      startY + height > this.height
    ) {
      console.error(
        "Building does not fit inside the grid."
      );

      return false;
    }

    for (
      let y = startY;
      y < startY + height;
      y++
    ) {
      for (
        let x = startX;
        x < startX + width;
        x++
      ) {
        const cell = this.cells[y][x];

        const isTop = y === startY;
        const isBottom =
          y === startY + height - 1;
        const isLeft = x === startX;
        const isRight =
          x === startX + width - 1;

        if (
          isTop ||
          isBottom ||
          isLeft ||
          isRight
        ) {
          cell.tileType = "buildingWall";
        } else {
          cell.tileType = "buildingFloor";
        }
      }
    }

    // Add a door to the middle of the bottom wall
    const doorX =
      startX + Math.floor(width / 2);

    const doorY =
      startY + height - 1;

    this.cells[doorY][doorX].tileType = "door";

    return true;
  }

  // Print the map to the console
  print(): void {
    for (let y = 0; y < this.height; y++) {
      let line = "";

      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];

        // Entities appear on top of terrain
        if (cell.entities.length > 0) {
          line += cell.entities[0].symbol;
          continue;
        }

        switch (cell.tileType) {
          case "empty":
          case "road":
            line += ".";
            break;

          case "buildingWall":
            line += "#";
            break;

          case "buildingFloor":
            line += " ";
            break;

          case "door":
            line += "D";
            break;
          case "openDoor":
            line += "/";
            break;
        }
      }

      console.log(line);
    }
  }
}
