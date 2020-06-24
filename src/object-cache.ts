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
import { NodeDropZone } from './drop-zone';
import { Rect } from './util';

/**
 * A cache for fast access of graph objects.
 */
export class GraphObjectCache {

    private nodes: Map<string, Node>;
    private nodeBBoxes: Map<string, Rect>;
    private nodeDropZones: Map<string, Map<string, NodeDropZone>>;
    private edges: Map<string, Edge>;
    private edgesBySource: Map<string, Set<Edge>>;
    private edgesByTarget: Map<string, Set<Edge>>;

    constructor() {
        this.nodes = new Map<string, Node>();
        this.nodeBBoxes = new Map<string, Rect>();
        this.nodeDropZones = new Map<string, Map<string, NodeDropZone>>();
        this.edges = new Map<string, Edge>();
        this.edgesBySource = new Map<string, Set<Edge>>();
        this.edgesByTarget = new Map<string, Set<Edge>>();
    }

    /**
     * Invalidate the node cache.
     *
     * @param nodes the new node list
     */
    updateNodeCache(nodes: Node[]): void {
        const nodeMap = new Map();
        nodes.forEach((node) => nodeMap.set(node.id.toString(), node));
        this.nodes = nodeMap;
        this.nodeBBoxes = new Map<string, Rect>();
        this.nodeDropZones = new Map<string, Map<string, NodeDropZone>>();
    }

    /**
     * Add a node to the cache without invalidating the complete cache.
     *
     * @param node the new node to add to the cache
     */
    addNodeToCache(node: Node): void {
        this.nodes.set(node.id.toString(), node);
    }

    /**
     * Remove a node from the cache without invalidating the complete cache.
     *
     * @param nodeId the id of the old node to remove from the cache
     */
    removeNodeFromCache(nodeId: string): void {
        this.nodes.delete(nodeId.toString());
        this.nodeBBoxes.delete(nodeId.toString());
        this.nodeDropZones.delete(nodeId.toString());
    }

    /**
     * Invalidate all edge related caches.
     *
     * @param edges the new edge list
     */
    updateEdgeCache(edges: Edge[]): void {
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

    /**
     * Add a new edge to the object cache without invalidating the whole cache.
     *
     * @param edge the new edge to add to the object cache
     */
    addEdgeToCache(edge: Edge): void {
        this.edges.set(edgeId(edge), edge);
        let bySource: Set<Edge> = this.edgesBySource.get(edge.source.toString());
        if (bySource == null) {
            bySource = new Set();
            this.edgesBySource.set(edge.source.toString(), bySource);
        }
        bySource.add(edge);
        let byTarget: Set<Edge> = this.edgesByTarget.get(edge.target.toString());
        if (byTarget == null) {
            byTarget = new Set();
            this.edgesByTarget.set(edge.target.toString(), byTarget);
        }
        byTarget.add(edge);
    }

    /**
     * Remove an edge from the cache without invalidating the whole cache.
     *
     * @param edge the edge to remove from the object cache
     */
    removeEdgeFromCache(edge: Edge): void {
        const eId = edgeId(edge);
        const cachedEdge = this.edges.get(eId) ?? edge;
        this.edges.delete(eId);
        this.edgesBySource.get(edge.source.toString())?.delete(cachedEdge);
        this.edgesByTarget.get(edge.target.toString())?.delete(cachedEdge);
    }

    /**
     * Get the cached node.
     *
     * @param id the node id
     */
    getNode(id: number|string): Node {
        return this.nodes.get(id.toString());
    }

    /**
     * Store a bbox for a node in the cache.
     *
     * @param id the node id to store the bbox for
     * @param bbox the bbox of the node
     */
    setNodeBBox(id: number|string, bbox: DOMRect): void {
        this.nodeBBoxes.set(id.toString(), bbox);
    }

    /**
     * Get a node bbox from the cache.
     *
     * @param id the node id
     */
    getNodeBBox(id: number|string): Rect {
        return this.nodeBBoxes.get(id.toString());
    }

    /**
     * Set new dropzone onformation for a node.
     *
     * @param id the id of the node to update the dropzones for
     * @param dropZones the new dropzones
     */
    setNodeDropZones(id: number|string, dropZones: Map<string, NodeDropZone>): void {
        this.nodeDropZones.set(id.toString(), dropZones);
    }

    /**
     * Get all dropzones of a node.
     *
     * @param id the id of the node to get the dropzones for
     */
    getAllDropZones(id: number|string): Map<string, NodeDropZone> {
        return this.nodeDropZones.get(id.toString());
    }

    /**
     * Get a specific dropzone of a node.
     *
     * @param id the id of the node to get the dropzone for
     * @param dropZoneId the id of the dropzones
     */
    getDropZone(id: number|string, dropZoneId: string): NodeDropZone {
        return this.nodeDropZones.get(id.toString())?.get(dropZoneId);
    }

    /**
     * Get an edge by its id.
     *
     * @param id the edge id
     */
    getEdge(id: number|string): Edge {
        return this.edges.get(id?.toString());
    }

    /**
     * Get all edges with the same target.
     *
     * @param targetId id of the target node
     * @returns the set of edges with the same target
     */
    getEdgesByTarget(targetId: number|string): Set<Edge> {
        const edges = this.edgesByTarget.get(targetId.toString());
        if (edges == null) {
            return new Set();
        }
        return edges;
    }

    /**
     * Get all edges with the same source.
     *
     * @param sourceId id of the source node
     * @returns the set of edges with the same source
     */
    getEdgesBySource(sourceId: number|string): Set<Edge> {
        const edges = this.edgesBySource.get(sourceId.toString());
        if (edges == null) {
            return new Set();
        }
        return edges;
    }

}
