# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).


## [Unreleased]

### Added

- `originalEdge` in detail of edgedrop for edges that have createdFrom set

### Fixed

- Dragged edge not removed if edge remove event was cancelled
- Click event key not found in newest firefox


## [0.1.2] - 2019-07-30

### Added

- Changed single d3 dependency to dependencys on d3 modules

### Fixed

- Fixed display bugs when running in Firefox


## [0.1.1] - 2019-06-22

### Added

- Use regex to determine word boundarys when wrapping text (before only spaces were valid word boundarys for texwrapping)
- Use [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) to detect resizes if available (if unavailable calculate current size before zooming to bounding box)
- New `edgedrop` event to enable creating nodes where an edge was dropped in the void
- Add `eventSource` to all custom events to distinguish events by how they were triggered (possible values: `INTERNAL`, `API`, `USER_INTERACTION`)
- Add `clickEventKey` attribute to `Marker` class (used to set `data-click` attribute in html)
- Click events `edgeclick` and `nodeclick` now search the whole path (only inside the specific svg group) for a `data-click` attribute to use as key
- Add textcomponents to edge to display text in an edge with text wrapping and drag behaviour for manual positioning
- Add `edgetextpositionchange` events used when the user drags a text component
- Update d3 to >5.9 to use [join](https://github.com/d3/d3-selection/blob/master/README.md#selection_join)
- Add `calculateLinkHandlesForEdge` callback to customise where edges attach to nodes
- Allow dynamic propertys with `data-content`, `data-fill`, `data-stroke` and `data-href` attributes


### Fixed

- Grapheditor fails updating graph if an edge with a source or target pointing to a nonexisting node is present


## [0.1.0] - 2019-04-11

First beta version.

### Fixed

- Wrapping multiline text failing in firefox browser ([stackoverflow "How to get the width of an SVG tspan element"](https://stackoverflow.com/questions/5364980/how-to-get-the-width-of-an-svg-tspan-element))
- Textwrapping sometimes producing infinite loops.


## [0.0.3] - 2019-03-04

### Added

- `updateTextElements` function to update and reflow text with `force` parameter
- `getNode`, `getEdge`, `getEdgesBySource` and `getEdgesByTarget` functions in grapheditor

### Fixed

- First multiline textwrap not rendering the text
- `scaleRelative` not affecting `lineOffset` position of `edge.markerEnd`


## [0.0.2] - 2019-02-25

### Added

- LinkHandles for `path` and `polygon` elements
- scaleRelative attribute in `Marker` for scaling relative to stroke-width of edge path
- markerEnd attribute in `Edge` for better arrowheads
- lineOffset attribute in `Marker` for offsetting markerEnd from the end of the edge path


## [0.0.1] - 2019-02-15

### Added

- Initial webcomponent
- Documentation
