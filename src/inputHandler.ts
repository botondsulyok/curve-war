import type { Game } from './game';

export class InputHandler {
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
                        game.uiManager.actions.onStartGame();
                    } else {
                        game.uiManager.actions.onShowHowToPlay(false);
                    }
                } else if (game.gameState === 'roundOver' && !game.isRoundSummaryPending && !game.isGameOver) {
                    game.uiManager.actions.onPlayAgain();
                }
            }
        });
        document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    }

    isKeyDown(key: string): boolean {
        return this.keys.has(key);
    }
}