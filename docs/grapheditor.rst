Grapheditor
===========


Component Attributes
--------------------

.. describe:: nodes

   A json list of ``Node`` objects. All ``'`` characters will be replaced with ``"`` before parsing the json!

.. describe:: edges

   A json list of ``Edge`` objects. All ``'`` characters will be replaced with ``"`` before parsing the json!

.. _classes-attribute:

.. describe:: classes

   List of possible css classnames to set for edges or nodes. Same syntax as ``class`` attribute. (Can also be a json list.)

.. describe:: mode

   The interaction mode of the graph.

   *  ``display`` allow no user interaction with the graph except selecting nodes.
   *  ``layout`` allow free layout manipulation by user.
   *  ``link`` allow creating and destroying links by user.
   *  ``select`` allow only selecting and deselecting nodes.

.. describe:: zoom

   Controls pan and zoom behaviour of graph.

   *  ``none`` graph will not pan/zoom at all.
   *  ``manual`` allow free pan/zoom by user.
   *  ``automatic`` graph will pan/zoom after (re-)render to show all nodes.
   *  ``both`` both manual and automatic.



Example Usage
^^^^^^^^^^^^^

.. code-block:: html

    <network-graph
            nodes="[{'id': 1, 'title': 'hello world', 'type': 'REST', 'x': 0, 'y': 0}, {'id': 2, 'title': 'HI2', 'type': 'gRPC', 'x': 150, 'y': 100}]"
            edges="[{'source': 1, 'target': 2}]"
            classes="node-type-a node-type-b"
            mode="layout"
            zoom="both">
    </network-graph>




Component Styling
-----------------

It is possible to inject styles and node templates into the component via ``template`` tags.

Style templates need to have the attribute ``template-type="style"`` and contain one ``<style>`` tag.

Node templates need to have the attribute ``template-type="node"`` and should have a unique id that corresponds to a specific node type.

Styling Nodes
^^^^^^^^^^^^^

.. code-block:: html

    <!-- container for all nodes -->
    <g class="nodes">

        <!-- container for single node -->
        <g class="node hovered" id="1" data-template="REST" transform="translate(0,0)">
            <!-- template content -->

            <!-- link handles -->
            <circle class="link-handle" fill="black" cx="0" cy="-30" r="3"></circle>
            <circle class="link-handle" fill="black" cx="50" cy="0" r="3"></circle>
            <circle class="link-handle" fill="black" cx="0" cy="30" r="3"></circle>
            <circle class="link-handle" fill="black" cx="-50" cy="0" r="3"></circle>
        </g>

    </g>


All classes are set on the top level group (``<g class="node"></g>``) tag.

List of special node classes
""""""""""""""""""""""""""""

``nodes``
    Special class for node container group.

``node``
    All nodes have the ``node`` class.

``hovered``
    This class is set if the node is hovered by the mouse or a pointer device.

``selected``
    This class is set if the node is currently selected.

``link-handle``
    Special class for link handles inside of node.

``outline``
    Special class for an svg element used to define the outline of the node for calculating link-handle positions.

``text``
    Special class to select all text elements that need to be updated with text from the node.

Text injection
""""""""""""""

It is possible to use text from the node object inside a templated node.
The template has to contain a ``text`` tag with an ``data-content`` attribute and the ``text`` class.
The ``data-content`` attribute is used to determine wich attribute of the node is used as text for this element.
To use a value of a nested Object as text source a path can be provided in ``data-content`` where the path segments are seperated by ``.``.
Currently arrays are not supported as a text source.

.. code-block:: html

    <text class="text" data-content="type" x="-40" y="10" width="80"></text>

For text wrapping a ``width`` or ``data-width`` attribute must be supplied.
To enable multiline text wrapping an additional ``height`` or ``data-height`` attribute must be supplied.
The wrapping behaviour can be partially controlled with the css attributes ``text-overflow``, ``word-break`` and ``line-height``.


Styling Edges
^^^^^^^^^^^^^

.. code-block:: html

    <!-- container for all edges -->
    <g class="edges">

        <!-- container for single edge with markers -->
        <g class="edge-group " id="s1,t2" >
            <path class="edge" fill="none" stroke="black" d="M50,0L51,0C53,0,56,0,63,16,33,80,66,86,83C93,100,96,100,98,100L100,100"></path>
            <g class="marker" data-template="arrow" transform="translate(100,100)scale(0.5)rotate(0)">
                <!-- marker template content -->
            </g>
            <circle class="link-handle" fill="black" r="3" cx="92" cy="94"></circle>
        </g>

    </g>

All classes are set on the top level group (``<g class="edge-group"></g>``) tag.

List of special edge classes
""""""""""""""""""""""""""""

