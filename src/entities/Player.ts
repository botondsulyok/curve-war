

import { activeConfig } from '../config';
import type { TimedPoint, PowerUpType, PlayerConfig } from '../types';
import { rand } from '../utils';

export class Player {
    id: number; name: string; color: string;
    controls: { left: string; right:string; fire: string };
    x = 0; y = 0; angle = 0; score = 0;
    ghostX = 0; ghostY = 0;
    isAlive = true;
    trailSegments: TimedPoint[][] = [];
    isDrawing = true;
    distanceToNextStateChange = 0;
    
    isShielded = false;
    speedMultiplier = 1;
    trailWidthMultiplier = 1;
    isGhost = false;
    
    pushVx = 0;
    pushVy = 0;
    lastBoostTime = 0;
    lastFireTime = 0;
    ammo = 0;

    activePowerupTimeout: number | null = null;
    spawnProtectedUntil = 0;
    eliminationTime: number | null = null;

    constructor(id: number, config: PlayerConfig) {
        this.id = id;
        this.name = config.name;
        this.color = config.color;
        this.controls = {
            left: config.controls.left.toLowerCase(),
            right: config.controls.right.toLowerCase(),
            fire: config.controls.fire.toLowerCase(),
        };
    }
    
    isSpawnProtected() {
        return performance.now() < this.spawnProtectedUntil;
    }

    prepareForSpawnSelection(gameWidth: number, gameHeight: number) {
        this.isAlive = true;
        this.eliminationTime = null;
        this.trailSegments = [];
        this.ghostX = rand(100, gameWidth - 100);
        this.ghostY = rand(100 + activeConfig.TOP_MARGIN, gameHeight - 100);
        this.angle = rand(0, Math.PI * 2);
    }

    updateSpawnSelection(keys: Set<string>, gameWidth: number, gameHeight: number, deltaTime: number) {
        const speed = activeConfig.SPAWN_GHOST_SPEED;
        const turnSpeed = activeConfig.TURN_SPEED * activeConfig.SPAWN_GHOST_TURN_MULTIPLIER;
        
        if(keys.has(this.controls.left)) this.angle -= turnSpeed * deltaTime;
        if(keys.has(this.controls.right)) this.angle += turnSpeed * deltaTime;

        this.ghostX += Math.cos(this.angle) * speed * deltaTime;
        this.ghostY += Math.sin(this.angle) * speed * deltaTime;
        
        const topBoundary = activeConfig.TOP_MARGIN * (gameHeight / window.innerHeight);

        if (this.ghostX < activeConfig.PLAYER_SIZE) { this.ghostX = activeConfig.PLAYER_SIZE; this.angle = Math.PI - this.angle; }
        if (this.ghostX > gameWidth - activeConfig.PLAYER_SIZE) { this.ghostX = gameWidth - activeConfig.PLAYER_SIZE; this.angle = Math.PI - this.angle; }
        if (this.ghostY < activeConfig.PLAYER_SIZE + topBoundary) { this.ghostY = activeConfig.PLAYER_SIZE + topBoundary; this.angle = -this.angle; }
        if (this.ghostY > gameHeight - activeConfig.PLAYER_SIZE) { this.ghostY = gameHeight - activeConfig.PLAYER_SIZE; this.angle = -this.angle; }
    }

    finalizeSpawn() {
        this.x = this.ghostX;
        this.y = this.ghostY;
        this.spawnProtectedUntil = performance.now() + activeConfig.SPAWN_PROTECTION_DURATION;
        this.clearPowerUps();
        this.trailSegments = [[]];
        this.isDrawing = true;
        this.distanceToNextStateChange = activeConfig.DRAW_DISTANCE;
        this.ammo = activeConfig.INITIAL_AMMO;
    }
    
    clearPowerUps() {
        if(this.activePowerupTimeout) clearTimeout(this.activePowerupTimeout);
        this.isShielded = false;
        this.speedMultiplier = 1;
        this.trailWidthMultiplier = 1;
        this.isGhost = false;
        this.activePowerupTimeout = null;
    }
    
    fire(): { x: number; y: number; angle: number } | null {
        const now = performance.now();
        if (this.ammo > 0 && now - this.lastFireTime > activeConfig.FIRE_COOLDOWN) {
            this.ammo--;
            this.lastFireTime = now;
            const spawnX = this.x + Math.cos(this.angle) * (activeConfig.PLAYER_SIZE + 1);
            const spawnY = this.y + Math.sin(this.angle) * (activeConfig.PLAYER_SIZE + 1);
            return { x: spawnX, y: spawnY, angle: this.angle };
        }
        return null;
    }

    move(keys: Set<string>, addBoosterParticles: () => void, deltaTime: number): TimedPoint | null {
        if (!this.isAlive) return null;

        const speed = activeConfig.PLAYER_SPEED * this.speedMultiplier;
        let turnSpeed = activeConfig.TURN_SPEED;

        const now = performance.now();
        const timeSinceBoost = now - this.lastBoostTime;
        if (timeSinceBoost < activeConfig.BOOSTER_EFFECT_DURATION) {
            const effectProgress = timeSinceBoost / activeConfig.BOOSTER_EFFECT_DURATION;
            const dampeningFactor = activeConfig.BOOSTER_TURN_DAMPENING + (1 - activeConfig.BOOSTER_TURN_DAMPENING) * effectProgress;
            turnSpeed *= dampeningFactor;
        }

        if (keys.has(this.controls.left)) this.angle -= turnSpeed * deltaTime;
        if (keys.has(this.controls.right)) this.angle += turnSpeed * deltaTime;

        const totalVx = Math.cos(this.angle) * speed + this.pushVx;
        const totalVy = Math.sin(this.angle) * speed + this.pushVy;

        this.x += totalVx * deltaTime;
        this.y += totalVy * deltaTime;
        
        const pushDecay = Math.pow(activeConfig.BOOSTER_PUSH_DECAY, deltaTime);
        this.pushVx *= pushDecay;
        this.pushVy *= pushDecay;

        if (Math.hypot(this.pushVx, this.pushVy) > activeConfig.BOOSTER_PARTICLE_THRESHOLD_SPEED) {
             if (Math.random() < 0.7) addBoosterParticles();
        }
        
        const distanceMoved = Math.hypot(totalVx, totalVy) * deltaTime;
        this.distanceToNextStateChange -= distanceMoved;

        if (this.distanceToNextStateChange <= 0) {
            const leftoverDistance = this.distanceToNextStateChange; // This is negative
            this.isDrawing = !this.isDrawing;
            if (this.isDrawing) {
                this.distanceToNextStateChange = activeConfig.DRAW_DISTANCE + leftoverDistance;
                this.trailSegments.push([]);
            } else {
                this.distanceToNextStateChange = activeConfig.GAP_DISTANCE + leftoverDistance;
            }
        }
        
        if (this.isDrawing && !this.isGhost) {
           const currentSegment = this.trailSegments[this.trailSegments.length-1];
           if (currentSegment) {
               const newPoint: TimedPoint = { x: this.x, y: this.y, time: performance.now() };
               currentSegment.push(newPoint);
               return newPoint;
           }
        }

        return null;
    }
    
    activatePowerUp(type: PowerUpType, duration: number) {
        this.clearPowerUps();
        switch(type) {
            case 'speed': this.speedMultiplier = 1.6; break;
            case 'shield': this.isShielded = true; break;
            case 'thinLine': this.trailWidthMultiplier = 0.5; break;
            case 'ghost': this.isGhost = true; break;
        }
        this.activePowerupTimeout = setTimeout(() => this.clearPowerUps(), duration);
    }
}