import type { PlayerConfig, GameSize, GameLength, GameMode } from "./types";

const RANDOM_NAMES = [
    'Ace', 'Bolt', 'Comet', 'Dash', 'Echo', 'Fury', 'Ghost', 'Hawk', 
    'Jinx', 'Loki', 'Mystic', 'Nova', 'Orion', 'Pulse', 'Quake', 'Raptor', 
    'Shadow', 'Talon', 'Viper', 'Wraith', 'Zephyr', 'Apex', 'Blaze', 'Cypher'
];

const STATIC_PLAYER_DATA = [
    { color: '#3498db', controls: { left: 'a', right: 'd', fire: 'w' } },
    { color: '#e74c3c', controls: { left: 'arrowleft', right: 'arrowright', fire: 'arrowup' } },
    { color: '#2ecc71', controls: { left: 'j', right: 'l', fire: 'k' } },
    { color: '#f1c40f', controls: { left: '4', right: '6', fire: '5' } },
    { color: '#9b59b6', controls: { left: 'f', right: 'h', fire: 'g' } },
    { color: '#1abc9c', controls: { left: 'z', right: 'c', fire: 'x' } },
    { color: '#e67e22', controls: { left: 'i', right: 'p', fire: 'o' } },
    { color: '#f57a7a', controls: { left: '1', right: '3', fire: '2' } }
];

function generateDefaultPlayerConfigs(): PlayerConfig[] {
    const shuffledNames = [...RANDOM_NAMES].sort(() => 0.5 - Math.random());
    return STATIC_PLAYER_DATA.map((data, index) => ({
        ...data,
        name: shuffledNames[index] || `Player ${index + 1}`
    }));
}


// These are the default properties for each player. These are used as a fallback
// and a template for the customizable `playerConfigs`.
export const DEFAULT_PLAYER_CONFIGS = generateDefaultPlayerConfigs();

// This is the full palette of colors players can choose from.
export const PLAYER_COLOR_PALETTE = STATIC_PLAYER_DATA.map(p => p.color);

// --- Player Config Management ---
export let playerConfigs: PlayerConfig[] = [];
export const PLAYER_CONFIG_STORAGE_KEY = 'curveWarPlayerConfig_v2';

export function savePlayerConfigs() {
    try {
        localStorage.setItem(PLAYER_CONFIG_STORAGE_KEY, JSON.stringify(playerConfigs));
    } catch (e) {
        console.error("Failed to save player settings:", e);
    }
}

export function loadPlayerConfigs() {
    const defaultConfigs = generateDefaultPlayerConfigs();
    let finalConfigs: PlayerConfig[];
    try {
        const saved = localStorage.getItem(PLAYER_CONFIG_STORAGE_KEY);
        if (saved) {
            const savedConfigs = JSON.parse(saved);
            // Merge to ensure new players get defaults and new properties are added.
            finalConfigs = defaultConfigs.map((config: PlayerConfig, i: number) => ({ ...config, ...(savedConfigs[i] || {}) }));
        } else {
            finalConfigs = defaultConfigs;
        }
    } catch (e) {
        console.error("Failed to load player settings:", e);
        finalConfigs = defaultConfigs;
    }
    // Mutate the original array instead of reassigning the variable.
    // This ensures that any module that imported `playerConfigs` sees the changes.
    playerConfigs.splice(0, playerConfigs.length, ...finalConfigs);
    // Always save the resulting config to persist the initial random names
    // and any new players who were assigned a random name.
    savePlayerConfigs();
}

export function resetPlayerConfigs() {
    try {
        localStorage.removeItem(PLAYER_CONFIG_STORAGE_KEY);
    } catch (e) {
        console.error("Failed to remove saved player configs:", e);
    }
    const defaultConfigs = generateDefaultPlayerConfigs();
    playerConfigs.splice(0, playerConfigs.length, ...defaultConfigs);
    // After resetting, save the new set of random names to make them the new persistent base.
    savePlayerConfigs();
}

