import { activeConfig } from "./config";
import { BoosterPad } from "./entities/BoosterPad";
import { Obstacle } from "./entities/Obstacle";
import type { Game } from "./game";
import type { Rect } from "./types";
import { checkRectCollision, rand } from "./utils";

export class LevelGenerator {
    game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    generate(): { obstacles: Obstacle[], boosterPads: BoosterPad[] } {
        const obstacles: Obstacle[] = [];
        const boosterPads: BoosterPad[] = [];

        const padding = 100 * (this.game.gameWidth / this.game.renderer.canvas.width);
        const allElements: Rect[] = [];
        let retries = 100;
        
        const playerCountForScale = this.game.gameMode === 'practice' ? 2 : this.game.playerCount;
        const baseArea = this.game.renderer.canvas.width * this.game.renderer.canvas.height;
        const gameArea = this.game.gameWidth * this.game.gameHeight;
        const effectivePlayerCount = (1 + (playerCountForScale - 2) * 0.08);
        const areaScale = (gameArea / baseArea) / effectivePlayerCount;
        
        const scaledObstacleCount = Math.round(activeConfig.OBSTACLE_COUNT * areaScale);
        const scaledBoosterCount = Math.round(activeConfig.BOOSTER_COUNT * areaScale);
        const topBoundary = activeConfig.TOP_MARGIN * (this.game.gameHeight / this.game.renderer.canvas.height);
        
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
                const x = rand(padding, this.game.gameWidth - aabbWidth - padding);
                const y = rand(padding + topBoundary, this.game.gameHeight - aabbHeight - padding);
                newObstacle = new Obstacle(x, y, width, height, angle);
                bounds = { x, y, width: aabbWidth, height: aabbHeight };
                retries--;
            } while (retries > 0 && allElements.some(el => checkWithPadding(bounds, el)));
            if (retries > 0) { obstacles.push(newObstacle); allElements.push(bounds); }
        }

        for (let i = 0; i < scaledBoosterCount && retries > 0; i++) {
            let newBooster: BoosterPad, bounds: Rect;
             do {
                const width = rand(80, 150), height = 25, angle = rand(0, Math.PI * 2);
                const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
                const aabbWidth = width * cos + height * sin, aabbHeight = width * sin + height * cos;
                const x = rand(padding, this.game.gameWidth - aabbWidth - padding);
                const y = rand(padding + topBoundary, this.game.gameHeight - aabbHeight - padding);
                newBooster = new BoosterPad(x, y, width, height, angle);
                bounds = { x, y, width: aabbWidth, height: aabbHeight };
                retries--;
            } while (retries > 0 && allElements.some(el => checkWithPadding(bounds, el)));
            if (retries > 0) { boosterPads.push(newBooster); allElements.push(bounds); }
        }

        return { obstacles, boosterPads };
    }
}