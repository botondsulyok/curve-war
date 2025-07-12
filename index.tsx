/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- GAME CONFIGURATION ---
const PLAYER_SPEED = 1.25; // Base speed, will be scaled by TARGET_FPS
const TURN_SPEED = 0.03; // Base turn speed
const PLAYER_SIZE = 5;
const POWERUP_SPAWN_INTERVAL = 7000; // ms
const POWERUP_LIFESPAN = 10000; // ms, powerups disappear after this time
const POWERUP_DURATION = 8000; // ms
const OBSTACLE_COUNT = 3; // Fewer obstacles
const BOOSTER_COUNT = 2;
const BOOSTER_PUSH_FORCE = 7.5; // Stronger, single impulse push
const BOOSTER_COOLDOWN = 500; // ms, longer cooldown to prevent re-boosting too quickly
const BOOSTER_EFFECT_DURATION = 1500; // ms, duration of the slide effect
const BOOSTER_TURN_DAMPENING = 0.1; // at peak effect, player has 10% turn control
const SPAWN_PROTECTION_DURATION = 3000; // ms
const SPAWN_SELECTION_DURATION = 5000; // 5 seconds to choose start
const PROJECTILE_SPEED = 2;
const PROJECTILE_SIZE = 20; // Increased size
const PROJECTILE_TRAIL_CLEAR_RADIUS = 20;
const FIRE_COOLDOWN = 1000; //ms
const INITIAL_AMMO = 2;
const TOP_MARGIN = 60; // Safe zone at the top for the HUD

// Classic Achtung-style trail gap constants, now time-based
const TARGET_FPS = 120; // Game was tuned for 120hz, everything will be based on this
const DRAW_DURATION_S = 300 / TARGET_FPS; // seconds to draw continuously
const GAP_DURATION_S = 25 / TARGET_FPS;   // seconds for the gap - consistent size


const PLAYER_COLORS = [
    '#3498db', '#e74c3c', '#2ecc71', '#f1c40f',
    '#9b59b6', '#1abc9c', '#e67e22', '#f57a7a'
];

const PLAYER_COLOR_NAMES = [
    'Blue', 'Red', 'Green', 'Yellow', 'Purple', 'Teal', 'Orange', 'Pink'
];

const PLAYER_CONTROLS = [
    { left: 'a', right: 'd', fire: 'w' },
    { left: 'ArrowLeft', right: 'ArrowRight', fire: 'ArrowUp' },
    { left: 'j', right: 'l', fire: 'k' },
    { left: '4', right: '6', fire: '5' }, // Numpad
    { left: 'f', right: 'h', fire: 'g' },
    { left: 'z', right: 'c', fire: 'x' },
    { left: 'i', right: 'p', fire: 'o' },
    { left: '1', right: '3', fire: '2' }
];

type GameState = 'menu' | 'spawnSelection' | 'countdown' | 'playing' | 'roundOver';
type PowerUpType = 'speed' | 'shield' | 'thinLine' | 'ghost';
type GameLength = 'short' | 'normal' | 'marathon';
type GameSize = 'small' | 'medium' | 'large';

const GAME_SIZE_MULTIPLIERS: Record<GameSize, number> = {
    small: 1.0,
    medium: 1.3,
    large: 1.6,
};


// --- TYPE DEFINITIONS ---
interface Point { x: number; y: number; }
interface Rect { x: number; y: number; width: number; height: number; }

// --- UTILITY FUNCTIONS ---
const distSq = (p1: Point, p2: Point) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const checkRectCollision = (rect1: Rect, rect2: Rect) => (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
);

function isPointInRotatedRect(point: Point, rect: Rect & { angle: number }): boolean {
    const rectCenterX = rect.x + rect.width / 2;
    const rectCenterY = rect.y + rect.height / 2;

    const translatedX = point.x - rectCenterX;
    const translatedY = point.y - rectCenterY;

    const cosAngle = Math.cos(-rect.angle);
    const sinAngle = Math.sin(-rect.angle);
    const rotatedX = translatedX * cosAngle - translatedY * sinAngle;
    const rotatedY = translatedX * sinAngle + translatedY * cosAngle;

    return (
        Math.abs(rotatedX) < rect.width / 2 &&
        Math.abs(rotatedY) < rect.height / 2
    );
}


