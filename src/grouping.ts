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

import { Node } from './node';
import GraphEditor, { EventSource } from './grapheditor';
import { Edge, Point } from './edge';
import { filterDropzonesByType, calculateSquaredDistanceFromNodeToDropZone } from './drop-zone';

/**
 * Interface for tree information containing the root of the tree,
 * the direct tree parent and the depth of this group.
 */
export interface TreeInformation {
    /** The root (group id) of the tree. The tree root has itself as the tree root. */
    treeRoot: string;
    /** The parent group id of this group. The tree root has no parent. */
    treeParent: string;
    /** The depth of the group in the tree. The tree root has depth 0. */
    treeDepth: number;
}

/**
 * Class containing all information of a group.
 *
 * This class is not intended to be used outside of the GroupingManager!
 */
export class NodeGroup implements TreeInformation {
    /** The id of this group. This should be the same id as the node it represents. */
    readonly groupId: string;

    /** A set of all direct parents (group ids). */
    readonly parents: Set<string>;
    /** A set of all direct children (group ids). */
    readonly children: Set<string>;
    /** The depth of the group in the acyclic directed group graph. Initialized as 0. `Max(parents => parents.depth) + 1` */
    public groupDepth: number;

    /** The root of the tree this group belongs to. Null if the group is not part of a tree. */
    public treeRoot: string;
    /** The parent that has the same tree root as this group that should be considered the parent for this group and this tree. */
    public treeParent: string;
    /** The depth of the group in the tree. Initialized as 0. `treeParent.treeDepth + 1` */
    public treeDepth: number;

    /** The group behaviour that determines how this group acts. */
    public groupBehaviour: GroupBehaviour;

    constructor(nodeId: string) {
        this.groupId = nodeId;
        this.parents = new Set<string>();
        this.children = new Set<string>();
        this.groupDepth = 0;
    }
}

/**
 * A function that given a group, a (candidate) child group and the corresponding nodes
 * decides if a certain action can be done.
 *
 * @param group the group id of this group
 * @param childGroup the group id of the group (or node) the action will be performed for
 * @param groupNode the node in the grapheditor with the same id as `group`, may be null.
 * @param childNode the node in the grapheditor with the same id as `childGroup`, may be null.
 * @param graphEditor the instance of the grapheditor.
 * @returns true iff the action should be performed.
 */
export type GroupBehaviourDecisionCallback = (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) => boolean;

/**
 * A function that given a group, the corresponding node and an edge
 * decides which node should handle the edge.
 *
 * @param group the group id of this group
 * @param groupNode the node in the grapheditor with the same id as `group`, may be null.
 * @param edge the (incoming or outgoing) edge
 * @param graphEditor the instance of the grapheditor.
 * @returns the id of an existing Node that should handle this edge (as its source or target)
 */
export type GroupBehaviourEdgeDelegationCallback = (group: string, groupNode: Node, edge: Edge, graphEditor: GraphEditor) => string;


/**
 * Interface describing the behaviour of a NodeGroup.
 */
export interface GroupBehaviour {

    /** If true all children (including transitive children) will move the same amount as the group. */
    moveChildrenAlongGoup?: boolean;
    /**
     * If true this group captures all movement events for nodes in the same tree.
     * A captured movement event acts as if the node of this group is moved instead of the original target.
     *
     * The group and children must be part of the same tree for this to work!
     */
    captureChildMovement?: boolean;
    /**
     * Decide whether to capture the movement event from this particular node.
     *
     * The default is `() => true`
     */
    captureChildMovementForNode?: GroupBehaviourDecisionCallback;

    /**
     * If true this group captures all outgoing dragged edges of child nodes (including transitive children) in the same tree.
     * A captured edge behaves as if it is dragged from this group's node.
     *
     * The group and children must be part of the same tree for this to work!
     */
    captureOutgoingEdges?: boolean;
    /**
     * Decide whether to capture the outgoing dragged edge from this particular node.
     *
     * The default is `() => true`
     */
    captureOutgoingEdgesForNode?: GroupBehaviourDecisionCallback;
    /**
     * Delegate an outgoing edge from this group to another node.
     * A delegated edge behaves as if it is dragged from the given node.
     *
     * The default is to not change the current source.
     */
    delegateOutgoingEdgeSourceToNode?: GroupBehaviourEdgeDelegationCallback;

    /**
     * If true this group captures all incoming dragged edges of child nodes (including transitive children) in the same tree.
     * A captured edge behaves as if it is targeting this group's node.
     *
     * The group and children must be part of the same tree for this to work!
     */
    captureIncomingEdges?: boolean;
    /**
     * Decide whether to capture the incoming dragged edge from this particular node.
     *
     * The default is `() => true`
     */
    captureIncomingEdgesForNode?: GroupBehaviourDecisionCallback;
    /**
     * Delegate an incoming edge from this group to another node.
     * A delegated edge behaves as if target is the given node.
     *
     * The default is to not change the current target.
     */
    delegateIncomingEdgeTargetToNode?: GroupBehaviourEdgeDelegationCallback;

    /** If true dragged nodes can generally join this group. */
    captureDraggedNodes?: boolean;
    /** If true always allow free positioning of child nodes inside the group. (Always true if the node has no defined drop zones.)*/
    allowFreePositioning?: boolean;
    /**
     * Decide whether this specific node may join this group.
     *
     * Default implementation: `defaultCaptureThisDraggedNode`
     */
    captureThisDraggedNode?: GroupBehaviourDecisionCallback;

    /** If true dragged nodes can generally leave this group. */
    allowDraggedNodesLeavingGroup?: boolean;
    /** Decide whether this specific node may leave this group. */
    allowThisDraggedNodeLeavingGroup?: GroupBehaviourDecisionCallback;

