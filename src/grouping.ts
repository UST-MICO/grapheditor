import { Node } from './node';
import GraphEditor from './grapheditor';
import { Edge, Point } from './edge';


class NodeGroup {
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


type GroupBehaviourDecisionCallback = (groupNode: Node, childNode: Node, graphEditor: GraphEditor) => boolean;
type GroupBehaviourEdgeDelegationCallback = (groupNode: Node, edge: Edge, graphEditor: GraphEditor) => string;


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

    afterNodeJoinedGroup?: (groupNode: Node, childNode: Node, graphEditor: GraphEditor, atPosition?: Point) => void;
    afterNodeLeftGroup?: (groupNode: Node, childNode: Node, graphEditor: GraphEditor) => void;
    beforeNodeMove?: (groupNode: Node, childNode: Node, newPosition: Point, graphEditor: GraphEditor) => void;

    occupiedDropZones?: Map<string, string>;
    childNodePositions?: Map<string, string|Point>;
}

// eslint-disable-next-line complexity
export function defaultBeforeNodeMove(this: GroupBehaviour, groupNode: Node, childNode: Node, newPosition: Point, graphEditor: GraphEditor) {
    const dropZones = graphEditor.getNodeDropZonesForNode(groupNode);
    if (dropZones != null) {
        if (this.occupiedDropZones == null) {
            this.occupiedDropZones = new Map();
        }
        if (this.childNodePositions == null) {
            this.childNodePositions = new Map();
        }
        let bestDropZone: string;
        let bestDistance: number;
        let lastDropZone: string;
        for (const [key, dropZone] of dropZones) {
            if (this.occupiedDropZones.has(key)) {
                if (this.occupiedDropZones.get(key) === childNode.id.toString()) {
                    lastDropZone = key;
                } else {
                    continue;
                }
            }
            const nodeType = childNode.type || 'default';
            if (!dropZone.whitelist.has(nodeType)) {
                // nodeType is not in whitelist
                if (dropZone.whitelist.size > 0) {
                    continue; // whitelist is not empty
                }
                if (dropZone.blacklist.has(nodeType)) {
                    continue; // nodeType is in blacklist
                }
            }
            const dropZonePos = {
                x: groupNode.x + dropZone.bbox.x + dropZone.bbox.width / 2,
                y: groupNode.y + dropZone.bbox.y + dropZone.bbox.height / 2,
            };
            const distance = ((newPosition.x - dropZonePos.x) ** 2) + ((newPosition.y - dropZonePos.y) ** 2);
            if (bestDistance == null || bestDistance > distance) {
                bestDistance = distance;
                bestDropZone = key;
            }
        }
        if (lastDropZone != null && lastDropZone !== bestDropZone) {
            this.occupiedDropZones.delete(lastDropZone);
        }
        if (bestDropZone != null) {
            this.occupiedDropZones.set(bestDropZone, childNode.id.toString());
            this.childNodePositions.set(childNode.id.toString(), bestDropZone);
        } else {
            this.childNodePositions.delete(childNode.id.toString());
        }
    }
}


export function defaultAfterNodeJoinedGroup(this: GroupBehaviour, groupNode: Node, childNode: Node, graphEditor: GraphEditor, atPosition?: Point) {
    if (this.beforeNodeMove != null) {
        this.beforeNodeMove(groupNode, childNode, atPosition ?? childNode, graphEditor);
    }
}


