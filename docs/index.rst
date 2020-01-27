Grapheditor
===========

The grapheditor is a `custom web component <https://www.webcomponents.org>`_ that renders nodes and edges with `d3.js <https://d3js.org>`_.

.. seealso::

    * https://developer.mozilla.org/en-US/docs/Web/Web_Components
    * `d3 <https://github.com/d3/>`_
    * `d3 – select <https://github.com/d3/d3-selection>`_

Features
--------

:doc:`quickstart`

* Custom :doc:`static templates <static-templates>` with dynamic :ref:`text <static-templates:text injection for node templates>` and :ref:`content <static-templates:dynamic content>`
* Fully :doc:`dynamic templates <dynamic-templates>`
* Changeable :doc:`edge paths <edge-path-templates>`
* Dynamic styling with :ref:`css classes <grapheditor:styling nodes and edges with custom css classes>`
* :ref:`Text wrapping <static-templates:text injection for node templates>` in plain svg (this is not supported natively by browsers!)
* Pan and zoom using mouse or touch
* :ref:`Highly configurable <grapheditor:component attributes>`
* :ref:`View only mode <view-mode-attribute>`
* Node drag and drop
* Edge drag and drop
* :ref:`Custom markers <grapheditor:edge markers>` for edges (more powerful than svg markers)
* :ref:`Text components <grapheditor:text-components>` for edges
* Powerful :doc:`grouping mechanism <groups>`
* Compatible with all web frameworks (behaves like a standard html tag)
* Many :ref:`custom events <grapheditor:component events>`

.. image:: screenshots/test-html.png

Documentation
-------------

.. toctree::
    :maxdepth: 2

    quickstart
    grapheditor
    static-templates
    dynamic-templates
    edge-path-templates
    groups
    api/api-index
    changelog