    /**
     * Callback called after the childGroup has joined the parent group.
     *
     * Default implementation: `defaultAfterNodeJoinedGroup`
     *
     * @param group the (parent) group this group behaviour belongs to
     * @param childGroup the child group that joined this group
     * @param groupNode the node corresponding to the parent group, may be null
     * @param childNode the node corresponding to the child group, may be null
     * @param graphEditor the instance of the grapheditor
     * @param atPosition the absolute point where the child node will join the group
     *      The actual position of the child node may not be the same as atPosition
     *      as it is only updated **after** the node was moved.
     */
    afterNodeJoinedGroup?: (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor, atPosition?: Point) => void;
    /**
     * Callback called after the childGroup has left the parent group.
     *
     * Default implementation: `defaultAfterNodeLeftGroup`
     *
     * @param group the (parent) group this group behaviour belongs to
     * @param childGroup the child group that has left this group
     * @param groupNode the node corresponding to the parent group, may be null
     * @param childNode the node corresponding to the child group, may be null
     * @param graphEditor the instance of the grapheditor
     */
    afterNodeLeftGroup?: (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) => void;

    /**
     * Callback called before a direct child in the same tree is moved.
     *
     * This will not be called if the node joins the group while moving!
     *
     * @param group the (parent) group this group behaviour belongs to
     * @param childGroup the child group that is about to move
     * @param groupNode the node corresponding to the parent group, may be null
     * @param childNode the node corresponding to the child group
     * @param graphEditor the instance of the grapheditor
     */
    onNodeMoveStart?: (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) => void;
    /**
     * Callback called before a direct child in the same tree is moved to a new position.
     *
     * Default implementation: `defaultBeforeNodeMove`
     *
     * @param group the (parent) group this group behaviour belongs to
     * @param childGroup the child group that is beeing moved
     * @param groupNode the node corresponding to the parent group, may be null
     * @param childNode the node corresponding to the child group
     * @param newPosition the absolute position the node will be moved to
     * @param graphEditor the instance of the grapheditor
     */
    beforeNodeMove?: (group: string, childGroup: string, groupNode: Node, childNode: Node, newPosition: Point, graphEditor: GraphEditor) => void;
    /**
     * Callback called after a direct child in the same tree finished moving.
     *
     * This will not be called if the node left the group while moving!
     *
     * @param group the (parent) group this group behaviour belongs to
     * @param childGroup the child group that was moved
     * @param groupNode the node corresponding to the parent group, may be null
     * @param childNode the node corresponding to the child group
     * @param graphEditor the instance of the grapheditor
     */
    onNodeMoveEnd?: (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) => void;

    /** A map mapping the id of occupied drop zones to the id of the node occupying them. */
    occupiedDropZones?: Map<string, string>;
    /**
     * A map containing the positions of nodes inside the group.
     *
     * The position can either be the id of a drop zone (string) or a point relative to the node of the group.
     * For drop zones the center of the bounding box is the position the node will be placed.
     *
     * A node with a position in this map will not move from this position by dragging or calling moveNode!
     * Delete the node id from this map to allow free movement for the node.
     */
    childNodePositions?: Map<string, string|Point>;
}

/**
 * Default behaviour of the `captureThisDraggedNode` GroupBehaviourDecisionCallback of a GroupBehaviour.
 *
 * If the group behaviour has `allowFreePositioning` set as `true` then this method
 * always returns true.
 *
 * This method rerturns true if the group node has an unoccupied dropzone that allows the type
 * of the childNode in its filters.
 *
 * If the dropzone is already marked as occupied by the same id as the childNode the dropzone
 * is **not** considered occupied by this method!
 *
 * @param this the GroupBehaviour
 * @param group the group id of this group
 * @param childGroup the group id of the group (or node) the action will be performed for
 * @param groupNode the node in the grapheditor with the same id as `group`, may be null.
 * @param childNode the node in the grapheditor with the same id as `childGroup`, may be null.
 * @param graphEditor the instance of the grapheditor.
 * @returns true iff the node can join the group
 */
export function defaultCaptureThisDraggedNode(this: GroupBehaviour, group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor): boolean {
    if (this.allowFreePositioning) {
        return true;
    }
    if (childNode == null) {
        return false;
    }
    const dropZones = graphEditor.getNodeDropZonesForNode(group);
    for (const zone of filterDropzonesByType(dropZones, childNode.type)) {
        if (this.occupiedDropZones != null) {
            if (this.occupiedDropZones.has(zone.id)) {
                // drop zone is occupied
                if (this.occupiedDropZones.get(zone.id) === childNode.id.toString()) {
                    // occupied by the node in question, this cannot happen normally...
                    // assume node can join or already has joined this group
                    return true;
                }
                continue; // check next dropzone
            }
        }
        // drop zone is free
        return true;
    }
    return false;
};

/**
 * Default behaviour of the `beforeNodeMove` callback of a GroupBehaviour.
 *
 * If both groupNode and childNode are not null and the groupNode has dropzones this
 * method places the childNode at the nearest unoccupied dropzone.
 *
 * This method only considers dropzones with a filter allowing the type of the childNode.
 *
 * This method uses (and creates) the `occupiedDropZones` map and the `childNodePositions` of the groupBehaviour.
 *
 * The nearest dropzone is determined by the distance of the dropzone center to the coordinates of the childNode.
 *
 * If the childNode was already occupying a dropZone it will still change to a nearer dropzone when moved.
 *
 * @param this the GroupBehaviour
 * @param group the (parent) group this group behaviour belongs to
 * @param childGroup the child group that is beeing moved
 * @param groupNode the node corresponding to the parent group, may be null
 * @param childNode the node corresponding to the child group
 * @param newPosition the absolute position the node will be moved to
 * @param graphEditor the instance of the grapheditor
 */
