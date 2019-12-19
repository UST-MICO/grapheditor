export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function calculateBoundingRect(...rectangles: Rect[]): Rect {
    if (rectangles.length === 0) {
        return;
    }
    const rect = rectangles.pop();
    const result = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    };
    rectangles.forEach(r => {
        if (r.x < result.x) {
            const delta = result.x - r.x;
            result.x = r.x;
            result.width += delta;
        }
        if (r.y < result.y) {
            const delta = result.y - r.y;
            result.y = r.y;
            result.height += delta;
        }
        if (r.x + r.width > result.x + result.width) {
            result.width += (result.x + result.width) - (r.x + r.width);
        }
        if (r.y + r.height > result.y + result.height) {
            result.height += (result.y + result.height) - (r.y + r.height);
        }
    });
    return result;
}
