/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Timing & Speed
    TARGET_FPS: 120,
    PLAYER_SPEED: 1.25,
    TURN_SPEED: 0.03,
    PROJECTILE_SPEED: 2,
    SPAWN_SELECTION_DURATION: 5000,
    SPAWN_PROTECTION_DURATION: 3000,
    FIRE_COOLDOWN: 1000,
    
    // Trail Gaps
    DRAW_DURATION_S: 300 / 120, // seconds to draw continuously
    GAP_DURATION_S: 25 / 120,   // seconds for the gap

    // Sizes
    PLAYER_SIZE: 5,
    PROJECTILE_SIZE: 20,
    PROJECTILE_TRAIL_CLEAR_RADIUS: 20,
    TOP_MARGIN: 60, // Safe zone at the top for the HUD

    // Gameplay
    OBSTACLE_COUNT: 3,
    BOOSTER_COUNT: 2,
    INITIAL_AMMO: 2,

    // Powerups
    POWERUP_SPAWN_INTERVAL: 7000,
    POWERUP_LIFESPAN: 10000,
    POWERUP_DURATION: 8000,

    // Booster Pads
    BOOSTER_PUSH_FORCE: 7.5,
    BOOSTER_COOLDOWN: 500,
    BOOSTER_EFFECT_DURATION: 1500,
    BOOSTER_TURN_DAMPENING: 0.1,

    // Player Data
    PLAYER_COLORS: [
        '#3498db', '#e74c3c', '#2ecc71', '#f1c40f',
        '#9b59b6', '#1abc9c', '#e67e22', '#f57a7a'
    ],
    PLAYER_COLOR_NAMES: [
        'Blue', 'Red', 'Green', 'Yellow', 'Purple', 'Teal', 'Orange', 'Pink'
    ],
    PLAYER_CONTROLS: [
        { left: 'a', right: 'd', fire: 'w' },
        { left: 'ArrowLeft', right: 'ArrowRight', fire: 'ArrowUp' },
        { left: 'j', right: 'l', fire: 'k' },
        { left: '4', right: '6', fire: '5' }, // Numpad
        { left: 'f', right: 'h', fire: 'g' },
        { left: 'z', right: 'c', fire: 'x' },
        { left: 'i', right: 'p', fire: 'o' },
        { left: '1', right: '3', fire: '2' }
    ],

    GAME_SIZE_MULTIPLIERS: {
        small: 1.0,
        medium: 1.3,
        large: 1.6,
    },
};

// ============================================================================
// TYPE DEFINITIONS & UTILS
// ============================================================================

type GameState = 'menu' | 'spawnSelection' | 'countdown' | 'playing' | 'roundOver';
type GameMode = 'multiplayer' | 'practice';
type PowerUpType = 'speed' | 'shield' | 'thinLine' | 'ghost';
type GameLength = 'short' | 'normal' | 'marathon';
type GameSize = 'small' | 'medium' | 'large';

interface Point { x: number; y: number; }
interface Rect { x: number; y: number; width: number; height: number; }

const distSq = (p1: Point, p2: Point) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const checkRectCollision = (rect1: Rect, rect2: Rect) => (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
);

function isCircleCollidingWithRotatedRect(
    circle: { x: number; y: number; radius: number },
    rect: Rect & { angle: number }
): boolean {
    const rectCenterX = rect.x + rect.width / 2;
    const rectCenterY = rect.y + rect.height / 2;

    const translatedX = circle.x - rectCenterX;
    const translatedY = circle.y - rectCenterY;

    const cosAngle = Math.cos(-rect.angle);
    const sinAngle = Math.sin(-rect.angle);
    const rotatedX = translatedX * cosAngle - translatedY * sinAngle;
    const rotatedY = translatedX * sinAngle + translatedY * cosAngle;

    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const closestX = Math.max(-halfWidth, Math.min(halfWidth, rotatedX));
    const closestY = Math.max(-halfHeight, Math.min(halfHeight, rotatedY));
    
    const distanceSq = distSq({x: rotatedX, y: rotatedY}, {x: closestX, y: closestY});

    return distanceSq < circle.radius ** 2;
}

