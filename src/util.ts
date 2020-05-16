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

/**
 * Interface compatible with DOMRect and SVGRect.
 */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
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
