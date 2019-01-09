"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rotation_vector_1 = require("./rotation-vector");
/**
 * Calculate a vector of length 1 facing away from 0,0 towards handle.x,handle.y.
 *
 * @param handle link handle to calculate normal for
 */
function calculateNormal(handle) {
    const x = handle.normal != null ? handle.normal.dx : handle.x;
    const y = handle.normal != null ? handle.normal.dy : handle.y;
    handle.normal = rotation_vector_1.normalizeVector({
        dx: x,
        dy: y,
    });
}
exports.calculateNormal = calculateNormal;
/**
 * Generate link handles list for a rectangle.
 *
 * @param x x coordinate of the upper left corner of the rectangle
 * @param y y coordinate of the upper left corner of the rectangle
 * @param width of the rectangle
 * @param heightof the rectangle
 * @param linkHandles one of ['all', 'edges', 'corners', 'minimal'] 'minimal' is an alias for 'edges'
 */
function handlesForRectangle(x, y, width, height, linkHandles) {
    const handles = [];
    if (linkHandles === 'all' || linkHandles === 'corners') {
        handles.push({ id: 0, x: x, y: y });
    }
    if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
        handles.push({ id: 0, x: x + (width / 2), y: y });
    }
    if (linkHandles === 'all' || linkHandles === 'corners') {
        handles.push({ id: 0, x: x + width, y: y });
    }
    if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
        handles.push({ id: 0, x: x + width, y: y + (height / 2) });
    }
    if (linkHandles === 'all' || linkHandles === 'corners') {
        handles.push({ id: 0, x: x, y: y + height });
    }
    if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
        handles.push({ id: 0, x: x + (width / 2), y: y + height });
    }
    if (linkHandles === 'all' || linkHandles === 'corners') {
        handles.push({ id: 0, x: x + width, y: y + height });
    }
    if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
        handles.push({ id: 0, x: x, y: y + (height / 2) });
    }
    handles.forEach((element, index) => { element.id = index; });
    handles.forEach(calculateNormal);
    return handles;
}
exports.handlesForRectangle = handlesForRectangle;
/**
 * Generate link handles list for circle.
 *
 * @param radius of the circle
 * @param linkHandles one of ['all', 'minimal']
 */
function handlesForCircle(radius, linkHandles) {
    const handles = [];
    handles.push({ id: 0, x: 0, y: radius });
    if (linkHandles === 'all') {
        handles.push({
            id: 0,
            x: Math.sin((Math.PI / 2) + (Math.PI / 4)) * radius,
            y: Math.cos((Math.PI / 2) + (Math.PI / 4)) * radius,
        });
    }
    handles.push({ id: 0, x: radius, y: 0 });
    if (linkHandles === 'all') {
        handles.push({
            id: 0,
            x: Math.sin(Math.PI / 4) * radius,
            y: Math.cos(Math.PI / 4) * radius,
        });
    }
    handles.push({ id: 0, x: 0, y: -radius });
    if (linkHandles === 'all') {
        handles.push({
            id: 0,
            x: Math.sin((3 * Math.PI / 2) + (Math.PI / 4)) * radius,
            y: Math.cos((3 * Math.PI / 2) + (Math.PI / 4)) * radius,
        });
    }
    handles.push({ id: 0, x: -radius, y: 0 });
    if (linkHandles === 'all') {
        handles.push({
            id: 0,
            x: Math.sin((2 * Math.PI / 2) + (Math.PI / 4)) * radius,
            y: Math.cos((2 * Math.PI / 2) + (Math.PI / 4)) * radius,
        });
    }
    handles.forEach((element, index) => { element.id = index; });
    handles.forEach(calculateNormal);
    return handles;
}
exports.handlesForCircle = handlesForCircle;
//# sourceMappingURL=link-handle.js.map