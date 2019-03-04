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

import { RotationVector } from './rotation-vector';

interface RotationData {
    /** Absolute rotation via direction vector. */
    normal?: RotationVector;
    /** Relative angle in degree. */
    relativeAngle: number;
}

export interface Marker {
    /** the marker template id to use for this marker. */
    template: string;
    /** The relative position of the marker on the edge (between 0 and 1). */
    positionOnLine: number|string;
    /** The length used for end/start markers to offset the line position. */
    lineOffset?: number;
    /** A factor to scale the marker. */
    scale?: number;
    /** If true the marker and lineOffset is scaled relative to the stroke width. */
    scaleRelative?: boolean;
    /** Rotation information for the marker. */
    rotate?: RotationData;
}
