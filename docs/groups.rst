Groups
======

Nodes of the grapheditor can be organized into groups.
The :js:class:`GroupingManager` keeps track of all group related information.
The Groups form a **directed acyclic graph**.
Additionally any part of the group graph may be used as a tree.
A group can only be part of one tree at a time.

The groups are managed independent from the nodes.
They are matched to the nodes by their id.

.. code-block:: ts

    const g: GraphEditor;
    const groupManager = g.groupingManager;

    g.nodeList = [
        { id: 1, title: 'A', type: 'simple-node', x: 0, y: 0 },
        { id: 2, title: 'A-1', type: 'simple-node', x: 100, y: -50 },
    ]

    // mark node 1 as the root for a tree
    groupManager.markAsTreeRoot(1);
    // add node 2 to the grou of node 1
    // node 2 is also joined to the tree of node 1
    groupManager.addToGroup(1, 2);

    // group ids are independent of node ids
    // node 3 can join the group of node 1 before
    // node 3 is actually added to the grapheditor
    groupManager.addToGroup(1, 3);

    g.addNode({ id: 3, title: 'A-2', type: 'simple-node', x: 50, y: 50 });


Changing the Bahaviour of Groups
--------------------------------

.. note::
    In a directed acyclic graph a group can have multiple parents.
    Most of the group behaviours need only a single parent to handle an event of a child.
    Deciding which parent should handle the event in a generic and deterministic way may lead to some nasty surprises.

    For this reason only the direct tree parent of a group is considered in such cases!


How a Group and its Children are Moved
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. warning::

    If nodes need to be moved from code use the :js:func:`GraphEditor.moveNode` function instead of changing the node coordinates directly!
    This method also considers all relavant group logic just like dragging the node to that position would.

The attributes :js:attr:`GroupBehaviour.moveChildrenAlongGoup` and :js:attr:`GroupBehaviour.captureChildMovement` change how node movement is performed by this group.

If :js:attr:`GroupBehaviour.moveChildrenAlongGoup` is ``true`` the group moves all children returned by :js:func:`GroupingManager.getAllChildrenOf` method if the group node itself is moved.

If :js:attr:`GroupBehaviour.captureChildMovement` is ``true`` and a child in the same tree as the group is moved the movement is instead captured by the group node.
The move is then performed as if the move happened for the group node instead.
With the decision function :js:func:`GroupBehaviour.captureChildMovementForNode` the decision can be made depending on the specific node.

.. seealso::
    For even more fine grained control ove child node movement use :js:func:`GroupBehaviour.beforeNodeMove`, :js:func:`GroupBehaviour.onNodeMoveStart` and :js:func:`GroupBehaviour.onNodeMoveEnd`.

1.  Move all nodes in the group if the group node is moved:

    .. code-block:: ts

        const g: GraphEditor;

        g.groupingManager.setGroupBehaviourOf(1, {
            moveChildrenAlongGoup: true,
            captureChildMovement: false,
        });

2.  Move the whole group if a child node (or the group node) is moved:

    .. code-block:: ts

        const g: GraphEditor;

        g.groupingManager.setGroupBehaviourOf(1, {
            moveChildrenAlongGoup: true,
            captureChildMovement: true,
        });

.. seealso:: See :js:func:`GraphEditor.onBeforeNodeMove` and :js:class:`NodeMovementInformation` for additional methods to customise node movement of groups.


How a Group Interacts with Edges
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

A group can capture and delegate incoming and outgoing edges.
This is currently only implemented for dragged edges!

Capturing a dragged edge lets the edge behave as if it was dragged to/from the group node instead of the original target/source node.

A edge dragged from the group node (or a captured edge) may then be delegated to another node.

