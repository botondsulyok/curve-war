import type { Rect } from '../types';

export class BoosterPad implements Rect {
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
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);

        const localX = -this.width / 2;
        const localY = -this.height / 2;

        ctx.shadowColor = '#00aaff';
        ctx.shadowBlur = 25;
        
        const pulse = (Math.sin(this.life * 4) + 1) / 2; // a value between 0 and 1
        const baseAlpha = 0.2;
        const pulseAlpha = baseAlpha + pulse * 0.3; // ranges from 0.2 to 0.5
        
        const gradient = ctx.createLinearGradient(localX, 0, localX + this.width, 0);
        gradient.addColorStop(0, `rgba(0, 122, 255, ${pulseAlpha * 0.5})`);
        gradient.addColorStop(0.5, `rgba(0, 122, 255, ${pulseAlpha})`);
        gradient.addColorStop(1, `rgba(0, 122, 255, ${pulseAlpha * 0.5})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(localX, localY, this.width, this.height);
        
        ctx.strokeStyle = `rgba(0, 150, 255, 0.8)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(localX, localY, this.width, this.height);

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.lineCap = 'round';
        ctx.lineWidth = 4;
        
        const chevronCount = Math.floor(this.width / 40);
        const chevronSpacing = this.width / (chevronCount + 1);
        const chevronSize = 10;

        const animationSpeed = 2;
        const waveProgress = (this.life * animationSpeed) % 2;

        for (let i = 0; i < chevronCount; i++) {
            const chevronCenterX = localX + chevronSpacing * (i + 1);
            const normalizedPos = (i + 1) / (chevronCount + 1);
            const distToWave = Math.abs(normalizedPos - (waveProgress - 0.5));
            const brightness = Math.max(0, 1 - (distToWave / 0.5)**2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${brightness * 0.9})`;
            ctx.beginPath();
            ctx.moveTo(chevronCenterX - chevronSize / 2, localY + 4);
            ctx.lineTo(chevronCenterX + chevronSize / 2, localY + this.height / 2);
            ctx.lineTo(chevronCenterX - chevronSize / 2, localY + this.height - 4);
            ctx.stroke();
        }
        
        ctx.restore();
    }
}