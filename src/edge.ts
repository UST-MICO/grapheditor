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
import { Marker } from './marker';

/**
 * A single point.
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Interface for edges between nodes.
 */
export interface Edge {
    id?: number|string;
    /** The id of the source node of this edge. */
    source: number|string;
    /** The id of the target node of this edge. */
    target: number|string;
    sourceHandle?: LinkHandle;
    targetHandle?: LinkHandle;
    /** Edge type. Can be used for styling. */
    type?: any;
    /** List of markers to draw for this edge. */
    markers?: Marker[];
    [prop: string]: any;
}

/**
 * Extra attributes for edges dragged bay a user.
 */
export interface DraggedEdge extends Edge {
    id: string;
    /** If edge was created from an existing edge this is the id of the existing edge. */
    createdFrom?: number|string;
    /** A set of ids of nodes that are a valid target for this edge. */
    validTargets: Set<string>;
    /** The current target coordinates. */
    currentTarget: Point;
}

/**
 * Return edge id if set or calculate a new id from target and source.
 *
 * @param edge edge to get the id from
 */
export function edgeId(edge: Edge): string {
    if (edge.id != null) {
        return edge.id.toString();
    }
    return `s${edge.source},t${edge.target}`;
}
