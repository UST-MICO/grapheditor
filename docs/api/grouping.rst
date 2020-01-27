Grouping
========

.. js:autoclass:: GroupingManager
   :members:
   :exclude-members: _leaveTree, dispatchGroupChangeEvent, dispatchGroupDepthChangedEvent, dispatchTreeChangedEvent, getGroupWithProperty

NodeGroup
---------

.. note:: These classes are only used internally by the GroupingManager!

.. js:autoclass:: TreeInformation
   :members:

.. js:autoclass:: NodeGroup
   :members:

GroupBehaviour
--------------

.. js:autoclass:: GroupBehaviour
   :members:

.. js:method:: GroupBehaviourDecisionCallback(group, childGroup, groupNode, childNode, graphEditor)

    A function that given a group, a (candidate) child group and the corresponding nodes
    decides if a certain action can be done.

    :param string group: the group id of this group
    :param string childGroup: the group id of the group (or node) the action will be performed for
    :param Node groupNode: the node in the grapheditor with the same id as `group`, may be null.
    :param Node childNode: the node in the grapheditor with the same id as `childGroup`, may be null.
    :param GraphEditor graphEditor: the instance of the grapheditor.
    :returns: **boolean** – true iff the action should be performed.

.. js:method:: GroupBehaviourEdgeDelegationCallback(group, groupNode, edge, graphEditor)

    A function that given a group, the corresponding node and an edge
    decides which node should handle the edge.

    :param string group: the group id of this group
    :param Node groupNode: the node in the grapheditor with the same id as `group`, may be null.
    :param Edge edge: the (incoming or outgoing) edge
    :param GraphEditor graphEditor: the instance of the grapheditor.
    :returns: **string** – the id of an existing Node that should handle this edge (as its source or target)


Default Implementations for GroupBehaviour
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. js:autofunction:: defaultCaptureThisDraggedNode

.. js:autofunction:: defaultBeforeNodeMove

.. js:autofunction:: defaultAfterNodeJoinedGroup

.. js:autofunction:: defaultAfterNodeLeftGroup
