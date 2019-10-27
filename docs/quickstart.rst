Quickstart
==========

Create a new html file with the following content:

.. code-block:: html

    <!DOCTYPE html>
    <html>
        <head>
            <meta charset="utf-8" />
            <title>Test</title>
            <style>
                html {height: 100%}
                body {height: 100%}
            </style>
        </head>
        <body>
            <script src="https://cdn.jsdelivr.net/npm/@ustutt/grapheditor-webcomponent@latest/_bundles/grapheditor-webcomponent.js"></script>
            <network-graph classes="red blue" mode="layout" zoom="both">
                <style slot="style">
                    svg {width:100%; height: 100%}
                </style>
                <svg slot="graph"></svg>
            </network-graph>

            <script>
                var graph = document.querySelector('network-graph');
            </script>
        </body>
    </html>

Alternatively use the :download:`example.html` file.


Adding nodes
------------

Add two nodes to the graph:

.. code-block:: js

    graph.addNode({
        id: 1,
        title: 'RED',
        type: 'red',
        x: 0,
        y: 0,
    }, true);

    graph.addNode({
        id: 2,
        title: 'BLUE',
        type: 'blue',
        x: 100,
        y: 0,
    }, true);


Styling nodes
-------------

When first adding nodes everything is just black.
To change this add the following ``<styles>`` tag to the svg.

.. code-block:: html

    <svg slot="graph">
        <style>
            .node {fill: lightgray;}
            .link-handle {display: none; fill: black; opacity: 0.1; transition:opacity 0.25s ease-out;}
            .edge-group .link-handle {display: initial}
            .link-handle:hover {opacity: 0.7;}
            .hovered .link-handle {display: initial;}
        </style>
    </svg>

Now the link handles are clearly seperated from the node.
Dragging a link handle creates a new edge that can be dropped over a node.


Adding a default node template
------------------------------

To change the form of the node just add a default node template.
A node template is added in the ``<svg>`` tag inside a ``<defs>`` tag.

.. code-block:: html

    <svg slot="graph">
        <style>/* ... */</style>
        <defs>
            <g id="default" data-template-type="node">
                <rect x="-20" y="-8" width="40" height="16"></rect>
            </g>
        </defs>
    </svg>

To add text to the nodes add ``.text {fill: black;}`` to the styles tag and ``<text class="text" data-content="title" x="-18" y="5"></text>`` to the template.
For textwrapping to work specify a width in the text element (example: ``width="36"``).
Textwrapping can be custimized with css.
Try adding ``text-overflow: ellipsis;`` to the ``text`` class.
