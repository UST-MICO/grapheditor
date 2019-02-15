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

export interface RotationVector {
    dx: number;
    dy: number;
}

/**
 * Normalize an existing vector to length 1.
 *
 * @param vector vector to normalize
 */
export function normalizeVector(vector: RotationVector): RotationVector {
    const x = vector.dx;
    const y = vector.dy;
    const length = Math.sqrt(x * x + y * y);
    return {
        dx: x / length,
        dy: y / length,
    };
}


/**
 * Calculate the Angle of a rotation vector in degree.
 *
 * @param vector vector to normalize
 */
export function calculateAngle(vector: RotationVector): number {
    if (vector.dx === 0 && vector.dy === 0) {
        return 0;
    }
    vector = normalizeVector(vector);
    const angle = Math.atan2(vector.dy, vector.dx);
    return angle * 180 / Math.PI;
}