// eslint-disable-next-line complexity
export function defaultBeforeNodeMove(this: GroupBehaviour, group: string, childGroup: string, groupNode: Node, childNode: Node, newPosition: Point, graphEditor: GraphEditor) {
    if (groupNode == null || childNode == null) {
        return;
    }

    const dropZones = graphEditor.getNodeDropZonesForNode(groupNode);
    if (dropZones != null) {
        if (this.occupiedDropZones == null) {
            this.occupiedDropZones = new Map();
        }
        if (this.childNodePositions == null) {
            this.childNodePositions = new Map();
        }

        // find nearest dropZone
        let bestDropZone: string;
        let bestDistance: number;
        let lastDropZone: string;
        for (const dropZone of filterDropzonesByType(dropZones, childNode.type)) {
            // only consider free dropzones
            if (this.occupiedDropZones.has(dropZone.id)) {
                if (this.occupiedDropZones.get(dropZone.id) === childNode.id.toString()) {
                    lastDropZone = dropZone.id;
                } else {
                    continue;
                }
            }
            // check if dropzone is nearer
            const distance = calculateSquaredDistanceFromNodeToDropZone(groupNode, dropZone, newPosition);
            if (bestDistance == null || bestDistance > distance) {
                bestDistance = distance;
                bestDropZone = dropZone.id;
            }
        }
        if (lastDropZone != null && lastDropZone !== bestDropZone) {
            // old dropZone is no longer occupied
            this.occupiedDropZones.delete(lastDropZone);
        }

        // fix node to nearest dropzone
        if (bestDropZone != null) {
            this.occupiedDropZones.set(bestDropZone, childNode.id.toString());
            this.childNodePositions.set(childNode.id.toString(), bestDropZone);
        } else {
            this.childNodePositions.delete(childNode.id.toString());
        }
    }
}

/**
 * Default behaviour of the `afterNodeJoinedGroup` callback of a GroupBehaviour.
 *
 * This method calls `beforeNodeMove` of the GroupBehaviour.
 *
 * This method assumes `beforeNodeMove` to be implemented by `defaultBeforeNodeMove`.
 * If `beforeNodeMove` has a different behaviour than the default implementation then
 * this method should also be replaced by a custom method!
 *
 * @param this the GroupBehaviour
 * @param group the (parent) group this group behaviour belongs to
 * @param childGroup the child group that joined this group
 * @param groupNode the node corresponding to the parent group, may be null
 * @param childNode the node corresponding to the child group, may be null
 * @param graphEditor the instance of the grapheditor
 * @param atPosition the absolute point where the child node will join the group
 *      The actual position of the child node may not be the same as atPosition
 *      as it is only updated **after** the node was moved.
 */
// eslint-disable-next-line max-len
export function defaultAfterNodeJoinedGroup(this: GroupBehaviour, group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor, atPosition?: Point) {
    if (this.beforeNodeMove != null) {
        this.beforeNodeMove(group, childGroup, groupNode, childNode, atPosition ?? childNode, graphEditor);
    }
}

/**
 * Default behaviour of the `afterNodeLeftGroup` callback of a GroupBehaviour.
 *
 * This method removes childNodePositions for the node that left and frees all dropzones
 * that were occupied by the node that left.
 *
 * @param this the GroupBehaviour
 * @param group the (parent) group this group behaviour belongs to
 * @param childGroup the child group that has left this group
 * @param groupNode the node corresponding to the parent group, may be null
 * @param childNode the node corresponding to the child group, may be null
 * @param graphEditor the instance of the grapheditor
 */
export function defaultAfterNodeLeftGroup(this: GroupBehaviour, group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) {
    if (this.occupiedDropZones != null) {
        // cleanup occupied dropzones
        const toDelete = new Set<string>();
        this.occupiedDropZones.forEach((nodeId, zoneId) => {
            if (childGroup === nodeId) {
                toDelete.add(zoneId);
            }
        });
        toDelete.forEach(zoneId => this.occupiedDropZones.delete(zoneId));
    }
    this.childNodePositions?.delete(childGroup);
}

/**
 * Class managing all node groups.
 */
export class GroupingManager {
    /** Map containing all node groups by id. */
    private groupsById: Map<string, NodeGroup>;

    /** Reference to the grapheditor instance to dispatch events or get nodes. */
    private graphEditor: GraphEditor;

    constructor(graphEditor: GraphEditor) {
        this.groupsById = new Map<string, NodeGroup>();
        this.graphEditor = graphEditor;
    }

    /**
     * Clears all group information stored in this GroupingManager instance.
     *
     * Can be useful when redrawing/resetting the graph.
     */
    clearAllGroups(): void {
        this.groupsById = new Map<string, NodeGroup>();
    }

    /**
     * Get a NodeGroup object for the given id.
     *
     * If the `groupsById` does not contain a group with that id a new NodeGroup
     * with a default GroupBehaviour is created.
     *
     * @param nodeId a node/group id
     */
    protected getGroupForNode(nodeId: string|number) {
        const groupId = nodeId.toString();
        if (this.groupsById.has(groupId)) {
            return this.groupsById.get(groupId);
        }
        const newGroup = new NodeGroup(groupId);
        newGroup.groupBehaviour = {
            afterNodeJoinedGroup: defaultAfterNodeJoinedGroup,
            afterNodeLeftGroup: defaultAfterNodeLeftGroup,
            beforeNodeMove: defaultBeforeNodeMove,
        };
        this.groupsById.set(groupId, newGroup);
        return newGroup;
    }