// These are the game's mechanical settings. They can be modified by the user
// in the "Settings" menu and are saved to localStorage.
export const DEFAULT_CONFIG = {
    // --- UI-configurable settings ---
    gameMode: 'multiplayer' as GameMode,
    playerCount: 2,
    powerupsEnabled: true,
    obstaclesEnabled: true,
    shootingEnabled: true,
    gameSize: 'medium' as GameSize,
    gameLength: 'normal' as GameLength,
    trailShadowsEnabled: true,
    PLAYER_SPEED: 150,
    INITIAL_AMMO: 2,

    // --- Core game mechanics ---
    GAME_BASE_WIDTH: 1920, // Base reference width for scaling game logic.

    PLAYER_SPEED_OPTIONS: { // UI options for speed
        slow: 100,
        medium: 150,
        fast: 200,
    },
    TURN_SPEED: 3.6, // radians per second
    PROJECTILE_SPEED: 240,
    SPAWN_SELECTION_DURATION: 5000,
    SPAWN_PROTECTION_DURATION: 3000,
    FIRE_COOLDOWN: 1000,
    
    // Trail Gaps (distance based)
    DRAW_DISTANCE: 375,
    GAP_DISTANCE: 31.25,

    // Sizes
    PLAYER_SIZE: 5,
    PROJECTILE_SIZE: 20,
    PROJECTILE_TRAIL_CLEAR_RADIUS: 20,
    TOP_MARGIN: 60, // Safe zone at the top for the HUD
    SPATIAL_GRID_CELL_SIZE: 100,

    // Gameplay
    OBSTACLE_COUNT: 3,
    BOOSTER_COUNT: 2,
    SELF_COLLISION_GRACE_PERIOD_MS: 500,
    SPAWN_GHOST_SPEED: 660,
    SPAWN_GHOST_TURN_MULTIPLIER: 2.2,
    SPAWN_GHOST_SIZE_MULTIPLIER: 20,

    // Powerups
    POWERUP_SPAWN_INTERVAL: 7000,
    POWERUP_LIFESPAN: 10000,
    POWERUP_DURATION: 8000,

    // Booster Pads
    BOOSTER_PUSH_FORCE: 900,
    BOOSTER_COOLDOWN: 500,
    BOOSTER_EFFECT_DURATION: 1500,
    BOOSTER_TURN_DAMPENING: 0.1,

    // Physics & Effects
    BOOSTER_PUSH_DECAY: 5.35338e-5,
    BOOSTER_PARTICLE_THRESHOLD_SPEED: 60,
    DEATH_PARTICLE_COUNT_PROJECTILE: 150,
    DEATH_PARTICLE_COUNT_CRASH: 60,
    DEATH_SHAKE_AMOUNT_PROJECTILE: 35,
    DEATH_SHAKE_AMOUNT_CRASH: 15,
    SHIELD_BREAK_PARTICLE_COUNT: 30,
    SHIELD_BREAK_SHAKE_AMOUNT: 10,

    // Non-configurable constants
    GAME_SIZE_MULTIPLIERS: {
        small: 1.0,
        medium: 1.3,
        large: 1.6,
    },
};

// --- Game Config Management ---
export let activeConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
const CONFIG_STORAGE_KEY = 'curveWarConfig_v2';

export function saveConfig() {
    try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(activeConfig));
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
}

export function loadConfig() {
    try {
        const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
        if (saved) {
            const savedConfig = JSON.parse(saved);
            // Overwrite defaults with saved settings, keeping any new properties from default.
            Object.assign(activeConfig, savedConfig);
        }
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
}

export function resetConfig() {
    try {
        localStorage.removeItem(CONFIG_STORAGE_KEY);
    } catch (e) {
        console.error("Failed to remove saved config:", e);
    }
    const newConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    // delete old keys
    Object.keys(activeConfig).forEach(key => {
      if (!(key in newConfig)) {
        delete (activeConfig as any)[key];
      }
    });
    // assign new values
    Object.assign(activeConfig, newConfig);
}