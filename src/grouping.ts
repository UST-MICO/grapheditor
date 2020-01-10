import { Node } from './node';
import GraphEditor, { EventSource } from './grapheditor';
import { Edge, Point } from './edge';
import { filterDropzonesByType, calculateSquaredDistanceFromNodeToDropZone } from './drop-zone';


export interface TreeInformation {
    treeRoot: string;
    treeParent: string;
    treeDepth: number;
}


export class NodeGroup implements TreeInformation {
    readonly groupId: string;

    readonly parents: Set<string>;
    readonly children: Set<string>;
    public groupDepth: number;

    public treeRoot: string;
    public treeParent: string;
    public treeDepth: number;

    public groupBehaviour: GroupBehaviour;

    constructor(nodeId: string) {
        this.groupId = nodeId;
        this.parents = new Set<string>();
        this.children = new Set<string>();
        this.groupDepth = 0;
    }
}


export type GroupBehaviourDecisionCallback = (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) => boolean;
export type GroupBehaviourEdgeDelegationCallback = (group: string, groupNode: Node, edge: Edge, graphEditor: GraphEditor) => string;


export interface GroupBehaviour {

    moveChildrenAlongGoup?: boolean;
    captureChildMovement?: boolean;
    captureChildMovementForNode?: GroupBehaviourDecisionCallback;

    captureOutgoingEdges?: boolean;
    captureOutgoingEdgesForNode?: GroupBehaviourDecisionCallback;
    delegateOutgoingEdgeSourceToNode?: GroupBehaviourEdgeDelegationCallback;

    captureIncomingEdges?: boolean;
    captureIncomingEdgesForNode?: GroupBehaviourDecisionCallback;
    delegateIncomingEdgeTargetToNode?: GroupBehaviourEdgeDelegationCallback;

    captureDraggedNodes?: boolean;
    allowFreePositioning?: boolean;
    captureThisDraggedNode?: GroupBehaviourDecisionCallback;

    allowDraggedNodesLeavingGroup?: boolean;
    allowThisDraggedNodeLeavingGroup?: GroupBehaviourDecisionCallback;

    afterNodeJoinedGroup?: (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor, atPosition?: Point) => void;
    afterNodeLeftGroup?: (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) => void;

    onNodeMoveStart?: (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) => void;
    beforeNodeMove?: (group: string, childGroup: string, groupNode: Node, childNode: Node, newPosition: Point, graphEditor: GraphEditor) => void;
    onNodeMoveEnd?: (group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) => void;

    occupiedDropZones?: Map<string, string>;
    childNodePositions?: Map<string, string|Point>;
}

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
            if (this.occupiedDropZones.has(dropZone.id)) {
                if (this.occupiedDropZones.get(dropZone.id) === childNode.id.toString()) {
                    lastDropZone = dropZone.id;
                } else {
                    continue;
                }
            }
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


// eslint-disable-next-line max-len
export function defaultAfterNodeJoinedGroup(this: GroupBehaviour, group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor, atPosition?: Point) {
    if (this.beforeNodeMove != null) {
        this.beforeNodeMove(group, childGroup, groupNode, childNode, atPosition ?? childNode, graphEditor);
    }
}


export function defaultAfterNodeLeftGroup(this: GroupBehaviour, group: string, childGroup: string, groupNode: Node, childNode: Node, graphEditor: GraphEditor) {
    if (this.childNodePositions != null) {
        const position = this.childNodePositions.get(childGroup);
        if (typeof(position) === 'string') {
            this.occupiedDropZones?.delete(position);
        }
        this.childNodePositions.delete(childGroup);
    }
}


export class GroupingManager {
    private groupsById: Map<string, NodeGroup>;

    private graphEditor: GraphEditor;

    constructor(graphEditor: GraphEditor) {
        this.groupsById = new Map<string, NodeGroup>();
        this.graphEditor = graphEditor;
    }