    /**
     * Add a node to a group.
     *
     * For the group behaviour to work correctly both the groupId and the nodeId schould correspond
     * to an existing node in the grapheditor.
     *
     * This method checks if adding nodeId to the group would create a cycle in the group graph by using `getAllChildrenOf`.
     * It also checks if `nodeId == groupId` and aborts if true.
     *
     * The method updates the group depths of all affected groups recursively.
     *
     * If the parent group is part of a tree and the child group is not part of a tree the child group is added to the parents tree.
     *
     * The 'groupjoin' event is the last event dispatched by this method.
     * The `afterGroupJoin` callback of the parent group behaviour is called after the 'groupjoin' event was dispatched.
     *
     * @param groupId the group to add the node to
     * @param nodeId the id of the node that should join the group
     * @param atPosition the absolute position where the node will join the group (used for the drag behaviour)
     * @param eventSource the event source to be used for dispatched events (defaults to `EventSource.API`)
     * @param sourceEvent the source event that caused this node to be added to the group
     * @returns true iff the node was successfully added to the group
     */
    addNodeToGroup(groupId: string|number, nodeId: string|number, atPosition?: Point, eventSource: EventSource = EventSource.API, sourceEvent?: Event): boolean {
        const group = this.getGroupForNode(groupId);
        if (group.children.has(nodeId.toString())) {
            console.error(`Adding node ${nodeId} to group ${groupId} would create a cycle!`);
            return false;
        }
        if (group.groupId === nodeId.toString()) {
            console.error(`Node ${nodeId} tryed to join itself!`);
            return false;
        }
        const children = this.getAllChildrenOf(nodeId);
        if (children.has(group.groupId)) {
            console.error(`Adding node ${nodeId} to group ${groupId} would create a cycle!`);
            return false;
        }
        const childGroup = this.getGroupForNode(nodeId);
        group.children.add(childGroup.groupId);
        childGroup.parents.add(group.groupId);
        this.updateGroupDepth(childGroup, eventSource, sourceEvent);
        if (group.treeRoot != null) {
            this.propagateTreeRoot(group, childGroup, eventSource, sourceEvent);
        }
        const groupNode = this.graphEditor.getNode(groupId);
        const childNode = this.graphEditor.getNode(nodeId);
        if (group.groupBehaviour?.afterNodeJoinedGroup != null) {
            group.groupBehaviour.afterNodeJoinedGroup(group.groupId, childGroup.groupId, groupNode, childNode, this.graphEditor, atPosition);
        }
        this.afterGroupJoin(group.groupId, childGroup.groupId, groupNode, childNode, eventSource, sourceEvent);
        return true;
    }

    /**
     * Get the set of **direct** children of this group.
     *
     * Do **NOT** alter this set!
     *
     * @param groupId the id of the group (e.g. the node id)
     */
    getChildrenOf(groupId: string|number): Set<string> {
        return this.groupsById.get(groupId.toString())?.children ?? new Set<string>();
    }

    /**
     * Get the set of direct parents of this group.
     *
     * Do **NOT** alter this set!
     *
     * @param groupId the id of the group (e.g. the node id)
     */
    getParentsOf(groupId: string|number): Set<string> {
        return this.groupsById.get(groupId.toString())?.parents ?? new Set<string>();
    }

    /**
     * Get the depth of the group in the directed acyclic graph.
     *
     * A group with no parents has a depth of `0`.
     * A group with parents has a depth of `max(parent => parent.depth) + 1`.
     *
     * This can be useful for sorting the nodes so that children of a group appear above the group.
     *
     * @param groupId the id of the group (e.g. the node id)
     */
    getGroupDepthOf(groupId: string|number): number {
        return this.groupsById.get(groupId.toString())?.groupDepth ?? 0;
    }

    /**
     * Get the tree parent of the group.
     *
     * The tree parent is always a parent of the group too.
     * If the group is the tree root then it will not have a tree parent!
     *
     * @param groupId the id of the group (e.g. the node id)
     */
    getTreeParentOf(groupId: string|number): string {
        return this.groupsById.get(groupId.toString())?.treeParent;
    }

    /**
     * Get the tree root of the group.
     *
     * All groups with the same tree root are part of the same tree.
     *
     * @param groupId the id of the group (e.g. the node id)
     */
    getTreeRootOf(groupId: string|number): string {
        return this.groupsById.get(groupId.toString())?.treeRoot;
    }

    /**
     * Get the depth of the group in the tree.
     *
     * The tree root has a depth of `0`.
     * All other nodes of the tree have a depth of `treeParent.depth + 1`.
     *
     * @param groupId the id of the group (e.g. the node id)
     */
    getTreeDepthOf(groupId: string|number): number {
        return this.groupsById.get(groupId.toString())?.treeDepth;
    }

    /**
     * Get a set of **all** children of a group including children of children.
     *
     * @param groupId the id of the group (e.g. the node id)
     */
    getAllChildrenOf(groupId: string|number): Set<string> {
        const children = new Set<string>();
        const expanded = new Set<string>();
        const toExpand = [groupId.toString()];
        while (toExpand.length > 0) {
            const idToExpand = toExpand.pop();
            expanded.add(idToExpand);
            const group = this.groupsById.get(idToExpand);
            if (group != null) {
                group.children.forEach(child => {
                    children.add(child);
                    if (!expanded.has(child)) {
                        toExpand.push(child);
                    }
                });
            }
        }
        return children;
    }

