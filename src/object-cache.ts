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

import { map, Map } from 'd3';
import { Node } from './node';
import { Edge, edgeId, DraggedEdge, Point } from './edge';
import { DEFAULT_NODE_TEMPLATE } from './templates';
import { LinkHandle, calculateNormal } from './link-handle';

export class GraphObjectCache {

    private nodeTemplates: Map<string>;
    private nodeTemplateLinkHandles: Map<LinkHandle[]>;
    private markerTemplates: Map<string>;
    private nodes: Map<Node>;
    private nodeBBoxes: Map<DOMRect>;
    private edges: Map<Edge>;
    private edgesBySource: Map<Set<Edge>>;
    private edgesByTarget: Map<Set<Edge>>;

    constructor() {
        this.nodeTemplates = map<string>();
        this.nodeTemplateLinkHandles = map<LinkHandle[]>();
        this.markerTemplates = map<string>();
        this.nodes = map<Node>();
        this.nodeBBoxes = map<DOMRect>();
        this.edges = map<Edge>();
        this.edgesBySource = map<Set<Edge>>();
        this.edgesByTarget = map<Set<Edge>>();
    }

    updateNodeTemplateCache(templates: {id: string, innerHTML: string, [prop: string]: any}[]) {
        const templateMap = map();
        templates.forEach((template) => templateMap.set(template.id, template.innerHTML));
        this.nodeTemplates = templateMap;
        this.nodeTemplateLinkHandles = map();
    }

    updateMarkerTemplateCache(templates: {id: string, innerHTML: string, [prop: string]: any}[]) {
        const templateMap = map();
        templates.forEach((template) => templateMap.set(template.id, template.innerHTML));
        this.markerTemplates = templateMap;
    }

    updateNodeCache(nodes: Node[]) {
        const nodeMap = map();
        nodes.forEach((node) => nodeMap.set(node.id.toString(), node));
        this.nodes = nodeMap;
        this.nodeBBoxes = map<DOMRect>();
    }

    updateEdgeCache(edges: Edge[]) {
        const edgeMap = map();
        const bySourceMap = map();
        const byTargetMap = map();
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
            bySource.add(edge);
        });
        this.edges = edgeMap;
        this.edgesBySource = bySourceMap;
        this.edgesByTarget = byTargetMap;
    }

    getMarkerTemplate(markerType: string) {
        if (markerType == null) {
            console.log('Marker type was null!');
            return;
        }
        return this.markerTemplates.get(markerType);
    }

    getNodeTemplateId(nodeType: string) {
        if (nodeType == null || !this.nodeTemplates.has(nodeType)) {
            return 'default';
        } else {
            return nodeType;
        }
    }

    getNodeTemplate(nodeType: string) {
        if (nodeType == null) {
            nodeType = 'default';
        }
        let template = this.nodeTemplates.get(nodeType);
        if (template == null) {
            template = this.nodeTemplates.get('default');
        }
        if (template == null) {
            template = DEFAULT_NODE_TEMPLATE;
        }
        return template;
    }

    setNodeTemplateLinkHandles(nodeType: string, linkHandles: LinkHandle[]) {
        nodeType = this.getNodeTemplateId(nodeType);
        this.nodeTemplateLinkHandles.set(nodeType, linkHandles);
    }

    getNodeTemplateLinkHandles(nodeType: string): LinkHandle[] {
        nodeType = this.getNodeTemplateId(nodeType);
        return this.nodeTemplateLinkHandles.get(nodeType);
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
            sourceHandles = this.getNodeTemplateLinkHandles(source.type);
        } else {
            console.warn('Attempting to render Edge without valid source.', edge);
            source = {id: 'UNDEFINED', x: 0, y: 0};
        }
        let target = edge.target != null ? this.getNode(edge.target) : null;
        let targetHandles = edge.targetHandle != null ? [edge.targetHandle] : [{id: 0, x: 0, y: 0, normal: {dx: 0, dy: 0}}];
        if (target != null) {
            targetHandles = this.getNodeTemplateLinkHandles(target.type);
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
