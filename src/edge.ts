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
import { RotationData } from './rotation-vector';

/**
 * A single point.
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Interface describing the position of a marker, text component or link handle placed along an edge path.
 */
export interface PathPositionRotationAndScale extends RotationData {
    /** The relative position of the path element on the edge (between 0 and 1). (Default `0` == 'start') */
    positionOnLine?: number|'start'|'end';
    /**
     * The absolute position of the path element on the edge.
     *
     * A positive value is counted from the start of the path.
     * A negative value is counted from the end of the path.
     * If the absolute value is longer than the path length the relative
     * positionOnLine will be used as fallback value.
     */
    absolutePositionOnLine?: number;
    /** A factor to scale the path element. */
    scale?: number;
    /** If true the scaling factor is applied relative to the stroke width. */
    scaleRelative?: boolean;
    /** If true the relative rotation is applied as if the path always goes from left to right. */
    ignorePathDirectionForRotation?: boolean;
}

/**
 * Normalize the positionOnLine argument to a number. (Default: `0`)
 * @param positionOnLine
 */
export function normalizePositionOnLine(positionOnLine: number|'start'|'end') {
    if (positionOnLine == null || positionOnLine === 'start') {
        return 0;
    }
    if (positionOnLine === 'end') {
        return 1;
    }
    if (isNaN(positionOnLine)) {
        return 0;
    }
    if (positionOnLine < 0) {
        return 0;
    }
    if (positionOnLine > 1) {
        return 1;
    }
    return positionOnLine;
}

/**
 * Interface for text components that are part of an edge.
 */
export interface TextComponent extends PathPositionRotationAndScale {
    /** The actual text content. */
    value?: string;
    /** The path to the attribute containing the text. */
    attributePath?: string;
    /** The key used if the user clicked on the text. */
    clickEventKey?: string;
    /** Wether the text component can be dragged by the user (defaults to true). */
    draggable?: boolean;
    /** The width used for wrapping the text. */
    width: number;
    /** The height used for wrapping multiline text. */
    height?: number;
    /** The padding is used to avoid collisions. */
    padding?: number;
    /** Offset from the reference point in x direction. */
    offsetX?: number;
    /** Offset from the reference point in y direction. */
    offsetY?: number;
    /** The template to use for this text component. (Default: `'default-textcomponent'`) */
    template?: string;
}

/**
 * Special marker used as a drag handle for dragging an edge.
 */
export interface EdgeDragHandle extends Marker {
    /**
     * If true dragging this drag handle will result in a flipped edge beeing dragged.
     *
     * The flipped edge looks the same as the original edge but has source and target switched.
     * All component positions and relative rotations are updated accordingly.
     * This can be used to implement bidirectional or non-directional behaviour for edges.
     */
    isReverseHandle?: boolean;
}

/**
 * Set the `dragHandles` attribute of an edge to the default values.
 *
 * See `Edge.dragHandles`.
 *
 * @param edge the edge to set the default drag handles for
 */
export function setDefaultEdgeDragHandles(edge: Edge) {
    if (edge.dragHandles == null) {
        edge.dragHandles = [
            {
                template: 'default-marker',
                positionOnLine: 0.95,
                absolutePositionOnLine: -10,
            },
        ];
        if (edge.isBidirectional) {
            edge.dragHandles.push({
                template: 'default-marker',
                positionOnLine: 0.05,
                absolutePositionOnLine: 10,
                isReverseHandle: true,
            });
        }
    }
}

/**
 * Interface for edges between nodes.
 */
export interface Edge {
    /**
     * An optional explicit edge id.
     *
     * The edge id is normally computed by the `edgeId` function.
     * If this attribute is set it gets returned by `edgeId` instead of the computed id.
     */
    id?: number|string;
    /** The id of the source node of this edge. */
    source: number|string;
    /** The id of the target node of this edge. */
    target: number|string;
    /**
     * The link handle of the source node the edge is attached to.
     *
     * This attribute is set automatically by the grapheditor.
     */
    sourceHandle?: LinkHandle;
    /**
     * The link handle of the target node the edge is attached to.
     *
     * This attribute is set automatically by the grapheditor.
     */
    targetHandle?: LinkHandle;
    /** Edge type. Can be used for styling. */
    type?: any;
    /** The id of the path generator used for this edge. */
    pathType?: string;
    /** List of markers to draw for this edge. */
    markers?: Marker[];
    /** Markers to draw at the start of this edge. */
    markerStart?: Marker;
    /** Markers to draw at the end of this edge. */
    markerEnd?: Marker;
    /** List of text components of this edge. */
    texts?: TextComponent[];
    /**
     * List of EdgeDragHandle that can be used to drag the edge with.
     *
     * If the list is `null` a list containing default drag handle will be created.
     * If the list is an empty list `[]` no default drag handle will be created.
     * If `isBidirectional` is `true` and the list is `null` a list containing two
     * default drag handles (one for each end) will be created.
     */
    dragHandles?: EdgeDragHandle[];
    /** Set this to `true` if the edge should be treated as bidirectional (see `dragHandles`). */
    isBidirectional?: boolean;
    [prop: string]: any;
}

/**
 * Extra attributes for edges dragged bay a user.
 */
export interface DraggedEdge extends Edge {
    /**
     * Explicit id of the dragged edge.
     *
     * A dragged edge may have no current target and must to specify an explicit id!
     */
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