    /**
     * Propagate tree information from the parent group to the child group (recursively).
     *
     * This method adds the parent as the treeParent of the child if the child is not part of a tree.
     * The method is then called recursively with child as the new parent for all children of child.
     *
     * @param parent node group from which the tree information should be propagated from
     * @param child node group that should get the tree information
     * @param eventSource the event source to be used for dispatched events
     * @param sourceEvent the source event that should be used for new events
     */
    private propagateTreeRoot(parent: NodeGroup, child: NodeGroup, eventSource: EventSource, sourceEvent?: Event) {
        if (parent.treeRoot == null) {
            // parent is not part of a tree
            return;
        }
        if (child.treeRoot != null) {
            // child is already part of a tree
            return;
        }
        const oldTreeInfo: TreeInformation = {
            treeRoot: child.treeRoot,
            treeParent: child.treeParent,
            treeDepth: child.treeDepth,
        };
        child.treeRoot = parent.treeRoot;
        child.treeParent = parent.groupId;
        child.treeDepth = parent.treeDepth + 1;
        this.dispatchTreeChangedEvent(child.groupId, oldTreeInfo, child, eventSource, sourceEvent);
        child.children.forEach(cId => this.propagateTreeRoot(child, this.getGroupForNode(cId), eventSource, sourceEvent));
    }

    /**
     * Update the group depth recursively.
     *
     * @param group the group that should be updated
     * @param eventSource the event source to be used for dispatched events
     * @param sourceEvent the source event that should be used for new events
     */
    private updateGroupDepth(group: NodeGroup, eventSource: EventSource, sourceEvent?: Event) {
        let newDepth = 0;
        if (group.parents.size > 0) {
            group.parents.forEach(parentId => {
                const parentDepth = this.getGroupForNode(parentId).groupDepth;
                newDepth = Math.max(newDepth, parentDepth + 1);
            });
        }
        const oldDepth = group.groupDepth;
        const depthChanged = group.groupDepth !== newDepth;
        group.groupDepth = newDepth;
        if (depthChanged) {
            this.dispatchGroupDepthChangedEvent(group.groupId, oldDepth, newDepth, eventSource, sourceEvent);
            group.children.forEach(childId => this.updateGroupDepth(this.getGroupForNode(childId), eventSource, sourceEvent));
        }
    }

    /**
     * Remove a node from a group.
     *
     * This method will only remove direct children from a group!
     *
     * If the node is part of another group that is in the same tree it will set its
     * tree parent to that group instead of leaving the tree. If more than one parent is
     * part of the tree the parent with the smallest treeDepth (closest to the root) is chosen.
     *
     * The 'groupleave' event is the last event dispatched by this method.
     * The `afterGroupLeave` callback of the parent group behaviour is called after the 'groupleave' event was dispatched.
     *
     * @param groupId the group to remove the node from
     * @param nodeId the id of the node that should leave the group
     * @param eventSource the event source to be used for dispatched events (defaults to `EventSource.API`)
     * @param sourceEvent the source event that should be used for new events
     * @returns true iff the node was successfully removed from the group
     */
    removeNodeFromGroup(groupId: string|number, nodeId: string|number, eventSource: EventSource = EventSource.API, sourceEvent?: Event): boolean {
        const group = this.getGroupForNode(groupId);
        if (!group.children.has(nodeId.toString())) {
            return false;
        }
        const childGroup = this.getGroupForNode(nodeId);
        group.children.delete(childGroup.groupId);
        childGroup.parents.delete(group.groupId);
        this.updateGroupDepth(childGroup, eventSource, sourceEvent);
        if (childGroup.treeRoot != null) {
            this._leaveTree(childGroup, childGroup.treeRoot, true, eventSource, sourceEvent);
        }
        const groupNode = this.graphEditor.getNode(groupId);
        const childNode = this.graphEditor.getNode(nodeId);
        if (group.groupBehaviour?.afterNodeLeftGroup != null) {
            group.groupBehaviour.afterNodeLeftGroup(group.groupId, childGroup.groupId, groupNode, childNode, this.graphEditor);
        }
        this.afterGroupLeave(group.groupId, childGroup.groupId, groupNode, childNode, eventSource, sourceEvent);
        return true;
    }

    /**
     * Remove the group from its tree.
     *
     * This method sets all tree related attributes of the group and all its (recursive) children
     * that are part of the same tree to null.
     *
     * This method does not remove the group from any group it is currently a child of!
     *
     * @param groupId the group that should leave its tree
     * @param eventSource the event source to be used for dispatched events (defaults to `EventSource.API`)
     * @param sourceEvent the source event that should be used for new events
     */
    leaveTree(groupId: string|number, eventSource: EventSource = EventSource.API, sourceEvent?: Event): void {
        const group = this.getGroupForNode(groupId);
        this._leaveTree(group, group.treeRoot, false, eventSource, sourceEvent);
    }

    /**
     * Remove the group and all its children that are part of the same tree recursively from the tree given by treeRootId.
     *
     * If rejoin is true and the group is part of another group that is in the same tree it will
     * set its tree parent to that group instead of leaving the tree. If more than one parent is
     * part of the tree the parent with the smallest treeDepth (closest to the root) is chosen.
     *
     * @param group the group that should leave its tree
     * @param treeRootId the tree root of the tree to leave (used for the recursive calls)
     * @param rejoin if true the group will try to rejoin the same tree if another parent of the group is part of the same tree
     * @param eventSource the event source to be used for dispatched events (defaults to `EventSource.API`)
     * @param sourceEvent the source event that should be used for new events
     */
    private _leaveTree(group: NodeGroup, treeRootId: string, rejoin: boolean= false, eventSource: EventSource, sourceEvent?: Event) {
        if (group.treeRoot == null || group.treeRoot !== treeRootId) {
            return;
        }
        const oldTreeInfo: TreeInformation = {
            treeRoot: group.treeRoot,
            treeParent: group.treeParent,
            treeDepth: group.treeDepth,
        };
        group.treeRoot = null;
        group.treeParent = null;
        group.treeDepth = null;
        this.dispatchTreeChangedEvent(group.groupId, oldTreeInfo, group, eventSource, sourceEvent);
        group.children.forEach(cId => this._leaveTree(this.getGroupForNode(cId), treeRootId, false, eventSource, sourceEvent));
        if (rejoin) {
            // rejoin the same tree if possible
            let closestParent: NodeGroup;
            // find the parent that is closest to the treeRoot of this node
            group.parents.forEach(pId => {
                const parent = this.getGroupForNode(pId);
                if (parent.treeRoot !== treeRootId) {
                    // only check parents that are part of the same tree
                    return;
                }
                if (parent.groupId === oldTreeInfo.treeParent) {
                    // do not join the same parent again!
                    return;
                }
                if (closestParent == null || parent.treeDepth < closestParent.treeDepth) {
                    closestParent = parent;
                }
            });
            if (closestParent != null) {
                this.propagateTreeRoot(closestParent, group, eventSource, sourceEvent);
            }
        }
    }

