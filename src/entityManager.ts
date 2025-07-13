import { activeConfig, playerConfigs } from './config';
import { BoosterPad } from './entities/BoosterPad';
import { Obstacle } from './entities/Obstacle';
import { Particle } from './entities/Particle';
import { Player } from './entities/Player';
import { PowerUp } from './entities/PowerUp';
import { Projectile } from './entities/Projectile';
import type { Game } from './game';
import { SpatialGrid } from './spatialGrid';
import type { Point, TimedPoint } from './types';
import { distSq, isCircleCollidingWithRotatedRect, isLineSegmentIntersectingCircle } from './utils';

interface TrailPoint extends TimedPoint {
    owner: Player;
}

export class EntityManager {
    game: Game;

    players: Player[] = [];
    powerups: PowerUp[] = [];
    particles: Particle[] = [];
    obstacles: Obstacle[] = [];
    boosterPads: BoosterPad[] = [];
    projectiles: Projectile[] = [];
    eliminationOrder: Player[] = [];
    
    spatialGrid: SpatialGrid<TrailPoint>;

    constructor(game: Game) {
        this.game = game;
        this.spatialGrid = new SpatialGrid<TrailPoint>(game.gameWidth, game.gameHeight, activeConfig.SPATIAL_GRID_CELL_SIZE);
    }
    
    onResize(width: number, height: number) {
        this.spatialGrid = new SpatialGrid<TrailPoint>(width, height, activeConfig.SPATIAL_GRID_CELL_SIZE);
    }

    reset() {
        this.players = [];
        this.powerups = [];
        this.particles = [];
        this.obstacles = [];
        this.boosterPads = [];
        this.projectiles = [];
        this.eliminationOrder = [];
    }
    
    prepareNewRound() {
        this.powerups = [];
        this.particles = [];
        this.projectiles = [];
        this.eliminationOrder = [];
        this.spatialGrid.clear();
        this.game.lastPowerUpTime = performance.now();
    }

    addTrailPointToGrid(point: TimedPoint, owner: Player) {
        this.spatialGrid.insert({ ...point, owner });
    }

    createPlayers(count: number) {
        this.players = [];
        for (let i = 0; i < count; i++) {
            this.players.push(new Player(i, playerConfigs[i]));
        }
    }

    update(deltaTime: number) {
        const now = performance.now();

        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }
        
        this.boosterPads.forEach(b => b.update(deltaTime));
        this.powerups.forEach(p => p.update());

        // Only move projectiles during active gameplay to "freeze" them on round end.
        if (this.game.gameState === 'playing') {
            this.projectiles.forEach(p => p.update(deltaTime));
        }

