import type { Point, Rect } from './types';

export const distSq = (p1: Point, p2: Point) => (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
export const rand = (min: number, max: number) => Math.random() * (max - min) + min;
export const checkRectCollision = (rect1: Rect, rect2: Rect) => (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
);

export function isCircleCollidingWithRotatedRect(
    circle: { x: number; y: number; radius: number },
    rect: Rect & { angle: number }
): boolean {
    const rectCenterX = rect.x + rect.width / 2;
    const rectCenterY = rect.y + rect.height / 2;

    const translatedX = circle.x - rectCenterX;
    const translatedY = circle.y - rectCenterY;

    const cosAngle = Math.cos(-rect.angle);
    const sinAngle = Math.sin(-rect.angle);
    const rotatedX = translatedX * cosAngle - translatedY * sinAngle;
    const rotatedY = translatedX * sinAngle + translatedY * cosAngle;

    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const closestX = Math.max(-halfWidth, Math.min(halfWidth, rotatedX));
    const closestY = Math.max(-halfHeight, Math.min(halfHeight, rotatedY));
    
    const distanceSq = distSq({x: rotatedX, y: rotatedY}, {x: closestX, y: closestY});

    return distanceSq < circle.radius ** 2;
}

/**
 * Checks if a line segment (from p1 to p2) intersects with a circle.
 * This is useful for continuous collision detection to prevent tunneling.
 * @param p1 The start point of the line segment.
 * @param p2 The end point of the line segment.
 * @param circle The circle to check against.
 * @returns True if they intersect, false otherwise.
 */
export function isLineSegmentIntersectingCircle(p1: Point, p2: Point, circle: { x: number; y: number; radius: number }): boolean {
    // First, check if either endpoint is already inside the circle
    if (distSq(p2, circle) <= circle.radius ** 2) return true;

    const lenSq = distSq(p1, p2);
    // If the segment has no length and we're not inside, no collision
    if (lenSq === 0) return false; 

    // Find the projection of the circle's center onto the line defined by the segment
    const t = ((circle.x - p1.x) * (p2.x - p1.x) + (circle.y - p1.y) * (p2.y - p1.y)) / lenSq;

    // The projection falls outside the segment, so the closest point is one of the endpoints.
    // We already checked p2, so we only need to check the distance from p1.
    if (t < 0) {
        return distSq(p1, circle) <= circle.radius ** 2;
    }
    // If t > 1, the closest point is p2, which we already checked.
    if (t > 1) {
        return false;
    }

    // The projection falls within the segment, so find the closest point on the segment
    const closestPoint = {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
    };

    // Check if the distance from the center to this closest point is less than the radius
    return distSq(circle, closestPoint) <= circle.radius ** 2;
}


export function getRankSuffix(rank: number): string {
    if (rank % 100 >= 11 && rank % 100 <= 13) return 'th';
    switch (rank % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}