export function defaultAfterNodeLeftGroup(this: GroupBehaviour, groupNode: Node, childNode: Node, graphEditor: GraphEditor) {
    if (this.childNodePositions != null) {
        const position = this.childNodePositions.get(childNode.id.toString());
        if (typeof(position) === 'string') {
            this.occupiedDropZones?.delete(position);
        }
        this.childNodePositions.delete(childNode.id.toString());
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

    addNodeToGroup(groupId: string|number, nodeId: string|number, atPosition?: Point): void {
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
        if (group.treeRoot != null) {
            this.propagateTreeRoot(group, childGroup);
        }
        this.updateGroupDepth(childGroup);
        if (group.groupBehaviour?.afterNodeJoinedGroup != null) {
            const groupNode = this.graphEditor.getNode(groupId);
            const childNode = this.graphEditor.getNode(nodeId);
            group.groupBehaviour.afterNodeJoinedGroup(groupNode, childNode, this.graphEditor, atPosition);
        }
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

    private propagateTreeRoot(parent: NodeGroup, child: NodeGroup) {
        if (parent.treeRoot == null) {
            // parent is not part of a tree
            return;
        }
        if (child.treeRoot != null) {
            // child is already part of a tree
            return;
        }
        child.treeRoot = parent.treeRoot;
        child.treeParent = parent.groupId;
        child.treeDepth = parent.treeDepth + 1;
        child.children.forEach(cId => this.propagateTreeRoot(child, this.getGroupForNode(cId)));
    }

    private updateGroupDepth(group: NodeGroup) {
        let newDepth = 0;
        if (group.parents.size > 0) {
            group.parents.forEach(parentId => {
                const parentDepth = this.getGroupForNode(parentId).groupDepth;
                newDepth = Math.max(newDepth, parentDepth + 1);
            });
        }
        const depthChanged = group.groupDepth !== newDepth;
        group.groupDepth = newDepth;
        if (depthChanged) {
            group.children.forEach(childId => this.updateGroupDepth(this.getGroupForNode(childId)));
        }
    }

    removeNodeFromGroup(groupId: string|number, nodeId: string|number): void {
        const group = this.getGroupForNode(groupId);
        if (!group.children.has(nodeId.toString())) {
            return;
        }
        const childGroup = this.getGroupForNode(nodeId);
        group.children.delete(childGroup.groupId);
        childGroup.parents.delete(group.groupId);
        if (childGroup.treeRoot != null) {
            this._leaveTree(childGroup, childGroup.treeRoot, true);
        }
        this.updateGroupDepth(childGroup);
        if (group.groupBehaviour?.afterNodeLeftGroup != null) {
            const groupNode = this.graphEditor.getNode(groupId);
            const childNode = this.graphEditor.getNode(nodeId);
            group.groupBehaviour.afterNodeLeftGroup(groupNode, childNode, this.graphEditor);
        }
    }

    leaveTree(groupId: string|number, treeRootId: string|number): void {
        this._leaveTree(this.getGroupForNode(groupId), treeRootId.toString());
    }

    private _leaveTree(group: NodeGroup, treeRootId: string, rejoin: boolean= false) {
        if (group.treeRoot == null || group.treeRoot !== treeRootId) {
            return;
        }
        group.treeRoot = null;
        group.treeParent = null;
        group.treeDepth = null;
        group.children.forEach(cId => this._leaveTree(this.getGroupForNode(cId), treeRootId));
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
                this.propagateTreeRoot(closestParent, group);
            }
        }
    }

    joinTreeOfParent(groupId: string|number, treeParentId: string|number): void {
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
            this._leaveTree(group, group.treeRoot);
        }
        this.propagateTreeRoot(parentGroup, group);
    }

    markAsTreeRoot(groupId: string|number): void {
        const group = this.getGroupForNode(groupId);
        if (group.treeRoot != null && group.treeRoot !== group.groupId) {
            console.error(`Node ${groupId} is already part of tree ${group.treeRoot} and cannot become a treeRoot itself!`);
            return;
        }
        group.treeRoot = group.groupId;
        group.treeParent = null;
        group.treeDepth = 0;
        group.children.forEach(cId => this.propagateTreeRoot(group, this.getGroupForNode(cId)));
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
                if (groupDecision == null || groupDecision(this.graphEditor.getNode(parentGroup.groupId), childNode, this.graphEditor)) {
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
    getGroupCapturingDraggedNode(groupNode: Node, node: Node): string {
        const groupId = groupNode.id.toString();
        let currentGroup: NodeGroup = this.groupsById.get(groupId);

        // eslint-disable-next-line no-shadow, complexity
        const checkGroup = (group: NodeGroup, groupNode: Node, node: Node) => {
            const behaviour = group?.groupBehaviour;
            if (behaviour?.captureDraggedNodes ?? false) {
                const groupDecision: GroupBehaviourDecisionCallback = group.groupBehaviour.captureThisDraggedNode;
                if (groupDecision == null || groupDecision(groupNode, node, this.graphEditor)) {
                    if (behaviour.allowFreePositioning) {
                        return true;
                    }
                    const dropZones = this.graphEditor.getNodeDropZonesForNode(groupNode);
                    for (const [key, zone] of dropZones.entries()) {
                        if (behaviour.occupiedDropZones != null) {
                            if (behaviour.occupiedDropZones.has(key)) {
                                // drop zone is occupied
                                // eslint-disable-next-line max-depth
                                if (behaviour.occupiedDropZones.get(key) === node.id.toString()) {
                                    return true; // occupied by the node in question, this cannot happen normally...
                                }
                                continue;
                            }
                        }
                        // dropZone is not occupied, check if node type is allowed
                        const nodeType = node.type || 'default';
                        if (!zone.whitelist.has(nodeType)) {
                            // nodeType is not in whitelist
                            if (zone.whitelist.size > 0) {
                                continue; // whitelist is not empty
                            }
                            if (zone.blacklist.has(nodeType)) {
                                continue; // nodeType is in blacklist
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
        if (checkGroup(currentGroup, groupNode, node)) {
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
            if (checkGroup(currentGroup, currentGroupNode, node)) {
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

    getCanDraggedNodeLeaveGroup(groupId: string|number, childNode: Node): boolean {
        const groupBehaviour = this.getGroupBehaviourOf(groupId);
        if (groupBehaviour?.allowDraggedNodesLeavingGroup ?? false) {
            if (groupBehaviour.allowThisDraggedNodeLeavingGroup != null) {
                const groupNode = this.graphEditor.getNode(groupId);
                return groupBehaviour.allowThisDraggedNodeLeavingGroup(groupNode, childNode, this.graphEditor);
            }
            return true;
        }
        return false;
    }
}
