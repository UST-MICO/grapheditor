Grapheditor
===========


Component Attributes
--------------------

.. describe:: nodes

   A json list of :js:class:`Node` objects. All ``'`` characters will be replaced with ``"`` before parsing the json!

.. describe:: edges

   A json list of :js:class:`Edge` objects. All ``'`` characters will be replaced with ``"`` before parsing the json!

.. _classes-attribute:

.. describe:: classes

   List of possible css classnames to set for edges or nodes. Same syntax as ``class`` attribute. (Can also be a json list.)

.. _view-mode-attribute:
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
            nodes="[{'id': 1, 'title': 'hello world', 'type': 'simple-node', 'x': 0, 'y': 0}, {'id': 2, 'title': 'HI2', 'type': 'simple-node', 'x': 150, 'y': 100}]"
            edges="[{'source': 1, 'target': 2}]"
            classes="bg-red bg-blue"
            mode="layout"
            zoom="both">
    </network-graph>




Component Styling
-----------------

It is possible to inject styles, :js:class:`Node` and :js:class:`Marker` templates into the component.
This is achieved by using the `slots <https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots>`_ mechanic.

To use custom styles with the component place a ``<style slot="style">`` tag inside the ``<network-graph>`` tag.
Styles can also be placed in a ``<style>`` tag inside the ``<svg slot="graph">`` used to render the graph.
Placing all graph related styles in the svg is recommended as it allows to simply save the current graph as a self contained svg.
There is also very limited support for completely dynamic styles with :ref:`dynamic content <grapheditor:dynamic content>`.

It is possible to set the svg content of Nodes and Markers using templates.
The templates are simply a svg group with the ``data-template-type`` inside the first ``<defs>`` tag of the provided svg (``<g data-template-type="node|marker">``).

:js:class:`Node` templates need to have the attribute ``data-template-type="node"`` and must have a unique id that corresponds to a specific :js:class:`Node` type.
:js:class:`Marker` templates need to have the attribute ``data-template-type="marker"`` and must also have a unique id.

.. code-block:: html

    <network-graph>
        <style slot="style">/* general styles go here */</style>
        <svg slot="graphs">
            <style>/* graph styles go here */</style>
            <defs><!-- templates go here --></defs>
        </svg>
    </network-graph>

It is also possible to change the default layering (nodes rendering above edges) in the provided svg:

.. code-block:: html

    <network-graph>
        <svg slot="graphs">
            <g class="zoom-group"> <!-- the zoom-groop is used for the pan and zoom transormations -->
                <g class="nodes"></g> <!-- the first group will be rendered below the following groups-->
                <g class="edges"></g>
            </g>
        </svg>
    </network-graph>


Styling Nodes
^^^^^^^^^^^^^

The structure of the svg around a single node looks like this:

.. code-block:: html

    <!-- container for all nodes -->
    <g class="nodes">

        <!-- container for single node -->
        <g class="node hovered" id="1" data-template="default" transform="translate(0,0)">
            <!-- template content -->

            <!-- link handles -->
            <g class="link-handle" transform="translate(0,-30)" data-template="default-marker">
                <circle fill="black" cx="0" cy="0" r="3"></circle>
            </g>
            <g class="link-handle" transform="translate(50,0)" data-template="default-marker">
                <circle fill="black" cx="0" cy="0" r="3"></circle>
            </g>
            <g class="link-handle" transform="translate(0,30)" data-template="default-marker">
                <circle fill="black" cx="0" cy="0" r="3"></circle>
            </g>
            <g class="link-handle" transform="translate(-50,0)" data-template="default-marker">
                <circle fill="black" cx="0" cy="0" r="3"></circle>
            </g>
        </g>

    </g>


All classes are set on the top level group (``<g class="node"></g>``) tag.
The top level group *always* has the ``node`` class.
To change the classlist of a node dynamically set the :js:attr:`GraphEditor.setNodeClass` (:ref:`details <grapheditor:styling nodes and edges with custom css classes>`).

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

It is possible to use text from the :js:class:`Node` object inside a templated node.
The template has to contain a ``text`` tag with an ``data-content`` attribute and the ``text`` class.
The ``data-content`` attribute is used to determine wich attribute of the :js:class:`Node` is used as text for this element.
To use a value of a nested Object as text source a path can be provided in ``data-content`` where the path segments are seperated by ``.``.
Currently arrays are not supported as a text source.

.. code-block:: html

    <text class="text" data-content="type" x="-40" y="10" width="80"></text>

For text wrapping a ``width`` or ``data-width`` attribute must be supplied.
To enable multiline text wrapping an additional ``height`` or ``data-height`` attribute must be supplied.
The wrapping behaviour can be partially controlled with the css attributes ``text-overflow``, ``word-break`` and ``line-height``.

