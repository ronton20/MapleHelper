import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventorySlotComponent } from '../inventory-slot/inventory-slot.component';
import { ItemFormComponent } from '../item-form/item-form.component';
import { CharacterSearchComponent } from '../character-search/character-search.component';

interface InventorySlot {
  name?: string;
  type?: string;
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
  imports: [
    CommonModule,
    InventorySlotComponent,
    ItemFormComponent,
    CharacterSearchComponent,
  ],
})
export class EquipmentInventoryComponent {
  slots: InventorySlot[] = [
    { name: 'Ring', locked: false, hidden: false, type: 'ring' }, // Slot for Ring 1
    { locked: true, hidden: true }, // Seperator
    { name: 'Cap', locked: false, hidden: false, type: 'cap' }, // Slot for Cap
    { locked: true, hidden: true }, // Seperator
    { name: 'Emblem', locked: false, hidden: false, type: 'emblem' }, // Slot for Emblem

    { name: 'Ring', locked: false, hidden: false, type: 'ring' }, // Slot for Ring 2
    { name: 'Pendant', locked: false, hidden: false, type: 'pendant' }, // Slot for Pendant 1
    { name: 'Face Acc', locked: false, hidden: false, type: 'faceAcc' }, // Slot for Face Accessory
    { locked: true, hidden: true }, // Seperator
    { name: 'Badge', locked: false, hidden: false, type: 'badge' }, // Slot for Badge

    { name: 'Ring', locked: false, hidden: false, type: 'ring' }, // Slot for Ring 3
    { name: 'Pendant', locked: false, hidden: false, type: 'pendant' }, // Slot for Pendant 2
    { name: 'Eye Acc', locked: false, hidden: false, type: 'eyeAcc' }, // Slot for Eye Accessory
    { name: 'Ear Acc', locked: false, hidden: false, type: 'earAcc' }, // Slot for Ear Accessory
    { name: 'Medal', locked: false, hidden: false, type: 'medal' }, // Slot for Medal

    { name: 'Ring', locked: false, hidden: false, type: 'ring' }, // Slot for Ring 4
    { name: 'Weapon', locked: false, hidden: false, type: 'weapon' }, // Slot for Weapon
    { name: 'Clothes', locked: false, hidden: false, type: 'clothes' }, // Slot for Clothes
    { name: 'Shoulder', locked: false, hidden: false, type: 'shoulder' }, // Slot for Shoulder
    { name: 'Sub Weapon', locked: false, hidden: false, type: 'subWeapon' }, // Slot for Sub Weapon

    { name: 'Pocket', locked: false, hidden: false, type: 'pocket' }, // Slot for Pocket Item
    { name: 'Belt', locked: false, hidden: false, type: 'belt' }, // Slot for Belt
    { name: 'Pants', locked: false, hidden: false, type: 'pants' }, // Slot for Pants
    { name: 'Gloves', locked: false, hidden: false, type: 'gloves' }, // Slot for Gloves
    { name: 'Cape', locked: false, hidden: false, type: 'cape' }, // Slot for Cape

    { locked: true, hidden: true }, // Seperator
    { locked: true, hidden: true }, // Seperator
    { name: 'Shoes', locked: false, hidden: false, type: 'shoes' }, // Slot for Shoes
    { name: 'Android', locked: false, hidden: false, type: 'android' }, // Slot for Android
    { name: 'Heart', locked: false, hidden: false, type: 'heart' }, // Slot for Heart
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
