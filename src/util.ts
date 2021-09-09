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
    /** The width of the rectangle. Must be `> 0`! */
    width: number;
    /** The height of the rectangle. Must be `> 0`! */
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
    const result={left:null, right:null, up:null,down:null}
    rectangles.forEach(box => {
        if(result.left == null || box.x - box.width/2 < result.left) {
            result.left = box.x - box.width/2;
        }
        if(result.right == null || box.x + box.width/2 > result.right) {
            result.right = box.x + box.width/2;
        }
        if(result.up == null || box.y - box.height/2 < result.up) {
            result.up = box.y - box.height/2;
        }
        if(result.down == null || box.y + box.height/2 > result.down) {
            result.down = box.y + box.height/2;
        }
    });

    return {x: result.left+(result.right-result.left)/2, y: result.up+(result.down-result.up)/2,width: result.right-result.left, height: result.down-result.up};
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
