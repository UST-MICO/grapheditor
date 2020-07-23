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

Styling the Overlay
^^^^^^^^^^^^^^^^^^^

The resize overlay can be styled with css like nodes and edges.
Below is the structure of an example resize overlay inside the graph svg.
The ``resize-overlay```group contains one ``rect`` with the class ``outline`` and one group for each resize handle.
The resize handles use the static templates for markers.
Use the :js:attr:`~ResizeOverlayOptions.handleTemplate` (or :js:attr:`~ResizeOverlayOptions.cornerHandleTemplate`) setting to set the template to use.
All resize handles have the class ``resize-handle`` and classes corresponding to their position (``top``, ``bottom``, ``left``, ``right``) and type (``horizontal``, ``vertical``, ``corner``) of handle.

.. code-block:: html

    <svg slot="graph" class="graph-editor" width="100%" height="100%">
        <g class="zoom-group" transform="translate(473.956,136.98600000000002) scale(3.1212)">
            <g class="edges">…</g>
            <g class="nodes">…</g>
            <g class="resize-overlays"><!-- this will always be the last group in the dom -->
                <g class="resize-overlay" transform="translate(0,0)">
                    <rect class="outline" x="-15" y="-15" width="30" height="30" fill="none" stroke="black"></rect>
                    <g class="resize-handle corner top left" template="resize-handle" transform="translate(-15,-15)">…</g>
                    <g class="resize-handle corner top right" template="resize-handle" transform="translate(15,-15)">…</g>
                    <g class="resize-handle corner bottom right" template="resize-handle" transform="translate(15,15)">…</g>
                    <g class="resize-handle corner bottom left" template="resize-handle" transform="translate(-15,15)">…</g>
                    <g class="resize-handle horizontal left" template="resize-handle" transform="translate(-15,0)">…</g>
                    <g class="resize-handle horizontal right" template="resize-handle" transform="translate(15,0)">…</g>
                    <g class="resize-handle vertical top" template="resize-handle" transform="translate(0,-15)">…</g>
                    <g class="resize-handle vertical bottom" template="resize-handle" transform="translate(0,15)">…</g>
                </g>
            </g>
        </g>
    </svg>


Example for Styling the Overlay
"""""""""""""""""""""""""""""""

This example sets the mouse cursor to display a resizing cursor when hovering a resize handle.
The ``resize-handle`` marker template can be used as the resize handle template.

.. code-block:: html

    <svg slot="graph" class="graph-editor" width="100%" height="100%">
        <style>
            /* Limit interactivity of the outline */
            .resize-overlay > .outline {pointer-events: none;}
            /* Set cursors for resize handles */
            .resize-overlay > .vertical.top {cursor: n-resize;}
            .resize-overlay > .vertical.bottom {cursor: s-resize;}
            .resize-overlay > .horizontal.right {cursor: e-resize;}
            .resize-overlay > .horizontal.left {cursor: w-resize;}
            .resize-overlay > .corner.top.left {cursor: nw-resize;}
            .resize-overlay > .corner.top.right {cursor: ne-resize;}
            .resize-overlay > .corner.bottom.left {cursor: sw-resize;}
            .resize-overlay > .corner.bottom.right {cursor: se-resize;}
        </style>
        <defs class="templates">
            <g id="resize-handle" data-template-type="marker">
                <rect x="-2" y="-2" width="4" height="4"></rect>
            </g>
        </defs>
    </svg>


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

