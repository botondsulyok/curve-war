






import { activeConfig, saveConfig, playerConfigs, savePlayerConfigs, PLAYER_COLOR_PALETTE } from './config';
import type { Player } from './entities/Player';
import type { Game } from './game';
import type { GameLength, GameMode, GameSize, PlayerConfig } from './types';
import { getRankSuffix } from './utils';

interface UIActions {
    onStartGame: () => void;
    onShowHowToPlay: (show: boolean) => void;
    onPlayAgain: () => void;
    onBackToMenu: () => void;
    onPlayerCountChange: (newCount: number) => void;
    onSettingChange: (setting: 'powerups' | 'obstacles' | 'shooting', value: boolean) => void;
    onGameModeChange: (mode: GameMode) => void;
    onGameSizeChange: (size: GameSize) => void;
    onGameLengthChange: (length: GameLength) => void;
    onResetToDefaults: () => void;
}

export class UIManager {
    game: Game;
    actions: UIActions;
    
    // Overlays
    menuOverlay: HTMLDivElement;
    roundOverOverlay: HTMLDivElement;
    countdownOverlay: HTMLDivElement;
    howToPlayOverlay: HTMLDivElement;
    playerSettingsOverlay: HTMLDivElement;
    resetConfirmOverlay: HTMLDivElement;
    
    // Countdown Elements
    countdownTitleEl: HTMLHeadingElement;
    roundNumberTextEl: HTMLHeadingElement;
    countdownTextEl: HTMLSpanElement;

    // In-Game HUD
    hud: HTMLDivElement;
    scoreboardEl: HTMLDivElement;

    // Menu Settings
    playerCountSetting: HTMLDivElement;
    playerCountValueEl: HTMLSpanElement;
    gameLengthSetting: HTMLDivElement;
    controlsInfoEl: HTMLDivElement;
    gameModeControl: HTMLDivElement;
    advancedSettingsContainer: HTMLDivElement;

    // Player Settings
    playerSettingsTitleEl: HTMLHeadingElement;
    playerNameInput: HTMLInputElement;
    playerColorSelector: HTMLDivElement;
    controlLeftInputBtn: HTMLButtonElement;
    controlRightInputBtn: HTMLButtonElement;
    controlFireInputBtn: HTMLButtonElement;
    activeKeyInputBtn: HTMLButtonElement | null = null;
    currentPlayerEditingId: number | null = null;


    // Round Over Screen
    practiceResultsEl: HTMLDivElement;
    survivalTimeTextEl: HTMLSpanElement;
    finalScoreboardEl: HTMLDivElement;
    endOfRoundTitleEl: HTMLHeadingElement;
    playAgainBtn: HTMLButtonElement;

    // How to Play Screen
    howToPlayWinningScoreEl: HTMLSpanElement;


