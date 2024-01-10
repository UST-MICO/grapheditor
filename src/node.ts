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
    /** An optional node width. Attribute is used by resize manager. */
    width?: number;
    /** An optional node height. Attribute is used by resize manager. */
    height?: number;
    /** Node type. Can be used for styling. */
    type?: string;
    /** The id of the dynamic node template to use for this node. */
    dynamicTemplate?: string;
    [prop: string]: any;
}

/**
 * Interface storing all informatein needed when moving a node.
 */
export interface NodeMovementInformation {
    /** The node to be moved. */
    node: Node;
    /** The affected children that need to move with the node. */
    children?: Set<string>;
    /** The initial offset from the movement start position to the node. */
    offset?: RotationVector;
    /** Flag, true if the next render should be a complete render instead of only updating positions. Reset after render. */
    needsFullRender?: boolean;
}



