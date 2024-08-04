import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BackgroundService } from './_services/background.service';
import { EquipmentInventoryComponent } from './_components/equipment-inventory/equipment-inventory.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, EquipmentInventoryComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'MapleHelper';
  backgroundImage: string = '';

  constructor(private backgroundService: BackgroundService) {}

  ngOnInit() {
    this.backgroundImage = this.backgroundService.getRandomBackground();
  }
}