``edges``
    Special class for edge-group container group.

``edge-group``
    Special class for edge container group.

``dragged``
    Special class for user dragged edge-groups.

``edge``
    Class for edge path.

``marker``
    Class for all edge markers.

``marker-end``
    Special class for marker at the end of the edge.

``link-handle``
    Class for edge drag handle.

``highlight-outgoing``
    Class to highlight outgoing edges of a selected or hovered node.

``highlight-incoming``
    Class to highlight incoming edges of a selected or hovered node.

Edge markers
""""""""""""

:js:class:`Edges <Edge>` can have a list of :js:class:`Markers <Marker>` that use marker templates for display.
For an arrowhead at the end of the edge use the special edge-end-marker :js:attr:`markerEnd <Edge.markerEnd>` together with a :js:attr:`lineOffset <Marker.lineOffset>` in the marker.
The :js:attr:`lineOffset <Marker.lineOffset>` controls how much the marker should extend beyond the end of the edge.

To update markers of dragged edges it is possible to set the function :js:func:`onCreateDraggedEdge <GraphEditor.onCreateDraggedEdge>`, :js:func:`onDraggedEdgeTargetChange <GraphEditor.onDraggedEdgeTargetChange>` and :js:func:`onDropDraggedEdge <GraphEditor.onDropDraggedEdge>`.


Example Styling Usage
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: html

    <network-graph>
        <template template-type="style">
            <style>
                .node {fill: aqua;}
                .link-handle {display: none; fill: black; opacity: 0.1; transition:r 0.25s ease-out;}
                .edge-group .link-handle {display: initial}
                .link-handle:hover {opacity: 0.7; r: 5;}
                .text {fill: black;}
                .node.hovered {fill: red;}
                .node.selected {fill: green; content:attr(class)}
                .highlight-outgoing .edge {stroke: red;}
                .highlight-incoming .edge {stroke: green;}
                .highlight-outgoing .marker {fill: red;}
                .highlight-incoming .marker {fill: green;}
            </style>
        </template>
        <template id="node" template-type="node">
            <rect width="100" height="60" x="-50" y="-30"></rect>
            <text class="title text" data-content="title" data-click="title" x="-40" y="-10"></text>
            <text class="text" data-content="type" x="-40" y="10" width="80"></text>
        </template>
        <template id="arrow" template-type="marker">
            <path d="M -9 -5 L 1 0 L -9 5 z" />
        </template>
    </network-graph>


Styling nodes and edges with custom css classes
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

It is possible to style nodes and edges with custom css classes.
The network-graph component needs to know about all possible :ref:`classes <classes-attribute>`.
To controll which class is set for a node or an edge set the functions :js:func:`setNodeClass <GraphEditor.setNodeClass>` or :js:func:`setEdgeClass <GraphEditor.setEdgeClass>`.

.. code-block:: html

    <network-graph classes="type-a type-b"></network-graph>

.. code-block:: js

    var graph = document.querySelector('network-graph');

    graph.setNodeClass = (className, node) => {
        return className === node.type);
    }

    graph.setEdgeClass = (className, edge, sourceNode, targetNode) => {
        if (targetNode == null) {
            return false;
        }
        return className === targetNode.type;
    }


Component Events
----------------

The graph component uses `custom events <https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Creating_and_triggering_events>`_. Custom event data can be accessed via the ``detail`` attribute.

.. warning::

    Custom events get dispatched synchronously!

.. hint::

    All events have an attribute ``eventSource`` in the event detail that can have the following values:

    * ``INTERNAL`` for events triggered by internal/unknown source
    * ``API`` for events triggered using the public API.
    * ``USER_INTERACTION`` for events triggered by the user interacting with the graph.

    The eventSource can be used in event listeners to ignore all events triggered by using the API.

.. describe:: modechange

    Fired after the interaction mode changed.

    **Example** ``detail``

    .. code-block:: ts

        {
            "oldMode": "layout",
            "newMode": "select"
        }

.. describe:: zoommodechange

    Fired after the zoom mode changed.

    **Example** ``detail``

    .. code-block:: ts

        {
            "oldMode": "none",
            "newMode": "both"
        }

