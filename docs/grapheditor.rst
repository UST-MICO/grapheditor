Grapheditor
===========


Component Attributes
--------------------

.. describe:: svg-template

    A **css selector** for the html template containing the full svg template to use in the grapheditor.

    .. note::
        Loading the svg from a html template into the shadow dom fully isolates the css from the main page.
        This makes it easier to have multiple grapheditors at the same time with different styles.
        Because of that loading the svg from a html template is the preferred method.

    .. code-block:: html

        <template id="graph-template">
            <svg>
                <style></style>
            </svg>
        </template>
        <network-graph svg-template="#graph-template"></network-graph>

    .. warning:: The html template must be in the dom before the grapheditor node.
        Otherwise the grapheditor may not be able to select and use the template.
        The template can also be manually loaded later with :js:func:`GraphEditor.reloadSvgTemplate`.

.. describe:: nodes

   A json list of :js:class:`Node` objects. All ``'`` characters will be replaced with ``"`` before parsing the json!

.. describe:: edges

   A json list of :js:class:`Edge` objects. All ``'`` characters will be replaced with ``"`` before parsing the json!

.. _classes-attribute:

.. describe:: classes

   List of possible css classnames to set for edges or nodes. Same syntax as ``class`` attribute. (Can also be a json list.)

.. _view-mode-attribute:
.. describe:: mode

   .. deprecated:: 7.0

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
   *  ``both`` DEFAULT; both manual and automatic.

.. describe:: select

   Controls the default node selection behaviour.
   This setting affects all interactive behaviours (node click, brush select) and the grapheditor API (e.g. :js:func:`~GraphEditor.changeSelected`, :js:func:`~GraphEditor.selectNode` and :js:func:`~GraphEditor.deselectNode`).

   Changes to this setting only apply to new selections.
   An already existing node selection will not be changed automatically.

   *  ``none`` prevents all node selections
   *  ``single`` only a single node can be selected at the same time
   *  ``multiple`` DEFAULT; multiple nodes can be selected at the same time

.. describe:: node-click

   Controls the default behaviour when clicking on a node.
   Events for node clicks will always fire.

   *  ``none`` no default action will be performed. Use this when a node click should trigger a custom action
   *  ``select`` DEFAULT; the selected status of the node will be toggled. If the selection mode is `single` all selected nodes will be deselected.
   *  ``link`` clicking on a node selects the node as the temporary edge source. Clicking on a second node creates (or removes)) an edge from the selected edge source to the clicked node.

.. describe:: node-drag

   Controls the drag behaviour of nodes.

   *  ``none`` nodes cannot be dragged around.
   *  ``move`` DEFAULT; dragging a node moves the node.
   *  ``link`` currently not implemented, will allow dragging links from the whole node instead of just the link handles of the node.

.. describe:: edge-drag

   Controls the drag behaviour of edges (when dragged from their drag handles).

   *  ``none`` edges cannot be dragged around.
   *  ``link`` DEFAULT; dragging edges can change to which nodes they are linkednd node creates (or removes)) an edge from the selected edge source to the clicked node.

.. describe:: background-drag

   Controls the drag behaviour when the whole graph is dragged around.
   Moving the graph around and zooming the graph are interdependent so this behaviour can also affect how zooming works.

   All modes (except ``none`` and ``move``) draw a visible brush on the screen.
   When the drag gesture is finished the action indicated by the current setting is performed.

   The brush can be styled using css.
   It uses the css class ``brush`` and is a direct decendent of the ``g.zoom-group`` node in the dom.

   *  ``none`` disables this behaviour completely. Only mousewheel zoom is allowed.
   *  ``move`` DEFAULT; dragging the graph moves it around (panning the graph).
   *  ``zoom`` zoom to fit the brush area to the available screen space.
   *  ``select`` select all nodes with coordinates that are inside of the brush box.
      This works best if the node coordinates correspond to the visual centers of the nodes.
      In single select mode the node closest to the brush center will be chosen.
      The brush does not work if the current selection mode is ``none``.
   *  ``custom`` draws the brush and fires the brush events without an active default behaviour. Use this to implement custom brush behaviours.



