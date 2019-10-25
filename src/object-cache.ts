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

import { Node } from './node';
import { Edge, edgeId, DraggedEdge, Point } from './edge';
import { LinkHandle, calculateNormal } from './link-handle';
import { TemplateCache } from './templating';

export class GraphObjectCache {

    private templateCache: TemplateCache;

    private nodes: Map<string, Node>;
    private nodeBBoxes: Map<string, DOMRect>;
    private edges: Map<string, Edge>;
    private edgesBySource: Map<string, Set<Edge>>;
    private edgesByTarget: Map<string, Set<Edge>>;

    constructor(templateCache: TemplateCache) {
        this.templateCache = templateCache;
        this.nodes = new Map<string, Node>();
        this.nodeBBoxes = new Map<string, DOMRect>();
        this.edges = new Map<string, Edge>();
        this.edgesBySource = new Map<string, Set<Edge>>();
        this.edgesByTarget = new Map<string, Set<Edge>>();
    }

    updateNodeCache(nodes: Node[]) {
        const nodeMap = new Map();
        nodes.forEach((node) => nodeMap.set(node.id.toString(), node));
        this.nodes = nodeMap;
        this.nodeBBoxes = new Map<string, DOMRect>();
    }

    updateEdgeCache(edges: Edge[]) {
        const edgeMap = new Map();
        const bySourceMap = new Map();
        const byTargetMap = new Map();
        edges.forEach((edge) => {
            edgeMap.set(edgeId(edge), edge);
            let bySource: Set<Edge> = bySourceMap.get(edge.source.toString());
            if (bySource == null) {
                bySource = new Set();
                bySourceMap.set(edge.source.toString(), bySource);
            }
            bySource.add(edge);
            let byTarget: Set<Edge> = byTargetMap.get(edge.target.toString());
            if (byTarget == null) {
                byTarget = new Set();
                byTargetMap.set(edge.target.toString(), byTarget);
            }
            byTarget.add(edge);
        });
        this.edges = edgeMap;
        this.edgesBySource = bySourceMap;
        this.edgesByTarget = byTargetMap;
    }

    getNode(id: number|string) {
        return this.nodes.get(id.toString());
    }

    setNodeBBox(id: number|string, bbox: DOMRect) {
        return this.nodeBBoxes.set(id.toString(), bbox);
    }

    getNodeBBox(id: number|string) {
        return this.nodeBBoxes.get(id.toString());
    }

    getEdge(id: number|string) {
        return this.edges.get(id.toString());
    }

    getEdgesByTarget(targetId: number|string): Set<Edge> {
        const edges = this.edgesByTarget.get(targetId.toString());
        if (edges == null) {
            return new Set();
        }
        return edges;
    }

    getEdgesBySource(sourceId: number|string): Set<Edge> {
        const edges = this.edgesBySource.get(sourceId.toString());
        if (edges == null) {
            return new Set();
        }
        return edges;
    }

    // tslint:disable-next-line:max-line-length
    getEdgeLinkHandles(edge: Edge|DraggedEdge, _calculateHandlesToUse?: (edge: Edge|DraggedEdge, sourceHandles: LinkHandle[], source: Node, targetHandles: LinkHandle[], target: Node|Point) => {sourceHandles: LinkHandle[], targetHandles: LinkHandle[]}) {
        let source = this.getNode(edge.source);
        let sourceHandles = edge.sourceHandle != null ? [edge.sourceHandle] : [{id: 0, x: 0, y: 0, normal: {dx: 0, dy: 0}}];
        if (source != null) {
            sourceHandles = this.templateCache.getNodeTemplateLinkHandles(source.type);
        } else {
            console.warn('Attempting to render Edge without valid source.', edge);
            source = {id: 'UNDEFINED', x: 0, y: 0};
        }
        let target = edge.target != null ? this.getNode(edge.target) : null;
        let targetHandles = edge.targetHandle != null ? [edge.targetHandle] : [{id: 0, x: 0, y: 0, normal: {dx: 0, dy: 0}}];
        if (target != null) {
            targetHandles = this.templateCache.getNodeTemplateLinkHandles(target.type);
        } else {
            if (edge.currentTarget != null) {
                target = edge.currentTarget;
            } else {
                console.warn('Attempting to render Edge without valid target.', edge);
                target = {id: 'UNDEFINED', x: 1, y: 1};
            }
        }
        if (_calculateHandlesToUse != null) {
            // replace template link handle lists with user calculated lists
            const calculatedHandles = _calculateHandlesToUse(edge, sourceHandles, source, targetHandles, target);
            if (calculatedHandles != null && calculatedHandles.sourceHandles != null && calculatedHandles.sourceHandles.length > 0) {
                sourceHandles = calculatedHandles.sourceHandles;
            }
            if (calculatedHandles != null && calculatedHandles.targetHandles != null && calculatedHandles.targetHandles.length > 0) {
                targetHandles = calculatedHandles.targetHandles;
            }
        }
        const result = this.calculateNearestHandles(sourceHandles, source, targetHandles, target);
        return {
            sourceHandle: result.sourceHandle,
            sourceCoordinates: {x: (source.x + result.sourceHandle.x), y: (source.y + result.sourceHandle.y)},
            targetHandle: result.targetHandle,
            targetCoordinates: {x: (target.x + result.targetHandle.x), y: (target.y + result.targetHandle.y)},
        };
    }

    private calculateNearestHandles(sourceHandles: LinkHandle[], source: Node, targetHandles: LinkHandle[],
                                    target: {x: number, y: number}) {
        let currentSourceHandle: LinkHandle = {id: 0, x: 0, y: 0, normal: {dx: 1, dy: 1}};
        if (sourceHandles != null && sourceHandles.length > 0) {
            currentSourceHandle = sourceHandles[0];
        } else {
            calculateNormal(currentSourceHandle);
        }
        let currentTargetHandle: LinkHandle = {id: 0, x: 0, y: 0, normal: {dx: 1, dy: 1}};
        if (targetHandles != null && targetHandles.length > 0) {
            currentTargetHandle = targetHandles[0];
        } else {
            calculateNormal(currentTargetHandle);
        }
        let currentDist = Math.pow((source.x + currentSourceHandle.x) - target.x, 2) +
                          Math.pow((source.y + currentSourceHandle.y) - target.y, 2);
        targetHandles.forEach((targetHandle) => {
            for (let i = 0; i < sourceHandles.length; i++) {
                const handle = sourceHandles[i];
                const dist = Math.pow((source.x + handle.x) - (target.x + targetHandle.x), 2) +
                             Math.pow((source.y + handle.y) - (target.y + targetHandle.y), 2);
                if (dist <= currentDist) {
                    currentSourceHandle = handle;
                    currentTargetHandle = targetHandle;
                    currentDist = dist;
                }
            }
        });
        return {
            sourceHandle: currentSourceHandle,
            targetHandle: currentTargetHandle,
        };
    }
}
