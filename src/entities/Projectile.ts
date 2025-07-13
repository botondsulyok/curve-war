import { activeConfig } from '../config';
import type { Player } from './Player';

export class Projectile {
    x: number; y: number; vx: number; vy: number;
    prevX: number; prevY: number;
    owner: Player;
    color: string;
    playersHit: Set<number> = new Set();

    constructor(x: number, y: number, angle: number, owner: Player) {
        this.x = x;
        this.y = y;
        this.prevX = x;
        this.prevY = y;
        this.vx = Math.cos(angle) * activeConfig.PROJECTILE_SPEED;
        this.vy = Math.sin(angle) * activeConfig.PROJECTILE_SPEED;
        this.owner = owner;
        this.color = owner.color;
    }

    update(deltaTime: number) {
        this.prevX = this.x;
        this.prevY = this.y;
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
    }
}