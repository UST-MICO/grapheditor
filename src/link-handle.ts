/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { RotationVector, normalizeVector } from './rotation-vector';
import { Point } from './edge';

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
export function calculateNormal(handle: LinkHandle) {
    const x = handle.normal != null ? handle.normal.dx : handle.x;
    const y = handle.normal != null ? handle.normal.dy : handle.y;

    handle.normal = normalizeVector({
        dx: x,
        dy: y,
    });
}

/**
 * Generate link handles list for a rectangle.
 *
 * @param x x coordinate of the upper left corner of the rectangle
 * @param y y coordinate of the upper left corner of the rectangle
 * @param width of the rectangle
 * @param heightof the rectangle
 * @param linkHandles one of ['all', 'edges', 'corners', 'minimal'] 'minimal' is an alias for 'edges'
 */
export function handlesForRectangle(x: number, y: number, width: number, height: number, linkHandles: string): LinkHandle[] {
    const handles: LinkHandle[] = [];
    if (linkHandles === 'all' || linkHandles === 'corners') {
        handles.push({id: 0, x: x, y: y});
    }
    if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
        handles.push({id: 0, x: x + (width / 2), y: y});
    }
    if (linkHandles === 'all' || linkHandles === 'corners') {
        handles.push({id: 0, x: x + width, y: y});
    }
    if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
        handles.push({id: 0, x: x + width, y: y + (height / 2)});
    }
    if (linkHandles === 'all' || linkHandles === 'corners') {
        handles.push({id: 0, x: x, y: y + height});
    }
    if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
        handles.push({id: 0, x: x + (width / 2), y: y + height});
    }
    if (linkHandles === 'all' || linkHandles === 'corners') {
        handles.push({id: 0, x: x + width, y: y + height});
    }
    if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
        handles.push({id: 0, x: x, y: y + (height / 2)});
    }
    handles.forEach((element, index) => {element.id = index; });
    handles.forEach(calculateNormal);
    return handles;
}

/**
 * Generate link handles list for circle.
 *
 * @param radius of the circle
 * @param linkHandles one of ['all', 'minimal']
 */
export function handlesForCircle(radius: number, linkHandles: string): LinkHandle[] {
    const handles: LinkHandle[] = [];
    handles.push({id: 0, x: 0, y: radius});
    if (linkHandles === 'all') {
        handles.push({
            id: 0,
            x: Math.sin((Math.PI / 2) + (Math.PI / 4)) * radius,
            y: Math.cos((Math.PI / 2) + (Math.PI / 4)) * radius,
        });
    }
    handles.push({id: 0, x: radius, y: 0});
    if (linkHandles === 'all') {
        handles.push({
            id: 0,
            x: Math.sin(Math.PI / 4) * radius,
            y: Math.cos(Math.PI / 4) * radius,
        });
    }
    handles.push({id: 0, x: 0, y: -radius});
    if (linkHandles === 'all') {
        handles.push({
            id: 0,
            x: Math.sin((3 * Math.PI / 2) + (Math.PI / 4)) * radius,
            y: Math.cos((3 * Math.PI / 2) + (Math.PI / 4)) * radius,
        });
    }
    handles.push({id: 0, x: -radius, y: 0});
    if (linkHandles === 'all') {
        handles.push({
            id: 0,
            x: Math.sin((2 * Math.PI / 2) + (Math.PI / 4)) * radius,
            y: Math.cos((2 * Math.PI / 2) + (Math.PI / 4)) * radius,
        });
    }
    handles.forEach((element, index) => {element.id = index; });
    handles.forEach(calculateNormal);
    return handles;
}

/**
 * Generate link handles list for a polygon.
 *
 * @param points
 * @param linkHandles one of ['all', 'minimal']
 */
export function handlesForPolygon(points: Point[], linkHandles: string): LinkHandle[] {
    const handles: LinkHandle[] = [];
    points.forEach((point, index) => {
        const pointAfter = points[(index + 1) % points.length];
        if (linkHandles === 'all' || linkHandles === 'corners') {
            handles.push({
                id: 0,
                x: point.x,
                y: point.y,
            });
        }
        if (linkHandles === 'all' || linkHandles === 'edges' || linkHandles === 'minimal') {
            handles.push({
                id: 0,
                x: (point.x + pointAfter.x) / 2,
                y: (point.y + pointAfter.y) / 2,
            });
        }
    });
    handles.forEach((element, index) => {element.id = index; });
    handles.forEach(calculateNormal);
    return handles;
}

/**
 * Generate link handles list for a path.
 *
 * @param path
 * @param linkHandles one of ['all', 'minimal']
 */
export function handlesForPath(path: SVGPathElement, linkHandles: string): LinkHandle[] {
    const handles: LinkHandle[] = [];
    const length = path.getTotalLength();
    let nrOfHandles = 1;
    if (linkHandles === 'all' || linkHandles === '') {
        nrOfHandles = 8;
    } else if (linkHandles === 'minimal') {
        nrOfHandles = 4;
    } else if (isNaN(parseInt(linkHandles, 10))) {
        nrOfHandles = parseInt(linkHandles, 10);
    }
    for (let i = 0; i < nrOfHandles; i++) {
        const point = path.getPointAtLength(length * (i / nrOfHandles));
        handles.push({
            id: 0,
            x: point.x,
            y: point.y,
        });
    }
    handles.forEach((element, index) => {element.id = index; });
    handles.forEach(calculateNormal);
    return handles;
}

