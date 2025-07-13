import type { PowerUpType } from '../types';

export class PowerUp {
    x: number; y: number; type: PowerUpType; size = 12;
    life = 0; // for animation
    spawnTime: number;

    constructor(x: number, y: number, type: PowerUpType) {
        this.x = x; this.y = y; this.type = type;
        this.spawnTime = performance.now();
    }
    
    update() {
        this.life++;
    }
}