    constructor(game: Game, actions: UIActions) {
        this.game = game;
        this.actions = actions;

        // Cache all DOM elements
        this.menuOverlay = document.getElementById('menu-overlay') as HTMLDivElement;
        this.roundOverOverlay = document.getElementById('round-over-overlay') as HTMLDivElement;
        this.countdownOverlay = document.getElementById('countdown-overlay') as HTMLDivElement;
        this.howToPlayOverlay = document.getElementById('how-to-play-overlay') as HTMLDivElement;
        this.playerSettingsOverlay = document.getElementById('player-settings-overlay') as HTMLDivElement;
        this.resetConfirmOverlay = document.getElementById('reset-confirm-overlay') as HTMLDivElement;
        
        this.countdownTitleEl = document.getElementById('countdown-title') as HTMLHeadingElement;
        this.roundNumberTextEl = document.getElementById('round-number-text') as HTMLHeadingElement;
        this.countdownTextEl = document.getElementById('countdown-text') as HTMLSpanElement;
        this.hud = document.getElementById('hud') as HTMLDivElement;
        this.scoreboardEl = document.getElementById('scoreboard') as HTMLDivElement;
        this.playerCountSetting = document.getElementById('player-count-setting') as HTMLDivElement;
        this.playerCountValueEl = document.getElementById('player-count-value') as HTMLSpanElement;
        this.gameLengthSetting = document.getElementById('game-length-setting') as HTMLDivElement;
        this.controlsInfoEl = document.getElementById('controls-info') as HTMLDivElement;
        this.gameModeControl = document.getElementById('game-mode-control') as HTMLDivElement;
        this.advancedSettingsContainer = document.getElementById('advanced-settings-container') as HTMLDivElement;

        this.practiceResultsEl = document.getElementById('practice-results') as HTMLDivElement;
        this.survivalTimeTextEl = document.getElementById('survival-time-text') as HTMLSpanElement;
        this.finalScoreboardEl = document.getElementById('scoreboard-final') as HTMLDivElement;
        this.endOfRoundTitleEl = document.getElementById('end-of-round-title') as HTMLHeadingElement;
        this.playAgainBtn = document.getElementById('play-again-btn') as HTMLButtonElement;
        this.howToPlayWinningScoreEl = document.getElementById('how-to-play-winning-score') as HTMLSpanElement;

        // Player settings elements
        this.playerSettingsTitleEl = document.getElementById('player-settings-title') as HTMLHeadingElement;
        this.playerNameInput = document.getElementById('player-name-input') as HTMLInputElement;
        this.playerColorSelector = document.getElementById('player-color-selector') as HTMLDivElement;
        this.controlLeftInputBtn = document.getElementById('control-left-input') as HTMLButtonElement;
        this.controlRightInputBtn = document.getElementById('control-right-input') as HTMLButtonElement;
        this.controlFireInputBtn = document.getElementById('control-fire-input') as HTMLButtonElement;

        const settingsEl = this.menuOverlay.querySelector('.settings') as HTMLElement;
        // Add a class to disable transitions during initialization to prevent FOUC
        settingsEl.classList.add('no-transitions');

        this.setupEventListeners();
        this.syncUIToConfig();
        this.createAndInjectAdvancedSettings();
        this.updateControlsInfo();
        this.showMenu();
        // Add initialized class to make settings visible
        settingsEl.classList.add('initialized');

        // Re-enable transitions after the initial render has taken place
        requestAnimationFrame(() => {
            settingsEl.classList.remove('no-transitions');
        });
    }

