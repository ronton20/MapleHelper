interface ItemTypeInfo {
  overallCategory: string; // inventory tab (e.g. Equip, Use, etc.)
  category: string; // category of item (e.g. One-Handed Weapon, Armor, etc.)
  subCategory: string; // type of item (e.g. Bladecaster, Hat, Bottom, etc.)
  lowItemId: number;
  highItemId: number;
}

export interface Item {
  requiredJobs: string[];
  requiredLevel: number;
  isCash: boolean;
  requiredGender: number;
  name: string;
  desc: string;
  id: number;
  typeInfo: ItemTypeInfo;

  // Stats on item
  stars: number;
  maxStars: number;
  rarity: string;
  flame: { [key: string]: number };
  potential: string[];
}