    /**
     * Let the group join the tree of one of its parents.
     *
     * If the given parent is not part of a tree calling this method has the same result as calling `leaveTree`.
     *
     * If the group is already part of a tree the group will leave this tree before joining the tree of the parent.
     * Use `markAsTreeRoot` on the parent befor joining its tree if the parent is not part of a tree yet.
     *
     * @param groupId the group that should join a tree
     * @param treeParentId the parent of the group that will be the new tree parent
     * @param eventSource the event source to be used for dispatched events (defaults to `EventSource.API`)
     * @param sourceEvent the source event that should be used for new events
     * @returns true if the group successfully joined the tree of the parent (or the group left its tree and the parent is not part of a tree)
     */
    joinTreeOfParent(groupId: string|number, treeParentId: string|number, eventSource: EventSource = EventSource.API, sourceEvent?: Event): boolean {
        const group = this.getGroupForNode(groupId);
        const parentGroup = this.getGroupForNode(treeParentId);
        if (!group.parents.has(parentGroup.groupId)) {
            console.error(`Node ${groupId} cannot join the tree of ${treeParentId} because the Node is not a child of ${treeParentId}!`);
            return false;
        }
        if (group.treeRoot === parentGroup.treeRoot && group.treeParent === parentGroup.groupId) {
            return true; // already in the right tree
        }
        if (group.treeRoot != null) {
            // leave old tree
            this._leaveTree(group, group.treeRoot, false, eventSource, sourceEvent);
        }
        this.propagateTreeRoot(parentGroup, group, eventSource, sourceEvent);
        return true;
    }

    /**
     * Make an existing group into a tree root.
     *
     * This method will make an existing group that is not part of a tree into a tree root.
     * All children of this group that are not part of a tree will join the tree defined
     * by the newly created tree root.
     *
     * @param groupId the group that should become a tree root
     * @param eventSource the event source to be used for dispatched events (defaults to `EventSource.API`)
     * @param sourceEvent the source event that should be used for new events
     * @returns true if the group was successfully marked as a tree root
     */
    markAsTreeRoot(groupId: string|number, eventSource: EventSource = EventSource.API, sourceEvent?: Event): boolean {
        const group = this.getGroupForNode(groupId);
        if (group.treeRoot != null && group.treeRoot !== group.groupId) {
            console.error(`Node ${groupId} is already part of tree ${group.treeRoot} and cannot become a treeRoot itself!`);
            return false;
        }
        const oldTreeInfo: TreeInformation = {
            treeRoot: group.treeRoot,
            treeParent: group.treeParent,
            treeDepth: group.treeDepth,
        };
        group.treeRoot = group.groupId;
        group.treeParent = null;
        group.treeDepth = 0;
        this.dispatchTreeChangedEvent(group.groupId, oldTreeInfo, group, eventSource, sourceEvent);
        group.children.forEach(cId => this.propagateTreeRoot(group, this.getGroupForNode(cId), eventSource, sourceEvent));
        return true;
    }

    /**
     * Set the graoup behaviour.
     *
     * The default implementations for `captureThisDraggedNode`, `afterNodeJoinedGroup`,
     * `afterNodeLeftGroup` and `beforeNodeMove` will be inserted into the given groupBehaviour
     * if the behaviour does not specify them already.
     *
     * @param groupId the group to set the behaviour for
     * @param groupBehaviour the group behaviour
     */
    setGroupBehaviourOf(groupId: string|number, groupBehaviour: GroupBehaviour): void {
        if (groupBehaviour.captureThisDraggedNode == null) {
            groupBehaviour.captureThisDraggedNode = defaultCaptureThisDraggedNode;
        }
        if (groupBehaviour.afterNodeJoinedGroup == null) {
            groupBehaviour.afterNodeJoinedGroup = defaultAfterNodeJoinedGroup;
        }
        if (groupBehaviour.afterNodeLeftGroup == null) {
            groupBehaviour.afterNodeLeftGroup = defaultAfterNodeLeftGroup;
        }
        if (groupBehaviour.beforeNodeMove == null) {
            groupBehaviour.beforeNodeMove = defaultBeforeNodeMove;
        }
        this.getGroupForNode(groupId).groupBehaviour = groupBehaviour;
    }

    /**
     * Get the group behaviour of a specific group.
     *
     * The returned group behaviour will always have at least the default implementations
     * for `captureThisDraggedNode`, `afterNodeJoinedGroup`, `afterNodeLeftGroup` and `beforeNodeMove` set.
     *
     * The returned group behaviour may be null if the group id was never used before.
     *
     * @param groupId the group to get the group behaviour for
     */
    getGroupBehaviourOf(groupId: string|number): GroupBehaviour {
        const group = this.groupsById.get(groupId.toString());
        if (group == null) {
            return null;
        }
        const groupBehaviour = group.groupBehaviour ?? {};
        if (groupBehaviour.captureThisDraggedNode == null) {
            groupBehaviour.captureThisDraggedNode = defaultCaptureThisDraggedNode;
        }
        if (groupBehaviour.afterNodeJoinedGroup == null) {
            groupBehaviour.afterNodeJoinedGroup = defaultAfterNodeJoinedGroup;
        }
        if (groupBehaviour.afterNodeLeftGroup == null) {
            groupBehaviour.afterNodeLeftGroup = defaultAfterNodeLeftGroup;
        }
        if (groupBehaviour.beforeNodeMove == null) {
            groupBehaviour.beforeNodeMove = defaultBeforeNodeMove;
        }
        return group.groupBehaviour;
    }

