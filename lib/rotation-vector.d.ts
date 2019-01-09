export interface RotationVector {
    dx: number;
    dy: number;
}
/**
 * Normalize an existing vector to length 1.
 *
 * @param vector vector to normalize
 */
export declare function normalizeVector(vector: RotationVector): RotationVector;
/**
 * Calculate the Angle of a rotation vector in degree.
 *
 * @param vector vector to normalize
 */
export declare function calculateAngle(vector: RotationVector): number;