Dynamic content
"""""""""""""""

To have the content of the node template change according to the node data use the following atrributes.

``data-content``
    Sets the text for this tag. Useful for ``<title>`` and ``<desc>`` tags. See :ref:`text injection <grapheditor:text injection>` for text wrapping.

``data-fill``
    Sets the ``fill`` attribute of the svg node.

``data-stroke``
    Sets the ``stroke`` attribute of the svg node.

``data-href``
    Sets the ``href`` attribute of ``<a>`` or ``<image>`` tags.

The content of these custom attributes is the path to the value in the node object where the path segments are seperated by ``.``.

Link handles
""""""""""""

:js:class:`Link handles <LinkHandle>` get calculated per node template.
The calculation uses the first element in the group with the class ``outline`` or just the first element in the group.
Tha calculation can be influenced with the ``data-link-handles`` attribute set at the dom element.

The following svg elements are supported for link handle calculation:

``circle``
    ``data-link-handles`` can either be ``all`` or ``minimal``

``rect``
    ``data-link-handles`` can either be ``all``, ``edges``, ``corners`` or ``minimal``

``polygon``
    ``data-link-handles`` can either be ``all``, ``edges``, ``corners`` or ``minimal``

``path``
    ``data-link-handles`` can either be ``all``, ``minimal`` or a number

``any``
    ``data-link-handles`` can either be ``all``, ``edges``, ``corners`` or ``minimal``

If ``data-link-handles`` is set to ``edges`` the midpoint between two corners will be added to the link handles.
If ``data-link-handles`` is set to ``corners`` the corners will be added to the link handles.
Setting ``all`` implies ``edges`` and ``corners``.
For path objects the link handles are spaced evenly on the path (``all`` = 8 handles, ``minimal`` = 4 handles).


Styling Edges
^^^^^^^^^^^^^

The structure of the svg around a single edge looks like this:

.. code-block:: html

    <!-- container for all edges -->
    <g class="edges">

        <!-- container for single edge with markers -->
        <g class="edge-group " id="s1,t2" >
            <path class="edge" fill="none" stroke="black" d="M50,0L51,0C53,0,56,0,63,16,33,80,66,86,83C93,100,96,100,98,100L100,100"></path>

            <!-- edge markers -->
            <g class="marker" data-template="arrow" transform="translate(100,100)scale(0.5)rotate(0)">
                <!-- marker template content -->
            </g>

            <!-- text components -->
            <text x="54" y="-32" class="text" width="30" data-click="TextClick" data-wrapped="true">Hello…</text>

            <!-- link handle to drag edge -->
            <g class="link-handle" transform="translate(92,94)" data-template="default-marker">
                <circle fill="black" r="3" cx="0" cy="0"></circle>
            </g>
        </g>

    </g>

All classes are set on the top level group (``<g class="edge-group"></g>``) tag.
The top level group *always* has the ``edge`` class.
To change the classlist of a edge dynamically set the :js:attr:`GraphEditor.setEdgeClass` (:ref:`details <grapheditor:styling nodes and edges with custom css classes>`).

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

Text-Components
"""""""""""""""

:js:class:`Edges <Edge>` can have a list of :js:class:`Text-Components <TextComponent>`.
To set the displayed text either use :js:attr:`value <TextComponent.value>` to set a specific text or :js:attr:`attributePath <TextComponent.attributePath>` to set the text based on an attribute of the edge.
The position of the Text can be controlled via the :js:attr:`positionOnLine <TextComponent.positionOnLine>` Attribute similar to the Markers.
A Text-Component must have a :js:attr:`width <TextComponent.width>` > 0 which is used to wrap the text.
For multiline text wrapping also set the :js:attr:`height <TextComponent.height>` attribute.

To adjust the styling of the displayed text use the :js:attr:`class <TextComponent.class>` attribute which is used to set class attribute of the svg ``text`` element.
The ``text`` element will always have the ``text`` class.
Normally the text origin is the left of the baseline.
This means that a single line text is to the right and above the calculated anchor point on the edge path.
This can be changed by the ``text-anchor`` css attribute.

The Text-Component will always try not to clip into nodes.
This is achieved by checking whether the text is nearer to the start or end of the edge and then checking for overlaps with the node at that endpoint.
If the text overlaps it gets pushed in the direction towards the center of the edge.
The :js:attr:`padding <TextComponent.padding>` is used as a buffer zone around the text.