.. describe:: selection

    Fired when a user (de-)selects a node.

    **Example** ``detail``

    .. code-block:: ts

        {
            "selection": new Set<number|string>([1, 2, 5])
        }

.. describe:: nodeclick

    Fired when a user clicks on a node. The ``key`` can be used to create :ref:`custom buttons <example-events>`.

    Use ``event.preventDefault()`` to prevent standard graph behaviour.

    **Example** ``detail``

    .. code-block:: ts

        {
            "sourceEvent": {},
            "node": {
                "id": 1,
                "x": 0,
                "y": 0
            },
            "key": "close"
        }


.. describe:: nodeenter

    Fired when a user enters a node with a mouse or pointer device.

    **Example** ``detail``

    .. code-block:: ts

        {
            "sourceEvent": {},
            "node": {
                "id": 1,
                "x": 0,
                "y": 0
            }
        }

.. describe:: nodeleave

    Fired when a user leaves a node with a mouse or pointer device.

    **Example** ``detail``

    .. code-block:: ts

        {
            "sourceEvent": {},
            "node": {
                "id": 1,
                "x": 0,
                "y": 0
            }
        }

.. describe:: nodepositionchange

    Fired when a node gets new coordinates.

    **Example** ``detail``

    .. code-block:: ts

        {
            "node": {
                "id": 1,
                "x": 0,
                "y": 0
            }
        }

.. describe:: nodeadd

    Fired when a node gets added to the graph.

    Use ``event.preventDefault()`` to prevent standard graph behaviour.

    **Example** ``detail``

    .. code-block:: ts

        {
            "node": {
                "id": 1,
                "x": 0,
                "y": 0
            }
        }

.. describe:: noderemove

    Fired when a node gets removed from the graph.

    Use ``event.preventDefault()`` to prevent standard graph behaviour.

    **Example** ``detail``

    .. code-block:: ts

        {
            "node": {
                "id": 1,
                "x": 0,
                "y": 0
            }
        }
.. describe:: edgeclick

    Fired when a user clicks on a edge.

    Use ``event.preventDefault()`` to prevent standard graph behaviour.

    **Example** ``detail``

    .. code-block:: ts

        {
            "sourceEvent": {},
            "edge": {
                "source": 1,
                "target": 2
            }
        }

.. describe:: edgeadd

    Fired when an edge gets added to the graph.

    Use ``event.preventDefault()`` to prevent standard graph behaviour.

    **Example** ``detail``

    .. code-block:: ts

        {
            "edge": {
                "source": 1,
                "target": 2
            }
        }

.. describe:: edgeremove

    Fired when an edge gets removed from the graph.

    Use ``event.preventDefault()`` to prevent standard graph behaviour.

    **Example** ``detail``

    .. code-block:: ts

        {
            "edge": {
                "source": 1,
                "target": 2
            }
        }

.. describe:: edgedrop

    Fired when a dragged edge was dropped over the void by the user.

    The event can be used to create a new node where the user dropped the edge.

    **Example** ``detail``

    .. code-block:: ts

        {
            "edge": {
                "source": 1,
                "target": null
            },
            "sourceNode": {
                "id": 1,
                "x": 0,
                "y": 0
            },
            "dropPosition": {x: 1, y: 1}
        }



.. _example-events:

Example Event Usage
^^^^^^^^^^^^^^^^^^^

This example uses a node template where one part has the ``data-click="remove"`` attribute. This attribute is used in the event to populate the ``key`` attribute.

.. code-block:: html

    <network-graph>
        <template id="node" template-type="node">
            <rect width="100" height="60" x="-50" y="-30"></rect>
            <text class="text" data-click="remove" x="-40" y="-10">remove</text>
        </template>
    </network-graph>
    <script>
        var graph = document.querySelector('network-graph');
        graph.addEventListener('nodeclick', function test(event) {
            console.log(event.type, event.detail);
            if (event.detail.key === 'remove') {
                event.preventDefault();
            }
        });
    </script>


Public API
----------

.. js:autoclass:: GraphEditor
   :members: nodeList, edgeList, mode, zoomMode, setMode, setZoomMode, setNodes, setEdges, addNode, getNode, removeNode, addEdge, getEdge, removeEdge, getEdgesBySource, getEdgesByTarget, completeRender, updateTextElements, zoomToBoundingBox, onCreateDraggedEdge, onDraggedEdgeTargetChange, onDropDraggedEdge, setNodeClass, setEdgeClass