Example Usage
^^^^^^^^^^^^^

.. code-block:: html

    <network-graph
            nodes="[{'id': 1, 'title': 'hello world', 'type': 'simple-node', 'x': 0, 'y': 0}, {'id': 2, 'title': 'HI2', 'type': 'simple-node', 'x': 150, 'y': 100}]"
            edges="[{'source': 1, 'target': 2}]"
            classes="bg-red bg-blue"
            mode="layout"
            zoom="both"
            svg-template="#graph-template">
    </network-graph>




Component Styling
-----------------

It is possible to inject styles, :js:class:`Node` and :js:class:`Marker` templates into the component.
This is achieved by using the `slots <https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots>`_ mechanic.

.. warning:: The old styling method meant that every style was added to the global css scope.
    This makes the style slot essentially useless, thus it is deprecated.
    Styling is still supported with a ``<style>`` tag from inside the svg.

Styles can also be placed in a ``<style>`` tag inside the ``<svg>`` used to render the graph.
Placing all graph related styles in the svg is recommended as it allows to simply save the current graph as a self contained svg.
When the svg is loaded from a html template all styles are fully isolated from the global css styles.
There is also very limited support for completely dynamic styles with :ref:`dynamic content <static-templates:dynamic content>`.

.. warning:: The current preferred method to load an svg is to load it from an html template.
    See :ref:`grapheditor:component attributes` above for more information.

.. seealso:: It is possible to set the svg content of Nodes and Markers using templates.

    See the documentation for :doc:`static templates <static-templates>` and :doc:`dynamic templates <dynamic-templates>`.

.. code-block:: html

    <!-- new method (strongly recommended) -->
    <template id="graph-template">
        <svg>
            <style>/* graph styles go here (styles here are isolated!) */</style>
        </svg>
    </template>
    <network-graph svg-template="#graph-template"></network-graph>

    <!-- old method (discouraged) -->
    <network-graph>
        <svg slot="graphs">
            <style>/* graph styles go here (styles here are global!) */</style>
        </svg>
    </network-graph>

It is also possible to change the default layering (nodes rendering above edges) in the provided svg:

.. code-block:: html

    <template id="graph-template">
        <svg>
            <g class="zoom-group"> <!-- the zoom-groop is used for the pan and zoom transormations -->
                <g class="nodes"></g> <!-- the first group will be rendered below the following groups-->
                <g class="edges"></g>
            </g>
        </svg>
    </template>


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


.. seealso:: Setting custom css classes is also supported: :ref:`grapheditor:styling nodes and edges with custom css classes`.



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

.. hint:: The edge path can be changed with :doc:`edge-path-templates`.

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

``marker-special``
    Special class for marker at the start or end of the edge.

``marker-start``
    Special class for marker at the start of the edge.

``marker-end``
    Special class for marker at the end of the edge.

``link-handle``
    Class for edge drag handle.

``highlight-outgoing``
    Class to highlight outgoing edges of a selected or hovered node.

``highlight-incoming``
    Class to highlight incoming edges of a selected or hovered node.

