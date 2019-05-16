# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).


## [Unreleased]

### Added

- Use regex to determine word boundarys when wrapping text (before only spaces were valid word boundarys for texwrapping)
- Use [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) to detect resizes if available (if unavailable calculate current size before zooming to bounding box)


### Fixed


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
