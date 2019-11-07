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
import { Edge, edgeId } from './edge';

export class GraphObjectCache {

    private nodes: Map<string, Node>;
    private nodeBBoxes: Map<string, DOMRect>;
    private edges: Map<string, Edge>;
    private edgesBySource: Map<string, Set<Edge>>;
    private edgesByTarget: Map<string, Set<Edge>>;

    constructor() {
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

}
