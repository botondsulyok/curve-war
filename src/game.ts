import { activeConfig, loadConfig, loadPlayerConfigs, playerConfigs, PLAYER_COLOR_PALETTE, resetConfig, resetPlayerConfigs, saveConfig, savePlayerConfigs } from './config';
import { BoosterPad } from './entities/BoosterPad';
import { Obstacle } from './entities/Obstacle';
import { Particle } from './entities/Particle';
import { Player } from './entities/Player';
import { PowerUp } from './entities/PowerUp';
import { Projectile } from './entities/Projectile';
import { EntityManager } from './entityManager';
import { InputHandler } from './inputHandler';
import { LevelGenerator } from './levelGenerator';
import { Renderer } from './renderer';
import { UIManager } from './uiManager';
import type { GameLength, GameMode, GameSize, GameState, Point, PowerUpType, Rect } from './types';
import { checkRectCollision, distSq, isCircleCollidingWithRotatedRect, rand } from './utils';

export class Game {
    renderer: Renderer;
    uiManager: UIManager;
    inputHandler: InputHandler;
    entityManager: EntityManager;
    levelGenerator: LevelGenerator;
    
    gameState: GameState = 'menu';
    isGameOver = false;
    isRoundSummaryPending = false;
    
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
        loadConfig();
        loadPlayerConfigs();
        this.renderer = new Renderer();
        this.entityManager = new EntityManager(this);
        this.levelGenerator = new LevelGenerator(this);

        this.syncSettingsFromConfig();