.. warning::
    Edge delegation is not sanity checked!
    The edge can be delegated to *any* existing node of the graph.

    The bahaviour can be easily implemented using :js:func:`GroupingManager.getGroupCapturingIncomingEdge` or :js:func:`GroupingManager.getGroupCapturingOutgoingEdge` to replace the target/source and then using :js:func:`GroupBehaviour.delegateIncomingEdgeTargetToNode` or :js:func:`GroupBehaviour.delegateOutgoingEdgeSourceToNode` to get the final target/source of the edge.

Relevant attributes:

* :js:attr:`GroupBehaviour.captureOutgoingEdges`
* :js:func:`GroupBehaviour.captureOutgoingEdgesForNode`
* :js:func:`GroupBehaviour.delegateOutgoingEdgeSourceToNode`
* :js:attr:`GroupBehaviour.captureIncomingEdges`
* :js:func:`GroupBehaviour.captureIncomingEdgesForNode`
* :js:func:`GroupBehaviour.delegateIncomingEdgeTargetToNode`


How Nodes Can Join or Leave a Group
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Adding nodes to a group or removing nodes from a group with drag and drop is supported.
The group needs to specifically opt in for this to work!

To allow nodes joining the group use :js:attr:`GroupBehaviour.captureDraggedNodes` and :js:func:`GroupBehaviour.captureThisDraggedNode`.
Nodes will try to join the group if the coordinates of the node (:js:attr:`Node.x` and :js:attr:`Node.y`) are inside the svg elements of the group.

Excerpt of the code that tries to join a dragged node to a group:

.. code-block:: ts

    // get the client point from the graph coordinates
    const clientPoint = this.getClientPointFromGraphCoordinates(node);
    // getNodesFromPoint uses a browser api to get all elements under the client point
    const possibleTargetNodes = this.getNodesFromPoint(clientPoint.x, clientPoint.y);
    // only try to join the top most group (but filter out the currently dragged node for this)
    const targetNode = possibleTargetNodes.find(target => target.id !== node.id);

.. warning:: The function :js:func:`GraphEditor.getNodesFromPoint` that is used to find the possible group to relies on the **fully rendered** svg!

To allow nodes leaving the group use :js:attr:`GroupBehaviour.allowDraggedNodesLeavingGroup` and :js:func:`GroupBehaviour.allowThisDraggedNodeLeavingGroup`.

To fix a node to a position relative to the group node use :js:attr:`GroupBehaviour.childNodePositions`.

Relevant attributes:

* :js:attr:`GroupBehaviour.allowFreePositioning`
* :js:attr:`GroupBehaviour.captureDraggedNodes`
* :js:func:`GroupBehaviour.captureThisDraggedNode`
* :js:attr:`GroupBehaviour.allowDraggedNodesLeavingGroup`
* :js:func:`GroupBehaviour.allowThisDraggedNodeLeavingGroup`
* :js:func:`GroupBehaviour.afterNodeJoinedGroup`
* :js:func:`GroupBehaviour.afterNodeLeftGroup`
* :js:attr:`GroupBehaviour.childNodePositions`
* :js:attr:`GroupBehaviour.occupiedDropZones`

.. seealso::
    The default implementation relevant for node joining/leaving with drag and drop:

    * :js:func:`defaultCaptureThisDraggedNode`
    * :js:func:`defaultBeforeNodeMove`
    * :js:func:`defaultAfterNodeJoinedGroup`
    * :js:func:`defaultAfterNodeLeftGroup`


