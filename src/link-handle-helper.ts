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

import { LinkHandle } from './link-handle';
import { Edge, DraggedEdge, Point, edgeId } from './edge';
import { Node } from './node';
import { Selection } from 'd3';
import { StaticTemplateRegistry, DynymicTemplateRegistry } from './templating';
import { DynamicNodeTemplate } from './dynamic-templates/dynamic-template';
import GraphEditor from './grapheditor';

/**
 * Get the link handles of a node.
 *
 * @param nodeSelection the selection of the node to get the link handles for
 * @param templateCache the template cache
 * @param dynamicTemplateRegistry the dynamic template registry
 * @param graphEditor the graph editor instance holding the node
 */
export function getNodeLinkHandles(
    nodeSelection: Selection<SVGGElement, Node, any, unknown>,
    templateCache: StaticTemplateRegistry,
    dynamicTemplateRegistry: DynymicTemplateRegistry,
    graphEditor: GraphEditor
): LinkHandle[] {
    if (nodeSelection == null || nodeSelection.empty()) {
        return [];
    }
    const node = nodeSelection.datum();
    if (node.dynamicTemplate != null && node.dynamicTemplate !== '') {
        const template = dynamicTemplateRegistry.getDynamicTemplate<DynamicNodeTemplate>(node.dynamicTemplate);
        if (template != null) {
            return template.getLinkHandles(nodeSelection, graphEditor);
        }
        // TODO proper logging
        return [];
    }
    return templateCache.getNodeTemplateLinkHandles(node.type);
}

/**
 * Apply the user provided callback for link handle calculation and return a sanitized list of source and target handles.
 *
 * @param edge the edge
 * @param sourceHandles the source handle list
 * @param source the source node
 * @param targetHandles the target handle list
 * @param target the target node (or position for dragged edges)
 * @param callback the user provided callback (can be null)
 */
export function applyUserLinkHandleCalculationCallback(
    edge: Edge,
    sourceHandles: LinkHandle[],
    source: Node,
    targetHandles: LinkHandle[],
    target: Node | Point,
    // eslint-disable-next-line max-len
    callback?: (edge: Edge | DraggedEdge, sourceHandles: LinkHandle[], source: Node, targetHandles: LinkHandle[], target: Node | Point) => { sourceHandles: LinkHandle[]; targetHandles: LinkHandle[] }
): { sourceHandles: LinkHandle[]; targetHandles: LinkHandle[] } {
    const initialSourceHandles = sanitizeHandleList(sourceHandles);
    const initialTargetHandles = sanitizeHandleList(targetHandles);
    let newSourceHandles = initialSourceHandles;
    let newTargetHandles = initialTargetHandles;
    try {
        if (callback != null) {
            const newHandles = callback(edge, initialSourceHandles, source, initialTargetHandles, target);
            if (newHandles != null) {
                if (newHandles.sourceHandles != null && newHandles.sourceHandles.length > 0) {
                    newSourceHandles = newHandles.sourceHandles;
                }
                if (newHandles.targetHandles != null && newHandles.targetHandles.length > 0) {
                    newTargetHandles = newHandles.targetHandles;
                }
            }
        }
    } catch (error) {
        console.error(`An error occured while calculating the link handles for the edge ${edgeId(edge)} with the user supplied callback!`, error);
    }
    return {
        sourceHandles: newSourceHandles,
        targetHandles: newTargetHandles,
    };
}

/**
 * Sanitizes a link handle list.
 *
 * The returned list is never null and contains at least one link handle.
 *
 * @param handles the handle list to sanitize
 */
export function sanitizeHandleList(handles: LinkHandle[]): LinkHandle[] {
    if (handles == null || handles.length <= 0) {
        return [{ id: 0, x: 0, y: 0 }];
    }
    return handles;
}

/**
 * Calculate the pair of link handles that is closest to each other.
 *
 * @param sourceHandles list of link handles for the source node (must contain at least one handle!)
 * @param sourceCoords the source node position (default: `{x: 0, y: 0}`)
 * @param targetHandles list of link handles for the target node (must contain at least one handle!)
 * @param targetCoords the target node position(default: `{x: 1, y: 1}`)
 */
export function calculateNearestHandles(
    sourceHandles: LinkHandle[], sourceCoords: Point,
    targetHandles: LinkHandle[], targetCoords: Point
) {
    if (sourceCoords == null) {
        sourceCoords = {x: 0, y: 0};
    }
    if (targetCoords == null) {
        targetCoords = {x: 1, y: 1};
    }

    let nearestSourceHandle = sourceHandles[0];
    let nearestTargetHandle = targetHandles[0];
    let currentDist = distanceSquared(sourceCoords, nearestSourceHandle, targetCoords, nearestTargetHandle);

    targetHandles.forEach(targetHandle => {
        sourceHandles.forEach(sourceHandle => {
            const dist = distanceSquared(sourceCoords, sourceHandle, targetCoords, targetHandle);
            if (dist <= currentDist) {
                nearestSourceHandle = sourceHandle;
                nearestTargetHandle = targetHandle;
                currentDist = dist;
            }
        });
    });
    return {
        sourceHandle: nearestSourceHandle,
        targetHandle: nearestTargetHandle,
    };
}

/**
 * Calculate the squared distance between two link handles.
 *
 * @param sourceCoordinates Source coordinates
 * @param sourceLinkHandle offset from source coordinates
 * @param targetCoordinates target voordinates
 * @param targetLinkHandle offset from target coordinates
 */
function distanceSquared(sourceCoordinates: Point, sourceLinkHandle: LinkHandle, targetCoordinates: Point, targetLinkHandle: LinkHandle) {
    const sourceX = sourceCoordinates.x + sourceLinkHandle.x;
    const sourceY = sourceCoordinates.y + sourceLinkHandle.y;
    const targetX = targetCoordinates.x + targetLinkHandle.x;
    const targetY = targetCoordinates.y + targetLinkHandle.y;
    return Math.pow(sourceX - targetX, 2) + Math.pow(sourceY - targetY, 2);
}
