import { InventorySlot } from './inventory-slot';

export interface Character {
  name: string;
  region: string;
  job: string;
  level: number;
  imageURL: string;
  inventory: InventorySlot[];
}
