Resizing Nodes
==============

.. note:: If Nodes should have dynamic dimensions they need a :doc:`dynamic template <dynamic-templates>`.

To add resizing functionality to a grapheditor instance first initialize a new :js:class:`ResizingManager` with the grapheditor instance.
Then the methods of the resizing manager can be used to resize a Node directly or show a overlay that can be used to resize the node by dragging the overlay's handles.

.. code-block:: ts

    var resizingManager = new ResizingManager(graphEditor);

    // directly resize nodeA
    rm.resizeNode(nodeA.id, /* width: */ 30, /* height: */ 30);

    // show the resize overlay for nodeA
    resizingManager.showResizeOverlay(nodeA.id);


Resizing Using the API
----------------------

There are two methods to resize a Node.
The first method :js:func:`~ResizingManager.resizeNode` takes new values for width and height.
The second method :js:func:`~ResizingManager.resizeNodeToBBox` takes the new dimensions of the node as a bounding box.
This node is then resized to the bounding box width and height and moved into the bounding box.
The box coordinates have to be given relative to the node coordinates.

.. note:: If more than one Node should be resized at once then the boolean flag ``updateGrapheditor`` can be set to ``false``.

    Be sure to call :js:func:`GraphEditor.completeRender` and :js:func:`ResizingManager.updateOverlays` (in that order!) after all Nodes are resized to update the graph and the overlays!


Resizing Using the Overlay
--------------------------

The resize overlay for a node can be shown with a call to :js:func:`~ResizingManager.showResizeOverlay`.
To hide the overlay again use :js:func:`~ResizingManager.hideResizeOverlay`.
If the resize overlay is visible for a node can be queried with :js:func:`~ResizingManager.isResizeOverlayVisible`.

Options for the resize overlay can be given when showing the resize overlay.
For a complete list of possible options see :js:class:`ResizeOverlayOptions`.
There are also various options to change the overlay handles or only show some of them.

Some Scenarios
^^^^^^^^^^^^^^

Preserving aspect ratio

    To preserve the aspect ratio while resizing use the options :js:attr:`~ResizeOverlayOptions.preserveRatio`.

Preserve aspect ratio only when dragging a corner

    Use :js:attr:`~ResizeOverlayOptions.preserveRatioOnDiagonals`. This will allow dragging in the horizontal or vertical direction to still change the aspect ratio.

Mirror all resizes at the center

    Use :js:attr:`~ResizeOverlayOptions.symmetric` to affect both horizontal and vertical resizes.
    To only affect either horizontal or vertical resizes use :js:attr:`~ResizeOverlayOptions.symmetricHorizontal` or :js:attr:`~ResizeOverlayOptions.symmetricVertical`.
    These options will also have an effect when dragging a corner handle!

Resize the node live with the overlay

    To resize the node live to match the overlay while dragging use the option :js:attr:`~ResizeOverlayOptions.liveResize`.

Limit the node size

    To limit the node size set :js:attr:`~ResizeOverlayOptions.minWidth`, :js:attr:`~ResizeOverlayOptions.minHeight`, :js:attr:`~ResizeOverlayOptions.maxWidth` or :js:attr:`~ResizeOverlayOptions.maxHeight`.
    Te prevent resizing in one direction entirely set the maximum the same as the minimum.


Resize Strategies
-----------------

The new dimensions (either from resizing with the api or with the overlay) are applied to the node by a :js:class:`ResizeStrategy`.
The :ref:`default resize strategy <api/resizing:default resizestrategy>` uses ``node.width`` and ``node.height`` to store the current dimensions.
If the new bounding box is not centered around (0,0) then the node is also moved to fit into that bounding box.

Different resize strategies can be registered in :js:attr:`ResizingManager.resizeStrategies`.
The string key for the registered resize strategy can then be used in :js:func:`~ResizingManager.resizeNode` or :js:func:`~ResizingManager.resizeNodeToBBox` or in the resize options.


Events
------

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


.. describe:: noderesize

    Fired after a node was resized.

    **Example** ``detail``

    .. code-block:: ts

        {
            "node": node,
            "oldBBox": oldBBox,
            "newBBox": newBBox,
        }

