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

import { Rect } from './util';
import { Point } from './edge';


/**
 * Description of a NodeDropZone.
 */
export interface NodeDropZone {

    /** The id of thedrop zone. (unique for all zones of the same node) */
    id: string;

    /**
     * The bounding box of the drop zone.
     *
     * The coordinates of the bounding box are relative to the node the drop zone is in.
     */
    bbox: Rect;

    /**
     * The whitelist node-type filter of this dropzone.
     *
     * If the whitelist is not empty any node-type not in the whitelist will be rejected.
     */
    whitelist: Set<string>;

    /**
     * The blacklist node-type filter of this dropzone.
     *
     * Only active if the whitelist is empty.
     */
    blacklist: Set<string>;
}

/**
 * Generator returning all dropzones that are compatible with the given node type.
 *
 * See blacklist and whitelist of NodeDropZone for the filter criterium.
 *
 * @param zones all possible drop zones
 * @param nodeType the node type to check
 */
export function *filterDropzonesByType(zones: Map<string, NodeDropZone>, nodeType: string): Iterable<NodeDropZone> {
    nodeType = nodeType || 'default';
    for (const [key, dropZone] of zones) {
        if (!dropZone.whitelist.has(nodeType)) {
            // nodeType is not in whitelist
            if (dropZone.whitelist.size > 0) {
                continue; // whitelist is not empty
            }
            if (dropZone.blacklist.has(nodeType)) {
                continue; // nodeType is in blacklist
            }
        }
        yield dropZone;
    }
}

/**
 * Calculate the squared distance between the dropzone center and a node.
 *
 * The squared distance is enough to find the closest drop zone.
 *
 * @param dropZoneAnchor the anchor point of this dropzone (usually the node of the dropzone)
 * @param dropZone the drop zone
 * @param nodePosition the position of the node that may be dropped in this dropzone
 */
export function calculateSquaredDistanceFromNodeToDropZone(dropZoneAnchor: Point, dropZone: NodeDropZone, nodePosition: Point): number {
    const dropZonePos = {
        x: dropZoneAnchor.x + dropZone.bbox.x + dropZone.bbox.width / 2,
        y: dropZoneAnchor.y + dropZone.bbox.y + dropZone.bbox.height / 2,
    };
    const distance = ((nodePosition.x - dropZonePos.x) ** 2) + ((nodePosition.y - dropZonePos.y) ** 2);
    return distance;
}