Customising where edges attach to nodes
"""""""""""""""""""""""""""""""""""""""

:js:class:`Edges <Edge>` will snap to the nearest :js:class:`LinkHandle`.
:js:class:`Link handles <LinkHandle>` are :ref:`calculated per node template <grapheditor:link handles>`.
To customize the position where the edge attaches to nodes set the :js:attr:`calculateLinkHandlesForEdge <GraphEditor.calculateLinkHandlesForEdge>` callback.


Example Styling Usage
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: html

    <network-graph>
        <style slot="style">
            svg {width:100%; height: 100%}
        </style>
        <svg slot="graph">
            <style>
                .node {fill: aqua;}
                .link-handle {display: none; fill: black; opacity: 0.1;}
                .edge-group .link-handle {display: initial}
                .link-handle:hover {opacity: 0.7;}
                // the css transform overwrites the svg transform completely
                // and link handles are placed with a translate transformation
                // but the content of the link handle group can be scaled
                .link-handle>* {transition:transform 0.25s ease-out;}
                .link-handle:hover>* {transform: scale(1.5);}
                .text {fill: black;}
                .node.hovered {fill: red;}
                .node.selected {fill: green; content:attr(class)}
                .highlight-outgoing .edge {stroke: red;}
                .highlight-incoming .edge {stroke: green;}
                .highlight-outgoing .marker {fill: red;}
                .highlight-incoming .marker {fill: green;}
            </style>
            <defs>
                <g id="simple-node" data-template-type="node">
                    <rect width="100" height="60" x="-50" y="-30"></rect>
                    <text class="title text" data-content="title" data-click="title" x="-40" y="-10"></text>
                    <text class="text" data-content="type" x="-40" y="10" width="80"></text>
                </g>
                <g id="arrow" data-template-type="marker">
                    <path d="M -9 -5 L 1 0 L -9 5 z" />
                </g>
            </defs>
        </svg>
    </network-graph>


Styling nodes and edges with custom css classes
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

It is possible to style nodes and edges with custom css classes.
The network-graph component needs to know about all possible classes.
The list of possible classes can be set in the :ref:`classes attribute <classes-attribute>`.
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

    Fired when a user (de-)selects a :js:class:`Node`.

    **Example** ``detail``

    .. code-block:: ts

        {
            "selection": new Set<number|string>([1, 2, 5])
        }

.. describe:: nodeclick

    Fired when a user clicks on a :js:class:`Node`. The ``key`` can be used to create :ref:`custom buttons <example-events>`.

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

    Fired when a user enters a :js:class:`Node` with a mouse or pointer device.

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

    Fired when a user leaves a :js:class:`Node` with a mouse or pointer device.

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

    Fired when a :js:class:`Node` gets new coordinates.

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

    Fired when a :js:class:`Node` gets added to the graph.

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

    Fired when a :js:class:`Node` gets removed from the graph.

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

    Fired when a user clicks on a :js:class:`Edge`. The ``key`` can be used to create :ref:`custom buttons <example-events>`.

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

.. describe:: edgetextpositionchange

    Fired when a :js:class:`TextComponent` of an :js:class:`Edge` got moved by the user.
    This event could be used to limit the offset coordinates.

    **Example** ``detail``

    .. code-block:: ts

        {
            "sourceEvent": {},
            "text": {
                "offsetX": 10,
                "offsetY": 24
            },
            "edge": {
                "source": 1,
                "target": 2
            }
        }

.. describe:: edgeadd

    Fired when an :js:class:`Edge` gets added to the graph.

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

    Fired when an :js:class:`Edge` gets removed from the graph.

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

    Fired when a dragged :js:class:`Edge` was dropped over the void by the user.

    The event can be used to create a new :js:class:`Node` where the user dropped the :js:class:`Edge`.

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

This example uses a node template where one part has the ``data-click="remove"`` attribute.
This attribute is used in the event to populate the ``key`` attribute.
For custom buttons in :js:class:`Edges <Edge>` use markers with the :js:attr:`clickEventKey <Marker.clickEventKey>` attribute.

.. code-block:: html

    <network-graph>
        <svg slot="graph">
            <defs>
                <g id="simple-node" template-type="node">
                    <rect width="100" height="60" x="-50" y="-30"></rect>
                    <text class="text" data-click="remove" x="-40" y="-10">remove</text>
                </g>
            </defs>
        </svg>
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
   :members: nodeList, edgeList, mode, zoomMode, setMode, setZoomMode, setNodes, setEdges, addNode, getNode, removeNode, addEdge, getEdge, removeEdge, getEdgesBySource, getEdgesByTarget, completeRender, updateTextElements, zoomToBoundingBox, onCreateDraggedEdge, onDraggedEdgeTargetChange, onDropDraggedEdge, setNodeClass, setEdgeClass, calculateLinkHandlesForEdge

