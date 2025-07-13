import type { Point } from './types';

export class SpatialGrid<T extends Point> {
    private grid: Map<string, T[]>;
    private width: number;
    private height: number;
    private cellSize: number;
    private cols: number;
    private rows: number;

    constructor(width: number, height: number, cellSize: number) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Map();
    }
    
    private getKey(x: number, y: number): string {
        return `${x},${y}`;
    }

    clear(): void {
        this.grid.clear();
    }

    insert(obj: T): void {
        const col = Math.floor(obj.x / this.cellSize);
        const row = Math.floor(obj.y / this.cellSize);
        
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
            return; // Out of bounds
        }
        
        const key = this.getKey(col, row);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key)!.push(obj);
    }
    
    query(x: number, y: number, width: number, height: number): T[] {
        const results: T[] = [];
        const startCol = Math.max(0, Math.floor(x / this.cellSize));
        const endCol = Math.min(this.cols - 1, Math.floor((x + width) / this.cellSize));
        const startRow = Math.max(0, Math.floor(y / this.cellSize));
        const endRow = Math.min(this.rows - 1, Math.floor((y + height) / this.cellSize));
        
        const queriedKeys = new Set<string>();

        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const key = this.getKey(col, row);
                if (this.grid.has(key) && !queriedKeys.has(key)) {
                    results.push(...this.grid.get(key)!);
                    queriedKeys.add(key);
                }
            }
        }
        return results;
    }
}
