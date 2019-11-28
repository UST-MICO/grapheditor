class NodeGroup {
    readonly nodeId: string;

    readonly parents: Set<string>;
    readonly children: Set<string>;

    public treeRoot: string;
    public treeParent: string;
    public treeDepth: number;

    public groupBehaviour: GroupBehaviour;

    constructor(nodeId: string) {
        this.nodeId = nodeId;
        this.parents = new Set<string>();
        this.children = new Set<string>();
    }
}

export interface GroupBehaviour {

    moveChildrenAlongGoup?: boolean;
    captureChildMovement?: boolean;
}

export class GroupingManager {
    private groupsById: Map<string, NodeGroup>;

    constructor() {
        this.groupsById = new Map<string, NodeGroup>();
    }

    private getGroupForNode(nodeId: string|number) {
        const groupId = nodeId.toString();
        if (this.groupsById.has(groupId)) {
            return this.groupsById.get(groupId);
        }
        const newGroup = new NodeGroup(groupId);
        this.groupsById.set(groupId, newGroup);
        return newGroup;
    }

    addNodeToGroup(groupId: string|number, nodeId: string|number) {
        const group = this.getGroupForNode(groupId);
        const children = this.getAllChildrenOf(nodeId);
        if (children.has(group.nodeId)) {
            console.error(`Adding node ${nodeId} to group ${groupId} would create a cycle!`);
            return;
        }
        const childGroup = this.getGroupForNode(nodeId);
        group.children.add(childGroup.nodeId);
        childGroup.parents.add(group.nodeId);
        if (group.treeRoot != null) {
            this.propagateTreeRoot(group, childGroup);
        }
    }

    getChildrenOf(groupId: string|number) {
        return this.groupsById.get(groupId.toString())?.children ?? new Set<string>();
    }

    getParentsOf(groupId: string|number) {
        return this.groupsById.get(groupId.toString())?.parents ?? new Set<string>();
    }

    getTreeParentOf(groupId: string|number) {
        return this.groupsById.get(groupId.toString())?.treeParent;
    }

    getTreeRootOf(groupId: string|number) {
        return this.groupsById.get(groupId.toString())?.treeRoot;
    }

    getAllChildrenOf(groupId: string|number) {
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
        child.treeParent = parent.nodeId;
        child.treeDepth = parent.treeDepth + 1;
        child.children.forEach(cId => this.propagateTreeRoot(child, this.getGroupForNode(cId)));
    }

    removeNodeFromGroup(groupId: string|number, nodeId: string|number) {
        const group = this.getGroupForNode(groupId);
        const childGroup = this.getGroupForNode(nodeId);
        group.children.delete(childGroup.nodeId);
        childGroup.parents.delete(group.nodeId);
        if (childGroup.treeRoot != null) {
            this._leaveTree(childGroup, childGroup.treeRoot, true);
        }
    }

    leaveTree(groupId: string|number, treeRootId: string|number) {
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

    joinTreeOfParent(groupId: string|number, treeParentId: string|number) {
        const group = this.getGroupForNode(groupId);
        const parentGroup = this.getGroupForNode(treeParentId);
        if (!group.parents.has(parentGroup.nodeId)) {
            console.error(`Node ${groupId} cannot join the tree of ${treeParentId} because the Node is not a child of ${treeParentId}!`);
            return;
        }
        if (group.treeRoot === parentGroup.treeRoot && group.treeParent === parentGroup.nodeId) {
            return; // already in the right tree
        }
        if (group.treeRoot != null) {
            // leave old tree
            this._leaveTree(group, group.treeRoot);
        }
        this.propagateTreeRoot(parentGroup, group);
    }

    markAsTreeRoot(groupId: string|number) {
        const group = this.getGroupForNode(groupId);
        if (group.treeRoot != null && group.treeRoot !== group.nodeId) {
            console.error(`Node ${groupId} is already part of tree ${group.treeRoot} and cannot become a treeRoot itself!`);
            return;
        }
        group.treeRoot = group.nodeId;
        group.treeParent = null;
        group.treeDepth = 0;
        group.children.forEach(cId => this.propagateTreeRoot(group, this.getGroupForNode(cId)));
    }

    setGroupBehaviourOf(groupId: string|number, groupBehaviour: GroupBehaviour) {
        this.getGroupForNode(groupId).groupBehaviour = groupBehaviour;
    }

    getGroupBehaviourOf(groupId: string|number): GroupBehaviour {
        return this.groupsById.get(groupId.toString())?.groupBehaviour;
    }

    getGroupCapturingMovementOfChild(childId: string|number) {
        let group: NodeGroup = this.getGroupForNode(childId);
        while (group.treeParent != null) {
            const parent = this.getGroupForNode(group.treeParent);
            if (parent.groupBehaviour?.captureChildMovement ?? false) {
                group = parent;
            } else {
                return group.nodeId;
            }
        }
        return group.nodeId;
    }
}