    private getGroupForNode(nodeId: string|number) {
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

    addNodeToGroup(groupId: string|number, nodeId: string|number, atPosition?: Point, eventSource: EventSource = EventSource.API, sourceEvent?: Event): void {
        const group = this.getGroupForNode(groupId);
        if (group.children.has(nodeId.toString())) {
            return;
        }
        if (group.groupId === nodeId.toString()) {
            console.error(`Node ${nodeId} tryed to join itself!`);
            return;
        }
        const children = this.getAllChildrenOf(nodeId);
        if (children.has(group.groupId)) {
            console.error(`Adding node ${nodeId} to group ${groupId} would create a cycle!`);
            return;
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
    }

    getChildrenOf(groupId: string|number): Set<string> {
        return this.groupsById.get(groupId.toString())?.children ?? new Set<string>();
    }

    getParentsOf(groupId: string|number): Set<string> {
        return this.groupsById.get(groupId.toString())?.parents ?? new Set<string>();
    }

    getGroupDepthOf(groupId: string|number): number {
        return this.groupsById.get(groupId.toString())?.groupDepth;
    }

    getTreeParentOf(groupId: string|number): string {
        return this.groupsById.get(groupId.toString())?.treeParent;
    }

    getTreeRootOf(groupId: string|number): string {
        return this.groupsById.get(groupId.toString())?.treeRoot;
    }

    getTreeDepthOf(groupId: string|number): number {
        return this.groupsById.get(groupId.toString())?.treeDepth;
    }

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

    removeNodeFromGroup(groupId: string|number, nodeId: string|number, eventSource: EventSource = EventSource.API, sourceEvent?: Event): void {
        const group = this.getGroupForNode(groupId);
        if (!group.children.has(nodeId.toString())) {
            return;
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
    }

    leaveTree(groupId: string|number, treeRootId: string|number, eventSource: EventSource = EventSource.API, sourceEvent?: Event): void {
        this._leaveTree(this.getGroupForNode(groupId), treeRootId.toString(), false, eventSource, sourceEvent);
    }

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
                if (closestParent == null || parent.treeDepth < closestParent.treeDepth) {
                    closestParent = parent;
                }
            });
            if (closestParent != null) {
                this.propagateTreeRoot(closestParent, group, eventSource, sourceEvent);
            }
        }
    }

    joinTreeOfParent(groupId: string|number, treeParentId: string|number, eventSource: EventSource = EventSource.API, sourceEvent?: Event): void {
        const group = this.getGroupForNode(groupId);
        const parentGroup = this.getGroupForNode(treeParentId);
        if (!group.parents.has(parentGroup.groupId)) {
            console.error(`Node ${groupId} cannot join the tree of ${treeParentId} because the Node is not a child of ${treeParentId}!`);
            return;
        }
        if (group.treeRoot === parentGroup.treeRoot && group.treeParent === parentGroup.groupId) {
            return; // already in the right tree
        }
        if (group.treeRoot != null) {
            // leave old tree
            this._leaveTree(group, group.treeRoot, false, eventSource, sourceEvent);
        }
        this.propagateTreeRoot(parentGroup, group, eventSource, sourceEvent);
    }

    markAsTreeRoot(groupId: string|number, eventSource: EventSource = EventSource.API, sourceEvent?: Event): void {
        const group = this.getGroupForNode(groupId);
        if (group.treeRoot != null && group.treeRoot !== group.groupId) {
            console.error(`Node ${groupId} is already part of tree ${group.treeRoot} and cannot become a treeRoot itself!`);
            return;
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
    }

    setGroupBehaviourOf(groupId: string|number, groupBehaviour: GroupBehaviour): void {
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

    getGroupBehaviourOf(groupId: string|number): GroupBehaviour {
        const group = this.groupsById.get(groupId.toString());
        if (group == null) {
            return null;
        }
        const groupBehaviour = group.groupBehaviour ?? {};
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

    protected getGroupWithProperty(childNode: Node, groupProperty: string, groupDecisionCallback: string, strategy: 'closest-parent' | 'largest-group'): string {
        const childId = childNode.id.toString();
        let currentGroup: NodeGroup = this.groupsById.get(childId); // the child group is never checked
        let validGroup: string;
        while (currentGroup?.treeParent != null && currentGroup.groupId !== currentGroup.treeRoot) {
            const parentGroup = this.getGroupForNode(currentGroup.treeParent);
            if (parentGroup.groupBehaviour[groupProperty]) {
                const groupDecision: GroupBehaviourDecisionCallback = parentGroup.groupBehaviour[groupDecisionCallback];
                if (groupDecision == null || groupDecision(parentGroup.groupId, childId, this.graphEditor.getNode(parentGroup.groupId), childNode, this.graphEditor)) {
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

    getGroupCapturingMovementOfChild(child: Node): string {
        return this.getGroupWithProperty(child, 'captureChildMovement', 'captureChildMovementForNode', 'largest-group');
    }

    getGroupCapturingOutgoingEdge(child: Node): string {
        return this.getGroupWithProperty(child, 'captureOutgoingEdges', 'captureOutgoingEdgesForNode', 'closest-parent');
    }

    getGroupCapturingIncomingEdge(child: Node): string {
        return this.getGroupWithProperty(child, 'captureIncomingEdges', 'captureIncomingEdgesForNode', 'closest-parent');
    }

    // eslint-disable-next-line complexity
    getGroupCapturingDraggedNode(groupId: string|number, childGroupId: string|number, groupNode: Node, node: Node): string {
        let currentGroup: NodeGroup = this.groupsById.get(groupId.toString());

        // eslint-disable-next-line no-shadow
        const checkGroup = (groupId: string, childId: string, group: NodeGroup, groupNode: Node, node: Node) => {
            const behaviour = group?.groupBehaviour;
            if (behaviour?.captureDraggedNodes ?? false) {
                const groupDecision: GroupBehaviourDecisionCallback = group.groupBehaviour.captureThisDraggedNode;
                if (groupDecision == null || groupDecision(groupId, childId, groupNode, node, this.graphEditor)) {
                    if (behaviour.allowFreePositioning) {
                        return true;
                    }
                    const dropZones = this.graphEditor.getNodeDropZonesForNode(groupNode);
                    for (const zone of filterDropzonesByType(dropZones, node.type)) {
                        if (behaviour.occupiedDropZones != null) {
                            if (behaviour.occupiedDropZones.has(zone.id)) {
                                // drop zone is occupied
                                // eslint-disable-next-line max-depth
                                if (behaviour.occupiedDropZones.get(zone.id) === node.id.toString()) {
                                    return true; // occupied by the node in question, this cannot happen normally...
                                }
                                continue;
                            }
                        }
                        return true;
                    }
                }
            }
            return false;
        };

        const allChildren = this.getAllChildrenOf(node.id);

        // check first group
        if (checkGroup(currentGroup?.groupId, childGroupId.toString(), currentGroup, groupNode, node)) {
            // found a group
            if (currentGroup.groupId === node.id.toString()) {
                return; // cannot join itself
            }
            if (allChildren?.has(currentGroup.groupId) ?? false) {
                return; // but cannot join the found group as it would create a cycle!
            }
            return currentGroup.groupId;
        }

        // check group tree
        while (currentGroup?.treeParent != null && currentGroup.groupId !== currentGroup.treeRoot) {
            currentGroup = this.getGroupForNode(currentGroup.treeParent);
            const currentGroupNode = this.graphEditor.getNode(currentGroup.groupId);
            if (checkGroup(currentGroup.groupId, childGroupId.toString(), currentGroup, currentGroupNode, node)) {
                // found a group
                if (currentGroup.groupId === node.id.toString()) {
                    return; // cannot join itself
                }
                if (allChildren?.has(currentGroup.groupId) ?? false) {
                    return; // but cannot join the found group as it would create a cycle!
                }
                return currentGroup.groupId;
            }
        }

        // no group found
        return null;
    }

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

    private afterGroupJoin(parentGroupId: string, childGroupId: string, parentNode?: Node, childNode?: Node, eventSource: EventSource = EventSource.API, sourceEvent?: Event) {
        this.dispatchGroupChangeEvent('groupjoin', eventSource, parentGroupId, childGroupId, parentNode, childNode, sourceEvent);
    }

    private afterGroupLeave(parentGroupId: string, childGroupId: string, parentNode?: Node, childNode?: Node, eventSource: EventSource = EventSource.API, sourceEvent?: Event) {
        this.dispatchGroupChangeEvent('groupleave', eventSource, parentGroupId, childGroupId, parentNode, childNode, sourceEvent);
    }

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
