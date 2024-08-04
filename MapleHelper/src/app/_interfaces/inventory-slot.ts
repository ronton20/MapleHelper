export interface InventorySlot {
  name?: string;
  type?: string;
  locked: boolean;
  hidden: boolean;
  item?: any;
  selected?: boolean;
}
