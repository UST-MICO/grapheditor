Rendering (internals)
=====================

The Grapheditor uses an instance of each of the renderers for nodes, edges and common features to render the content into the svg.
Overriding these renderers allows for greater customization of the looks and behaviour.
This comes at the cost of increased complexity and additional maintanance costs because of a possibly unstable API of the renderers.

.. warning:: Use these only if customization using other means is not possible or sufficient!

.. js:autoclass:: NodeRenderer
   :members:

.. js:autoclass:: EdgeRenderer
   :members:

.. js:autoclass:: ExtrasRenderer
   :members:
