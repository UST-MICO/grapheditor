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

import { RotationVector, angleToVector, calculateAngle, calculateLength } from './rotation-vector';

interface RotationData {
    /** Absolute rotation via direction vector. */
    normal?: RotationVector;
    /** Relative angle in degree. */
    relativeAngle: number;
}

export interface Marker {
    /** the marker template id to use for this marker. */
    template: string;
    /** True iff the link handle uses a dynamic template. */
    isDynamicTemplate?: boolean;
    /** The relative position of the marker on the edge (between 0 and 1, defaults to 1). */
    positionOnLine?: number|string;
    /** @deprecated The length used for end/start markers to offset the line position. */
    lineOffset?: number;
    /** A factor to scale the marker. */
    scale?: number;
    /** If true the marker and lineOffset is scaled relative to the stroke width. */
    scaleRelative?: boolean;
    /** Rotation information for the marker. */
    rotate?: RotationData;
    /** A key used in a click event when the marker was clicked. */
    clickEventKey?: string;
}

export class LineAttachementInfo {

    private isDirectional: boolean;
    private lineAttachementAngle: number;
    private attachementOffset: number;

    constructor(lineAttachementPoint: string|number) {
        if (lineAttachementPoint == null) {
            lineAttachementPoint = 0;
        }
        if (typeof lineAttachementPoint === 'number') {
            this.attachementOffset = lineAttachementPoint;
            this.lineAttachementAngle = 0;
            this.isDirectional = false;
        }
        const coords = lineAttachementPoint.toString().split(' ');
        if (coords.length === 1) {
            this.attachementOffset = parseFloat(coords[0]);
            this.lineAttachementAngle = 0;
            this.isDirectional = false;
        } else if (coords.length === 2) {
            const normal = {dx: parseFloat(coords[0]), dy: parseFloat(coords[1])};
            this.attachementOffset = calculateLength(normal);
            this.lineAttachementAngle = calculateAngle(normal);
            this.isDirectional = true;
        } else {
            console.warn('lineAttachementPoint must be one or two numbers seperated by a space!');
        }
        if (this.attachementOffset == null || isNaN(this.attachementOffset)) {
            console.warn('Could not parse attachement offset! Using 0 instead.');
            this.attachementOffset = 0;
        }
        if (this.lineAttachementAngle == null || isNaN(this.lineAttachementAngle)) {
            console.warn('Could not parse attachement angle! Using 0 instead.');
            this.lineAttachementAngle = 0;
            this.isDirectional = false;
        }
    }

    getRotationVector(angle: number, scale?: number) {
        let attachementAngle;
        if (this.isDirectional) {
            attachementAngle = angle + this.lineAttachementAngle;
        } else {
            // rotate attachement angle
            attachementAngle = angle + 180;
        }
        let offset = this.attachementOffset;
        if (scale != null || scale === 0) {
            offset = this.attachementOffset * scale;
        }
        return angleToVector(attachementAngle, offset);
    }
}
