Coordinates in the GraphEditor
==============================

Knowing how the different coordinate systems work is key to understanding how to effectively create interactive graphs with this library.
This section of the documentation discusses the different coordinate systems used and how they are related to each other.


SVG Coordinates
---------------

The SVG coordinate system by default has the origin (x=0, y=0) in the upper left corner.
The x coordinates grow in towards the right and shrink towards the left going negative beyond the origin point.
The y coordinates grow towards the bottom of the screen (so a bigger y coordinate means something is positioned lower on the screen).
Sometimes width and height are used instead of specifying a new coordinate pair.
Width and height are always in the direction of increasing values along their axis (width=x, height=y).

.. code-block::

    ┌───────────────────────────────────────────────────┐
    │    (0,0)      (10,0)     (20,0)                   │
    │   +          +          +                         │
    │                                                   │
    │                                                   │
    │                                                   │
    │    (0,5)      (10,5)                              │
    │   +          +                                    │
    └───────────────────────────────────────────────────┘


Graph Coordinates
-----------------

All graph coordinates (node coordinates, bounding boxes, zoom box, …) use the same coordinate system.
However all graph components are placed inside an SVG group (``<g class="zoom-group">…</g>``) that is used to apply the curren zoom.
A `transformation <https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/transform>`_ is applied to the group element that transforms *all* coordinates inside the group.
This effectively decouples the graph coordinates from the top level SVG coordinate system!


Node Coordinates
----------------

Node coordinates are graph coordinates.
However the node is represented by a top level SVG group (``<g class="node">…</g>``) that contains the contatn from the node template and the link handles of the node.
The node coordinates are implemented as a translate transformation on that group element.
This maps the origin point of the node template to the graph coordinates of the node.

.. hint:: It is recommended to ensure that the **visible center** of the node corresponds to the **graph coordinates** of that node.
    This makes it easier to reason about where a node is positioned and most functions in this library assume this to be true.

    For example the selection brush only checks if the graph coordinates of a node are inside of the selected area.
    If the graph coordinates correspond to the node center then the selected area must include that node center for the node to be selected.
    If however the graph coordinates are off center, then overlap of the selected area with the node is different depending on the direction.


.. code-block::

    Node template: <rect x="-20" y="-3" width=40 height=6></rect>
    ┌───────────────────────────────────────────────────┐
    │    (0,0)                ┃(20,0)                   │
    │   +                     +                         │
    │                         ┃                         │
    │                         ┃(20,3)                   │
    │━━━+━━━━━━━━━━━━━━━━━━━━━+                         │
    │                                                   │
    │                                                   │
    └───────────────────────────────────────────────────┘

    Node: x=20 y=3 <g transform="translate(20 3)">…</g>
    ┌───────────────────────────────────────────────────┐
    │    (0,0)                                   (40,0) │
    │   +━━━━━━━━━━━━━━━━━━━━━+━━━━━━━━━━━━━━━━━━━━━+   │
    │   ┃                                           ┃   │
    │   ┃                      (20,3)               ┃   │
    │   +                     +                     +   │
    │   ┃                                           ┃   │
    │   ┃                                           ┃   │
    │   +━━━━━━━━━━━━━━━━━━━━━+━━━━━━━━━━━━━━━━━━━━━+   │
    │    (0,6)                                   (40,6) │
    │                                                   │
    └───────────────────────────────────────────────────┘