function getRankSuffix(rank: number): string {
    if (rank % 100 >= 11 && rank % 100 <= 13) return 'th';
    switch (rank % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}


// ============================================================================
// GAME ENTITY CLASSES
// ============================================================================

class Obstacle implements Rect {
    x: number; y: number; width: number; height: number; angle: number;
    color = '#99aaff';

    constructor(x: number, y: number, width: number, height: number, angle: number) {
        this.x = x; this.y = y; this.width = width; this.height = height; this.angle = angle;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(this.angle);

        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        ctx.restore();
    }
}

class BoosterPad implements Rect {
    x: number; y: number; width: number; height: number;
    angle: number;
    life = 0; // for animation, now in seconds
    
    constructor(x: number, y: number, width: number, height: number, angle: number) {
        this.x = x; this.y = y; this.width = width; this.height = height; this.angle = angle;
    }

    update(deltaTime: number) {
        this.life += deltaTime;
    }
    
    draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);

        const localX = -this.width / 2;
        const localY = -this.height / 2;

        ctx.shadowColor = '#00aaff';
        ctx.shadowBlur = 25;
        
        const gradient = ctx.createLinearGradient(localX, 0, localX + this.width, 0);
        gradient.addColorStop(0, `rgba(0, 122, 255, 0.1)`);
        gradient.addColorStop(0.5, `rgba(0, 122, 255, 0.4)`);
        gradient.addColorStop(1, `rgba(0, 122, 255, 0.1)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(localX, localY, this.width, this.height);
        
        ctx.strokeStyle = `rgba(0, 150, 255, 0.8)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(localX, localY, this.width, this.height);

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.lineCap = 'round';
        ctx.lineWidth = 4;
        
        const chevronCount = Math.floor(this.width / 40);
        const chevronSpacing = this.width / (chevronCount + 1);
        const chevronSize = 10;

        const animationSpeed = 2;
        const waveProgress = (this.life * animationSpeed) % 2;

        for (let i = 0; i < chevronCount; i++) {
            const chevronCenterX = localX + chevronSpacing * (i + 1);
            const normalizedPos = (i + 1) / (chevronCount + 1);
            const distToWave = Math.abs(normalizedPos - (waveProgress - 0.5));
            const brightness = Math.max(0, 1 - (distToWave / 0.5)**2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${brightness * 0.9})`;
            ctx.beginPath();
            ctx.moveTo(chevronCenterX - chevronSize / 2, localY + 4);
            ctx.lineTo(chevronCenterX + chevronSize / 2, localY + this.height / 2);
            ctx.lineTo(chevronCenterX - chevronSize / 2, localY + this.height - 4);
            ctx.stroke();
        }
        
        ctx.restore();
    }
}

class Player {
    id: number; name: string; color: string;
    controls: { left: string; right: string; fire: string };
    x = 0; y = 0; angle = 0; score = 0;
    ghostX = 0; ghostY = 0;
    isAlive = true;
    trailSegments: Point[][] = [];
    isDrawing = true;
    timeToNextStateChange = 0;
    
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

    constructor(id: number) {
        this.id = id;
        this.name = CONFIG.PLAYER_COLOR_NAMES[id];
        this.color = CONFIG.PLAYER_COLORS[id];
        this.controls = {
            left: CONFIG.PLAYER_CONTROLS[id].left.toLowerCase(),
            right: CONFIG.PLAYER_CONTROLS[id].right.toLowerCase(),
            fire: CONFIG.PLAYER_CONTROLS[id].fire.toLowerCase(),
        };
    }
    
    isSpawnProtected() {
        return performance.now() < this.spawnProtectedUntil;
    }

    prepareForSpawnSelection(gameWidth: number, gameHeight: number) {
        this.isAlive = true;
        this.trailSegments = [];
        this.ghostX = rand(100, gameWidth - 100);
        this.ghostY = rand(100 + CONFIG.TOP_MARGIN, gameHeight - 100);
        this.angle = rand(0, Math.PI * 2);
    }

    updateSpawnSelection(keys: Set<string>, gameWidth: number, gameHeight: number, deltaTime: number) {
        const speed = 5.5 * CONFIG.TARGET_FPS;
        const turnSpeed = (CONFIG.TURN_SPEED * 2.2) * CONFIG.TARGET_FPS;
        
        if(keys.has(this.controls.left)) this.angle -= turnSpeed * deltaTime;
        if(keys.has(this.controls.right)) this.angle += turnSpeed * deltaTime;

        this.ghostX += Math.cos(this.angle) * speed * deltaTime;
        this.ghostY += Math.sin(this.angle) * speed * deltaTime;
        
        const topBoundary = CONFIG.TOP_MARGIN * (gameHeight / window.innerHeight);

        if (this.ghostX < CONFIG.PLAYER_SIZE) { this.ghostX = CONFIG.PLAYER_SIZE; this.angle = Math.PI - this.angle; }
        if (this.ghostX > gameWidth - CONFIG.PLAYER_SIZE) { this.ghostX = gameWidth - CONFIG.PLAYER_SIZE; this.angle = Math.PI - this.angle; }
        if (this.ghostY < CONFIG.PLAYER_SIZE + topBoundary) { this.ghostY = CONFIG.PLAYER_SIZE + topBoundary; this.angle = -this.angle; }
        if (this.ghostY > gameHeight - CONFIG.PLAYER_SIZE) { this.ghostY = gameHeight - CONFIG.PLAYER_SIZE; this.angle = -this.angle; }
    }

    finalizeSpawn() {
        this.x = this.ghostX;
        this.y = this.ghostY;
        this.spawnProtectedUntil = performance.now() + CONFIG.SPAWN_PROTECTION_DURATION;
        this.clearPowerUps();
        this.trailSegments = [[]];
        this.isDrawing = true;
        this.timeToNextStateChange = CONFIG.DRAW_DURATION_S;
        this.ammo = CONFIG.INITIAL_AMMO;
    }
    
    clearPowerUps() {
        if(this.activePowerupTimeout) clearTimeout(this.activePowerupTimeout);
        this.isShielded = false;
        this.speedMultiplier = 1;
        this.trailWidthMultiplier = 1;
        this.isGhost = false;
        this.activePowerupTimeout = null;
    }
    
    fire(addProjectile: (proj: Projectile) => void) {
        const now = performance.now();
        if (this.ammo > 0 && now - this.lastFireTime > CONFIG.FIRE_COOLDOWN) {
            this.ammo--;
            this.lastFireTime = now;
            const spawnX = this.x + Math.cos(this.angle) * (CONFIG.PLAYER_SIZE + 1);
            const spawnY = this.y + Math.sin(this.angle) * (CONFIG.PLAYER_SIZE + 1);
            addProjectile(new Projectile(spawnX, spawnY, this.angle, this));
        }
    }

    move(keys: Set<string>, addBoosterParticles: () => void, deltaTime: number) {
        if (!this.isAlive) return;

        const speed = (CONFIG.PLAYER_SPEED * CONFIG.TARGET_FPS) * this.speedMultiplier;
        let turnSpeed = CONFIG.TURN_SPEED * CONFIG.TARGET_FPS;

        const now = performance.now();
        const timeSinceBoost = now - this.lastBoostTime;
        if (timeSinceBoost < CONFIG.BOOSTER_EFFECT_DURATION) {
            const effectProgress = timeSinceBoost / CONFIG.BOOSTER_EFFECT_DURATION;
            const dampeningFactor = CONFIG.BOOSTER_TURN_DAMPENING + (1 - CONFIG.BOOSTER_TURN_DAMPENING) * effectProgress;
            turnSpeed *= dampeningFactor;
        }

        if (keys.has(this.controls.left)) this.angle -= turnSpeed * deltaTime;
        if (keys.has(this.controls.right)) this.angle += turnSpeed * deltaTime;

        const totalVx = Math.cos(this.angle) * speed + this.pushVx;
        const totalVy = Math.sin(this.angle) * speed + this.pushVy;

        this.x += totalVx * deltaTime;
        this.y += totalVy * deltaTime;
        
        const pushDecay = Math.pow(0.92, deltaTime * CONFIG.TARGET_FPS);
        this.pushVx *= pushDecay;
        this.pushVy *= pushDecay;

        if (Math.hypot(this.pushVx, this.pushVy) > 0.5 * CONFIG.TARGET_FPS) {
             if (Math.random() < 0.7) addBoosterParticles();
        }
        
        this.timeToNextStateChange -= deltaTime;
        if (this.timeToNextStateChange <= 0) {
            this.isDrawing = !this.isDrawing;
            if (this.isDrawing) {
                this.timeToNextStateChange = CONFIG.DRAW_DURATION_S;
                this.trailSegments.push([]);
            } else {
                this.timeToNextStateChange = CONFIG.GAP_DURATION_S;
            }
        }
        
        if (this.isDrawing && !this.isGhost) {
           const currentSegment = this.trailSegments[this.trailSegments.length-1];
           if (currentSegment) {
               currentSegment.push({ x: this.x, y: this.y });
           }
        }
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

class Projectile {
    x: number; y: number; vx: number; vy: number;
    owner: Player;
    color: string;
    playersHit: Set<number> = new Set();

    constructor(x: number, y: number, angle: number, owner: Player) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * CONFIG.PROJECTILE_SPEED * CONFIG.TARGET_FPS;
        this.vy = Math.sin(angle) * CONFIG.PROJECTILE_SPEED * CONFIG.TARGET_FPS;
        this.owner = owner;
        this.color = owner.color;
    }

    update(deltaTime: number) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
    }
}

class Particle {
    x: number; y: number; vx: number; vy: number;
    life: number; color: string; size: number;

    constructor(x: number, y: number, color: string) {
        this.x = x; this.y = y; this.color = color;
        this.size = Math.random() * 3 + 1;
        this.life = Math.random() * 60 + 30;
        this.vx = (Math.random() - 0.5) * 5;
        this.vy = (Math.random() - 0.5) * 5;
    }

    update() {
        this.x += this.vx; this.y += this.vy;
        this.vx *= 0.96;
        this.vy *= 0.96;
        this.life--;
    }
}

class PowerUp {
    x: number; y: number; type: PowerUpType; size = 12;
    life = 0; // for animation
    spawnTime: number;

    constructor(x: number, y: number, type: PowerUpType) {
        this.x = x; this.y = y; this.type = type;
        this.spawnTime = performance.now();
    }
    
    get icon() {
        switch(this.type) {
            case 'speed': return '⏩';
            case 'shield': return '🛡️';
            case 'thinLine': return '〰️';
            case 'ghost': return '👻';
        }
    }

    update() {
        this.life++;
    }
}

// ============================================================================
// CORE SYSTEM CLASSES
// ============================================================================

class Renderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    backgroundCanvas: HTMLCanvasElement;
    backgroundCtx: CanvasRenderingContext2D;
    screenShake = 0;

    constructor() {
        this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.backgroundCanvas = document.createElement('canvas');
        this.backgroundCtx = this.backgroundCanvas.getContext('2d')!;
        this.resize();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    updateGameDimensions(gameWidth: number, gameHeight: number) {
        if (this.backgroundCanvas.width !== gameWidth || this.backgroundCanvas.height !== gameHeight) {
            this.redrawBackground(gameWidth, gameHeight);
        }
    }
    
    redrawBackground(gameWidth: number, gameHeight: number) {
        this.backgroundCanvas.width = gameWidth;
        this.backgroundCanvas.height = gameHeight;
        
        this.backgroundCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-color');
        this.backgroundCtx.fillRect(0, 0, gameWidth, gameHeight);
        
        const gridSize = 50;
        this.backgroundCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color');
        this.backgroundCtx.lineWidth = 1;
        this.backgroundCtx.shadowBlur = 0;
        
        for (let x = 0; x < gameWidth; x += gridSize) {
            this.backgroundCtx.beginPath();
            this.backgroundCtx.moveTo(x, 0);
            this.backgroundCtx.lineTo(x, gameHeight);
            this.backgroundCtx.stroke();
        }
        for (let y = 0; y < gameHeight; y += gridSize) {
            this.backgroundCtx.beginPath();
            this.backgroundCtx.moveTo(0, y);
            this.backgroundCtx.lineTo(gameWidth, y);
            this.backgroundCtx.stroke();
        }
    }

    render(game: Game) {
        this.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-color');
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        if (this.screenShake > 0) {
            const dx = (Math.random() - 0.5) * this.screenShake;
            const dy = (Math.random() - 0.5) * this.screenShake;
            this.ctx.translate(dx, dy);
            this.screenShake *= 0.9;
            if (this.screenShake < 0.5) this.screenShake = 0;
        }

        this.ctx.scale(this.canvas.width / game.gameWidth, this.canvas.height / game.gameHeight);
        this.ctx.drawImage(this.backgroundCanvas, 0, 0);

        game.obstacles.forEach(o => o.draw(this.ctx));
        game.boosterPads.forEach(b => b.draw(this.ctx));
        game.powerups.forEach(p => this.drawPowerup(p));
        
        if (game.gameState === 'spawnSelection') {
             game.players.forEach(p => p.isAlive && this.drawPlayerGhost(p));
        } else {
            game.players.forEach(p => this.drawPlayer(p));
        }

        game.projectiles.forEach(p => this.drawProjectile(p));
        game.particles.forEach(p => this.drawParticle(p));
        
        this.ctx.restore();

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
        this.ctx.shadowColor = 'rgba(255, 100, 100, 0.8)';
        this.ctx.shadowBlur = 10;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, CONFIG.TOP_MARGIN);
        this.ctx.lineTo(this.canvas.width, CONFIG.TOP_MARGIN);
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    drawProjectile(proj: Projectile) {
        this.ctx.fillStyle = proj.color;
        this.ctx.shadowColor = proj.color;
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.ctx.arc(proj.x, proj.y, CONFIG.PROJECTILE_SIZE, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    }
    
    drawParticle(p: Particle) {
        this.ctx.fillStyle = p.color;
        const maxLife = 60;
        this.ctx.globalAlpha = Math.max(0, p.life / maxLife);
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
    }
    
    drawPowerup(p: PowerUp) {
        const pulse = Math.sin(p.life * 0.05) * 3;
        this.ctx.save();
        this.ctx.shadowColor = 'white';
        this.ctx.shadowBlur = 15 + pulse;
        this.ctx.font = '24px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size + 8 + pulse/2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillText(p.icon, p.x, p.y);
        this.ctx.restore();
    }

    drawPlayerGhost(player: Player) {
        this.ctx.save();
        const ghostRadius = CONFIG.PLAYER_SIZE * 4;
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillStyle = player.color;
        this.ctx.shadowColor = player.color;
        this.ctx.shadowBlur = 20;
        
        this.ctx.beginPath();
        this.ctx.arc(player.ghostX, player.ghostY, ghostRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.translate(player.ghostX, player.ghostY);
        this.ctx.rotate(player.angle);
        this.ctx.fillStyle = "white";
        this.ctx.shadowBlur = 0; this.ctx.shadowColor = "transparent";
        this.ctx.beginPath();
        
        this.ctx.moveTo(ghostRadius, 0);
        this.ctx.lineTo(ghostRadius * 0.5, -ghostRadius * 0.5);
        this.ctx.lineTo(ghostRadius * 0.5, ghostRadius * 0.5);
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.restore();
    }

    drawPlayer(player: Player) {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineWidth = CONFIG.PLAYER_SIZE * 2 * player.trailWidthMultiplier;
        this.ctx.strokeStyle = player.color;
        this.ctx.shadowColor = player.color;
        this.ctx.shadowBlur = 15;

        const isProtected = player.isSpawnProtected();
        if (isProtected || player.isGhost) {
             this.ctx.globalAlpha = 0.5;
        }
        
        for (const segment of player.trailSegments) {
            if (segment.length < 2) continue;
            this.ctx.beginPath();
            this.ctx.moveTo(segment[0].x, segment[0].y);
            for (let i = 1; i < segment.length; i++) {
                this.ctx.lineTo(segment[i].x, segment[i].y);
            }
            this.ctx.stroke();
        }
        
        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;
        
        if (!player.isAlive) return;

        this.ctx.fillStyle = player.isGhost ? 'rgba(255,255,255,0.7)' : player.color;
        this.ctx.shadowColor = player.color;
        this.ctx.shadowBlur = 20;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, CONFIG.PLAYER_SIZE, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.save();
        this.ctx.translate(player.x, player.y);
        this.ctx.rotate(player.angle);
        this.ctx.fillStyle = "white";
        this.ctx.shadowBlur = 0; this.ctx.shadowColor = "transparent";
        
        const hasPowerup = player.activePowerupTimeout !== null;
        let shouldDrawArrow = true;

        if (isProtected) {
            if (Math.floor(performance.now() / 150) % 2 === 0) {
                shouldDrawArrow = false;
            }
        }

        if (shouldDrawArrow) {
            if (hasPowerup) {
                this.ctx.shadowColor = 'white';
                this.ctx.shadowBlur = 15;
            }
            this.ctx.beginPath();
            this.ctx.moveTo(CONFIG.PLAYER_SIZE, 0);
            this.ctx.lineTo(CONFIG.PLAYER_SIZE/2, -CONFIG.PLAYER_SIZE/2);
            this.ctx.lineTo(CONFIG.PLAYER_SIZE/2, CONFIG.PLAYER_SIZE/2);
            this.ctx.closePath();
            this.ctx.fill();
        }
        this.ctx.restore();

        if (player.isShielded) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 3;
            this.ctx.shadowColor = '#ffffff';
            this.ctx.shadowBlur = 15;
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y, CONFIG.PLAYER_SIZE + 6, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    }
}

class UIManager {
    game: Game;
    
    menuOverlay: HTMLDivElement;
    roundOverOverlay: HTMLDivElement;
    countdownOverlay: HTMLDivElement;
    howToPlayOverlay: HTMLDivElement;
    countdownTitleEl: HTMLHeadingElement;
    roundNumberTextEl: HTMLHeadingElement;
    countdownTextEl: HTMLSpanElement;
    hud: HTMLDivElement;
    playerCountSetting: HTMLDivElement;
    gameLengthSetting: HTMLDivElement;
    practiceResultsEl: HTMLDivElement;
    survivalTimeTextEl: HTMLSpanElement;
    finalScoreboardEl: HTMLDivElement;

    constructor(game: Game) {
        this.game = game;
        this.menuOverlay = document.getElementById('menu-overlay') as HTMLDivElement;
        this.roundOverOverlay = document.getElementById('round-over-overlay') as HTMLDivElement;
        this.countdownOverlay = document.getElementById('countdown-overlay') as HTMLDivElement;
        this.howToPlayOverlay = document.getElementById('how-to-play-overlay') as HTMLDivElement;
        this.countdownTitleEl = document.getElementById('countdown-title') as HTMLHeadingElement;
        this.roundNumberTextEl = document.getElementById('round-number-text') as HTMLHeadingElement;
        this.countdownTextEl = document.getElementById('countdown-text') as HTMLSpanElement;
        this.hud = document.getElementById('hud') as HTMLDivElement;
        this.playerCountSetting = document.getElementById('player-count-setting') as HTMLDivElement;
        this.gameLengthSetting = document.getElementById('game-length-setting') as HTMLDivElement;
        this.practiceResultsEl = document.getElementById('practice-results') as HTMLDivElement;
        this.survivalTimeTextEl = document.getElementById('survival-time-text') as HTMLSpanElement;
        this.finalScoreboardEl = document.getElementById('scoreboard-final') as HTMLDivElement;

        this.setupEventListeners();
        this.updatePlayerCount(this.game.playerCount);
        this.showMenu();
    }

    setupEventListeners() {
        document.getElementById('start-game-btn')!.addEventListener('click', () => this.game.startGame());
        document.getElementById('how-to-play-btn')!.addEventListener('click', () => this.showHowToPlay(true));
        document.getElementById('close-how-to-play-btn')!.addEventListener('click', () => this.showHowToPlay(false));
        document.getElementById('play-again-btn')!.addEventListener('click', () => {
             if (!this.game.isRoundSummaryPending) this.game.startRound();
        });
        document.getElementById('back-to-menu-btn')!.addEventListener('click', () => this.game.showMenu());
        
        document.getElementById('player-count-plus')!.addEventListener('click', () => this.updatePlayerCount(this.game.playerCount + 1));
        document.getElementById('player-count-minus')!.addEventListener('click', () => this.updatePlayerCount(this.game.playerCount - 1));

        document.getElementById('powerups-toggle')!.addEventListener('change', (e) => { this.game.powerupsEnabled = (e.target as HTMLInputElement).checked; });
        document.getElementById('obstacles-toggle')!.addEventListener('change', (e) => { this.game.obstaclesEnabled = (e.target as HTMLInputElement).checked; });
        document.getElementById('shooting-toggle')!.addEventListener('change', (e) => { this.game.shootingEnabled = (e.target as HTMLInputElement).checked; this.updateScoreboard() });

        document.getElementById('game-mode-control')!.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            if (target.tagName !== 'BUTTON' || !target.dataset.value) return;

            this.game.gameMode = target.dataset.value as GameMode;
            
            const parent = target.parentElement!;
            parent.querySelector('.active')?.classList.remove('active');
            target.classList.add('active');
            
            if (this.game.gameMode === 'practice') {
                this.playerCountSetting.classList.add('hidden');
                this.gameLengthSetting.classList.add('hidden');
                this.updatePlayerCount(1);
            } else {
                this.playerCountSetting.classList.remove('hidden');
                this.gameLengthSetting.classList.remove('hidden');
                 if (this.game.playerCount < 2) {
                    this.updatePlayerCount(2);
                }
            }
        });

        document.getElementById('game-length-control')!.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            if (target.tagName !== 'BUTTON' || !target.dataset.value) return;
            this.game.gameLength = target.dataset.value as GameLength;
            const parent = target.parentElement!;
            parent.querySelector('.active')?.classList.remove('active');
            target.classList.add('active');
            this.updateWinningScoreDisplay();
        });
        
        document.getElementById('game-size-control')!.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            if (target.tagName !== 'BUTTON' || !target.dataset.value) return;
            this.game.gameSize = target.dataset.value as GameSize;
            const parent = target.parentElement!;
            parent.querySelector('.active')?.classList.remove('active');
            target.classList.add('active');
            this.game.updateGameDimensions();
        });
    }

    updatePlayerCount(newCount: number) {
        const minPlayers = this.game.gameMode === 'multiplayer' ? 2 : 1;
        this.game.playerCount = Math.max(minPlayers, Math.min(8, newCount));
        (document.getElementById('player-count-value') as HTMLSpanElement).textContent = this.game.playerCount.toString();
        
        this.game.updateGameDimensions();
        this.updateControlsInfo();
        this.updateWinningScoreDisplay();
    }

    updateWinningScoreDisplay() {
        const winningScore = this.game.getWinningScore();
        const el = document.getElementById('how-to-play-winning-score');
        if (el) {
           el.textContent = `The first player to reach ${winningScore} points wins the game.`;
        }
    }
    
    updateControlsInfo() {
        const infoBox = document.getElementById('controls-info')!;
        infoBox.innerHTML = '';
        const count = this.game.gameMode === 'practice' ? 1 : this.game.playerCount;
        for (let i = 0; i < count; i++) {
            const p = CONFIG.PLAYER_CONTROLS[i];
            const color = CONFIG.PLAYER_COLORS[i];
            const div = document.createElement('div');
            div.className = 'control-player-info';
            div.innerHTML = `
                <div class="player-color-dot" style="background-color: ${color};"></div>
                ${CONFIG.PLAYER_COLOR_NAMES[i]}: ${p.left.toUpperCase()} / ${p.right.toUpperCase()} / ${p.fire.toUpperCase()}
            `;
            infoBox.appendChild(div);
        }
    }

    showHowToPlay(show: boolean) {
        if (show) {
            this.howToPlayOverlay.classList.remove('hidden');
        } else {
            this.howToPlayOverlay.classList.add('hidden');
        }
    }

    showMenu() {
        this.menuOverlay.classList.remove('hidden');
        this.roundOverOverlay.classList.add('hidden');
        this.countdownOverlay.classList.add('hidden');
        this.howToPlayOverlay.classList.add('hidden');
        this.hud.classList.add('hidden');

        // Reset UI to default multiplayer view
        this.game.gameMode = 'multiplayer';
        this.playerCountSetting.classList.remove('hidden');
        this.gameLengthSetting.classList.remove('hidden');
        const gameModeControl = document.getElementById('game-mode-control')!;
        gameModeControl.querySelector('[data-value="practice"]')?.classList.remove('active');
        gameModeControl.querySelector('[data-value="multiplayer"]')?.classList.add('active');
        this.updatePlayerCount(2);
    }
    
    showRoundSummary() {
        const endTitle = document.getElementById('end-of-round-title') as HTMLHeadingElement;
        const playAgainBtn = document.getElementById('play-again-btn') as HTMLButtonElement;

        if (this.game.gameMode === 'practice') {
            this.finalScoreboardEl.classList.add('hidden');
            this.practiceResultsEl.classList.remove('hidden');
            this.survivalTimeTextEl.textContent = `${this.game.roundDuration.toFixed(1)}s`;
            
            endTitle.textContent = 'Practice Over!';
            playAgainBtn.textContent = 'Try Again';

        } else { // Multiplayer mode
            this.finalScoreboardEl.classList.remove('hidden');
            this.practiceResultsEl.classList.add('hidden');
            
            const alivePlayers = this.game.players.filter(p => p.isAlive);
            const winner = alivePlayers.length === 1 ? alivePlayers[0] : undefined;
            const gameWinner = this.game.players.find(p => p.score >= this.game.getWinningScore());

            if (gameWinner) {
                endTitle.textContent = `The ${gameWinner.name} player wins the game!`;
                playAgainBtn.textContent = 'New Game';
            } else {
                endTitle.textContent = winner ? `The ${winner.name} player wins the round!` : "It's a draw!";
                playAgainBtn.textContent = 'Next Round';
            }
        }
        
        this.countdownOverlay.classList.add('hidden');
        this.roundNumberTextEl.style.display = 'block';
        this.countdownTextEl.style.display = 'block';
        this.countdownTitleEl.style.color = '';
        this.countdownTitleEl.classList.remove('winner-announcement');
        this.roundOverOverlay.classList.remove('hidden');
    }

    updateCountdownUI() {
        if (this.game.gameState === 'spawnSelection') {
            const elapsed = performance.now() - this.game.roundStartTime;
            const remaining = Math.max(0, CONFIG.SPAWN_SELECTION_DURATION - elapsed);
            this.roundNumberTextEl.style.display = 'block';
            this.countdownTextEl.style.display = 'block';
            this.roundNumberTextEl.textContent = this.game.gameMode === 'practice' ? 'Practice' : `Round ${this.game.roundNumber}`;
            this.countdownTitleEl.textContent = 'CHOOSE YOUR START';
            this.countdownTextEl.textContent = Math.ceil(remaining / 1000).toString();
            this.countdownOverlay.classList.remove('hidden');
        } else if (this.game.gameState === 'countdown') {
            this.roundNumberTextEl.style.display = 'block';
            this.countdownTextEl.style.display = 'none';
            this.roundNumberTextEl.textContent = this.game.gameMode === 'practice' ? 'Practice' : `Round ${this.game.roundNumber}`;
            this.countdownTitleEl.textContent = 'GET READY!';
            this.countdownOverlay.classList.remove('hidden');
        } else if (this.game.gameState === 'playing' || this.game.gameState === 'roundOver') {
            if (this.game.gameState === 'playing') {
                this.countdownOverlay.classList.add('hidden');
            }
        }
    }

    updateScoreboard = () => {
        const scoreboard = document.getElementById('scoreboard')!;
        scoreboard.innerHTML = '';
        
        const playersToShow = this.game.gameMode === 'practice' ? this.game.players : [...this.game.players].sort((a, b) => b.score - a.score);
        
        playersToShow.forEach(p => {
            const el = document.createElement('div');
            el.className = 'player-score';
            if (!p.isAlive) el.classList.add('dead');

            let ammoDisplay = '';
            if (this.game.shootingEnabled) {
                let dots = '';
                for (let i = 1; i <= CONFIG.INITIAL_AMMO; i++) {
                    dots += `<div class="ammo-dot ${p.ammo >= i ? 'active' : ''}"></div>`;
                }
                ammoDisplay = `<div class="player-ammo">${dots}</div>`;
            }

            const scoreText = this.game.gameMode === 'practice' 
                ? `${(this.game.roundDuration).toFixed(1)}s` 
                : `${p.name}: ${p.score}`;

            el.innerHTML = `
                <div class="player-color-dot" style="background-color: ${p.color};"></div>
                <span class="player-name-score">${scoreText}</span>
                ${ammoDisplay}
            `;
            scoreboard.appendChild(el);
        });
    }

    updateFinalScoreboard(pointsThisRound?: Map<Player, number>) {
        const scoreboard = document.getElementById('scoreboard-final')!;
        scoreboard.innerHTML = '';
        const sortedPlayers = [...this.game.players].sort((a,b) => b.score - a.score);
        
        sortedPlayers.forEach((p, index) => {
            const el = document.createElement('div');
el.className = 'player-score-final';
            if (this.game.isGameOver && index < 3) {
                el.classList.add(`podium-${index + 1}`);
            }
            const rank = index + 1;
            const rankText = `${rank}${getRankSuffix(rank)}`;
            const pointsAwarded = pointsThisRound?.get(p) ?? 0;

            el.innerHTML = `
                <span class="player-rank">${rankText}</span>
                <span class="player-name">
                    <span class="player-color-dot" style="background-color: ${p.color};"></span>
                    ${p.name}
                </span>
                <span class="player-final-score-container">
                    <span class="player-final-score">${p.score}</span>
                    ${pointsAwarded > 0 ? `<span class="points-awarded">+${pointsAwarded}</span>` : ''}
                </span>
            `;
            scoreboard.appendChild(el);
        });
        
        setTimeout(() => {
            const awardedSpans = document.querySelectorAll('#scoreboard-final .points-awarded');
            awardedSpans.forEach((span, index) => {
                setTimeout(() => {
                    (span as HTMLElement).classList.add('visible');
                }, index * 150);
            });
        }, 200);
    }
}

class InputHandler {
    keys = new Set<string>();

    constructor(game: Game) {
        this.setupEventListeners(game);
    }

    setupEventListeners(game: Game) {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys.add(key);

            if (key === ' ') {
                if (game.gameState === 'menu') {
                    if (game.uiManager.howToPlayOverlay.classList.contains('hidden')) {
                        game.startGame();
                    } else {
                        game.uiManager.showHowToPlay(false);
                    }
                } else if (game.gameState === 'roundOver' && !game.isRoundSummaryPending && !game.isGameOver) {
                    game.startRound();
                }
            }
        });
        document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    }

    isKeyDown(key: string): boolean {
        return this.keys.has(key);
    }
}

class Game {
    renderer: Renderer;
    uiManager: UIManager;
    inputHandler: InputHandler;
    
    gameState: GameState = 'menu';
    isGameOver = false;
    isRoundSummaryPending = false;
    players: Player[] = [];
    powerups: PowerUp[] = [];
    particles: Particle[] = [];
    obstacles: Obstacle[] = [];
    boosterPads: BoosterPad[] = [];
    projectiles: Projectile[] = [];
    eliminationOrder: Player[] = [];
    
    lastPowerUpTime = 0;
    roundStartTime = 0;
    roundNumber = 0;
    roundDuration = 0;
    
    gameWidth = 0;
    gameHeight = 0;
    
    gameMode: GameMode = 'multiplayer';
    playerCount = 2;
    powerupsEnabled = true;
    obstaclesEnabled = true;
    shootingEnabled = true;
    gameLength: GameLength = 'normal';
    gameSize: GameSize = 'medium';
    
    animationFrameId: number | null = null;
    lastFrameTime = 0;

    constructor() {
        this.renderer = new Renderer();
        this.uiManager = new UIManager(this);
        this.inputHandler = new InputHandler(this);

        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.updateGameDimensions();
        });
        this.updateGameDimensions();
    }
    
    updateGameDimensions() {
        const playerCountForScale = this.gameMode === 'practice' ? 2 : this.playerCount;
        const scale = 1 + (playerCountForScale - 2) * 0.08;
        const sizeMultiplier = CONFIG.GAME_SIZE_MULTIPLIERS[this.gameSize];
        this.gameWidth = this.renderer.canvas.width * scale * sizeMultiplier;
        this.gameHeight = this.renderer.canvas.height * scale * sizeMultiplier;
        this.renderer.updateGameDimensions(this.gameWidth, this.gameHeight);
    }

    getWinningScore(): number {
        switch(this.gameLength) {
            case 'short': return 10 + this.playerCount * 3;
            case 'normal': return 20 + this.playerCount * 5;
            case 'marathon': return 40 + this.playerCount * 8;
        }
    }

    showMenu() {
        this.gameState = 'menu';
        if(this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.players = []; this.powerups = []; this.particles = [];
        this.obstacles = []; this.boosterPads = []; this.projectiles = [];
        this.isGameOver = false;
        this.isRoundSummaryPending = false;
        this.uiManager.showMenu();
        this.renderer.render(this);
    }
    
    startGame() {
        if (this.gameMode === 'practice') {
            this.playerCount = 1;
        }
        this.players = [];
        for (let i = 0; i < this.playerCount; i++) {
            this.players.push(new Player(i));
        }
        this.isGameOver = false;
        this.roundNumber = 0;
        this.startRound();
    }

    startRound() {
        if (this.isGameOver) {
            this.startGame();
            return;
        }
        
        this.roundStartTime = performance.now();
        this.roundDuration = 0;
        this.roundNumber++;
        this.gameState = 'spawnSelection';
        
        this.players.forEach(p => { p.trailSegments = []; });
        
        this.uiManager.menuOverlay.classList.add('hidden');
        this.uiManager.roundOverOverlay.classList.add('hidden');
        this.uiManager.hud.classList.remove('hidden');
        this.uiManager.countdownOverlay.classList.remove('hidden');

        this.powerups = []; this.particles = []; this.projectiles = [];
        this.eliminationOrder = [];
        this.lastPowerUpTime = performance.now();
        this.inputHandler.keys.clear();
        this.generateLevelElements();

        this.players.forEach(p => p.finalizeSpawn());
        const spawnPoints: Point[] = [];
        this.players.forEach(p => {
            let validSpawn = false, retries = 50; 
            while (!validSpawn && retries > 0) {
                retries--;
                p.prepareForSpawnSelection(this.gameWidth, this.gameHeight);
                const ghostPosition = { x: p.ghostX, y: p.ghostY };
                const playerCircle = { ...ghostPosition, radius: CONFIG.PLAYER_SIZE * 4 };

                let collision = this.obstacles.some(obs => isCircleCollidingWithRotatedRect(playerCircle, obs)) ||
                                spawnPoints.some(sp => distSq(ghostPosition, sp) < ((CONFIG.PLAYER_SIZE * 4) * 2) ** 2);
                
                if (!collision) {
                    validSpawn = true;
                    spawnPoints.push(ghostPosition);
                }
            }
             if (retries === 0) spawnPoints.push({ x: p.ghostX, y: p.ghostY });
        });
        
        this.uiManager.updateScoreboard();

        if(this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.lastFrameTime = 0;
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    generateLevelElements() {
        this.obstacles = [];
        this.boosterPads = [];
        if (!this.obstaclesEnabled) return;

        const padding = 100 * (this.gameWidth / this.renderer.canvas.width);
        const allElements: Rect[] = [];
        let retries = 100;
        
        const playerCountForScale = this.gameMode === 'practice' ? 2 : this.playerCount;
        const baseArea = this.renderer.canvas.width * this.renderer.canvas.height;
        const gameArea = this.gameWidth * this.gameHeight;
        const effectivePlayerCount = (1 + (playerCountForScale - 2) * 0.08);
        const areaScale = (gameArea / baseArea) / effectivePlayerCount;
        
        const scaledObstacleCount = Math.round(CONFIG.OBSTACLE_COUNT * areaScale);
        const scaledBoosterCount = Math.round(CONFIG.BOOSTER_COUNT * areaScale);
        const topBoundary = CONFIG.TOP_MARGIN * (this.gameHeight / this.renderer.canvas.height);
        
        const checkWithPadding = (rect1: Rect, rect2: Rect) => {
            const spacing = 80;
            const r1Padded = { x: rect1.x - spacing, y: rect1.y - spacing, width: rect1.width + spacing * 2, height: rect1.height + spacing * 2 };
            return checkRectCollision(r1Padded, rect2);
        };

        for (let i = 0; i < scaledObstacleCount && retries > 0; i++) {
            let newObstacle: Obstacle, bounds: Rect;
            do {
                const width = rand(50, 150), height = rand(10, 25), angle = rand(0, Math.PI * 2);
                const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
                const aabbWidth = width * cos + height * sin, aabbHeight = width * sin + height * cos;
                const x = rand(padding, this.gameWidth - aabbWidth - padding), y = rand(padding + topBoundary, this.gameHeight - aabbHeight - padding);
                newObstacle = new Obstacle(x, y, width, height, angle);
                bounds = { x, y, width: aabbWidth, height: aabbHeight };
                retries--;
            } while (retries > 0 && allElements.some(el => checkWithPadding(bounds, el)));
            if (retries > 0) { this.obstacles.push(newObstacle); allElements.push(bounds); }
        }

        for (let i = 0; i < scaledBoosterCount && retries > 0; i++) {
            let newBooster: BoosterPad, bounds: Rect;
             do {
                const width = rand(80, 150), height = 25, angle = rand(0, Math.PI * 2);
                const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
                const aabbWidth = width * cos + height * sin, aabbHeight = width * sin + height * cos;
                const x = rand(padding, this.gameWidth - aabbWidth - padding), y = rand(padding + topBoundary, this.gameHeight - aabbHeight - padding);
                newBooster = new BoosterPad(x, y, width, height, angle);
                bounds = { x, y, width: aabbWidth, height: aabbHeight };
                retries--;
            } while (retries > 0 && allElements.some(el => checkWithPadding(bounds, el)));
            if (retries > 0) { this.boosterPads.push(newBooster); allElements.push(bounds); }
        }
    }

    gameLoop = (timestamp: number) => {
        if (!this.lastFrameTime) this.lastFrameTime = timestamp;
        const deltaTime = Math.min(0.1, (timestamp - this.lastFrameTime) / 1000);
        this.lastFrameTime = timestamp;

        this.update(deltaTime);
        this.renderer.render(this);
        this.uiManager.updateCountdownUI();
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    update(deltaTime: number) {
        const now = performance.now();
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }
        
        this.boosterPads.forEach(b => b.update(deltaTime));

        if (this.gameState === 'spawnSelection') {
            this.players.forEach(p => p.updateSpawnSelection(this.inputHandler.keys, this.gameWidth, this.gameHeight, deltaTime));
            if (now - this.roundStartTime >= CONFIG.SPAWN_SELECTION_DURATION) {
                this.players.forEach(p => p.finalizeSpawn());
                this.uiManager.updateScoreboard();
                this.roundStartTime = now;
                this.gameState = 'countdown';
            }
        } else if (this.gameState === 'countdown') {
            if (now - this.roundStartTime >= 2000) {
                this.gameState = 'playing';
            }
        } else if (this.gameState === 'playing') {
            this.roundDuration += deltaTime;
            this.handlePlayerInput();
            this.checkBoosterPads();
            this.players.forEach(p => p.move(this.inputHandler.keys, () => this.createBoosterParticles(p), deltaTime));
            
            this.powerups.forEach(p => p.update());
            this.projectiles.forEach(p => p.update(deltaTime));

            for (let i = this.powerups.length - 1; i >= 0; i--) {
                if (now - this.powerups[i].spawnTime >= CONFIG.POWERUP_LIFESPAN) {
                    this.powerups.splice(i, 1);
                }
            }

            if (this.powerupsEnabled && now - this.lastPowerUpTime > CONFIG.POWERUP_SPAWN_INTERVAL) {
                this.spawnPowerup();
                this.lastPowerUpTime = now;
            }

            this.checkCollisions();
            
            const alivePlayers = this.players.filter(p => p.isAlive);
            let roundShouldEnd = false;
            if (this.gameMode === 'multiplayer') {
                if (this.players.length > 1 && alivePlayers.length <= 1) roundShouldEnd = true;
            } else {
                if (this.players.length > 0 && alivePlayers.length === 0) roundShouldEnd = true;
            }

            if (roundShouldEnd) this.endRound();
        }
    }
    
    handlePlayerInput() {
        if (!this.shootingEnabled) return;
        for(const player of this.players) {
            if (player.isAlive && this.inputHandler.isKeyDown(player.controls.fire)) {
                player.fire(proj => {
                    this.projectiles.push(proj)
                    this.uiManager.updateScoreboard();
                });
            }
        }
    }

    createBoosterParticles(player: Player) {
        const angle = player.angle + Math.PI + rand(-0.3, 0.3);
        const speed = rand(1, 3);
        const p = new Particle(player.x, player.y, '#007aff');
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.life = 20;
        this.particles.push(p);
    }

    createBoosterImpactParticles(player: Player, pad: BoosterPad) {
        for (let i = 0; i < 40; i++) {
            const splashAngle = pad.angle + (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1);
            const angle = splashAngle + rand(-0.4, 0.4);
            const speed = rand(4, 10);
            const p = new Particle(player.x, player.y, Math.random() < 0.3 ? 'white' : '#00aaff');
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = rand(30, 60);
            this.particles.push(p);
        }
        this.renderer.screenShake += 8;
    }

    checkBoosterPads() {
        const now = performance.now();
        for (const player of this.players) {
            if (!player.isAlive || now - player.lastBoostTime < CONFIG.BOOSTER_COOLDOWN) continue;
            for (const pad of this.boosterPads) {
                if (isCircleCollidingWithRotatedRect({ x: player.x, y: player.y, radius: CONFIG.PLAYER_SIZE }, pad)) {
                    player.pushVx = Math.cos(pad.angle) * CONFIG.BOOSTER_PUSH_FORCE * CONFIG.TARGET_FPS;
                    player.pushVy = Math.sin(pad.angle) * CONFIG.BOOSTER_PUSH_FORCE * CONFIG.TARGET_FPS;
                    player.lastBoostTime = now;
                    this.createBoosterImpactParticles(player, pad);
                    break;
                }
            }
        }
    }

    checkCollisions() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            for (const player of this.players) {
                if (player.isAlive && player !== proj.owner && !proj.playersHit.has(player.id)) {
                    if (distSq(proj, player) < (CONFIG.PROJECTILE_SIZE + CONFIG.PLAYER_SIZE) ** 2) {
                        this.killPlayer(player, 'projectile');
                        proj.playersHit.add(player.id);
                    }
                }
            }
            if (proj.x < 0 || proj.x > this.gameWidth || proj.y < 0 || proj.y > this.gameHeight) {
                this.projectiles.splice(i, 1);
            }
        }
        
        if (this.projectiles.length > 0) {
            const trailsToSplit: { player: Player; segmentIndex: number; splitIndices: Set<number> }[] = [];
            for (const proj of this.projectiles) {
                for (const player of this.players) {
                    for (let i = 0; i < player.trailSegments.length; i++) {
                        const segment = player.trailSegments[i];
                        for (let j = 0; j < segment.length; j++) {
                             if (player === proj.owner && i === player.trailSegments.length - 1 && j > segment.length - 15) continue;
                            if (distSq(proj, segment[j]) < CONFIG.PROJECTILE_TRAIL_CLEAR_RADIUS ** 2) {
                                let splitInfo = trailsToSplit.find(t => t.player === player && t.segmentIndex === i);
                                if (!splitInfo) {
                                    splitInfo = { player, segmentIndex: i, splitIndices: new Set() };
                                    trailsToSplit.push(splitInfo);
                                }
                                splitInfo.splitIndices.add(j);
                            }
                        }
                    }
                }
            }
            trailsToSplit.sort((a, b) => (a.player.id !== b.player.id) ? a.player.id - b.player.id : b.segmentIndex - a.segmentIndex);

            for (const splitInfo of trailsToSplit) {
                const { player, segmentIndex, splitIndices } = splitInfo;
                if (splitIndices.size === 0) continue;
                const originalSegment = player.trailSegments[segmentIndex];
                const newSegments: Point[][] = [];
                let currentSegment: Point[] = [];
                for (let i = 0; i < originalSegment.length; i++) {
                    if (splitIndices.has(i)) {
                        if (currentSegment.length > 1) newSegments.push(currentSegment);
                        currentSegment = [];
                    } else {
                        currentSegment.push(originalSegment[i]);
                    }
                }
                if (currentSegment.length > 1) newSegments.push(currentSegment);
                player.trailSegments.splice(segmentIndex, 1, ...newSegments);
            }
        }

        const topBoundary = CONFIG.TOP_MARGIN * (this.gameHeight / this.renderer.canvas.height);
        for (const player of this.players) {
            if (!player.isAlive) continue;
            const pHead = { x: player.x, y: player.y };

            for (let k = this.powerups.length - 1; k >= 0; k--) {
                const powerup = this.powerups[k];
                if (distSq(pHead, powerup) < (CONFIG.PLAYER_SIZE + powerup.size) ** 2) {
                    player.activatePowerUp(powerup.type, CONFIG.POWERUP_DURATION);
                    for (let i = 0; i < 20; i++) this.particles.push(new Particle(player.x, player.y, 'white'));
                    this.powerups.splice(k, 1);
                    break; 
                }
            }

            if (player.isSpawnProtected()) continue;

            if (pHead.x < CONFIG.PLAYER_SIZE || pHead.x > this.gameWidth - CONFIG.PLAYER_SIZE ||
                pHead.y < topBoundary + CONFIG.PLAYER_SIZE || pHead.y > this.gameHeight - CONFIG.PLAYER_SIZE) {
                this.killPlayer(player); continue;
            }

            for (const obs of this.obstacles) {
                if (isCircleCollidingWithRotatedRect({ x: pHead.x, y: pHead.y, radius: CONFIG.PLAYER_SIZE }, obs)) {
                    this.killPlayer(player);
                    break;
                }
            }
            if (!player.isAlive) continue;
            
            if (!player.isGhost) {
                 for (const otherPlayer of this.players) {
                    const collisionDistSq = (CONFIG.PLAYER_SIZE + CONFIG.PLAYER_SIZE * otherPlayer.trailWidthMultiplier) ** 2;
                    for (let i = 0; i < otherPlayer.trailSegments.length; i++) {
                        const segment = otherPlayer.trailSegments[i];
                        let pointsToCheck = segment;
                        if (player === otherPlayer && i === otherPlayer.trailSegments.length - 1 && segment.length > 0) {
                            const requiredClearanceDistSq = ((CONFIG.PLAYER_SIZE + CONFIG.PLAYER_SIZE * player.trailWidthMultiplier) * 1.2) ** 2;
                            let firstSafePointIndex = -1;
                            for (let k = segment.length - 1; k >= 0; k--) {
                                if (distSq(pHead, segment[k]) > requiredClearanceDistSq) { firstSafePointIndex = k; break; }
                            }
                            pointsToCheck = (firstSafePointIndex !== -1) ? segment.slice(0, firstSafePointIndex + 1) : [];
                        }
                        for (const point of pointsToCheck) {
                            if (distSq(pHead, point) < collisionDistSq) { this.killPlayer(player); break; }
                        }
                        if (!player.isAlive) break;
                    }
                    if (!player.isAlive) break;
                }
            }
        }
    }
    
    killPlayer(player: Player, cause: 'crash' | 'projectile' = 'crash') {
        if (!player.isAlive || player.isSpawnProtected()) return;
        
        if (player.isShielded && cause === 'projectile') {
            player.clearPowerUps();
            for(let i = 0; i < 30; i++) this.particles.push(new Particle(player.x, player.y, 'white'));
            this.renderer.screenShake = 10;
            return;
        }

        player.isAlive = false;
        this.eliminationOrder.push(player);

        const remainingAlive = this.players.filter(p => p.isAlive).length;
        const isRoundEndingKill = (this.gameMode === 'multiplayer' && this.players.length > 1 && remainingAlive <= 1) ||
                                  (this.gameMode === 'practice' && remainingAlive === 0);

        if (cause === 'projectile' || isRoundEndingKill) {
            this.renderer.screenShake = 35;
            for(let i = 0; i < 150; i++) {
                const p = new Particle(player.x, player.y, Math.random() < 0.3 ? 'white' : player.color);
                const angle = Math.random() * Math.PI * 2, speed = Math.random() * 12 + 4;
                p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
                p.life = Math.random() * 70 + 50;
                this.particles.push(p);
            }
        } else {
            this.renderer.screenShake = 15;
            for(let i = 0; i < 60; i++) this.particles.push(new Particle(player.x, player.y, player.color));
        }
        this.uiManager.updateScoreboard();
    }
    
    spawnPowerup() {
        const padding = 50 * (this.gameWidth / this.renderer.canvas.width);
        const topBoundary = CONFIG.TOP_MARGIN * (this.gameHeight / this.renderer.canvas.height);
        const x = rand(padding, this.gameWidth - padding);
        const y = rand(padding + topBoundary, this.gameHeight - padding);
        const types: PowerUpType[] = ['speed', 'shield', 'thinLine', 'ghost'];
        const type = types[Math.floor(Math.random() * types.length)];
        this.powerups.push(new PowerUp(x, y, type));
    }
    
    endRound() {
        if (this.gameState !== 'playing') return;
        this.gameState = 'roundOver';
        this.isRoundSummaryPending = true;

        if (this.gameMode === 'multiplayer') {
            const alivePlayers = this.players.filter(p => p.isAlive);
            const winner = alivePlayers.length === 1 ? alivePlayers[0] : undefined;
            
            this.uiManager.countdownTitleEl.textContent = winner ? `${winner.name} wins the round!` : "It's a Draw!";
            this.uiManager.countdownTitleEl.style.color = winner ? winner.color : 'white';
            this.uiManager.countdownTitleEl.classList.add('winner-announcement');
            this.uiManager.roundNumberTextEl.style.display = 'none';
            this.uiManager.countdownTextEl.style.display = 'none';
            this.uiManager.countdownOverlay.classList.remove('hidden');
        }

        setTimeout(() => {
            this.processRoundResults();
        }, this.gameMode === 'multiplayer' ? 2500 : 1000);
    }

    processRoundResults() {
        this.isRoundSummaryPending = false;
        if (this.gameState !== 'roundOver') return; 
        
        if (this.gameMode === 'multiplayer') {
            const finalRanking = [...this.eliminationOrder, ...this.players.filter(p => p.isAlive)].reverse();
            const pointsToAward = new Map<Player, number>();
            
            finalRanking.forEach((player, index) => {
                const pointsAwarded = this.players.length - index;
                if (pointsAwarded > 0) {
                     player.score += pointsAwarded;
                     pointsToAward.set(player, pointsAwarded);
                }
            });
            
            const gameWinner = this.players.find(p => p.score >= this.getWinningScore());
            if (gameWinner) this.isGameOver = true;
            this.uiManager.updateFinalScoreboard(pointsToAward);
        }
        
        this.uiManager.showRoundSummary();
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================
window.addEventListener('load', () => {
    new Game();
});