function isCircleCollidingWithRotatedRect(
    circle: { x: number; y: number; radius: number },
    rect: Rect & { angle: number }
): boolean {
    const rectCenterX = rect.x + rect.width / 2;
    const rectCenterY = rect.y + rect.height / 2;

    // Translate circle center to be relative to rect center
    const translatedX = circle.x - rectCenterX;
    const translatedY = circle.y - rectCenterY;

    // Rotate the translated point by the negative angle of the rect
    const cosAngle = Math.cos(-rect.angle);
    const sinAngle = Math.sin(-rect.angle);
    const rotatedX = translatedX * cosAngle - translatedY * sinAngle;
    const rotatedY = translatedX * sinAngle + translatedY * cosAngle;

    // Find the closest point on the AABB (in the rect's local space) to the rotated circle's center
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const closestX = Math.max(-halfWidth, Math.min(halfWidth, rotatedX));
    const closestY = Math.max(-halfHeight, Math.min(halfHeight, rotatedY));
    
    // Calculate distance between rotated circle center and closest point on AABB
    const distanceSq = distSq({x: rotatedX, y: rotatedY}, {x: closestX, y: closestY});

    // Check for collision
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

        // Center of the pad, for rotation
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;

        ctx.translate(cx, cy);
        ctx.rotate(this.angle);

        const localX = -this.width / 2;
        const localY = -this.height / 2;

        // --- Base Pad ---
        ctx.shadowColor = '#00aaff';
        ctx.shadowBlur = 25;
        
        // Gradient for depth
        const gradient = ctx.createLinearGradient(localX, 0, localX + this.width, 0);
        gradient.addColorStop(0, `rgba(0, 122, 255, 0.1)`);
        gradient.addColorStop(0.5, `rgba(0, 122, 255, 0.4)`);
        gradient.addColorStop(1, `rgba(0, 122, 255, 0.1)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(localX, localY, this.width, this.height);
        
        // Border
        ctx.strokeStyle = `rgba(0, 150, 255, 0.8)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(localX, localY, this.width, this.height);

        // --- Animated Chevrons ---
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.lineCap = 'round';
        ctx.lineWidth = 4;
        
        const chevronCount = Math.floor(this.width / 40); // Number of chevrons based on width
        const chevronSpacing = this.width / (chevronCount + 1);
        const chevronSize = 10; // Height of the chevron point

        // The animation is a wave of light moving across the chevrons
        const animationSpeed = 2; // Slower, smoother wave
        const waveProgress = (this.life * animationSpeed) % 2; // Loop from 0 to 2

        for (let i = 0; i < chevronCount; i++) {
            const chevronCenterX = localX + chevronSpacing * (i + 1);
            
            // Calculate the chevron's normalized position (0 to 1)
            const normalizedPos = (i + 1) / (chevronCount + 1);
            
            // Calculate brightness based on distance to the wave
            const distToWave = Math.abs(normalizedPos - (waveProgress - 0.5));
            // Use a gaussian-like falloff for a smooth glow
            const brightness = Math.max(0, 1 - (distToWave / 0.5)**2);
            
            ctx.strokeStyle = `rgba(255, 255, 255, ${brightness * 0.9})`;

            ctx.beginPath();
            // Draw a `>` shape
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
    ghostX = 0; ghostY = 0; // For spawn selection
    isAlive = true;
    trailSegments: Point[][] = [];
    isDrawing = true;
    timeToNextStateChange = 0; // now in seconds
    
    isShielded = false;
    speedMultiplier = 1;
    trailWidthMultiplier = 1;
    isGhost = false;
    
    pushVx = 0; // now in pixels per second
    pushVy = 0; // now in pixels per second
    lastBoostTime = 0;
    lastFireTime = 0;
    ammo = 0;

    activePowerupTimeout: number | null = null;
    spawnProtectedUntil = 0;

    constructor(id: number) {
        this.id = id;
        this.name = PLAYER_COLOR_NAMES[id];
        this.color = PLAYER_COLORS[id];
        this.controls = {
            left: PLAYER_CONTROLS[id].left.toLowerCase(),
            right: PLAYER_CONTROLS[id].right.toLowerCase(),
            fire: PLAYER_CONTROLS[id].fire.toLowerCase(),
        };
    }
    
    isSpawnProtected() {
        return performance.now() < this.spawnProtectedUntil;
    }

    prepareForSpawnSelection(gameWidth: number, gameHeight: number) {
        this.isAlive = true;
        this.trailSegments = [];
        this.ghostX = rand(100, gameWidth - 100);
        this.ghostY = rand(100 + TOP_MARGIN, gameHeight - 100);
        this.angle = rand(0, Math.PI * 2);
    }

    updateSpawnSelection(keys: Set<string>, gameWidth: number, gameHeight: number, deltaTime: number) {
        const speed = 2.5 * TARGET_FPS;
        const turnSpeed = (TURN_SPEED * 1.5) * TARGET_FPS;
        
        if(keys.has(this.controls.left)) this.angle -= turnSpeed * deltaTime;
        if(keys.has(this.controls.right)) this.angle += turnSpeed * deltaTime;

        this.ghostX += Math.cos(this.angle) * speed * deltaTime;
        this.ghostY += Math.sin(this.angle) * speed * deltaTime;
        
        const topBoundary = TOP_MARGIN * (gameHeight / window.innerHeight);

        if (this.ghostX < PLAYER_SIZE) { this.ghostX = PLAYER_SIZE; this.angle = Math.PI - this.angle; }
        if (this.ghostX > gameWidth - PLAYER_SIZE) { this.ghostX = gameWidth - PLAYER_SIZE; this.angle = Math.PI - this.angle; }
        if (this.ghostY < PLAYER_SIZE + topBoundary) { this.ghostY = PLAYER_SIZE + topBoundary; this.angle = -this.angle; }
        if (this.ghostY > gameHeight - PLAYER_SIZE) { this.ghostY = gameHeight - PLAYER_SIZE; this.angle = -this.angle; }
    }

    finalizeSpawn() {
        this.x = this.ghostX;
        this.y = this.ghostY;
        this.spawnProtectedUntil = performance.now() + SPAWN_PROTECTION_DURATION;
        this.clearPowerUps();
        this.trailSegments = [[]];
        this.isDrawing = true;
        this.timeToNextStateChange = DRAW_DURATION_S;
        this.ammo = INITIAL_AMMO;
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
        if (this.ammo > 0 && now - this.lastFireTime > FIRE_COOLDOWN) {
            this.ammo--;
            this.lastFireTime = now;
            // Spawn projectile slightly in front of the player
            const spawnX = this.x + Math.cos(this.angle) * (PLAYER_SIZE + 1);
            const spawnY = this.y + Math.sin(this.angle) * (PLAYER_SIZE + 1);
            addProjectile(new Projectile(spawnX, spawnY, this.angle, this));
            this.updateScoreboard();
        }
    }

    move(keys: Set<string>, addBoosterParticles: () => void, deltaTime: number) {
        if (!this.isAlive) return;

        const speed = (PLAYER_SPEED * TARGET_FPS) * this.speedMultiplier;
        let turnSpeed = TURN_SPEED * TARGET_FPS;

        // NEW: Dampen turning for a "slippery" booster effect
        const now = performance.now();
        const timeSinceBoost = now - this.lastBoostTime;
        if (timeSinceBoost < BOOSTER_EFFECT_DURATION) {
            // Interpolate from BOOSTER_TURN_DAMPENING to 1.0 over the effect duration.
            // This creates a smooth transition from low control back to full control.
            const effectProgress = timeSinceBoost / BOOSTER_EFFECT_DURATION; // 0 to 1
            const dampeningFactor = BOOSTER_TURN_DAMPENING + (1 - BOOSTER_TURN_DAMPENING) * effectProgress;
            turnSpeed *= dampeningFactor;
        }

        if (keys.has(this.controls.left)) this.angle -= turnSpeed * deltaTime;
        if (keys.has(this.controls.right)) this.angle += turnSpeed * deltaTime;

        const totalVx = Math.cos(this.angle) * speed + this.pushVx;
        const totalVy = Math.sin(this.angle) * speed + this.pushVy;

        this.x += totalVx * deltaTime;
        this.y += totalVy * deltaTime;
        
        const pushDecay = Math.pow(0.92, deltaTime * TARGET_FPS);
        this.pushVx *= pushDecay;
        this.pushVy *= pushDecay;

        if (Math.hypot(this.pushVx, this.pushVy) > 0.5 * TARGET_FPS) {
             if (Math.random() < 0.7) addBoosterParticles();
        }
        
        this.timeToNextStateChange -= deltaTime;
        if (this.timeToNextStateChange <= 0) {
            this.isDrawing = !this.isDrawing;
            if (this.isDrawing) {
                this.timeToNextStateChange = DRAW_DURATION_S;
                this.trailSegments.push([]);
            } else {
                this.timeToNextStateChange = GAP_DURATION_S;
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
    
    drawGhost(ctx: CanvasRenderingContext2D) {
        ctx.save();
        const ghostRadius = PLAYER_SIZE * 4;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 20;
        
        ctx.beginPath();
        ctx.arc(this.ghostX, this.ghostY, ghostRadius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.translate(this.ghostX, this.ghostY);
        ctx.rotate(this.angle);
        ctx.fillStyle = "white";
        ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
        ctx.beginPath();
        
        // Scale arrow proportionally
        ctx.moveTo(ghostRadius, 0);
        ctx.lineTo(ghostRadius * 0.5, -ghostRadius * 0.5);
        ctx.lineTo(ghostRadius * 0.5, ghostRadius * 0.5);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.lineWidth = PLAYER_SIZE * 2 * this.trailWidthMultiplier;
        ctx.strokeStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;

        const isProtected = this.isSpawnProtected();
        if (isProtected || this.isGhost) {
             ctx.globalAlpha = 0.5;
        }
        
        for (const segment of this.trailSegments) {
            if (segment.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(segment[0].x, segment[0].y);
            for (let i = 1; i < segment.length; i++) {
                ctx.lineTo(segment[i].x, segment[i].y);
            }
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        
        if (!this.isAlive) return;

        ctx.fillStyle = this.isGhost ? 'rgba(255,255,255,0.7)' : this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(this.x, this.y, PLAYER_SIZE, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = "white";
        ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
        
        const hasPowerup = this.activePowerupTimeout !== null;
        let shouldDrawArrow = true;

        if (isProtected) {
            if (Math.floor(performance.now() / 150) % 2 === 0) {
                shouldDrawArrow = false;
            }
        }

        if (shouldDrawArrow) {
            if (hasPowerup) {
                ctx.shadowColor = 'white';
                ctx.shadowBlur = 15;
            }
            ctx.beginPath();
            ctx.moveTo(PLAYER_SIZE, 0);
            ctx.lineTo(PLAYER_SIZE/2, -PLAYER_SIZE/2);
            ctx.lineTo(PLAYER_SIZE/2, PLAYER_SIZE/2);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        if (this.isShielded) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(this.x, this.y, PLAYER_SIZE + 6, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    updateScoreboard() {
        // This is a placeholder; the main game class will call the global update.
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
        this.vx = Math.cos(angle) * PROJECTILE_SPEED * TARGET_FPS;
        this.vy = Math.sin(angle) * PROJECTILE_SPEED * TARGET_FPS;
        this.owner = owner;
        this.color = owner.color;
    }

    update(deltaTime: number) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(this.x, this.y, PROJECTILE_SIZE, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
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

    draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = this.color;
        const maxLife = 60;
        ctx.globalAlpha = Math.max(0, this.life / maxLife);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
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

    draw(ctx: CanvasRenderingContext2D) {
        const pulse = Math.sin(this.life * 0.05) * 3;
        ctx.save();
        ctx.shadowColor = 'white';
        ctx.shadowBlur = 15 + pulse;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size + 8 + pulse/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(this.icon, this.x, this.y);
        ctx.restore();
    }
}

class ZatackaGame {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    backgroundCanvas: HTMLCanvasElement;
    backgroundCtx: CanvasRenderingContext2D;
    
    menuOverlay = document.getElementById('menu-overlay') as HTMLDivElement;
    roundOverOverlay = document.getElementById('round-over-overlay') as HTMLDivElement;
    countdownOverlay = document.getElementById('countdown-overlay') as HTMLDivElement;
    howToPlayOverlay = document.getElementById('how-to-play-overlay') as HTMLDivElement;
    countdownTitleEl = document.getElementById('countdown-title') as HTMLHeadingElement;
    roundNumberTextEl = document.getElementById('round-number-text') as HTMLHeadingElement;
    countdownTextEl = document.getElementById('countdown-text') as HTMLSpanElement;
    hud = document.getElementById('hud') as HTMLDivElement;
    
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
    keys = new Set<string>();
    lastPowerUpTime = 0;
    roundStartTime = 0;
    roundNumber = 0;
    screenShake = 0;

    // Game world dimensions
    gameWidth = 0;
    gameHeight = 0;
    
    playerCount = 2;
    powerupsEnabled = true;
    obstaclesEnabled = true;
    shootingEnabled = true;
    gameLength: GameLength = 'normal';
    gameSize: GameSize = 'medium';
    
    animationFrameId: number | null = null;
    lastFrameTime = 0;

    constructor() {
        this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.backgroundCanvas = document.createElement('canvas');
        this.backgroundCtx = this.backgroundCanvas.getContext('2d')!;
        this.setupEventListeners();
        this.resizeCanvas();
        this.updatePlayerCount(this.playerCount); // Initial setup
        this.showMenu();
    }

    setupEventListeners() {
        window.addEventListener('resize', () => { this.resizeCanvas(); });

        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys.add(key);

            if (key === ' ') {
                if (this.gameState === 'menu') {
                    if (this.howToPlayOverlay.classList.contains('hidden')) {
                        this.startGame();
                    } else {
                        this.showHowToPlay(false);
                    }
                } else if (this.gameState === 'roundOver' && !this.isRoundSummaryPending && !this.isGameOver) {
                    // This robust check prevents starting a new round before the summary screen is shown.
                    // Also prevents starting with space when the game is over.
                    this.startRound();
                }
            }
        });
        document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
        
        document.getElementById('start-game-btn')!.addEventListener('click', () => this.startGame());
        document.getElementById('how-to-play-btn')!.addEventListener('click', () => this.showHowToPlay(true));
        document.getElementById('close-how-to-play-btn')!.addEventListener('click', () => this.showHowToPlay(false));
        document.getElementById('play-again-btn')!.addEventListener('click', () => {
             if (!this.isRoundSummaryPending) this.startRound();
        });
        document.getElementById('back-to-menu-btn')!.addEventListener('click', () => this.showMenu());
        
        document.getElementById('player-count-plus')!.addEventListener('click', () => this.updatePlayerCount(this.playerCount + 1));
        document.getElementById('player-count-minus')!.addEventListener('click', () => this.updatePlayerCount(this.playerCount - 1));

        document.getElementById('powerups-toggle')!.addEventListener('change', (e) => { this.powerupsEnabled = (e.target as HTMLInputElement).checked; });
        document.getElementById('obstacles-toggle')!.addEventListener('change', (e) => { this.obstaclesEnabled = (e.target as HTMLInputElement).checked; });
        document.getElementById('shooting-toggle')!.addEventListener('change', (e) => { this.shootingEnabled = (e.target as HTMLInputElement).checked; this.updateScoreboard() });

        document.getElementById('game-length-control')!.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            if (target.tagName !== 'BUTTON' || !target.dataset.value) return;

            this.gameLength = target.dataset.value as GameLength;
            
            const parent = target.parentElement!;
            parent.querySelector('.active')?.classList.remove('active');
            target.classList.add('active');
            
            this.updateWinningScoreDisplay();
        });
        
        document.getElementById('game-size-control')!.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            if (target.tagName !== 'BUTTON' || !target.dataset.value) return;

            this.gameSize = target.dataset.value as GameSize;
            
            const parent = target.parentElement!;
            parent.querySelector('.active')?.classList.remove('active');
            target.classList.add('active');
            
            this.updateGameDimensions();
        });
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.updateGameDimensions();
    }

    updateGameDimensions() {
        // Increase game world size by 8% for each player above 2
        const scale = 1 + (this.playerCount - 2) * 0.08;
        const sizeMultiplier = GAME_SIZE_MULTIPLIERS[this.gameSize];
        this.gameWidth = this.canvas.width * scale * sizeMultiplier;
        this.gameHeight = this.canvas.height * scale * sizeMultiplier;
        
        this.redrawBackgroundCanvas();
    }
    
    redrawBackgroundCanvas() {
        this.backgroundCanvas.width = this.gameWidth;
        this.backgroundCanvas.height = this.gameHeight;
        
        this.backgroundCtx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-color');
        this.backgroundCtx.fillRect(0, 0, this.gameWidth, this.gameHeight);
        
        const gridSize = 50;
        this.backgroundCtx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color');
        this.backgroundCtx.lineWidth = 1;
        this.backgroundCtx.shadowBlur = 0;
        
        for (let x = 0; x < this.gameWidth; x += gridSize) {
            this.backgroundCtx.beginPath();
            this.backgroundCtx.moveTo(x, 0);
            this.backgroundCtx.lineTo(x, this.gameHeight);
            this.backgroundCtx.stroke();
        }
        for (let y = 0; y < this.gameHeight; y += gridSize) {
            this.backgroundCtx.beginPath();
            this.backgroundCtx.moveTo(0, y);
            this.backgroundCtx.lineTo(this.gameWidth, y);
            this.backgroundCtx.stroke();
        }
    }

    getWinningScore(): number {
        switch(this.gameLength) {
            case 'short': return 10 + this.playerCount * 3;
            case 'normal': return 20 + this.playerCount * 5;
            case 'marathon': return 40 + this.playerCount * 8;
        }
    }

    updateWinningScoreDisplay() {
        const winningScore = this.getWinningScore();
        const el = document.getElementById('how-to-play-winning-score');
        if (el) {
           el.textContent = `The first player to reach ${winningScore} points wins the game.`;
        }
    }
    
    updatePlayerCount(newCount: number) {
        this.playerCount = Math.max(2, Math.min(8, newCount));
        (document.getElementById('player-count-value') as HTMLSpanElement).textContent = this.playerCount.toString();
        
        this.updateGameDimensions();
        this.updateControlsInfo();
        this.updateWinningScoreDisplay();
    }

    updateControlsInfo() {
        const infoBox = document.getElementById('controls-info')!;
        infoBox.innerHTML = '';
        for (let i = 0; i < this.playerCount; i++) {
            const p = PLAYER_CONTROLS[i];
            const color = PLAYER_COLORS[i];
            const div = document.createElement('div');
            div.className = 'control-player-info';
            div.innerHTML = `
                <div class="player-color-dot" style="background-color: ${color};"></div>
                ${PLAYER_COLOR_NAMES[i]}: ${p.left.toUpperCase()} / ${p.right.toUpperCase()} / ${p.fire.toUpperCase()}
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
        this.gameState = 'menu';
        if(this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.players = [];
        this.powerups = [];
        this.particles = [];
        this.obstacles = [];
        this.boosterPads = [];
        this.projectiles = [];

        this.menuOverlay.classList.remove('hidden');
        this.roundOverOverlay.classList.add('hidden');
        this.countdownOverlay.classList.add('hidden');
        this.howToPlayOverlay.classList.add('hidden');
        this.hud.classList.add('hidden');
        this.isGameOver = false;
        this.isRoundSummaryPending = false;
        this.draw();
    }
    
    startGame() {
        this.players = [];
        for (let i = 0; i < this.playerCount; i++) {
            const p = new Player(i);
            p.updateScoreboard = () => this.updateScoreboard();
            this.players.push(p);
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
        this.roundNumber++;
        this.gameState = 'spawnSelection';
        
        this.players.forEach(p => { p.trailSegments = []; });
        
        this.menuOverlay.classList.add('hidden');
        this.roundOverOverlay.classList.add('hidden');
        this.hud.classList.remove('hidden');
        this.countdownOverlay.classList.remove('hidden');

        this.powerups = [];
        this.particles = [];
        this.projectiles = [];
        this.eliminationOrder = [];
        this.lastPowerUpTime = performance.now();
        this.keys.clear();
        this.generateLevelElements();

        // BUG FIX: Ensure players get a valid, non-colliding initial spawn position.
        const spawnPoints: Point[] = [];
        this.players.forEach(p => {
            let validSpawn = false;
            let retries = 50; // Prevent infinite loops on crowded maps
            while (!validSpawn && retries > 0) {
                retries--;
                p.prepareForSpawnSelection(this.gameWidth, this.gameHeight);

                const ghostPosition = { x: p.ghostX, y: p.ghostY };
                // Use a large radius for spawn clearance, matching the ghost selection visual
                const spawnRadius = PLAYER_SIZE * 4;
                const playerCircle = { ...ghostPosition, radius: spawnRadius };

                let collision = false;
                // Check against obstacles
                for (const obs of this.obstacles) {
                    if (isCircleCollidingWithRotatedRect(playerCircle, obs)) {
                        collision = true;
                        break;
                    }
                }
                if (collision) continue;

                // Check against other player spawn points
                for (const sp of spawnPoints) {
                    // Check if spawn areas overlap
                    if (distSq(ghostPosition, sp) < (spawnRadius * 2) ** 2) {
                        collision = true;
                        break;
                    }
                }
                if (collision) continue;

                // If we are here, the spawn is valid
                validSpawn = true;
                spawnPoints.push(ghostPosition);
            }
            if (retries === 0) {
                console.warn(`Could not find a clear spawn location for Player ${p.id}. Placing anyway.`);
                spawnPoints.push({ x: p.ghostX, y: p.ghostY });
            }
        });
        
        this.updateScoreboard();

        if(this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.lastFrameTime = 0;
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    generateLevelElements() {
        this.obstacles = [];
        this.boosterPads = [];
        if (!this.obstaclesEnabled) return;

        const padding = 100 * (this.gameWidth / this.canvas.width);
        const allElements: Rect[] = [];
        let retries = 100;

        const areaScale = (this.gameWidth * this.gameHeight) / (this.canvas.width * this.canvas.height);
        const scaledObstacleCount = Math.round(OBSTACLE_COUNT * areaScale);
        const scaledBoosterCount = Math.round(BOOSTER_COUNT * areaScale);
        const topBoundary = TOP_MARGIN * (this.gameHeight / this.canvas.height);
        
        const checkWithPadding = (rect1: Rect, rect2: Rect) => {
            const spacing = 80; // Extra space between objects
            const r1Padded = { 
                x: rect1.x - spacing, y: rect1.y - spacing, 
                width: rect1.width + spacing * 2, height: rect1.height + spacing * 2
            };
            return checkRectCollision(r1Padded, rect2);
        };

        for (let i = 0; i < scaledObstacleCount && retries > 0; i++) {
            let newObstacle: Obstacle;
            let bounds: Rect;
            do {
                const width = rand(50, 150);
                const height = rand(10, 25);
                const angle = rand(0, Math.PI * 2); // Fully random angle
                
                const cos = Math.abs(Math.cos(angle));
                const sin = Math.abs(Math.sin(angle));
                const aabbWidth = width * cos + height * sin;
                const aabbHeight = width * sin + height * cos;
                
                const x = rand(padding, this.gameWidth - aabbWidth - padding);
                const y = rand(padding + topBoundary, this.gameHeight - aabbHeight - padding);
                newObstacle = new Obstacle(x, y, width, height, angle);
                bounds = { x, y, width: aabbWidth, height: aabbHeight };
                retries--;
            } while (retries > 0 && allElements.some(el => checkWithPadding(bounds, el)));
            
            if (retries > 0) {
                this.obstacles.push(newObstacle);
                allElements.push(bounds);
            }
        }

        for (let i = 0; i < scaledBoosterCount && retries > 0; i++) {
            let newBooster: BoosterPad;
            let bounds: Rect;
             do {
                const width = rand(80, 150);
                const height = 25;
                const angle = rand(0, Math.PI * 2);

                const cos = Math.abs(Math.cos(angle));
                const sin = Math.abs(Math.sin(angle));
                const aabbWidth = width * cos + height * sin;
                const aabbHeight = width * sin + height * cos;

                const x = rand(padding, this.gameWidth - aabbWidth - padding);
                const y = rand(padding + topBoundary, this.gameHeight - aabbHeight - padding);
                
                newBooster = new BoosterPad(x, y, width, height, angle);
                bounds = { x, y, width: aabbWidth, height: aabbHeight };
                retries--;
            } while (retries > 0 && allElements.some(el => checkWithPadding(bounds, el)));

            if (retries > 0) {
                this.boosterPads.push(newBooster);
                allElements.push(bounds);
            }
        }
    }

    gameLoop = (timestamp: number) => {
        if (!this.lastFrameTime) {
            this.lastFrameTime = timestamp;
        }
        // Clamp deltaTime to prevent huge jumps on tab resume
        const deltaTime = Math.min(0.1, (timestamp - this.lastFrameTime) / 1000);
        this.lastFrameTime = timestamp;

        this.update(deltaTime);
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
    }

    update(deltaTime: number) {
        const now = performance.now();
        
        // OPTIMIZATION: In-place array filtering to reduce garbage collection.
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update();
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
        
        this.boosterPads.forEach(b => b.update(deltaTime));

        if (this.gameState === 'spawnSelection') {
            this.players.forEach(p => p.updateSpawnSelection(this.keys, this.gameWidth, this.gameHeight, deltaTime));
            const elapsed = now - this.roundStartTime;
            if (elapsed >= SPAWN_SELECTION_DURATION) {
                this.players.forEach(p => p.finalizeSpawn());
                this.updateScoreboard(); // Update to show initial ammo
                this.roundStartTime = now; // Reset timer for next phase
                this.gameState = 'countdown';
            }
        } else if (this.gameState === 'countdown') {
            const elapsed = now - this.roundStartTime;
            if (elapsed >= 2000) { // 2 second "GET READY"
                this.gameState = 'playing';
            }
        } else if (this.gameState === 'playing') {
            this.handlePlayerInput();
            this.checkBoosterPads();
            this.players.forEach(p => p.move(this.keys, () => this.createBoosterParticles(p), deltaTime));
            
            this.powerups.forEach(p => p.update());
            this.projectiles.forEach(p => p.update(deltaTime));

            // OPTIMIZATION: In-place filtering for expired power-ups.
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                if (now - this.powerups[i].spawnTime >= POWERUP_LIFESPAN) {
                    this.powerups.splice(i, 1);
                }
            }

            if (this.powerupsEnabled && now - this.lastPowerUpTime > POWERUP_SPAWN_INTERVAL) {
                this.spawnPowerup();
                this.lastPowerUpTime = now;
            }

            this.checkCollisions();
            
            const alivePlayers = this.players.filter(p => p.isAlive);
            if (this.players.length > 1 && alivePlayers.length <= 1) {
                this.endRound();
            }
        }
    }
    
    handlePlayerInput() {
        if (!this.shootingEnabled) return;
        for(const player of this.players) {
            if (player.isAlive && this.keys.has(player.controls.fire)) {
                player.fire(proj => this.projectiles.push(proj));
            }
        }
    }

    createBoosterParticles(player: Player) {
        const angle = player.angle + Math.PI + rand(-0.3, 0.3); // Behind the player
        const speed = rand(1, 3);
        const p = new Particle(player.x, player.y, '#007aff');
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.life = 20;
        this.particles.push(p);
    }

    createBoosterImpactParticles(player: Player, pad: BoosterPad) {
        // A more dramatic particle burst on impact
        for (let i = 0; i < 40; i++) {
            // Particles shoot out perpendicular to the boost direction for a "splash" effect
            const splashAngle = pad.angle + (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1);
            const angle = splashAngle + rand(-0.4, 0.4);
            const speed = rand(4, 10);
            const p = new Particle(player.x, player.y, Math.random() < 0.3 ? 'white' : '#00aaff');
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = rand(30, 60);
            this.particles.push(p);
        }
        this.screenShake += 8; // Add a little screen shake for feedback
    }

    checkBoosterPads() {
        const now = performance.now();
        for (const player of this.players) {
            if (!player.isAlive) continue;
            if (now - player.lastBoostTime < BOOSTER_COOLDOWN) continue;

            for (const pad of this.boosterPads) {
                const playerCircle = { x: player.x, y: player.y, radius: PLAYER_SIZE };
                if (isCircleCollidingWithRotatedRect(playerCircle, pad)) {
                    // Apply a single, strong impulse push, overwriting previous push velocity.
                    const pushX = Math.cos(pad.angle) * BOOSTER_PUSH_FORCE * TARGET_FPS;
                    const pushY = Math.sin(pad.angle) * BOOSTER_PUSH_FORCE * TARGET_FPS;
                    player.pushVx = pushX;
                    player.pushVy = pushY;
                    
                    player.lastBoostTime = now;
                    // NEW: Call the dramatic impact particle effect
                    this.createBoosterImpactParticles(player, pad);
                    break;
                }
            }
        }
    }

    checkCollisions() {
        // --- Projectile Collisions ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];

            // Vs players
            for (const player of this.players) {
                if (player.isAlive && player !== proj.owner && !proj.playersHit.has(player.id)) {
                    if (distSq(proj, player) < (PROJECTILE_SIZE + PLAYER_SIZE) ** 2) {
                        this.killPlayer(player, 'projectile');
                        proj.playersHit.add(player.id);
                        // Projectile continues, does not get destroyed on player hit
                    }
                }
            }

            // Vs walls
            if (proj.x < 0 || proj.x > this.gameWidth || proj.y < 0 || proj.y > this.gameHeight) {
                this.projectiles.splice(i, 1);
                continue;
            }
        }
        
        // --- Projectile Vs Trails (Eraser effect) ---
        if (this.projectiles.length > 0) {
            const trailsToSplit: { player: Player; segmentIndex: number; splitIndices: Set<number> }[] = [];

            for (const proj of this.projectiles) {
                for (const player of this.players) {
                    for (let i = 0; i < player.trailSegments.length; i++) {
                        const segment = player.trailSegments[i];
                        for (let j = 0; j < segment.length; j++) {
                             if (player === proj.owner && i === player.trailSegments.length - 1 && j > segment.length - 15) {
                                continue; // Skip the last 15 points of the owner's newest trail segment
                            }
                            if (distSq(proj, segment[j]) < PROJECTILE_TRAIL_CLEAR_RADIUS ** 2) {
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
            
            trailsToSplit.sort((a, b) => {
                if (a.player.id !== b.player.id) {
                    return a.player.id - b.player.id;
                }
                return b.segmentIndex - a.segmentIndex;
            });

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


        // --- Player Collisions ---
        const topBoundary = TOP_MARGIN * (this.gameHeight / this.canvas.height);
        for (const player of this.players) {
            if (!player.isAlive) continue;
            const pHead = { x: player.x, y: player.y };

            // BUG FIX & REFACTOR: Centralized power-up collection logic.
            // This can happen at any time, even when spawn-protected.
            for (let k = this.powerups.length - 1; k >= 0; k--) {
                const powerup = this.powerups[k];
                if (distSq(pHead, powerup) < (PLAYER_SIZE + powerup.size) ** 2) {
                    player.activatePowerUp(powerup.type, POWERUP_DURATION);
                    for (let i = 0; i < 20; i++) this.particles.push(new Particle(player.x, player.y, 'white'));
                    this.powerups.splice(k, 1);
                    break; // Player can only pick up one power-up per frame
                }
            }

            // If player is spawn-protected, they are immune to lethal collisions.
            if (player.isSpawnProtected()) {
                continue;
            }

            // --- Lethal Collisions ---
            // Vs Walls
            if (pHead.x < PLAYER_SIZE || pHead.x > this.gameWidth - PLAYER_SIZE ||
                pHead.y < topBoundary + PLAYER_SIZE || pHead.y > this.gameHeight - PLAYER_SIZE) {
                this.killPlayer(player); continue;
            }

            // Vs Obstacles
            for (const obs of this.obstacles) {
                const playerCircle = { x: pHead.x, y: pHead.y, radius: PLAYER_SIZE };
                if (isCircleCollidingWithRotatedRect(playerCircle, obs)) {
                    this.killPlayer(player);
                    break; // Player is dead, no need to check other obstacles
                }
            }
            if (!player.isAlive) continue;
            
            // Vs Trails (ghosts are immune)
            if (!player.isGhost) {
                 for (const otherPlayer of this.players) {
                    // Correctly calculate collision distance based on head radius and trail radius.
                    const headRadius = PLAYER_SIZE;
                    const trailRadius = PLAYER_SIZE * otherPlayer.trailWidthMultiplier;
                    const collisionDistSq = (headRadius + trailRadius) ** 2;

                    for (let i = 0; i < otherPlayer.trailSegments.length; i++) {
                        const segment = otherPlayer.trailSegments[i];
                        let pointsToCheck = segment;
                        
                        // Prevent self-collision with the very fresh part of own trail.
                        if (player === otherPlayer && i === otherPlayer.trailSegments.length - 1 && segment.length > 0) {
                            const selfHeadRadius = PLAYER_SIZE;
                            const selfTrailRadius = PLAYER_SIZE * player.trailWidthMultiplier;
                            const clearanceDiameter = selfHeadRadius + selfTrailRadius;
                            const requiredClearanceDistSq = (clearanceDiameter * 1.2) ** 2;

                            let firstSafePointIndex = -1;
                            for (let k = segment.length - 1; k >= 0; k--) {
                                if (distSq(pHead, segment[k]) > requiredClearanceDistSq) {
                                    firstSafePointIndex = k;
                                    break;
                                }
                            }
                            
                            if (firstSafePointIndex !== -1) {
                                pointsToCheck = segment.slice(0, firstSafePointIndex + 1);
                            } else {
                                pointsToCheck = [];
                            }
                        }

                        for (const point of pointsToCheck) {
                            if (distSq(pHead, point) < collisionDistSq) {
                                this.killPlayer(player);
                                break;
                            }
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
            player.isShielded = false; // Shield absorbs one projectile hit
            if (player.activePowerupTimeout) clearTimeout(player.activePowerupTimeout);
            player.clearPowerUps();

            for(let i = 0; i < 30; i++) this.particles.push(new Particle(player.x, player.y, 'white'));
            this.screenShake = 10;
            return; // Player is saved from the projectile
        }

        player.isAlive = false;
        this.eliminationOrder.push(player);

        const remainingAlive = this.players.filter(p => p.isAlive).length;
        const isRoundEndingKill = this.players.length > 1 && remainingAlive <= 1;

        if (cause === 'projectile' || isRoundEndingKill) {
            // Spectacular headshot effect
            this.screenShake = 35;
            for(let i = 0; i < 150; i++) {
                const p = new Particle(player.x, player.y, Math.random() < 0.3 ? 'white' : player.color);
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 12 + 4;
                p.vx = Math.cos(angle) * speed;
                p.vy = Math.sin(angle) * speed;
                p.life = Math.random() * 70 + 50;
                this.particles.push(p);
            }
        } else {
            // Normal crash effect
            this.screenShake = 15;
            for(let i = 0; i < 60; i++) this.particles.push(new Particle(player.x, player.y, player.color));
        }

        this.updateScoreboard();
    }
    
    spawnPowerup() {
        const padding = 50 * (this.gameWidth / this.canvas.width);
        const topBoundary = TOP_MARGIN * (this.gameHeight / this.canvas.height);
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

        const alivePlayers = this.players.filter(p => p.isAlive);
        const winner = alivePlayers.length === 1 ? alivePlayers[0] : undefined;
        
        // Announce winner immediately
        this.countdownTitleEl.textContent = winner ? `${winner.name} wins the round!` : "It's a Draw!";
        this.countdownTitleEl.style.color = winner ? winner.color : 'white';
        this.countdownTitleEl.classList.add('winner-announcement');
        this.roundNumberTextEl.style.display = 'none';
        this.countdownTextEl.style.display = 'none';
        this.countdownOverlay.classList.remove('hidden');

        // Show the summary screen after a delay
        setTimeout(() => {
            this.showRoundSummary();
        }, 2500);
    }

    showRoundSummary() {
        this.isRoundSummaryPending = false;
        if (this.gameState !== 'roundOver') return; // Prevent multiple executions
        
        const alivePlayers = this.players.filter(p => p.isAlive);
        const finalRanking = [...this.eliminationOrder, ...alivePlayers].reverse();
        const pointsToAward = new Map<Player, number>();
        
        // Revised scoring: Last place gets 1 point, 2nd to last gets 2, etc.
        finalRanking.forEach((player, index) => {
            const pointsAwarded = this.players.length - index;
            if (pointsAwarded > 0) {
                 player.score += pointsAwarded;
                 pointsToAward.set(player, pointsAwarded);
            }
        });
        
        const winningScore = this.getWinningScore();
        const winner = alivePlayers.length === 1 ? alivePlayers[0] : undefined;
        
        const gameWinner = this.players.find(p => p.score >= winningScore);
        const endTitle = document.getElementById('end-of-round-title') as HTMLHeadingElement;
        if (gameWinner) {
            this.isGameOver = true;
            endTitle.textContent = `The ${gameWinner.name} player wins the game!`;
            (document.getElementById('play-again-btn') as HTMLButtonElement).textContent = 'New Game';
        } else {
            endTitle.textContent = winner ? `The ${winner.name} player wins the round!` : "It's a draw!";
            (document.getElementById('play-again-btn') as HTMLButtonElement).textContent = 'Next Round';
        }
        
        // Hide winner announcement and show final scoreboard
        this.countdownOverlay.classList.add('hidden');
        // Reset countdown styles for the next round
        this.roundNumberTextEl.style.display = 'block';
        this.countdownTextEl.style.display = 'block';
        this.countdownTitleEl.style.color = '';
        this.countdownTitleEl.classList.remove('winner-announcement');

        this.updateFinalScoreboard(pointsToAward);
        this.roundOverOverlay.classList.remove('hidden');

        // Trigger score animations after a short delay
        setTimeout(() => {
            const awardedSpans = document.querySelectorAll('#scoreboard-final .points-awarded');
            awardedSpans.forEach((span, index) => {
                setTimeout(() => {
                    (span as HTMLElement).classList.add('visible');
                }, index * 150); // Staggered animation
            });
        }, 200);
    }

    draw() {
        this.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-color');
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // --- Start of world-space drawing context ---
        this.ctx.save();
        if (this.screenShake > 0) {
            const dx = (Math.random() - 0.5) * this.screenShake;
            const dy = (Math.random() - 0.5) * this.screenShake;
            this.ctx.translate(dx, dy);
            this.screenShake *= 0.9;
            if (this.screenShake < 0.5) this.screenShake = 0;
        }

        // Apply world-to-screen transform
        this.ctx.scale(this.canvas.width / this.gameWidth, this.canvas.height / this.gameHeight);

        // OPTIMIZATION: Draw the pre-rendered background canvas instead of redrawing the grid.
        this.ctx.drawImage(this.backgroundCanvas, 0, 0);

        this.obstacles.forEach(o => o.draw(this.ctx));
        this.boosterPads.forEach(b => b.draw(this.ctx));
        this.powerups.forEach(p => p.draw(this.ctx));
        
        if (this.gameState === 'spawnSelection') {
             this.players.forEach(p => p.isAlive && p.drawGhost(this.ctx));
        } else {
            this.players.forEach(p => p.draw(this.ctx));
        }

        this.projectiles.forEach(p => p.draw(this.ctx));
        this.particles.forEach(p => p.draw(this.ctx));
        
        // --- End of world-space drawing context ---
        this.ctx.restore();

        // Draw HUD safety line in SCREEN SPACE (after restore)
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
        this.ctx.shadowColor = 'rgba(255, 100, 100, 0.8)';
        this.ctx.shadowBlur = 10;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, TOP_MARGIN);
        this.ctx.lineTo(this.canvas.width, TOP_MARGIN);
        this.ctx.stroke();
        this.ctx.restore();
        
        this.updateCountdownUI();
    }

    updateCountdownUI() {
        if (this.gameState === 'spawnSelection') {
            const elapsed = performance.now() - this.roundStartTime;
            const remaining = Math.max(0, SPAWN_SELECTION_DURATION - elapsed);
            this.roundNumberTextEl.style.display = 'block';
            this.countdownTextEl.style.display = 'block';
            this.roundNumberTextEl.textContent = `Round ${this.roundNumber}`;
            this.countdownTitleEl.textContent = 'CHOOSE YOUR START';
            this.countdownTextEl.textContent = Math.ceil(remaining / 1000).toString();
            this.countdownOverlay.classList.remove('hidden');
        } else if (this.gameState === 'countdown') {
            this.roundNumberTextEl.style.display = 'block';
            this.countdownTextEl.style.display = 'none'; // Hide the "GO!" text
            this.roundNumberTextEl.textContent = `Round ${this.roundNumber}`;
            this.countdownTitleEl.textContent = 'GET READY!';
            this.countdownOverlay.classList.remove('hidden');
        } else if (this.gameState === 'playing' || this.gameState === 'roundOver') {
            if (this.gameState === 'playing') {
                this.countdownOverlay.classList.add('hidden');
            }
        }
    }

    updateScoreboard = () => {
        const scoreboard = document.getElementById('scoreboard')!;
        scoreboard.innerHTML = '';
        const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score)
        sortedPlayers.forEach(p => {
            const el = document.createElement('div');
            el.className = 'player-score';
            if (!p.isAlive) el.classList.add('dead');

            let ammoDisplay = '';
            if (this.shootingEnabled) {
                let dots = '';
                for (let i = 1; i <= INITIAL_AMMO; i++) {
                    dots += `<div class="ammo-dot ${p.ammo >= i ? 'active' : ''}"></div>`;
                }
                ammoDisplay = `<div class="player-ammo">${dots}</div>`;
            }

            el.innerHTML = `
                <div class="player-color-dot" style="background-color: ${p.color};"></div>
                <span class="player-name-score">${p.name}: ${p.score}</span>
                ${ammoDisplay}
            `;
            scoreboard.appendChild(el);
        });
    }

    updateFinalScoreboard(pointsThisRound?: Map<Player, number>) {
        const scoreboard = document.getElementById('scoreboard-final')!;
        scoreboard.innerHTML = '';
        const sortedPlayers = [...this.players].sort((a,b) => b.score - a.score);
        
        sortedPlayers.forEach((p, index) => {
            const el = document.createElement('div');
            el.className = 'player-score-final';
            if (this.isGameOver && index < 3) {
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
    }
}

// --- INITIALIZATION ---
window.addEventListener('load', () => {
    new ZatackaGame();
});