    /**
     * Walk up the tree of the group of childNode and return a group matching the given properties.
     *
     * The strategy 'closest-parent' will return the first group it finds.
     * The strategy 'largest-group' will return the group closest to the tree root that matches the given properties.
     *
     * If no matching group is found then the id of the childNode is returned!
     *
     * @param childNode the groupId to start at
     * @param groupProperty the groupProperty that must be true
     * @param groupDecisionCallback the groupDecisionCallback that must be true (if it is set)
     * @param strategy the strategy to use for finding the group
     * @returns the id of the matching group or the childNode id
     */
    protected getGroupWithProperty(childNode: Node, groupProperty: string, groupDecisionCallback: string, strategy: 'closest-parent' | 'largest-group'): string {
        const childId = childNode.id.toString();
        let currentGroup: NodeGroup = this.groupsById.get(childId); // the child group is never checked
        let validGroup: string;
        while (currentGroup?.treeParent != null && currentGroup.groupId !== currentGroup.treeRoot) {
            const parentGroup = this.getGroupForNode(currentGroup.treeParent);
            if (parentGroup.groupBehaviour[groupProperty]) {
                const behaviour = parentGroup.groupBehaviour;
                if (behaviour[groupDecisionCallback] == null ||
                        behaviour[groupDecisionCallback](parentGroup.groupId, childId, this.graphEditor.getNode(parentGroup.groupId), childNode, this.graphEditor)) {
                    // groupBehaviour satisfies conditions
                    if (strategy === 'closest-parent') {
                        return parentGroup.groupId;
                    }
                    if (strategy === 'largest-group') {
                        validGroup = parentGroup.groupId;
                    }
                }
            }
            currentGroup = parentGroup;
        }
        return validGroup ?? childId;
    }

    /**
     * Get the id of the group that will capture the movement of the given node.
     *
     * Only groups in the same tree that have this node as a direct or indirect child
     * may capture its movement.
     *
     * If two or more groups in the path to the tree root may capture the node movement
     * the group closest to the tree root is returned.
     *
     * @param child a node that is about to move
     * @returns the group id capturing the movement of the node or the node id if no group was found
     */
    getGroupCapturingMovementOfChild(child: Node): string {
        return this.getGroupWithProperty(child, 'captureChildMovement', 'captureChildMovementForNode', 'largest-group');
    }

    /**
     * Get the id of the group that will capture outgoing edges of the given node.
     *
     * Only groups in the same tree that have this node as a direct or indirect child
     * may capture its outgoing edges.
     *
     * If two or more groups in the path to the tree root may capture its outgoing
     * edges the group closest to the node is returned.
     *
     * @param child a node that is about to have a new outgoing edge
     * @returns the group id capturing outgoing edges for the node or the node id if no group was found
     */
    getGroupCapturingOutgoingEdge(child: Node): string {
        return this.getGroupWithProperty(child, 'captureOutgoingEdges', 'captureOutgoingEdgesForNode', 'closest-parent');
    }


    /**
     * Get the id of the group that will capture incoming edges of the given node.
     *
     * Only groups in the same tree that have this node as a direct or indirect child
     * may capture its incoming edges.
     *
     * If two or more groups in the path to the tree root may capture its incoming
     * edges the group closest to the node is returned.
     *
     * @param child a node that is about to have a new incoming edge
     * @returns the group id capturing incoming edges for the node or the node id if no group was found
     */
    getGroupCapturingIncomingEdge(child: Node): string {
        return this.getGroupWithProperty(child, 'captureIncomingEdges', 'captureIncomingEdgesForNode', 'closest-parent');
    }

    /**
     * Get the group that the (dragged) node may join into.
     *
     * Only groups in the tree as groupId (including groupId) may capture the (dragged) node.
     *
     * Joining a group returned by this method does not create a cycle in the group graph!
     *
     * If two or more groups in the path to the tree root may capture the (dragged) node
     * the group closest to the groupNode is returned.
     *
     * @param groupId the id of the group that a new node may join into
     * @param childGroupId the id of the group that may join
     * @param groupNode the node with the groupId
     * @param node the node with the childGroupId
     * @returns the group id capturing the (dragged) node or null no group was found
     */
    // eslint-disable-next-line complexity
    getGroupCapturingDraggedNode(groupId: string|number, childGroupId: string|number, groupNode: Node, node: Node): string {
        const group: NodeGroup = this.groupsById.get(groupId.toString());

        // check first group
        // test if node tries to join itself
        if (groupId !== childGroupId.toString()) {
            const behaviour = group?.groupBehaviour;
            // test if group allows nodes to join
            if (behaviour?.captureDraggedNodes ?? false) {
                // test if node joining the group would create a cycle
                if (!(this.getAllChildrenOf(node.id)?.has(group.groupId) ?? false)) {
                    // test if group allows this specific node to join
                    if (behaviour.captureThisDraggedNode == null || behaviour.captureThisDraggedNode(group.groupId, childGroupId.toString(), groupNode, node, this.graphEditor)) {
                        return group.groupId;
                    }
                }
            }
        }

        // check group tree
        const matchingGroup = this.getGroupWithProperty(groupNode, 'captureDraggedNodes', 'captureThisDraggedNode', 'closest-parent');

        if (matchingGroup === groupId.toString()) {
            // groupNode.id was used as falback by this.getGroupWithProperty
            // first group was already checked (and failed)
            return;
        }

        // extra checks for possible cycles
        if (matchingGroup === childGroupId.toString()) {
            return; // a group cannot join itself
        }
        if (this.getAllChildrenOf(node.id)?.has(matchingGroup)) {
            return; // node cannot join the group as it would create a cycle!
        }

        // return the found group
        return matchingGroup;
    }

