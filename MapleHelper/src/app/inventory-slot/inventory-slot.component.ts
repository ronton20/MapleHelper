import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-inventory-slot',
  templateUrl: './inventory-slot.component.html',
  styleUrls: ['./inventory-slot.component.css'],
  standalone: true,
  imports: [CommonModule],
})
export class InventorySlotComponent {
  @Input() slot: any;
  @Input() item: any;
  @Input() locked: boolean = false;
  @Input() hidden: boolean = false;
  @Output() edit = new EventEmitter<void>();
  hover: boolean = false;
  star_filled: string = '../assets/star_filled.png';

  onMouseEnter() {
    if (this.locked) return;
    this.hover = true;
  }

  onMouseLeave() {
    this.hover = false;
  }

  onClick() {
    if (this.locked) return;
    console.log('Clicked on', this.slot.name);
    this.edit.emit();
  }
}
