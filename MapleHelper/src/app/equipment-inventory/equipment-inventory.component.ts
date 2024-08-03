import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventorySlotComponent } from '../inventory-slot/inventory-slot.component';
import { ItemFormComponent } from '../item-form/item-form.component';

interface InventorySlot {
  name?: string;
  stats?: string;
  locked: boolean;
  hidden: boolean;
  item?: any;
  selected?: boolean;
}

@Component({
  selector: 'app-equipment-inventory',
  templateUrl: './equipment-inventory.component.html',
  styleUrls: ['./equipment-inventory.component.css'],
  standalone: true,
  imports: [CommonModule, InventorySlotComponent, ItemFormComponent],
})
export class EquipmentInventoryComponent {
  slots: InventorySlot[] = [
    { name: 'Ring', locked: false, hidden: false }, // Slot for Ring 1
    { locked: true, hidden: true }, // Seperator
    { name: 'Cap', locked: false, hidden: false }, // Slot for Cap
    { locked: true, hidden: true }, // Seperator
    { name: 'Emblem', locked: false, hidden: false }, // Slot for Emblem

    { name: 'Ring', locked: false, hidden: false }, // Slot for Ring 2
    { name: 'Pendant', locked: false, hidden: false }, // Slot for Pendant 1
    { name: 'Face Acc', locked: false, hidden: false }, // Slot for Face Accessory
    { locked: true, hidden: true }, // Seperator
    { name: 'Badge', locked: false, hidden: false }, // Slot for Badge

    { name: 'Ring', locked: false, hidden: false }, // Slot for Ring 3
    { name: 'Pendant', locked: false, hidden: false }, // Slot for Pendant 2
    { name: 'Eye Acc', locked: false, hidden: false }, // Slot for Eye Accessory
    { name: 'Ear Acc', locked: false, hidden: false }, // Slot for Ear Accessory
    { name: 'Medal', locked: false, hidden: false }, // Slot for Medal

    { name: 'Ring', locked: false, hidden: false }, // Slot for Ring 4
    { name: 'Weapon', locked: false, hidden: false }, // Slot for Weapon
    { name: 'Clothes', locked: false, hidden: false }, // Slot for Clothes
    { name: 'Shoulder', locked: false, hidden: false }, // Slot for Shoulder
    { name: 'Sub Weapon', locked: false, hidden: false }, // Slot for Sub Weapon

    { name: 'Pocket', locked: false, hidden: false }, // Slot for Pocket Item
    { name: 'Belt', locked: false, hidden: false }, // Slot for Belt
    { name: 'Pants', locked: false, hidden: false }, // Slot for Pants
    { name: 'Gloves', locked: false, hidden: false }, // Slot for Gloves
    { name: 'Cape', locked: false, hidden: false }, // Slot for Cape

    { locked: true, hidden: true }, // Seperator
    { locked: true, hidden: true }, // Seperator
    { name: 'Shoes', locked: false, hidden: false }, // Slot for Shoes
    { name: 'Android', locked: false, hidden: false }, // Slot for Android
    { name: 'Heart', locked: false, hidden: false }, // Slot for Heart
  ];

  selectedSlot: InventorySlot | null = null;

  editSlot(slot: InventorySlot) {
    if (this.selectedSlot) this.selectedSlot.selected = false;
    this.selectedSlot = slot;
    this.selectedSlot.selected = true;
  }

  saveSlot(item: any) {
    if (this.selectedSlot) {
      this.selectedSlot.item = item;
      this.selectedSlot.selected = false;
    }
    this.selectedSlot = null;
  }

  cancelEdit() {
    if (this.selectedSlot) this.selectedSlot.selected = false;
    this.selectedSlot = null;
  }
}
