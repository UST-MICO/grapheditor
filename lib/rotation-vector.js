"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Normalize an existing vector to length 1.
 *
 * @param vector vector to normalize
 */
function normalizeVector(vector) {
    const x = vector.dx;
    const y = vector.dy;
    const length = Math.sqrt(x * x + y * y);
    return {
        dx: x / length,
        dy: y / length,
    };
}
exports.normalizeVector = normalizeVector;
/**
 * Calculate the Angle of a rotation vector in degree.
 *
 * @param vector vector to normalize
 */
function calculateAngle(vector) {
    if (vector.dx === 0 && vector.dy === 0) {
        return 0;
    }
    vector = normalizeVector(vector);
    const angle = Math.atan2(vector.dy, vector.dx);
    return angle * 180 / Math.PI;
}
exports.calculateAngle = calculateAngle;
//# sourceMappingURL=rotation-vector.js.map