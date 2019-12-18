import { RotationVector } from './rotation-vector';

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

/**
 * Node interface.
 */
export interface Node {
    /** Unique identifier. */
    id: number|string;
    /** X coordinate of Node(center). */
    x: number;
    /** Y coordinate of Node(center). */
    y: number;
    /** Node type. Can be used for styling. */
    type?: string;
    /** The id of the dynamic node template to use for this node. */
    dynamicTemplate?: string;
    [prop: string]: any;
}

export interface NodeMovementInformation {
    node: Node;
    children?: Set<string>;
    offset?: RotationVector;
}
