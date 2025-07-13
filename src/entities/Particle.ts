export class Particle {
    x: number; y: number; vx: number; vy: number;
    life: number; maxLife: number; color: string; size: number; initialSize: number;

    constructor(x: number, y: number, color:string, size = 3, life = 60, speed = 5) {
        this.x = x; this.y = y; this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * speed;
        this.vx = Math.cos(angle) * velocity;
        this.vy = Math.sin(angle) * velocity;
        this.initialSize = Math.random() * size + 1;
        this.size = this.initialSize;
        this.life = this.maxLife = Math.random() * life + life / 2;
    }

    update() {
        this.x += this.vx; this.y += this.vy;
        this.vx *= 0.97;
        this.vy *= 0.97;
        this.size = this.initialSize * Math.max(0, this.life / this.maxLife);
        this.life--;
    }
}