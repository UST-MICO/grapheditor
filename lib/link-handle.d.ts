import { RotationVector } from './rotation-vector';
/**
 * Start- or End-Point of edge.
 */
export interface LinkHandle {
    /** Normally the index of the LinkHandle. Unique for each template. */
    id: number;
    /** X coordinate relative to node center */
    x: number;
    /** Y coordinate relative to node center */
    y: number;
    /**
     * Direction vecter pointing in the direction an
     * edge should come in/out of the handle.
     * Usually away from the node center.
     */
    normal?: RotationVector;
}
/**
 * Calculate a vector of length 1 facing away from 0,0 towards handle.x,handle.y.
 *
 * @param handle link handle to calculate normal for
 */
export declare function calculateNormal(handle: LinkHandle): void;
/**
 * Generate link handles list for a rectangle.
 *
 * @param x x coordinate of the upper left corner of the rectangle
 * @param y y coordinate of the upper left corner of the rectangle
 * @param width of the rectangle
 * @param heightof the rectangle
 * @param linkHandles one of ['all', 'edges', 'corners', 'minimal'] 'minimal' is an alias for 'edges'
 */
export declare function handlesForRectangle(x: number, y: number, width: number, height: number, linkHandles: string): LinkHandle[];
/**
 * Generate link handles list for circle.
 *
 * @param radius of the circle
 * @param linkHandles one of ['all', 'minimal']
 */
export declare function handlesForCircle(radius: number, linkHandles: string): LinkHandle[];
