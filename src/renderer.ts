import { activeConfig } from './config';
import type { BoosterPad } from './entities/BoosterPad';
import type { Obstacle } from './entities/Obstacle';
import type { Particle } from './entities/Particle';
import type { Player } from './entities/Player';
import type { PowerUp } from './entities/PowerUp';
import type { Projectile } from './entities/Projectile';
import type { Game } from './game';


export class Renderer {
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

        const { entityManager } = game;

        this.ctx.scale(this.canvas.width / game.gameWidth, this.canvas.height / game.gameHeight);
        this.ctx.drawImage(this.backgroundCanvas, 0, 0);

        entityManager.obstacles.forEach(o => o.draw(this.ctx));
        entityManager.boosterPads.forEach(b => b.draw(this.ctx));
        entityManager.powerups.forEach(p => this.drawPowerup(p));
        
        if (game.gameState === 'spawnSelection') {
             entityManager.players.forEach(p => p.isAlive && this.drawPlayerGhost(p));
        } else {
            entityManager.players.forEach(p => this.drawPlayer(p));
        }

        entityManager.projectiles.forEach(p => this.drawProjectile(p));
        entityManager.particles.forEach(p => this.drawParticle(p));
        
        this.ctx.restore();

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
        this.ctx.shadowColor = 'rgba(255, 100, 100, 0.8)';
        this.ctx.shadowBlur = 10;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, activeConfig.TOP_MARGIN);
        this.ctx.lineTo(this.canvas.width, activeConfig.TOP_MARGIN);
        this.ctx.lineTo(this.canvas.width, this.canvas.height);
        this.ctx.lineTo(0, this.canvas.height);
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    drawProjectile(proj: Projectile) {
        this.ctx.fillStyle = proj.color;
        this.ctx.shadowColor = proj.color;
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.ctx.arc(proj.x, proj.y, activeConfig.PROJECTILE_SIZE, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    }
    
    drawParticle(p: Particle) {
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
    }
    
    drawPowerup(p: PowerUp) {
        const pulse = Math.sin(p.life * 0.05) * 3;
        const containerRadius = p.size + 8 + pulse / 2;
        
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        
        // Outer glow
        this.ctx.shadowColor = 'white';
        this.ctx.shadowBlur = 15 + pulse;

        // Background circle
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, containerRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Icon drawing
        this.ctx.shadowBlur = 5;
        this.ctx.shadowColor = '#000';
        this.ctx.strokeStyle = 'white';
        this.ctx.fillStyle = 'white';
        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        switch(p.type) {
            case 'speed': // Lightning bolt
                this.ctx.moveTo(-8, -12);
                this.ctx.lineTo(8, 0);
                this.ctx.lineTo(0, 0);
                this.ctx.lineTo(8, 12);
                this.ctx.lineTo(-8, 0);
                this.ctx.lineTo(0, 0);
                this.ctx.closePath();
                this.ctx.stroke();
                this.ctx.fill();
                break;
            case 'shield': // Shield shape
                this.ctx.moveTo(0, -12);
                this.ctx.bezierCurveTo(12, -10, 12, 10, 0, 12);
                this.ctx.bezierCurveTo(-12, 10, -12, -10, 0, -12);
                this.ctx.closePath();
                this.ctx.stroke();
                this.ctx.fill();
                break;
            case 'thinLine': // Wavy line
                this.ctx.moveTo(-12, 0);
                this.ctx.quadraticCurveTo(-6, -8, 0, 0);
                this.ctx.quadraticCurveTo(6, 8, 12, 0);
                this.ctx.lineWidth = 4;
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(-12, 0);
                this.ctx.quadraticCurveTo(-6, -8, 0, 0);
                this.ctx.quadraticCurveTo(6, 8, 12, 0);
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeStyle = '#999';
                this.ctx.stroke();
                break;
            case 'ghost': // Ghost shape
                this.ctx.moveTo(-10, 10);
                this.ctx.arc(0, 0, 10, Math.PI * 0.9, Math.PI * 0.1, false);
                this.ctx.lineTo(10, 10);
                this.ctx.lineTo(6, 6);
                this.ctx.lineTo(0, 10);
                this.ctx.lineTo(-6, 6);
                this.ctx.lineTo(-10, 10);
                this.ctx.closePath();
                this.ctx.stroke();
                this.ctx.fill();
                // Eyes
                this.ctx.fillStyle = '#333';
                this.ctx.beginPath();
                this.ctx.arc(-4, -2, 2, 0, Math.PI * 2);
                this.ctx.arc(4, -2, 2, 0, Math.PI * 2);
                this.ctx.fill();
                break;
        }
        
        this.ctx.restore();
    }

    drawPlayerGhost(player: Player) {
        this.ctx.save();
        const ghostX = player.ghostX;
        const ghostY = player.ghostY;
        const maxRadius = activeConfig.PLAYER_SIZE * activeConfig.SPAWN_GHOST_SIZE_MULTIPLIER;
        const time = performance.now() * 0.001;

        // Draw three concentric, rotating, pulsing rings
        const ringCount = 3;
        for (let i = 0; i < ringCount; i++) {
            const progress = (time * 0.5 + i * 0.4) % 1;
            const radius = progress * maxRadius;
            const alpha = (1 - progress) * 0.7;

            this.ctx.strokeStyle = player.color;
            this.ctx.globalAlpha = alpha;
            this.ctx.lineWidth = 2 + (1 - progress) * 3;
            this.ctx.beginPath();
            this.ctx.arc(ghostX, ghostY, radius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        // Inner core
        this.ctx.globalAlpha = 0.8;
        const coreGradient = this.ctx.createRadialGradient(ghostX, ghostY, 0, ghostX, ghostY, maxRadius * 0.3);
        coreGradient.addColorStop(0, 'rgba(255,255,255,0.7)');
        coreGradient.addColorStop(0.5, player.color);
        coreGradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = coreGradient;
        this.ctx.beginPath();
        this.ctx.arc(ghostX, ghostY, maxRadius * 0.3, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.globalAlpha = 1.0;
    
        // Draw the direction arrow on top
        this.ctx.translate(ghostX, ghostY);
        this.ctx.rotate(player.angle);
        this.ctx.fillStyle = "white";
        this.ctx.shadowColor = 'black';
        this.ctx.shadowBlur = 5;
        
        const arrowSize = maxRadius * 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(arrowSize * 0.7, 0);
        this.ctx.lineTo(arrowSize * 0.4, -arrowSize * 0.4);
        this.ctx.lineTo(arrowSize * 0.4, arrowSize * 0.4);
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.restore();
    }

    drawPlayer(player: Player) {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineWidth = activeConfig.PLAYER_SIZE * 2 * player.trailWidthMultiplier;
        this.ctx.strokeStyle = player.color;
        
        if (activeConfig.trailShadowsEnabled) {
            this.ctx.shadowColor = player.color;
            this.ctx.shadowBlur = 10;
        } else {
            this.ctx.shadowBlur = 0;
        }

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
        this.ctx.shadowBlur = 0; // Reset shadow after drawing trails
        
        if (!player.isAlive) return;

        // Apply shadow only to the player's head for optimized glow effect.
        this.ctx.shadowColor = player.color;
        this.ctx.shadowBlur = 20;
        
        // Main head circle
        this.ctx.fillStyle = player.isGhost ? 'rgba(255,255,255,0.7)' : player.color;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, activeConfig.PLAYER_SIZE, 0, Math.PI * 2);
        this.ctx.fill();

        // Inner highlight for 3D effect
        this.ctx.shadowBlur = 0;
        const highlightOffset = activeConfig.PLAYER_SIZE * 0.3;
        const gradient = this.ctx.createRadialGradient(
            player.x - highlightOffset, player.y - highlightOffset, 0,
            player.x - highlightOffset, player.y - highlightOffset, activeConfig.PLAYER_SIZE * 1.5
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, activeConfig.PLAYER_SIZE, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.save();
        this.ctx.translate(player.x, player.y);
        this.ctx.rotate(player.angle);
        this.ctx.fillStyle = "white";
        
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
            this.ctx.moveTo(activeConfig.PLAYER_SIZE, 0);
            this.ctx.lineTo(activeConfig.PLAYER_SIZE/2, -activeConfig.PLAYER_SIZE/2);
            this.ctx.lineTo(activeConfig.PLAYER_SIZE/2, activeConfig.PLAYER_SIZE/2);
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
            this.ctx.arc(player.x, player.y, activeConfig.PLAYER_SIZE + 6, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    }
}