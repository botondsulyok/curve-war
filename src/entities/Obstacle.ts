import type { Rect } from '../types';

export class Obstacle implements Rect {
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
