export type Direction = "up" | "down" | "left" | "right";
export type PetState = "idle" | "walk" | "sleep" | "seekPartner" | "kiss";

export interface Vec2 {
  x: number;
  y: number;
}

export interface PetConfig {
  id: "pet-a" | "pet-b";
  name: string;
  partnerId: "pet-a" | "pet-b";
  emoji: string;
  speedPxPerTick: number;
  frameMs: number;
  baseSize: number;
}

export interface PetProfile {
  config: PetConfig;
  scale: number;
  minScale: number;
  maxScale: number;
}