        this.uiManager = new UIManager(this, {
            onStartGame: () => this.startGame(),
            onShowHowToPlay: (show) => this.uiManager.showHowToPlay(show),
            onPlayAgain: () => { if (!this.isRoundSummaryPending) this.startRound(); },
            onBackToMenu: () => this.showMenu(),
            onPlayerCountChange: (count) => this.setPlayerCount(count),
            onSettingChange: (setting, value) => this.setGameSetting(setting, value),
            onGameModeChange: (mode) => this.setGameMode(mode),
            onGameSizeChange: (size) => this.setGameSize(size),
            onGameLengthChange: (length) => this.setGameLength(length),
            onResetToDefaults: () => this.resetToDefaults(),
        });
        this.inputHandler = new InputHandler(this);

        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.updateGameDimensions();
        });
        this.updateGameDimensions();
    }
    
    syncSettingsFromConfig() {
        this.gameMode = activeConfig.gameMode;
        this.playerCount = activeConfig.playerCount;
        this.powerupsEnabled = activeConfig.powerupsEnabled;
        this.obstaclesEnabled = activeConfig.obstaclesEnabled;
        this.shootingEnabled = activeConfig.shootingEnabled;
        this.gameLength = activeConfig.gameLength;
        this.gameSize = activeConfig.gameSize;
    }

    setPlayerCount(newCount: number) {
        const minPlayers = this.gameMode === 'multiplayer' ? 2 : 1;
        const oldCount = this.playerCount;
        const clampedNewCount = Math.max(minPlayers, Math.min(8, newCount));

        if (clampedNewCount > oldCount) { // Players were added
            const colorsInUse = new Set(playerConfigs.slice(0, oldCount).map(p => p.color));
            for (let i = oldCount; i < clampedNewCount; i++) {
                const playerConfig = playerConfigs[i];
                if (colorsInUse.has(playerConfig.color)) {
                    // This player's default color is taken. Find a new one.
                    const newColor = PLAYER_COLOR_PALETTE.find(p => !colorsInUse.has(p));
                    if (newColor) {
                        playerConfig.color = newColor;
                    }
                }
                colorsInUse.add(playerConfig.color);
            }
            savePlayerConfigs();
        }

        this.playerCount = clampedNewCount;
        // Only save playerCount to config if in multiplayer mode.
        // When switching to practice, this prevents overwriting the user's multiplayer player count.
        if (this.gameMode === 'multiplayer') {
            activeConfig.playerCount = this.playerCount;
            saveConfig();
        }

        this.uiManager.updatePlayerCountDisplay(this.playerCount);
        this.updateGameDimensions();
        this.uiManager.updateControlsInfo();
        this.uiManager.updateWinningScoreDisplay();
    }

    setGameSetting(setting: 'powerups' | 'obstacles' | 'shooting', value: boolean) {
        switch (setting) {
            case 'powerups': 
                this.powerupsEnabled = value; 
                activeConfig.powerupsEnabled = value;
                break;
            case 'obstacles': 
                this.obstaclesEnabled = value;
                activeConfig.obstaclesEnabled = value;
                break;
            case 'shooting': 
                this.shootingEnabled = value; 
                activeConfig.shootingEnabled = value;
                this.uiManager.updateScoreboard(); 
                break;
        }
        saveConfig();
    }

    setGameMode(mode: GameMode) {
        if (this.gameMode === mode) return;
        this.gameMode = mode;
        activeConfig.gameMode = mode;
        saveConfig();

        if (mode === 'practice') {
            this.setPlayerCount(1);
            this.uiManager.toggleModeStyles(true);
        } else {
            this.setPlayerCount(activeConfig.playerCount); // Restore saved player count
            this.uiManager.toggleModeStyles(false);
        }
    }

    setGameSize(size: GameSize) {
        if (this.gameSize === size) return;
        this.gameSize = size;
        activeConfig.gameSize = size;
        saveConfig();
        this.updateGameDimensions();
    }
    
    setGameLength(length: GameLength) {
        if (this.gameLength === length) return;
        this.gameLength = length;
        activeConfig.gameLength = length;
        saveConfig();
        this.uiManager.updateWinningScoreDisplay();
    }
    
    resetToDefaults() {
        resetConfig();
        resetPlayerConfigs();
    
        this.syncSettingsFromConfig();
        this.uiManager.syncUIToConfig();
        this.uiManager.updatePlayerCountDisplay(this.playerCount);
        this.uiManager.updateControlsInfo();
        this.uiManager.updateWinningScoreDisplay();
        this.uiManager.createAndInjectAdvancedSettings();
    }

    updateGameDimensions() {
        const playerCountForScale = this.gameMode === 'practice' ? 2 : this.playerCount;
        const scale = 1 + (playerCountForScale - 2) * 0.08;
        const sizeMultiplier = activeConfig.GAME_SIZE_MULTIPLIERS[this.gameSize];

        // New logic: make game dimensions independent of screen resolution
        const aspectRatio = this.renderer.canvas.width / this.renderer.canvas.height;
        this.gameWidth = activeConfig.GAME_BASE_WIDTH * scale * sizeMultiplier;
        this.gameHeight = this.gameWidth / aspectRatio;

        this.renderer.updateGameDimensions(this.gameWidth, this.gameHeight);
        this.entityManager.onResize(this.gameWidth, this.gameHeight);
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
        this.entityManager.reset();
        this.isGameOver = false;
        this.isRoundSummaryPending = false;
        this.uiManager.showMenu();
        this.renderer.render(this);
    }
    
    startGame() {
        if (this.gameMode === 'practice') {
            this.playerCount = 1;
        } else {
            this.playerCount = activeConfig.playerCount;
        }
        this.entityManager.createPlayers(this.playerCount);
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
        
        this.entityManager.players.forEach(p => { p.trailSegments = []; });
        
        this.uiManager.hideAllOverlays();
        this.uiManager.hud.classList.remove('hidden');
        this.uiManager.countdownOverlay.classList.remove('hidden');

        this.entityManager.prepareNewRound();
        this.inputHandler.keys.clear();

        if (this.obstaclesEnabled) {
            const { obstacles, boosterPads } = this.levelGenerator.generate();
            this.entityManager.obstacles = obstacles;
            this.entityManager.boosterPads = boosterPads;
        }

        this.entityManager.players.forEach(p => p.finalizeSpawn());
        const spawnPoints: Point[] = [];
        this.entityManager.players.forEach(p => {
            let validSpawn = false, retries = 50; 
            while (!validSpawn && retries > 0) {
                retries--;
                p.prepareForSpawnSelection(this.gameWidth, this.gameHeight);
                const ghostPosition = { x: p.ghostX, y: p.ghostY };
                const playerCircle = { ...ghostPosition, radius: activeConfig.PLAYER_SIZE * 4 };

                let collision = this.entityManager.obstacles.some(obs => isCircleCollidingWithRotatedRect(playerCircle, obs)) ||
                                spawnPoints.some(sp => distSq(ghostPosition, sp) < ((activeConfig.PLAYER_SIZE * 4) * 2) ** 2);
                
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
        
        this.entityManager.update(deltaTime);

        if (this.gameState === 'spawnSelection') {
            this.entityManager.players.forEach(p => p.updateSpawnSelection(this.inputHandler.keys, this.gameWidth, this.gameHeight, deltaTime));
            if (now - this.roundStartTime >= activeConfig.SPAWN_SELECTION_DURATION) {
                this.entityManager.players.forEach(p => p.finalizeSpawn());
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
            this.entityManager.players.forEach(p => {
                const newTrailPoint = p.move(this.inputHandler.keys, () => this.createBoosterParticles(p), deltaTime);
                if (newTrailPoint) {
                    this.entityManager.addTrailPointToGrid(newTrailPoint, p);
                }
            });

            if (this.powerupsEnabled && now - this.lastPowerUpTime > activeConfig.POWERUP_SPAWN_INTERVAL) {
                this.spawnPowerup();
                this.lastPowerUpTime = now;
            }

            this.entityManager.checkCollisions();
            
            if (this.isRoundOver()) this.endRound();
        }
    }

    isRoundOver(): boolean {
        const alivePlayers = this.entityManager.players.filter(p => p.isAlive);
        if (this.gameMode === 'multiplayer') {
            return this.entityManager.players.length > 1 && alivePlayers.length <= 1;
        } else { // Practice mode
            return this.entityManager.players.length > 0 && alivePlayers.length === 0;
        }
    }
    
    handlePlayerInput() {
        if (!this.shootingEnabled) return;
        for(const player of this.entityManager.players) {
            if (player.isAlive && this.inputHandler.isKeyDown(player.controls.fire)) {
                const fireData = player.fire();
                if (fireData) {
                    this.entityManager.projectiles.push(new Projectile(fireData.x, fireData.y, fireData.angle, player));
                    this.uiManager.updateScoreboard();
                }
            }
        }
    }

    createBoosterParticles(player: Player) {
        const angle = player.angle + Math.PI + rand(-0.3, 0.3);
        const speed = rand(1, 3);
        const p = new Particle(player.x, player.y, '#007aff', 2, 20, 0);
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        this.entityManager.particles.push(p);
    }

    createBoosterImpactParticles(player: Player, pad: BoosterPad) {
        for (let i = 0; i < 40; i++) {
            const splashAngle = pad.angle + (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1);
            const angle = splashAngle + rand(-0.4, 0.4);
            const speed = rand(4, 10);
            const color = Math.random() < 0.3 ? 'white' : '#00aaff';
            const p = new Particle(player.x, player.y, color, 3, rand(30, 60), 0);
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            this.entityManager.particles.push(p);
        }
        this.renderer.screenShake += 8;
    }

    checkBoosterPads() {
        const now = performance.now();
        for (const player of this.entityManager.players) {
            if (!player.isAlive || now - player.lastBoostTime < activeConfig.BOOSTER_COOLDOWN) continue;
            for (const pad of this.entityManager.boosterPads) {
                if (isCircleCollidingWithRotatedRect({ x: player.x, y: player.y, radius: activeConfig.PLAYER_SIZE }, pad)) {
                    player.pushVx = Math.cos(pad.angle) * activeConfig.BOOSTER_PUSH_FORCE;
                    player.pushVy = Math.sin(pad.angle) * activeConfig.BOOSTER_PUSH_FORCE;
                    player.lastBoostTime = now;
                    this.createBoosterImpactParticles(player, pad);
                    break;
                }
            }
        }
    }

    killPlayer(player: Player, cause: 'crash' | 'projectile' = 'crash') {
        if (!player.isAlive || player.isSpawnProtected()) return;
        
        if (player.isShielded && cause === 'projectile') {
            player.clearPowerUps();
            for(let i = 0; i < activeConfig.SHIELD_BREAK_PARTICLE_COUNT; i++) {
                this.entityManager.particles.push(new Particle(player.x, player.y, 'white', 4, 40, 7));
            }
            this.renderer.screenShake = activeConfig.SHIELD_BREAK_SHAKE_AMOUNT;
            return;
        }
        
        player.eliminationTime = this.roundDuration;
        player.clearPowerUps(); // Ensure all power-ups (and their timeouts) are cleared on death
        player.isAlive = false;
        this.entityManager.eliminationOrder.push(player);

        const isRoundEndingKill = this.isRoundOver();

        if (cause === 'projectile' || isRoundEndingKill) {
            this.renderer.screenShake = activeConfig.DEATH_SHAKE_AMOUNT_PROJECTILE;
            for(let i = 0; i < activeConfig.DEATH_PARTICLE_COUNT_PROJECTILE; i++) {
                const color = Math.random() < 0.3 ? 'white' : player.color;
                this.entityManager.particles.push(new Particle(player.x, player.y, color, 4, 80, 15));
            }
        } else {
            this.renderer.screenShake = activeConfig.DEATH_SHAKE_AMOUNT_CRASH;
            for(let i = 0; i < activeConfig.DEATH_PARTICLE_COUNT_CRASH; i++) {
                this.entityManager.particles.push(new Particle(player.x, player.y, player.color, 3, 60, 6));
            }
        }
        this.uiManager.updateScoreboard();
    }
    
    spawnPowerup() {
        const padding = 50 * (this.gameWidth / this.renderer.canvas.width);
        const topBoundary = activeConfig.TOP_MARGIN * (this.gameHeight / this.renderer.canvas.height);
        const x = rand(padding, this.gameWidth - padding);
        const y = rand(padding + topBoundary, this.gameHeight - padding);
        const types: PowerUpType[] = ['speed', 'shield', 'thinLine', 'ghost'];
        const type = types[Math.floor(Math.random() * types.length)];
        this.entityManager.powerups.push(new PowerUp(x, y, type));
    }
    
    endRound() {
        if (this.gameState !== 'playing') return;
        this.gameState = 'roundOver';
        this.isRoundSummaryPending = true;

        if (this.gameMode === 'multiplayer') {
            const alivePlayers = this.entityManager.players.filter(p => p.isAlive);
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
            const pointsToAward = new Map<Player, number>();

            // Sort players by who survived longest. Survivors are ranked highest.
            // Players eliminated at the same time will be grouped in the next step.
            const sortedPlayers = [...this.entityManager.players].sort((a, b) => {
                if (a.isAlive && !b.isAlive) return -1; // a survived, b did not
                if (!a.isAlive && b.isAlive) return 1;  // b survived, a did not
                if (!a.isAlive && !b.isAlive) { // both died, sort by time of death
                    return b.eliminationTime! - a.eliminationTime!;
                }
                return 0; // both survived, they are tied
            });
            
            let rank = 1;
            let i = 0;
            while (i < sortedPlayers.length) {
                const currentPlayer = sortedPlayers[i];
                
                // Find all players tied at the current rank
                let j = i;
                while (j + 1 < sortedPlayers.length) {
                    const nextPlayer = sortedPlayers[j + 1];
                    // Check for a tie: either both are alive, or they died at the exact same time.
                    const isTie = (currentPlayer.isAlive && nextPlayer.isAlive) || 
                                  (!currentPlayer.isAlive && !nextPlayer.isAlive && currentPlayer.eliminationTime === nextPlayer.eliminationTime);
                    if (isTie) {
                        j++;
                    } else {
                        break;
                    }
                }
                
                const tieCount = j - i + 1;
                const pointsAwarded = this.entityManager.players.length - rank + 1;
                
                // Award points to all tied players
                for (let k = i; k <= j; k++) {
                    const player = sortedPlayers[k];
                    if (pointsAwarded > 0) {
                        player.score += pointsAwarded;
                        pointsToAward.set(player, pointsAwarded);
                    }
                }
                
                rank += tieCount;
                i += tieCount;
            }

            const gameWinner = this.entityManager.players.find(p => p.score >= this.getWinningScore());
            if (gameWinner) this.isGameOver = true;
            this.uiManager.updateFinalScoreboard(pointsToAward);
        }
        
        this.uiManager.showRoundSummary();
    }
}