    private setupSegmentedControl(elementId: string, callback: (value: string) => void) {
        const control = document.getElementById(elementId)!;
        control.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            if (target.tagName !== 'BUTTON' || !target.dataset.value) return;
            
            callback(target.dataset.value);

            const parent = target.parentElement!;
            parent.querySelector('.active')?.classList.remove('active');
            target.classList.add('active');
        });
    }

    setupEventListeners() {
        document.getElementById('start-game-btn')!.addEventListener('click', this.actions.onStartGame);
        document.getElementById('how-to-play-btn')!.addEventListener('click', () => this.actions.onShowHowToPlay(true));
        document.getElementById('close-how-to-play-btn')!.addEventListener('click', () => this.actions.onShowHowToPlay(false));

        this.playAgainBtn.addEventListener('click', this.actions.onPlayAgain);
        document.getElementById('back-to-menu-btn')!.addEventListener('click', this.actions.onBackToMenu);
        
        document.getElementById('player-count-plus')!.addEventListener('click', () => this.actions.onPlayerCountChange(this.game.playerCount + 1));
        document.getElementById('player-count-minus')!.addEventListener('click', () => this.actions.onPlayerCountChange(this.game.playerCount - 1));

        document.getElementById('powerups-toggle')!.addEventListener('change', (e) => this.actions.onSettingChange('powerups', (e.target as HTMLInputElement).checked));
        document.getElementById('obstacles-toggle')!.addEventListener('change', (e) => this.actions.onSettingChange('obstacles', (e.target as HTMLInputElement).checked));
        const shootingToggle = document.getElementById('shooting-toggle') as HTMLInputElement;
        shootingToggle.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            this.actions.onSettingChange('shooting', isChecked);
            this.advancedSettingsContainer.querySelector('.ammo-setting')?.classList.toggle('hidden', !isChecked);
        });

        document.getElementById('reset-defaults-btn')!.addEventListener('click', () => this.showResetConfirm(true));
        document.getElementById('confirm-reset-btn')!.addEventListener('click', () => {
            this.actions.onResetToDefaults();
            this.showResetConfirm(false);
        });
        document.getElementById('cancel-reset-btn')!.addEventListener('click', () => this.showResetConfirm(false));


        this.setupSegmentedControl('game-mode-control', (value) => this.actions.onGameModeChange(value as GameMode));
        this.setupSegmentedControl('game-length-control', (value) => this.actions.onGameLengthChange(value as GameLength));
        this.setupSegmentedControl('game-size-control', (value) => this.actions.onGameSizeChange(value as GameSize));

        // Player Settings Listeners
        document.getElementById('save-player-settings-btn')!.addEventListener('click', () => this.handleSavePlayerSettings());
        document.getElementById('cancel-player-settings-btn')!.addEventListener('click', () => this.showPlayerSettings(false));
        this.controlLeftInputBtn.addEventListener('click', () => this.listenForKey(this.controlLeftInputBtn));
        this.controlRightInputBtn.addEventListener('click', () => this.listenForKey(this.controlRightInputBtn));
        this.controlFireInputBtn.addEventListener('click', () => this.listenForKey(this.controlFireInputBtn));
        document.addEventListener('keydown', (e) => this.onKeyInput(e));
    }

    toggleModeStyles(isPractice: boolean) {
        this.playerCountSetting.classList.toggle('hidden', isPractice);
        this.gameLengthSetting.classList.toggle('hidden', isPractice);
        this.updateControlsInfo(); // Re-render controls for 1p vs multi
    }
    
    updatePlayerCountDisplay(newCount: number) {
        this.playerCountValueEl.textContent = newCount.toString();
    }

    updateWinningScoreDisplay() {
        if (this.game.gameMode === 'practice') {
            this.howToPlayWinningScoreEl.textContent = '';
            return;
        }
        const winningScore = this.game.getWinningScore();
        if (this.howToPlayWinningScoreEl) {
           this.howToPlayWinningScoreEl.textContent = `The first player to reach ${winningScore} points wins the game.`;
        }
    }
    
    updateControlsInfo() {
        this.controlsInfoEl.replaceChildren(); // Clear previous content
        const count = this.game.gameMode === 'practice' ? 1 : this.game.playerCount;

        for (let i = 0; i < count; i++) {
            const pConfig = playerConfigs[i];
            
            const div = document.createElement('div');
            div.className = 'control-player-info';
            div.dataset.playerId = i.toString();
            div.addEventListener('click', () => this.showPlayerSettings(true, i));

            const dot = document.createElement('div');
            dot.className = 'player-color-dot';
            dot.style.backgroundColor = pConfig.color;
            
            const text = document.createTextNode(` ${pConfig.name}: ${pConfig.controls.left.toUpperCase()} / ${pConfig.controls.right.toUpperCase()} / ${pConfig.controls.fire.toUpperCase()}`);
            div.append(dot, text);
            this.controlsInfoEl.appendChild(div);
        }
    }

    showHowToPlay(show: boolean) {
        if (show) {
            this.updateWinningScoreDisplay();
        }
        this.howToPlayOverlay.classList.toggle('hidden', !show);
    }
    
    showResetConfirm(show: boolean) {
        this.resetConfirmOverlay.classList.toggle('hidden', !show);
    }

    hideAllOverlays() {
        this.menuOverlay.classList.add('hidden');
        this.roundOverOverlay.classList.add('hidden');
        this.countdownOverlay.classList.add('hidden');
        this.howToPlayOverlay.classList.add('hidden');
        this.playerSettingsOverlay.classList.add('hidden');
        this.resetConfirmOverlay.classList.add('hidden');
    }

    showMenu() {
        this.hideAllOverlays();
        this.menuOverlay.classList.remove('hidden');
        this.hud.classList.add('hidden');

        // Reset UI to default multiplayer view if needed
        const isPractice = this.game.gameMode === 'practice';
        this.toggleModeStyles(isPractice);
        this.gameModeControl.querySelector('.active')?.classList.remove('active');
        this.gameModeControl.querySelector(`[data-value="${this.game.gameMode}"]`)?.classList.add('active');
        
        this.syncUIToConfig();
        this.updateControlsInfo();
    }
    
    showRoundSummary() {
        if (this.game.gameMode === 'practice') {
            this.finalScoreboardEl.classList.add('hidden');
            this.practiceResultsEl.classList.remove('hidden');
            this.survivalTimeTextEl.textContent = `${this.game.roundDuration.toFixed(1)}s`;
            
            this.endOfRoundTitleEl.textContent = 'Practice Over!';
            this.playAgainBtn.textContent = 'Try Again';

        } else { // Multiplayer mode
            this.finalScoreboardEl.classList.remove('hidden');
            this.practiceResultsEl.classList.add('hidden');
            
            const alivePlayers = this.game.entityManager.players.filter(p => p.isAlive);
            const winner = alivePlayers.length === 1 ? alivePlayers[0] : undefined;
            const gameWinner = this.game.entityManager.players.find(p => p.score >= this.game.getWinningScore());

            if (gameWinner) {
                this.endOfRoundTitleEl.textContent = `${gameWinner.name} wins the game!`;
                this.playAgainBtn.textContent = 'New Game';
            } else {
                this.endOfRoundTitleEl.textContent = winner ? `${winner.name} wins the round!` : "It's a draw!";
                this.playAgainBtn.textContent = 'Next Round';
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
            const remaining = Math.max(0, activeConfig.SPAWN_SELECTION_DURATION - elapsed);
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
        this.scoreboardEl.replaceChildren();
        
        const players = this.game.entityManager.players;
        if (!players || players.length === 0) return;

        const playersToShow = this.game.gameMode === 'practice' ? players : [...players].sort((a, b) => b.score - a.score);
        
        playersToShow.forEach(p => {
            const el = document.createElement('div');
            el.className = 'player-score';
            if (!p.isAlive) el.classList.add('dead');

            const colorDot = document.createElement('div');
            colorDot.className = 'player-color-dot';
            colorDot.style.backgroundColor = p.color;

            const nameScore = document.createElement('span');
            nameScore.className = 'player-name-score';
            nameScore.textContent = this.game.gameMode === 'practice' 
                ? `${(this.game.roundDuration).toFixed(1)}s` 
                : `${p.name}: ${p.score}`;
            
            el.append(colorDot, nameScore);

            if (this.game.shootingEnabled) {
                const ammoDisplay = document.createElement('div');
                ammoDisplay.className = 'player-ammo';
                for (let i = 1; i <= activeConfig.INITIAL_AMMO; i++) {
                    const dot = document.createElement('div');
                    dot.className = 'ammo-dot';
                    if(p.ammo >= i) dot.classList.add('active');
                    ammoDisplay.appendChild(dot);
                }
                el.appendChild(ammoDisplay);
            }
            
            this.scoreboardEl.appendChild(el);
        });
    }

    updateFinalScoreboard(pointsThisRound?: Map<Player, number>) {
        this.finalScoreboardEl.replaceChildren();
        const sortedPlayers = [...this.game.entityManager.players].sort((a,b) => b.score - a.score);
        
        let rank = 1;
        sortedPlayers.forEach((p, index) => {
            // If the current player's score is less than the previous player's score, they have a new, lower rank.
            // Otherwise, they share the same rank as the previous player.
            if (index > 0 && p.score < sortedPlayers[index - 1].score) {
                rank = index + 1;
            }

            const el = document.createElement('div');
            el.className = 'player-score-final';
            // Apply podium styling based on the calculated rank, not the array index.
            if (this.game.isGameOver && rank <= 3) {
                el.classList.add(`podium-${rank}`);
            }
            
            const rankText = `${rank}${getRankSuffix(rank)}`;
            const pointsAwarded = pointsThisRound?.get(p) ?? 0;

            const rankSpan = document.createElement('span');
            rankSpan.className = 'player-rank';
            rankSpan.textContent = rankText;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';

            const colorDot = document.createElement('span');
            colorDot.className = 'player-color-dot';
            colorDot.style.backgroundColor = p.color;
            nameSpan.append(colorDot, document.createTextNode(` ${p.name}`));

            const scoreContainer = document.createElement('span');
            scoreContainer.className = 'player-final-score-container';
            
            const finalScore = document.createElement('span');
            finalScore.className = 'player-final-score';
            finalScore.textContent = p.score.toString();
            scoreContainer.appendChild(finalScore);

            if (pointsAwarded > 0) {
                const awardedSpan = document.createElement('span');
                awardedSpan.className = 'points-awarded';
                awardedSpan.textContent = `+${pointsAwarded}`;
                scoreContainer.appendChild(awardedSpan);
            }

            el.append(rankSpan, nameSpan, scoreContainer);
            this.finalScoreboardEl.appendChild(el);
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
    
    // --- Settings Methods ---

    syncUIToConfig() {
        // Set toggles
        (document.getElementById('powerups-toggle') as HTMLInputElement).checked = activeConfig.powerupsEnabled;
        (document.getElementById('obstacles-toggle') as HTMLInputElement).checked = activeConfig.obstaclesEnabled;
        (document.getElementById('shooting-toggle') as HTMLInputElement).checked = activeConfig.shootingEnabled;
    
        // Set segmented controls for size and length
        document.querySelector('#game-size-control .active')?.classList.remove('active');
        document.querySelector(`#game-size-control [data-value="${activeConfig.gameSize}"]`)?.classList.add('active');
        
        document.querySelector('#game-length-control .active')?.classList.remove('active');
        document.querySelector(`#game-length-control [data-value="${activeConfig.gameLength}"]`)?.classList.add('active');
    
        // Set player count
        this.updatePlayerCountDisplay(activeConfig.playerCount);
    }

    createAndInjectAdvancedSettings() {
        this.advancedSettingsContainer.innerHTML = ''; // Clear existing
    
        const createRow = (label: string): [HTMLDivElement, HTMLLabelElement] => {
            const row = document.createElement('div');
            row.className = 'adv-setting-row';
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            row.appendChild(labelEl);
            return [row, labelEl];
        };
    
        // --- Speed Setting ---
        const [speedRow] = createRow('Line Speed');
        const speedControl = document.createElement('div');
        speedControl.className = 'segmented-control';
    
        let currentSpeedKey: string = 'medium';
        for (const [key, value] of Object.entries(activeConfig.PLAYER_SPEED_OPTIONS)) {
            if (value === activeConfig.PLAYER_SPEED) {
                currentSpeedKey = key;
            }
        }
    
        for (const key of Object.keys(activeConfig.PLAYER_SPEED_OPTIONS)) {
            const button = document.createElement('button');
            button.dataset.value = key;
            button.textContent = key.charAt(0).toUpperCase() + key.slice(1);
            if (key === currentSpeedKey) button.classList.add('active');
            speedControl.appendChild(button);
        }
        
        speedControl.addEventListener('click', (e) => {
            const target = e.target as HTMLButtonElement;
            const value = target.dataset.value;
            if (!value || target.tagName !== 'BUTTON') return;
            
            speedControl.querySelector('.active')?.classList.remove('active');
            target.classList.add('active');

            const speedKey = value as keyof typeof activeConfig.PLAYER_SPEED_OPTIONS;
            activeConfig.PLAYER_SPEED = activeConfig.PLAYER_SPEED_OPTIONS[speedKey];
            saveConfig();
        });
        speedRow.appendChild(speedControl);
        this.advancedSettingsContainer.appendChild(speedRow);
    
        // --- Ammo Setting ---
        const [ammoRow, ammoLabel] = createRow('Ammo');
        ammoLabel.htmlFor = 'config-input-INITIAL_AMMO';
        ammoRow.classList.add('ammo-setting');
        if (!this.game.shootingEnabled) ammoRow.classList.add('hidden');
        
        const ammoInput = document.createElement('input');
        ammoInput.type = 'number';
        ammoInput.id = 'config-input-INITIAL_AMMO';
        ammoInput.value = activeConfig.INITIAL_AMMO.toString();
        ammoInput.min = "0";
        ammoInput.max = "10";
        ammoInput.addEventListener('change', () => {
            let value = parseInt(ammoInput.value, 10);
            if (isNaN(value) || value < 0) value = 0;
            if (value > 10) value = 10;
            activeConfig.INITIAL_AMMO = value;
            saveConfig();
            ammoInput.value = value.toString(); // Ensure UI reflects sanitized value
        });
        ammoRow.appendChild(ammoInput);
        this.advancedSettingsContainer.appendChild(ammoRow);
    
        // --- Trail Shadows Setting ---
        const [shadowsRow, shadowsLabel] = createRow('Trail Shadows');
        shadowsLabel.htmlFor = 'config-input-trailShadowsEnabled';
        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = activeConfig.trailShadowsEnabled;
        input.id = 'config-input-trailShadowsEnabled';
        const slider = document.createElement('span');
        slider.className = 'slider';
        switchLabel.append(input, slider);
        
        input.addEventListener('change', () => {
            activeConfig.trailShadowsEnabled = input.checked;
            saveConfig();
        });
        shadowsRow.appendChild(switchLabel);
        this.advancedSettingsContainer.appendChild(shadowsRow);
    }
    
    // --- Player Settings Methods ---

    showPlayerSettings(show: boolean, playerId?: number) {
        if (show && playerId !== undefined) {
            this.currentPlayerEditingId = playerId;
            const config = playerConfigs[playerId];

            this.playerSettingsTitleEl.textContent = `Edit ${config.name}`;
            this.playerNameInput.value = config.name;
            
            this.controlLeftInputBtn.textContent = config.controls.left.toUpperCase();
            this.controlLeftInputBtn.dataset.key = config.controls.left;
            this.controlRightInputBtn.textContent = config.controls.right.toUpperCase();
            this.controlRightInputBtn.dataset.key = config.controls.right;
            this.controlFireInputBtn.textContent = config.controls.fire.toUpperCase();
            this.controlFireInputBtn.dataset.key = config.controls.fire;

            this.generateColorSelector(config.color);
            
            this.playerSettingsOverlay.classList.remove('hidden');
            this.menuOverlay.classList.add('hidden');
        } else {
            this.playerSettingsOverlay.classList.add('hidden');
            this.menuOverlay.classList.remove('hidden');
            this.currentPlayerEditingId = null;
        }
    }
    
    generateColorSelector(currentColor: string) {
        this.playerColorSelector.innerHTML = '';
        const usedColors = playerConfigs
            .slice(0, this.game.playerCount) // Only check against active players
            .map(p => p.color)
            .filter((_, i) => i !== this.currentPlayerEditingId);

        PLAYER_COLOR_PALETTE.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.dataset.color = color;

            if (color === currentColor) {
                swatch.classList.add('selected');
            }
            if (usedColors.includes(color)) {
                swatch.classList.add('disabled');
            }

            swatch.addEventListener('click', () => {
                if (swatch.classList.contains('disabled')) return;
                this.playerColorSelector.querySelector('.selected')?.classList.remove('selected');
                swatch.classList.add('selected');
            });

            this.playerColorSelector.appendChild(swatch);
        });
    }

    handleSavePlayerSettings() {
        if (this.currentPlayerEditingId === null) return;

        const newName = this.playerNameInput.value.trim() || `Player ${this.currentPlayerEditingId + 1}`;
        const selectedColorSwatch = this.playerColorSelector.querySelector('.selected') as HTMLDivElement;
        const newColor = selectedColorSwatch.dataset.color!;
        const newControls = {
            left: this.controlLeftInputBtn.dataset.key!,
            right: this.controlRightInputBtn.dataset.key!,
            fire: this.controlFireInputBtn.dataset.key!,
        };

        // Check for duplicate keys
        const allKeys = [newControls.left, newControls.right, newControls.fire];
        if (new Set(allKeys).size !== 3) {
            alert("Duplicate controls for the same player are not allowed.");
            return;
        }
        for (let i = 0; i < this.game.playerCount; i++) {
            if (i === this.currentPlayerEditingId) continue;
            const otherControls = playerConfigs[i].controls;
            if (allKeys.includes(otherControls.left) || allKeys.includes(otherControls.right) || allKeys.includes(otherControls.fire)) {
                alert(`One of these keys is already used by ${playerConfigs[i].name}. Please choose unique keys.`);
                return;
            }
        }

        playerConfigs[this.currentPlayerEditingId] = {
            name: newName,
            color: newColor,
            controls: newControls
        };
        
        savePlayerConfigs();
        this.updateControlsInfo();
        this.showPlayerSettings(false);
    }
    
    listenForKey(button: HTMLButtonElement) {
        if (this.activeKeyInputBtn) {
            this.activeKeyInputBtn.classList.remove('listening');
            this.activeKeyInputBtn.textContent = this.activeKeyInputBtn.dataset.key?.toUpperCase() ?? '...';
        }
        this.activeKeyInputBtn = button;
        button.classList.add('listening');
        button.textContent = 'Press a key...';
    }

    onKeyInput(e: KeyboardEvent) {
        if (!this.activeKeyInputBtn) return;
        
        e.preventDefault();
        e.stopPropagation();

        const key = e.key.toLowerCase();
        
        // Don't allow meta keys or escape
        if (e.metaKey || e.ctrlKey || e.altKey || key === 'escape') {
             this.activeKeyInputBtn.classList.remove('listening');
             this.activeKeyInputBtn.textContent = this.activeKeyInputBtn.dataset.key?.toUpperCase() ?? '...';
             this.activeKeyInputBtn = null;
            return;
        }

        this.activeKeyInputBtn.dataset.key = key;
        this.activeKeyInputBtn.textContent = key.toUpperCase();
        this.activeKeyInputBtn.classList.remove('listening');
        this.activeKeyInputBtn = null;
    }
}