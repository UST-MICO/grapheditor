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

import { Selection } from 'd3-selection';
import { Point } from '.';

/**
 * Interface compatible with DOMRect and SVGRect.
 */
export interface Rect {
    x: number;
    y: number;
    /** The width of the rectangle. Must be `> 0`! */
    width: number;
    /** The height of the rectangle. Must be `> 0`! */
    height: number;
}

/**
 * Calculate the **squared** euklidean distance between two points.
 *
 * Use `Math.sqrt` to calculate the normal euklidean distance bewteen two points.
 *
 * @param pointA the first point
 * @param pointB the second point
 * @returns the **squared** euklidean distance between the points
 */
export function squaredPointDistance(pointA: Point, pointB: Point): number {
    return Math.pow(pointA.x - pointB.x, 2) + Math.pow(pointA.y - pointB.y, 2);
}

/**
 * Calculate the bounding rectangle of a set of rectangles.
 *
 * @param rectangles the rectangles to calculate the bounding rectangle for
 */
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
            result.width += (r.x + r.width) - (result.x + result.width);
        }
        if (r.y + r.height > result.y + result.height) {
            result.height += (r.y + r.height) - (result.y + result.height);
        }
    });
    return result;
}

/**
 * Remove all child nodes from a single node.
 *
 * @param nodeSelection a d3 selection of a single node that should be emptied
 */
export function removeAllChildNodes(nodeSelection: Selection<SVGElement, any, any, any>): void {
    if (nodeSelection.empty() || nodeSelection.size() > 1) {
        console.error('Node selection may only consist of exactly one node!');
        return;
    }
    const range = document?.createRange();
    if (range == null) {
        // fallback when document api is not available
        const node = nodeSelection.node();
        while (node.lastChild) {
            node.lastChild.remove();
        }
    }
    range.selectNodeContents(nodeSelection.node());
    range.deleteContents();
}

/**
 * Copy the child nodes of a template into the node selected in nodeSelection.
 *
 * @param nodeSelection a d3 selection of a single empty svg element
 * @param templateSelection a d3 selection of a single svg element whose content is to be copied into node
 */
export function copyTemplateSelectionIntoNode(nodeSelection: Selection<SVGElement, any, any, any>, templateSelection: Selection<SVGElement, any, any, any>): void {
    if (nodeSelection.empty() || nodeSelection.size() > 1) {
        console.error('Node selection may only consist of exactly one node!');
        return;
    }
    if (templateSelection.empty() || templateSelection.size() > 1) {
        console.error('Template selection may only consist of exactly one node!');
        return;
    }
    const range = document?.createRange();
    if (range == null) {
        // fallback when document api is not available
        const node = nodeSelection.node();
        templateSelection.node().childNodes.forEach((templateChildNode) => {
            node.appendChild(templateChildNode.cloneNode(true));
        });
    }
    range.selectNodeContents(templateSelection.node());
    nodeSelection.node().appendChild(range.cloneContents());
}



/**
 * Recursively retrieve an attribute.
 *
 * The attribute path is a string split at the '.' character.
 * The attribute path is processed recursively by applying `obj = obj[attr[0]]`.
 * If a path segment is '()' then `obj = obj()` is applied instead.
 *
 * @param obj the object to get the attribute from
 * @param attr the attribute or attribute path to get
 */
export function recursiveAttributeGet(obj: unknown, attr: string): unknown {
    let result = null;
    try {
        if (attr != null) {
            if (attr.includes('.')) {
                // recursive decend along path
                const path = attr.split('.');
                let temp = obj;
                path.forEach(segment => {
                    if (segment === '()') {
                        temp = (temp as () => unknown)();
                    } else if (temp?.hasOwnProperty(segment)) {
                        temp = temp[segment];
                    } else {
                        temp = null;
                    }
                });
                result = temp;
            } else {
                result = obj[attr];
            }
        }
    } catch (error) { // TODO add debug output
        return null;
    }
    return result;
}

/**
 * Calculate the safe absolutePositionOnLine value for the given path length.
 *
 * If absolutePositidragHandlesonOnLine is negative it is counted from the end of the path.
 * If absolutePositidragHandlesonOnLine exceeds the path length positionOnLine will be used as fallback.
 *
 * @param pathLength the length of the path
 * @param positionOnLine the relative position on the line (between 0 and 1)
 * @param absolutePositidragHandlesonOnLine the absolute position on line (between 0 and length)
 * @returns the positive absolute positionOnLine to be used with `path.getPointAtLength(absolutePositionOnLine)`.
 */
export function calculateAbsolutePositionOnLine(pathLength: number, positionOnLine: number, absolutePositionOnLine?: number): number {
    let result = null;
    if (absolutePositionOnLine != null) {
        if (absolutePositionOnLine < 0) {
            // actually a substraction...
            result = pathLength + absolutePositionOnLine;
        } else {
            result = absolutePositionOnLine;
        }
    }

    // else case & sanity checks for if case
    if (result == null || result < 0 || result > pathLength) {
        // always fall back to relative position
        result = pathLength * positionOnLine;
    }
    return result;
}