        for (let i = this.powerups.length - 1; i >= 0; i--) {
            if (now - this.powerups[i].spawnTime >= activeConfig.POWERUP_LIFESPAN) {
                this.powerups.splice(i, 1);
            }
        }
    }

    private handleProjectileTrailCollisions(): boolean {
        if (this.projectiles.length === 0) return false;

        let trailsModified = false;
        // Map to store modifications before applying them, to prevent altering arrays while iterating.
        // Map<Player, { segmentIndex: number; newSegments: TimedPoint[][] }[]>
        const playerSegmentsToRebuild = new Map<Player, { segmentIndex: number; newSegments: TimedPoint[][] }[]>();

        // This is O(players * segments * points * projectiles). It's slow, but correct.
        // The original implementation was flawed as it couldn't map grid points back to segments.
        for (const player of this.players) {
            for (let segIdx = 0; segIdx < player.trailSegments.length; segIdx++) {
                const segment = player.trailSegments[segIdx];
                const pointsToRemove = new Set<number>(); // Indices of points to remove from this segment

                for (let ptIdx = 0; ptIdx < segment.length; ptIdx++) {
                    const point = segment[ptIdx];
                    for (const proj of this.projectiles) {
                        // Don't clear owner's most recent trail points
                        if (player === proj.owner && segIdx === player.trailSegments.length - 1 && ptIdx > segment.length - 15) continue;
                        
                        if (distSq(proj, point) < activeConfig.PROJECTILE_TRAIL_CLEAR_RADIUS ** 2) {
                            pointsToRemove.add(ptIdx);
                            trailsModified = true;
                        }
                    }
                }
                
                if (pointsToRemove.size > 0) {
                    const newSegments: TimedPoint[][] = [];
                    let currentSegment: TimedPoint[] = [];
                    for (let i = 0; i < segment.length; i++) {
                        if (pointsToRemove.has(i)) {
                            if (currentSegment.length > 1) newSegments.push(currentSegment);
                            currentSegment = [];
                        } else {
                            currentSegment.push(segment[i]);
                        }
                    }
                    if (currentSegment.length > 1) newSegments.push(currentSegment);

                    if (!playerSegmentsToRebuild.has(player)) {
                        playerSegmentsToRebuild.set(player, []);
                    }
                    playerSegmentsToRebuild.get(player)!.push({ segmentIndex: segIdx, newSegments });
                }
            }
        }

        if (trailsModified) {
            // Apply the changes. Iterate backwards over a sorted list of modifications for each player.
            for (const [player, rebuilds] of playerSegmentsToRebuild.entries()) {
                rebuilds.sort((a, b) => b.segmentIndex - a.segmentIndex);
                for (const rebuild of rebuilds) {
                    player.trailSegments.splice(rebuild.segmentIndex, 1, ...rebuild.newSegments);
                }
            }
        }

        return trailsModified;
    }

    private rebuildTrailGrid() {
        this.spatialGrid.clear();
        for (const player of this.players) {
            for (const segment of player.trailSegments) {
                for (const point of segment) {
                    this.addTrailPointToGrid(point, player);
                }
            }
        }
    }

    checkCollisions() {
        const now = performance.now();

        // Projectile vs Player Head (Continuous Collision Detection)
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            for (const player of this.players) {
                if (player.isAlive && player !== proj.owner && !proj.playersHit.has(player.id)) {
                    // Check if the projectile's path intersects the player's hitbox.
                    // The hitbox is expanded by the projectile's radius for an accurate check.
                    const playerHitbox = { 
                        x: player.x, 
                        y: player.y, 
                        radius: activeConfig.PLAYER_SIZE + activeConfig.PROJECTILE_SIZE 
                    };
                    if (isLineSegmentIntersectingCircle({x: proj.prevX, y: proj.prevY}, proj, playerHitbox)) {
                        this.game.killPlayer(player, 'projectile');
                        proj.playersHit.add(player.id);
                    }
                }
            }
            if (proj.x < 0 || proj.x > this.game.gameWidth || proj.y < 0 || proj.y > this.game.gameHeight) {
                this.projectiles.splice(i, 1);
            }
        }
        
        // Projectile vs Player Trails (Refactored for correctness)
        const trailsWereModified = this.handleProjectileTrailCollisions();
        if (trailsWereModified) {
            this.rebuildTrailGrid();
        }

        const topBoundary = activeConfig.TOP_MARGIN * (this.game.gameHeight / this.game.renderer.canvas.height);
        for (const player of this.players) {
            if (!player.isAlive) continue;
            const pHead = { x: player.x, y: player.y };

            // Player vs Powerups
            for (let k = this.powerups.length - 1; k >= 0; k--) {
                const powerup = this.powerups[k];
                if (distSq(pHead, powerup) < (activeConfig.PLAYER_SIZE + powerup.size) ** 2) {
                    player.activatePowerUp(powerup.type, activeConfig.POWERUP_DURATION);
                    for (let i = 0; i < 30; i++) {
                        this.particles.push(new Particle(player.x, player.y, 'white', 3, 30, 8));
                    }
                    this.powerups.splice(k, 1);
                    break; 
                }
            }

            if (player.isSpawnProtected()) continue;

            // Player vs Boundaries
            if (pHead.x < activeConfig.PLAYER_SIZE || pHead.x > this.game.gameWidth - activeConfig.PLAYER_SIZE ||
                pHead.y < topBoundary + activeConfig.PLAYER_SIZE || pHead.y > this.game.gameHeight - activeConfig.PLAYER_SIZE) {
                this.game.killPlayer(player); continue;
            }

            // Player vs Obstacles
            for (const obs of this.obstacles) {
                if (isCircleCollidingWithRotatedRect({ x: pHead.x, y: pHead.y, radius: activeConfig.PLAYER_SIZE }, obs)) {
                    this.game.killPlayer(player);
                    break;
                }
            }
            if (!player.isAlive) continue;
            
            // Player vs Trails
            if (!player.isGhost) {
                 const searchRadius = activeConfig.PLAYER_SIZE * 2;
                 const nearbyPoints = this.spatialGrid.query(player.x - searchRadius, player.y - searchRadius, searchRadius*2, searchRadius*2);
                 
                 for (const point of nearbyPoints) {
                     const otherPlayer = point.owner;
                     
                     if (player === otherPlayer) {
                         const gracePeriod = activeConfig.SELF_COLLISION_GRACE_PERIOD_MS / player.speedMultiplier;
                         if (now - point.time > gracePeriod) {
                             // Check if the center of the head hits the trail. This is more forgiving.
                             const collisionDistSq = (activeConfig.PLAYER_SIZE * player.trailWidthMultiplier) ** 2;
                             if (distSq(pHead, point) < collisionDistSq) {
                                 this.game.killPlayer(player);
                                 break;
                             }
                         }
                     } else {
                         // Collision with other players
                         const collisionDistSq = (activeConfig.PLAYER_SIZE + activeConfig.PLAYER_SIZE * otherPlayer.trailWidthMultiplier) ** 2;
                         if (distSq(pHead, point) < collisionDistSq) {
                             this.game.killPlayer(player);
                             break;
                         }
                     }
                 }
                 if (!player.isAlive) continue;
            }
        }
    }
}