Static Templates
================

The grapheditor supports user provided static templates for :js:class:`Nodes <Node>`, :js:class:`Markers <Marker>` and :js:class:`LinkHandles <LinkHandle>`.
Static templates are simply a svg group with the ``data-template-type`` ( example: ``<g data-template-type="node|marker">``).
Templates are read from the first ``<defs>`` tag of the provided svg.

:js:class:`Node` templates need to have the attribute ``data-template-type="node"`` and must have a unique id that corresponds to a specific :js:class:`Node` type.
The type of a node also determines which template is used for the node.
:js:class:`Marker` templates need to have the attribute ``data-template-type="marker"`` and must also have a unique id.
Marker templates can be used as edge markers and link handles.
If a marker template is used as a start or end marker of an :js:class:`Edge` the edge will normally attach to the (0, 0) position (coordinates in the marker group).
Where the edge attaches can be customized by setting the ``data-line-attachement-point`` attribute.

.. hint:: The id ``default`` can be used to set the default node template while the id ``default-marker`` is used for the default marker template.
    If they are not provided a default marker and node template will be added to ``<defs>``.

.. code-block:: html

    <network-graph>
        <svg slot="graphs">
            <defs>
                <!-- templates go here -->
                <g id="default" data-template-type="node">
                    <rect x="-20" y="-8" width="40" height="16"></rect>
                    <text class="text" data-content="title" x="-18" y="5" width="36"></text>
                </g>
                <g id="arrow" data-template-type="marker" data-line-attachement-point="-9 0">
                    <path d="M -9 -4 L 0 0 L -9 4 z" />
                </g>
            </defs>
        </svg>
    </network-graph>


Text injection for Node Templates
---------------------------------

It is possible to use text from the :js:class:`Node` object inside a templated node.
The template has to contain a ``text`` tag with a ``data-content`` attribute and the ``text`` class.
The ``data-content`` attribute is used to determine wich attribute of the :js:class:`Node` is used as text for this element.
To use a value of a nested Object as text source a path can be provided in ``data-content`` where the path segments are seperated by ``.``.
The property is resolved by the :js:func:`recursiveAttributeGet <GraphEditor.recursiveAttributeGet>` function.

.. code-block:: html

    <text class="text" data-content="type" x="-40" y="10" width="80"></text>

For text wrapping a ``width`` or ``data-width`` attribute must be supplied.
To enable multiline text wrapping an additional ``height`` or ``data-height`` attribute must be supplied.
The wrapping behaviour can be partially controlled with the css attributes ``text-overflow``, ``word-break`` and ``line-height``.

.. note:: This will also work for ``text`` tags inside marker templates if the template is instantiated for a link handle of a node.

Dynamic content
---------------

To have the template content change according to the node or edge data the following atrributes can be used.

``data-content``
    Sets the text for this tag. Useful for ``<title>`` and ``<desc>`` tags. See :ref:`text injection <static-templates:text injection for node templates>` for text wrapping.

``data-fill``
    Sets the ``fill`` attribute of the svg node.

``data-stroke``
    Sets the ``stroke`` attribute of the svg node.

``data-href``
    Sets the ``href`` attribute of ``<a>`` or ``<image>`` tags.

The content of these custom attributes is the path to the value in the :js:class:`Node` or :js:class:`Edge` object where the path segments are seperated by ``.``.
The property is resolved by the :js:func:`recursiveAttributeGet <GraphEditor.recursiveAttributeGet>` function.


Link handles
------------

:js:class:`Link handles <LinkHandle>` get calculated per static node template.
The calculation uses the first element in the group with the class ``outline`` or just the first element in the group.
Tha calculation can be influenced with the ``data-link-handles`` attribute set at the dom element used for link handle calculation.

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

.. seealso:: Documentation for the :doc:`LinkHandle API <api/link-handle>`.