Node Drop Zones
"""""""""""""""

Node drop zones are a way to limit where and how many nodes can join a group with drag and drop.

A drop zone can be any svg element inside a node that has a :js:func:`getBBox()` method.
To make a drop zone out of an element add the attribute ``data-node-drop-zone`` with the id of the drop zone to that element.
The drop zones are updated every :js:func:`~GraphEditor.completeRender` and tracked for every node individually.

A drop zone can also have a filter that restricts the node types that can be dropped in that zone.
The filter is specified with the ``data-node-type-filter`` attribute on the drop zone element.
The filter string is a space seperated string of node types that are to be added to the :js:attr:`NodeDropZone.whitelist` or :js:attr:`NodeDropZone.blacklistlist`.
Types starting with an exclamation mark will be added to the blacklist without the exclamation mark.

Examples of node type filters:

*   ``data-node-type-filter="!group-node"``

    | :js:attr:`NodeDropZone.blacklistlist`: ``set(['group-node',])``
    | :js:attr:`NodeDropZone.whitelist`: ``set()``

*   ``data-node-type-filter="child-node"``

    | :js:attr:`NodeDropZone.blacklistlist`: ``set()``
    | :js:attr:`NodeDropZone.whitelist`: ``set(['child-node',])``

*   ``data-node-type-filter="child-node !group-node"``

    | :js:attr:`NodeDropZone.blacklistlist`: ``set(['group-node',])``
    | :js:attr:`NodeDropZone.whitelist`: ``set(['child-node',])``

Example drop zone:

.. code-block:: html

    <rect
        width="95" height="35" x="-47.5" y="-17.5"
        data-node-drop-zone="a"
        data-node-type-filter="!group-node">
    </rect>

.. note::
    When a dragged node joins or leaves a group the graph is updated with :js:func:`GraphEditor.completeRender`
    instead of just updating the positions of the graph elements.

.. seealso::

    For furthor information on how the drop zones are used to position nodes see the documentation for:

    * :js:attr:`GroupBehaviour.allowFreePositioning`
    * :js:func:`defaultCaptureThisDraggedNode`
    * :js:func:`defaultBeforeNodeMove`
    * :js:func:`defaultAfterNodeJoinedGroup`
    * :js:func:`defaultAfterNodeLeftGroup`


Group Related Events
--------------------

The events described in this section are dipatched on the grapheditor node.
They can be used like all other events described in :ref:`grapheditor:component events`.

.. warning::

    Custom events get dispatched synchronously!

.. hint::

    All events have an attribute ``eventSource`` in the event detail that can have the following values:

    * ``INTERNAL`` for events triggered by internal/unknown source
    * ``API`` for events triggered using the public API.
    * ``USER_INTERACTION`` for events triggered by the user interacting with the graph.

    The eventSource can be used in event listeners to ignore all events triggered by using the API.


.. describe:: groupjoin

    Fired when a node or group joins another group.

    **Example** ``detail``

    .. code-block:: ts

        {
            "parentGroup": parentGroupId,
            "childGroup": childGroupId,

            // the following attributes may not be present
            "sourceEvent": {},
            "parentNode": {
                "id": parentGroupId,
                "x": 0,
                "y": 0
            },
            "childNode": {
                "id": childGroupId,
                "x": 0,
                "y": 0
            }
        }

.. describe:: groupleave

    Fired when a node or group leaves a group.

    **Example** ``detail``

    .. code-block:: ts

        {
            "parentGroup": parentGroupId,
            "childGroup": childGroupId,

            // the following attributes may not be present
            "sourceEvent": {},
            "parentNode": {
                "id": parentGroupId,
                "x": 0,
                "y": 0
            },
            "childNode": {
                "id": childGroupId,
                "x": 0,
                "y": 0
            }
        }

.. describe:: groupdepthchange

    Fired when a group changes its depth in the acyclic directed graph.

    **Example** ``detail``

    .. code-block:: ts

        {
            "group": groupId,
            "oldDepth": 0,
            "newDepth": 1,

            // the following attributes may not be present
            "sourceEvent": {}
        }

.. describe:: grouptreechange

    Fired when a group changes its tree parent or tree root.

    **Example** ``detail``

    .. code-block:: ts

        {
            "group": groupId,
            "oldTreeRoot": null,
            "oldTreeParent": null,
            "oldTreeDepth": null,
            "newTreeRoot": groupId,
            "newTreeParent": null,
            "newTreeDepth": 0,

            // the following attributes may not be present
            "sourceEvent": {}
        }
