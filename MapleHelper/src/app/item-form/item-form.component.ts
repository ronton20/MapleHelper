import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-item-form',
  templateUrl: './item-form.component.html',
  styleUrls: ['./item-form.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class ItemFormComponent {
  @Input() slot: any;
  @Output() save = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  item: any = {};
  stars: number = 0;
  maxStars: number = 25;
  potentialOptions: any[] = [];
  rarity: string = 'rare';
  star_filled: string = '../assets/star_filled.png';
  star_empty: string = '../assets/star_empty.png';

  itemRarities = ['rare', 'epic', 'unique', 'legendary'];

  constructor() {}

  ngOnInit() {
    if (this.slot.item) {
      this.item = { ...this.slot.item };
      this.stars = this.item.stars || 0;
      this.maxStars = this.item.maxStars || 25;
      this.rarity = this.item.rarity || 'rare';
      // Set initial potential options based on item type and rarity
      this.setPotentialOptions();
    }
  }

  setPotentialOptions() {
    // Define potential options based on item type and rarity
    const options = [
      { rarity: 'rare', options: ['STR +3%', 'DEX +3%', 'INT +3%', 'LUK +3%'] },
      {
        rarity: 'epic',
        options: [
          'STR +6%',
          'DEX +6%',
          'INT +6%',
          'LUK +6%',
          'STR +3%',
          'DEX +3%',
          'INT +3%',
          'LUK +3%',
        ],
      },
      {
        rarity: 'unique',
        options: [
          'STR +9%',
          'DEX +9%',
          'INT +9%',
          'LUK +9%',
          'STR +6%',
          'DEX +6%',
          'INT +6%',
          'LUK +6%',
        ],
      },
      {
        rarity: 'legendary',
        options: [
          'STR +12%',
          'DEX +12%',
          'INT +12%',
          'LUK +12%',
          'STR +9%',
          'DEX +9%',
          'INT +9%',
          'LUK +9%',
        ],
      },
    ].find((p) => p.rarity === this.rarity);

    this.potentialOptions = options ? options.options : [];
  }

  onRarityChange() {
    this.setPotentialOptions();
  }

  saveItem() {
    this.item.stars = this.stars;
    this.item.rarity = this.rarity;
    this.save.emit(this.item);
  }

  cancelEdit() {
    this.cancel.emit();
  }
}