    /**
     * Check if the node is allowed to leave its group.
     *
     * @param groupId the group that the node wants to leave
     * @param childGroupId the group that wants to leave (the id of the child node)
     * @param childNode the node that wants to leave
     */
    getCanDraggedNodeLeaveGroup(groupId: string|number, childGroupId: string|number, childNode: Node): boolean {
        const groupBehaviour = this.getGroupBehaviourOf(groupId);
        if (groupBehaviour?.allowDraggedNodesLeavingGroup ?? false) {
            if (groupBehaviour.allowThisDraggedNodeLeavingGroup != null) {
                const groupNode = this.graphEditor.getNode(groupId);
                return groupBehaviour.allowThisDraggedNodeLeavingGroup(groupId.toString(), childGroupId.toString(), groupNode, childNode, this.graphEditor);
            }
            return true;
        }
        return false;
    }

    /**
     * Dispatch a 'groupjoin' event on the grapheditor.
     *
     * @param parentGroupId id of the parent group
     * @param childGroupId id of the child group
     * @param parentNode the node of the parent group
     * @param childNode the node of the child group
     * @param eventSource the event source to use (defaults to `EventSource.API`)
     * @param sourceEvent the source event to use, may be null
     */
    private afterGroupJoin(parentGroupId: string, childGroupId: string, parentNode?: Node, childNode?: Node, eventSource: EventSource = EventSource.API, sourceEvent?: Event) {
        this.dispatchGroupChangeEvent('groupjoin', eventSource, parentGroupId, childGroupId, parentNode, childNode, sourceEvent);
    }

    /**
     * Dispatch a 'groupleave' event on the grapheditor.
     *
     * @param parentGroupId id of the parent group
     * @param childGroupId id of the child group
     * @param parentNode the node of the parent group
     * @param childNode the node of the child group
     * @param eventSource the event source to use (defaults to `EventSource.API`)
     * @param sourceEvent the source event to use, may be null
     */
    private afterGroupLeave(parentGroupId: string, childGroupId: string, parentNode?: Node, childNode?: Node, eventSource: EventSource = EventSource.API, sourceEvent?: Event) {
        this.dispatchGroupChangeEvent('groupleave', eventSource, parentGroupId, childGroupId, parentNode, childNode, sourceEvent);
    }


    /**
     * Dispatch a 'groupjoin' or 'groupleave' event on the grapheditor.
     *
     * @param eventType 'groupjoin' or 'groupleave'
     * @param parentGroupId id of the parent group
     * @param childGroupId id of the child group
     * @param parentNode the node of the parent group
     * @param childNode the node of the child group
     * @param eventSource the event source to use
     * @param sourceEvent the source event to use, may be null
     */
    // eslint-disable-next-line max-len
    private dispatchGroupChangeEvent(eventType: 'groupjoin'|'groupleave', eventSource: EventSource, parentGroupId: string, childGroupId: string, parentNode: Node, childNode: Node, sourceEvent: Event) {
        const details: any = {
            eventSource: eventSource,
            parentGroup: parentGroupId,
            childGroup: childGroupId,
        };
        if (parentNode != null) {
            details.parentNode = parentNode;
        }
        if (childNode != null) {
            details.childNode = childNode;
        }
        if (sourceEvent != null) {
            details.sourceEvent = sourceEvent;
        }
        const event = new CustomEvent(eventType, {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: details,
        });
        this.graphEditor.dispatchEvent(event);
    }

    /**
     * Dispatch a 'groupdepthchange' event on the grapheditor.
     *
     * @param groupId the group for which the group depth has changed
     * @param oldDepth the old group depth
     * @param newDepth the new group depth
     * @param eventSource the event source to use
     * @param sourceEvent the source event to use, may be null
     */
    private dispatchGroupDepthChangedEvent(groupId, oldDepth: number, newDepth: number, eventSource: EventSource, sourceEvent?: Event) {
        const details: any = {
            eventSource: eventSource,
            group: groupId,
            oldDepth: oldDepth,
            newDepth: newDepth,
        };
        if (sourceEvent != null) {
            details.sourceEvent = sourceEvent;
        }
        const event = new CustomEvent('groupdepthchange', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: details,
        });
        this.graphEditor.dispatchEvent(event);
    }

    /**
     * Dispatch a 'grouptreechange' event on the grapheditor.
     *
     * @param groupId the group for whitch the tree information has changed
     * @param oldInfo the old tree information
     * @param newInfo the new tree information
     * @param eventSource the event source to use
     * @param sourceEvent the source event to use, may be null
     */
    private dispatchTreeChangedEvent(groupId, oldInfo: TreeInformation, newInfo: TreeInformation, eventSource: EventSource, sourceEvent?: Event) {
        const details: any = {
            eventSource: eventSource,
            group: groupId,
            oldTreeRoot: oldInfo.treeRoot,
            oldTreeParent: oldInfo.treeParent,
            oldTreeDepth: oldInfo.treeDepth,
            newTreeRoot: newInfo.treeRoot,
            newTreeParent: newInfo.treeParent,
            newTreeDepth: newInfo.treeDepth,
        };
        if (sourceEvent != null) {
            details.sourceEvent = sourceEvent;
        }
        const event = new CustomEvent('grouptreechange', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: details,
        });
        this.graphEditor.dispatchEvent(event);
    }
}
