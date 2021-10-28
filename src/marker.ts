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

import { angleToVector, calculateAngle, calculateLength, RotationVector } from './rotation-vector';
import { PathPositionRotationAndScale, Point } from './edge';

/**
 * Interface describing an edge marker.
 */
export interface Marker extends PathPositionRotationAndScale {
    /** the marker template id to use for this marker. */
    template: string;
    /** True iff the link handle uses a dynamic template. */
    isDynamicTemplate?: boolean;
    /** A factor to scale the marker. */
    scale?: number;
    /** If true the marker and lineOffset is scaled relative to the stroke width. */
    scaleRelative?: boolean;
    /** A key used in a click event when the marker was clicked. */
    clickEventKey?: string;
}

/**
 * Helper class to calculate where the edge attaches to an end marker.
 */
export class LineAttachementInfo {

    private isDirectional: boolean;
    private lineAttachementAngle: number;
    private attachementOffset: number;

    /**
     * Create a new line attachement info object.
     *
     * The attachement point can either be an offset from 0,0 or a point relative to 0,0 of the template.
     * To specify an offset use a single number or a string containing exactly one number.
     * To specify a point use a string with two numbers seperated by a space or a point object.
     * The line attachement point must not include any transformations applied to the marker when it is rendered.
     *
     * If only an offset was specified the attachement info is not directional.
     *
     * @param lineAttachementPoint the attachement point relative to 0,0 in the template
     */
    constructor(lineAttachementPoint: string|number|Point) {
        if (lineAttachementPoint == null) {
            lineAttachementPoint = 0;
        }
        if (typeof lineAttachementPoint === 'number') {
            this.attachementOffset = lineAttachementPoint;
            this.lineAttachementAngle = 0;
            this.isDirectional = false;
        } else if (typeof lineAttachementPoint === 'string') {
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
        } else {
            const normal = {dx: lineAttachementPoint.x, dy: lineAttachementPoint.y};
            this.attachementOffset = calculateLength(normal);
            this.lineAttachementAngle = calculateAngle(normal);
            this.isDirectional = true;
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

    /**
     * Return a rotation vector pointing at the translated line attachement point.
     *
     * @param angle the angle the marker is currently rotated
     * @param scale the current scale of the marker
     */
    getRotationVector(angle: number, scale?: number): RotationVector {
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
