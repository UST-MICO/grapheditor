Grapheditor
===========

The grapheditor is a `custom web component <https://www.webcomponents.org>`_ that renders nodes and edges with `d3.js <https://d3js.org>`_.

.. seealso::

    * https://developer.mozilla.org/en-US/docs/Web/Web_Components
    * `d3 <https://github.com/d3/>`_
    * `d3 – select <https://github.com/d3/d3-selection>`_


Quick Start
-----------

Want to jump right in?
Go to the :doc:`quickstart` to get a first feel for how this webcomponent is used.


When to Use
-----------

Use this webcomponent if you want to

* Display an interactive graph layout with complex node designs
* Allow users to rewire the graph interactively
* Render a graph to SVG

When NOT to Use
---------------

Do NOT use this webcomponent if you want to

* Display a large number of complex nodes (everything above 100 nodes should be testet for performance issues)
* Require the best and fastest text wrapping for large amounts of text in nodes
  (Text wrapping is implemented using custom javascript as browsers do not natively support text wrapping in SVGs)


Features
--------

* Custom :doc:`static templates <static-templates>` with dynamic :ref:`text <static-templates:text injection for node templates>` and :ref:`content <static-templates:dynamic content>`
* Fully :doc:`dynamic templates <dynamic-templates>`
* Changeable :doc:`edge paths <edge-path-templates>`
* Dynamic styling with :ref:`css classes <grapheditor:styling nodes and edges with custom css classes>`
* :ref:`Text wrapping <static-templates:text wrapping for node templates>` in plain svg (this is not supported natively by browsers!)
* :ref:`Wrap text in circles and other shapes <static-templates:extra text wrapping options>`
* Pan and zoom using mouse or touch
* :ref:`Highly configurable <grapheditor:component attributes>`
* :ref:`View only mode <view-mode-attribute>`
* Node drag and drop
* Edge drag and drop
* :ref:`Custom edge drag handles <grapheditor:edge drag handles>` for edges and bidirectional edges
* :ref:`Custom markers <grapheditor:edge markers>` for edges (more powerful than svg markers)
* :ref:`Text components <grapheditor:text-components>` for edges
* Powerful :doc:`grouping mechanism <groups>`
* Node :doc:`resizing <resizing>`
* Compatible with all web frameworks (behaves like a standard html tag, see also `custom web component <https://www.webcomponents.org>`_)
* Many :ref:`custom events <grapheditor:component events>`

.. image:: screenshots/test-html.png


.. raw:: html

    <script src="https://cdn.jsdelivr.net/npm/@ustutt/grapheditor-webcomponent@0.7.0/_bundles/grapheditor-webcomponent.js" defer></script>

    <h3>Interactive Example</h3>

    <template id="graphTemplate">
        <svg slot="graph">
            <style>
                svg {width:100%; height: 100%; min-height: 400px;}
                .zoom-group > .brush {fill: dodgerblue; opacity: 0.3;}
                .ghost {opacity: 0.5;}
                .node {fill: aqua;}
                .link-handle {display: none; fill: black; opacity: 0.1;}
                .link-handle>* {transition:transform 0.25s ease-out;}
                .edge-group .link-handle {display: initial}
                .link-handle:hover {opacity: 0.7;}
                .link-handle:hover>* {transform: scale(1.5);}
                .text {fill: black; font-size: 6pt; text-overflow: ellipsis; word-break: break-word}
                .text.title {font-size: initial; text-overflow: clip; word-break: break-word;}
                .node.hovered {fill: red;}
                .hovered .link-handle {display: initial;}
                .node.selected {fill: green; }
                .highlight-outgoing .edge {stroke: red;}
                .highlight-incoming .edge {stroke: green;}
                .highlight-outgoing .marker {fill: red;}
                .highlight-incoming .marker {fill: green;}
                .simple-node {fill: green;}
                .small-node {fill: blueviolet;}
                .fancy-node {fill: lightsalmon;}
                .simple-node .edge {stroke: green;}
                .small-node .edge {stroke: blueviolet;}
                .fancy-node .edge {stroke: lightsalmon;}
                .node.selected > *:first-child {stroke: gold; stroke-width: 4px; stroke-dasharray: 8 4 10 4;}
            </style>
            <defs class="templates">
                <g id="simple-node" data-template-type="node">
                    <rect width="100" height="60" x="-50" y="-30" data-link-handles="edges" data-fill="color"></rect>
                    <text class="title text" data-content="title" data-click="title" x="-40" y="-10" width="80"></text>
                    <text class="text" data-content="description" x="-40" y="5" width="80" height="30"></text>
                </g>
                <g id="small-node" data-template-type="node">
                    <rect width="100" height="40" x="-50" y="-20" data-link-handles="edges" data-fill="color"></rect>
                    <text class="title text" data-content="title" data-click="title" x="-40" y="-3" width="80"></text>
                    <text class="text" data-content="type" x="-40" y="12" width="80"></text>
                </g>
                <g id="fancy-node" data-template-type="node">
                    <polygon class="outline" points="-40,-15 40,-15 45,0 40,15 -40,15 -45,0" style="fill:lime;stroke:purple;stroke-width:1"></polygon>
                    <a data-href="link">
                        <text class="text" data-content="link" x="-40", y="0"></text>
                    </a>
                    <title data-content="title"></title>
                    <desc data-content="description"></desc>
                    <image x="15" y="-13" width="26" height="26" data-href="image"></image>
                </g>
                <g id="arrow" data-template-type="marker" data-line-attachement-point="-9 0">
                    <path d="M -9 -4 L 0 0 L -9 4 z" />
                </g>
            </defs>
        </svg>
    </template>

    <network-graph
        nodes='[
            {"id": 1, "x": 0, "y": 0, "title": "hello world", "type": "simple-node", "description": "This is a really long text that is wrapped in multiple lines.", "color": "green" },
            {"id": 2, "x": 150, "y": 100, "title": "HI 3", "type": "small-node", "color": "blueviolet" },
            {"id": 3, "x": 130, "y": -50, "title": "NEW", "type": "fancy-node", "description": "New node", "image": "https://d3js.org/logo.svg", "link": "https://d3js.org" }
        ]'
        edges='[
            {"source": 1, "target": 2, "texts": [{ "positionOnLine": 0.8, "value": "Hello World!", "width": 30, "height": 30 }] },
            {"source": 3, "target": 1, "isBidirectional": true,
                "markers": [
                    {"template": "arrow", "positionOnLine": 1, "scale": 0.5, "relativeRotation": 0},
                    {"template": "arrow", "positionOnLine": 0.3, "scale": 0.5, "scaleRelative": true, "absoluteRotation": 180, "relativeRotation": 0},
                    {"template": "arrow", "positionOnLine": 0.1, "scale": 0.5, "relativeRotation": 0}
                ],
                "texts": [{"positionOnLine": 0.2, "value": "Hello World!", "width": 30, "padding": 5}]
            }
        ]'
        svg-template="#graphTemplate"
        zoom="both"
        selection="multiple"
        background-drag="move"
        node-click="select"
        node-drag="move"
        edge-drag="link">
    </network-graph>


Documentation
-------------

.. toctree::
    :maxdepth: 2

    quickstart
    coordinates
    grapheditor
    static-templates
    dynamic-templates
    edge-path-templates
    groups
    resizing
    api/api-index
    changelog
