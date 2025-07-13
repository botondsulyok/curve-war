
export type GameState = 'menu' | 'spawnSelection' | 'countdown' | 'playing' | 'roundOver';
export type GameMode = 'multiplayer' | 'practice';
export type PowerUpType = 'speed' | 'shield' | 'thinLine' | 'ghost';
export type GameLength = 'short' | 'normal' | 'marathon';
export type GameSize = 'small' | 'medium' | 'large';

export interface Point { x: number; y: number; }
export interface TimedPoint extends Point { time: number; }
export interface Rect { x: number; y: number; width: number; height: number; }

export interface PlayerControls {
    left: string;
    right: string;
    fire: string;
}
export interface PlayerConfig {
    name: string;
    color: string;
    controls: PlayerControls;
}
