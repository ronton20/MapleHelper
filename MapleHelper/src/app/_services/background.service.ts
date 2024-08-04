import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class BackgroundService {
  private backgroundsFolder: string = 'assets/backgrounds/';
  private backgrounds: string[] = [
    this.backgroundsFolder + '6thJobPlace.png',
    this.backgroundsFolder + 'AdeleHome.png',
    this.backgroundsFolder + 'Arcana.png',
    this.backgroundsFolder + 'Dragon.png',
    this.backgroundsFolder + 'Esfera.png',
    this.backgroundsFolder + 'FoxGoddess.png',
    this.backgroundsFolder + 'FoxValley.png',
    this.backgroundsFolder + 'GoldTrees.png',
    this.backgroundsFolder + 'LacheleinClockTower.png',
    this.backgroundsFolder + 'Limina.png',
    this.backgroundsFolder + 'MapleTree.png',
    this.backgroundsFolder + 'Pantheon.png',
    this.backgroundsFolder + 'RuinsPillars.png',
    this.backgroundsFolder + 'VanishingJourney.png',
    this.backgroundsFolder + 'VJBoat.png',
  ];

  constructor() {}

  getRandomBackground(): string {
    const randomIndex = Math.floor(Math.random() * this.backgrounds.length);
    return this.backgrounds[randomIndex];
  }
}
