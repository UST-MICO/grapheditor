Dynamic Templates
=================

For full control over the template contents dynamic templates can be used.
They must be registered in the :js:attr:`GraphEditor.dynamicTemplateRegistry` before they can be used.

.. seealso:: Documentation of the :doc:`DynamicTemplate api <api/dynamic-templates>` and :doc:`DynamicTemplateRegistry api <api/dynamic-template-registry>`.


Dynamic Node Templates
----------------------

A dynamic node template must implement the :js:class:`DynamicNodeTemplate` interface.
To use a dynamic node template set the :js:attr:`Node.dynamicTemplate?` attribute to the template id.

.. note:: Even for dynamic templates all :ref:`dynamic properties <static-templates:dynamic content>` of static templates are still applied.
    This is also the preferred way to benefit from :ref:`text wrapping <static-templates:text injection for node templates>` in dynamic templates.


Dynamic Marker Templates
------------------------

A dynamic marker template must implement the :js:class:`DynamicMarkerTemplate` interface.
Dynamic marker templates are used for both :js:class:`Markers <Marker>` and :js:class:`LinkHandles <LinkHandle>`.
They will get a context with their parent element (an :js:class:`Edge` or a :js:class:`Node`).
To use a dynamic marker template set the :js:attr:`Marker.template` attribute to the template id and :js:attr:`Marker.isDynamicTemplate?` to ``true``.
The same goes for :js:class:`LinkHandles <LinkHandle>`.


If the dynamic marker template is used for a start or end marker of an :js:class:`Edge` the method :js:func:`DynamicMarkerTemplate.getLineAttachementInfo` is used to determine the point where the edge attaches to the marker.

.. seealso:: Documentation of the :js:class:`LineAttachementInfo` api.


Dynamic TextComponent Templates
-------------------------------

A dynamic text component template must implement the :js:class:`DynamicTextComponentTemplate` interface.
The template must add exactly one ``text`` tag to the svg group!