Edge Drag Handles
"""""""""""""""""

:js:class:`Edges <Edge>` can have a list of :js:class:`EdgeDragHandles <EdgeDragHandle>` that use marker templates for display.
They behave like :js:class:`Markers <Marker>` (see :ref:`next section <grapheditor:edge markers>`).
If they are dragged the edge detaches from it's target node and follows the drag.

To create bidirectional edges set the :js:attr:`isBidirectional <Edge.isBidirectional>` attribute to ``true``.
Alternatively directly use a :js:class:`EdgeDragHandle` with :js:attr:`isReverseHandle <EdgeDragHandle.isReverseHandle>` to ``true`` to
simulate an edge that can be dragged from its source.
If such a :js:class:`EdgeDragHandle` is dragged the resulting dragged edge is a flipped version of the original edge with source and target switched.

.. hint::
    To determine if an edge was dragged from a :js:class:`EdgeDragHandle` with :js:attr:`isReverseHandle <EdgeDragHandle.isReverseHandle>` set ``true``
    compare the dragged edge source with the original edge source.

Edge Markers
""""""""""""

:js:class:`Edges <Edge>` can have a list of :js:class:`Markers <Marker>` that use marker templates for display.
For an arrowhead at the start or end of the edge use the special edge-end-markers :js:attr:`markerEnd <Edge.markerEnd>` and :js:attr:`markerStart <Edge.markerStart>`.
The attachement point of the edge line to the marker can be adjusted by setting the ``data-line-attachement-point`` attribute in the marker template (:ref:`example <grapheditor:example styling usage>`).
If the attribute is a single number it describes how far from the center of the template the edge attaches.
If the attribute is two numbers (seperated by a single space) the it describes a specific point in the template where the edge attaches to.

To update markers of dragged edges it is possible to set the function :js:func:`onCreateDraggedEdge <GraphEditor.onCreateDraggedEdge>`, :js:func:`onDraggedEdgeTargetChange <GraphEditor.onDraggedEdgeTargetChange>` and :js:func:`onDropDraggedEdge <GraphEditor.onDropDraggedEdge>`.

.. hint:: The position of the marker can be controlled with the attributes defined in :js:class:`PathPositionRotationAndScale` and :js:class:`RotationData`.

Text-Components
"""""""""""""""

:js:class:`Edges <Edge>` can have a list of :js:class:`Text-Components <TextComponent>`.
To set the displayed text either use :js:attr:`value <TextComponent.value>` to set a specific text or :js:attr:`attributePath <TextComponent.attributePath>` to set the text based on an attribute of the edge.
The position of the Text can be controlled via the :js:attr:`positionOnLine <PathPositionRotationAndScale.positionOnLine>` Attribute similar to the Markers.
A Text-Component must have a :js:attr:`width <TextComponent.width>` ``> 0`` which is used to wrap the text.
For multiline text wrapping also set the :js:attr:`height <TextComponent.height>` attribute.

The ``text`` element will always have the ``text`` class.

Normally the text origin is the left of the baseline.
This means that a single line text is to the right and above the calculated anchor point on the edge path.
This can be changed by the ``text-anchor`` css attribute.

The Text-Component will always try not to clip into nodes.
This is achieved by checking whether the text is nearer to the start or end of the edge and then checking for overlaps with the node at that endpoint.
If the text overlaps it gets pushed in the direction towards the center of the edge.
The :js:attr:`padding <TextComponent.padding>` is used as a buffer zone around the text.

.. hint:: The position of the text component can be controlled with the attributes defined in :js:class:`PathPositionRotationAndScale` and :js:class:`RotationData`.

Customising where edges attach to nodes
"""""""""""""""""""""""""""""""""""""""

:js:class:`Edges <Edge>` will snap to the nearest :js:class:`LinkHandle`.
:js:class:`Link handles <LinkHandle>` are :ref:`calculated per node template <static-templates:link handles>`.
To customize the position where the edge attaches to nodes set the :js:attr:`calculateLinkHandlesForEdge <GraphEditor.calculateLinkHandlesForEdge>` callback.

..seealso:: Documentation for :ref:`dynamic node templates <dynamic-templates:dynamic node templates>`.


Example Styling Usage
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: html

    <template id="graph-template">
        <svg>
            <style>
                svg {width:100%; height: 100%}
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
                <g id="arrow" data-template-type="marker" data-line-attachement-point="-9 0">
                    <path d="M -9 -4 L 0 0 L -9 4 z" />
                </g>
            </defs>
        </svg>
    </template>
    <network-graph svg-template="#graph-template"></network-graph>


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
        return className === node.type;
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


.. describe:: svginitialized

    Fired after the zoom has changed.

    **Example** ``detail``

    .. code-block:: ts

        {
            "newSVG": this.svg,
            "oldSVG": oldSVG,
        }

.. describe:: modechange

    .. warning:: This event was removed with the deprecation of the mode attribute.

.. describe:: zoommodechange

    Fired after the zoom mode changed.

    **Example** ``detail``

    .. code-block:: ts

        {
            "oldMode": "none",
            "newMode": "both"
        }

.. describe:: zoomchange

    Fired after the zoom has changed.

    **Example** ``detail``

    .. code-block:: ts

        {
            "oldZoom": d3-zoom.ZoomTransform,
            "newZoom": d3-zoom.ZoomTransform,
            "currentViewWindow": graphEditor.currentViewWindow,
        }

.. describe:: render

    Fired after the graph was completely or partially updated.

    The attribute ``rendered`` can be one of the following:

    ``complete``

        The method :js:func:`GraphEditor.completeRender` was used to update the graph.

    ``text``

        The method :js:func:`GraphEditor.updateTextElements` was used to update the graph.

    ``classes``

        The method :js:func:`GraphEditor.updateNodeClasses` was used to update the graph.

    ``positions``

        The method :js:func:`GraphEditor.updateGraphPositions` was used to update the graph.

    **Example** ``detail``

    .. code-block:: ts

        {
            "rendered": "complete",
        }

.. describe:: backgroundclick

    Fired when the graph background was clicked.

    The event contains the point where the click happened in graph coordinates.

    **Example** ``detail``

    .. code-block:: ts

        {
            sourceEvent: {},
            point: {
                x: 0,
                y: 0,
            },
        }

.. describe:: brushdrag

    Fired when the brush area changes.

    The event contains the current brush area and the current brush interaction settings (the value of the ``background-drag`` attribute; see :ref:`grapheditor:component attributes`).

    **Example** ``detail``

    .. code-block:: ts

        {
            sourceEvent: {},
            brushArea: {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            },
            brushMode: "select",
        }

.. describe:: brush

    Fired before the current active brush action is performed.

    The event contains the current brush area and the current brush interaction settings (the value of the ``background-drag`` attribute; see :ref:`grapheditor:component attributes`).

    **Example** ``detail``

    .. code-block:: ts

        {
            sourceEvent: {},
            brushArea: {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
            },
            brushMode: "select",
        }

.. describe:: selection

    Fired when a user (de-)selects a :js:class:`Node`.

    .. hint::

        Use :js:func:`GraphEditor.selectNode`, :js:func:`GraphEditor.deselectNode` and
        :js:func:`GraphEditor.changeSelected` to change the selection programmatically.
        Use :js:attr:`GraphEditor.selected` to get the current selection outside of events.

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

.. describe:: nodedragstart

    Fired before a :js:class:`Node` is moved via drag and drop or :js:func:`GraphEditor.moveNode`.

    **Example** ``detail``

    .. code-block:: ts

        {
            "node": {
                "id": 1,
                "x": 0,
                "y": 0
            }
            "affectedChildren": new Set<string>()
        }

.. describe:: nodedragend

    Fired after a :js:class:`Node` was moved via drag and drop or :js:func:`GraphEditor.moveNode`.

    **Example** ``detail``

    .. code-block:: ts

        {
            "node": {
                "id": 1,
                "x": 0,
                "y": 0
            }
            "affectedChildren": new Set<string>()
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

.. describe:: edgetextdragstart

    Fired before a :js:class:`TextComponent` is moved via drag and drop.

    **Example** ``detail``

    .. code-block:: ts

        {
            "text": {
                "offsetX": 10,
                "offsetY": 24
            },
            "edge": {
                "source": 1,
                "target": 2
            }
        }

.. describe:: edgetextdragend

    Fired after a :js:class:`TextComponent` was moved via drag and drop.

    **Example** ``detail``

    .. code-block:: ts

        {
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

    <template id="graph-template">
        <svg slot="graph">
            <defs>
                <g id="simple-node" template-type="node">
                    <rect width="100" height="60" x="-50" y="-30"></rect>
                    <text class="text" data-click="remove" x="-40" y="-10">remove</text>
                </g>
            </defs>
        </svg>
    </template>
    <network-graph svg-template="#graph-template"></network-graph>
    <script>
        var graph = document.querySelector('network-graph');
        graph.addEventListener('nodeclick', function test(event) {
            console.log(event.type, event.detail);
            if (event.detail.key === 'remove') {
                event.preventDefault();
            }
        });
    </script>

