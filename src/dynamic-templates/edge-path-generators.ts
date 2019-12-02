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

import { line, Line, CurveFactory, CurveFactoryLineOnly, curveLinear } from 'd3-shape';
import { Point } from '../edge';
import { RotationVector } from '../rotation-vector';

/**
 * Interface for edge path generators.
 *
 * A path generator is used to interpolate the edge path between two points.
 */
export interface EdgePathGenerator {
    /**
     * Generate the path string for the `d` attribute of the svg `<path>` element.
     *
     * @param start the starting point of the edge
     * @param end the end point of the edge
     * @param startNormal the normal of the link handle of the start point; may be `null` or `{dx: 0, dy: 0}`
     * @param endNormal the normal of the link handle of the end point; may be `null` or `{dx: 0, dy: 0}`
     */
    generateEdgePath(start: Point, end: Point, startNormal?: RotationVector, endNormal?: RotationVector): string;
}

/**
 * An edge path generator that uses helper points and the d3 curve factories.
 */
export class SmoothedEdgePathGenerator implements EdgePathGenerator {
    lineGenerator: Line<Point>;
    useOffsetPoints: boolean;
    offsetPointOffset: number;

    /**
     * Create  a new path generator.
     *
     * @param smoothing the curve factory to use to generate the path string
     * @param useOffsetPoints if true offset points in the direction of start and end normal will be used for the interpolation (default: `true`)
     * @param offsetPointOffset the distance of the offset points (default: `1`)
     */
    constructor(smoothing: CurveFactory|CurveFactoryLineOnly, useOffsetPoints: boolean= true, offsetPointOffset: number= 1) {
        this.lineGenerator = line<Point>()
            .x((d) => d.x)
            .y((d) => d.y)
            .curve(smoothing);
        this.useOffsetPoints = useOffsetPoints;
        this.offsetPointOffset = offsetPointOffset;
    }

    generateEdgePath(start: Point, end: Point, startNormal?: RotationVector, endNormal?: RotationVector): string {
        const points = [start];
        if (this.useOffsetPoints) {
            if (startNormal != null) {
                points.push({
                    x: start.x + (startNormal.dx * this.offsetPointOffset),
                    y: start.y + (startNormal.dy * this.offsetPointOffset),
                });
            }
            if (endNormal != null) {
                points.push({
                    x: end.x + (endNormal.dx * this.offsetPointOffset),
                    y: end.y + (endNormal.dy * this.offsetPointOffset),
                });
            }
        }
        points.push(end);
        return this.lineGenerator(points);
    }
}

/**
 * A naive stepping path generator that tries to produce the shortest path using only lines parallel to the axes.
 */
export class SteppedEdgePathGenerator implements EdgePathGenerator {
    lineGenerator = line<Point>()
        .x((d) => d.x)
        .y((d) => d.y)
        .curve(curveLinear);

    generateEdgePath(start: Point, end: Point, startNormal?: RotationVector, endNormal?: RotationVector): string {
        const dx = Math.abs(start.x - end.x);
        const dy = Math.abs(start.y - end.y);
        const points = [start];
        if (dx >= dy) {
            const xMid = (start.x + end.x) / 2;
            points.push({
                x: xMid,
                y: start.y,
            });
            points.push({
                x: xMid,
                y: end.y,
            });
        } else {
            const yMid = (start.y + end.y) / 2;
            points.push({
                x: start.x,
                y: yMid,
            });
            points.push({
                x: end.x,
                y: yMid,
            });
        }
        points.push(end);
        return this.lineGenerator(points);
    }
}
