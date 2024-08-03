import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Character {
  characterName: string;
  characterImgURL: string;
  jobName: string;
  level: number;
}

@Component({
  selector: 'app-character-search',
  templateUrl: './character-search.component.html',
  styleUrls: ['./character-search.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class CharacterSearchComponent {
  region: string = 'eu';
  characterName: string = '';
  characters: Character[] = [];
  selectedCharacter: Character | null = null;
  view: 'search' | 'results' | 'details' = 'search'; // State variable to control view

  constructor(private http: HttpClient) {}

  searchCharacter() {
    const url = `/api/api/maplestory/no-auth/v1/ranking/${this.region}?type=overall&id=weekly&page_index=1&character_name=${this.characterName}`;
    this.http.get<any>(url).subscribe((response) => {
      this.characters = response.ranks.map((rank: any) => ({
        characterName: rank.characterName,
        characterImgURL: rank.characterImgURL,
        jobName: rank.jobName,
        level: rank.level,
      }));
      this.view = 'results'; // Show results after search
    });
  }

  selectCharacter(character: Character) {
    this.selectedCharacter = character;
    this.view = 'details'; // Show details after selecting a character
  }

  goBack() {
    this.view = 'search'; // Go back to search view
    this.selectedCharacter = null;
    this.characters = [];
  }
}
