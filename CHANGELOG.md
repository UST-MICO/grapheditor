# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).


## [Unreleased]

**Known Issue:** this version was compiled using typescript 3.7!
The resulting `.d.ts` are **only** compatible with typescript versions `>= 3.6`. See [typescript 3.7 release notes](www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#class-field-mitigations) for more information.


## [0.3.1] - 2019-12-02

**Known Issue:** this version was compiled using typescript 3.7!
The resulting `.d.ts` are **only** compatible with typescript versions `>= 3.6`. See [typescript 3.7 release notes](www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#class-field-mitigations) for more information.

### Added

- Added 'backgroundclick' event
- Added api for node selection (`selectNode`, `deselectNode`, `changeSelected` and `selected`)

### Fixed

- Fixed all possible classes in the `classes` attribute of the `network-graph` beeing applied to nodes/edges if `setNodeClass`/`setEdgeClass` was null
- Fixed marker for `MarkerStart` not beeing rotated 180° like the line attachement point
- Fixed `removeEdge` not working correctly with edges with explicit id


## [0.3.0] - 2019-11-22

**Known Issue:** this version was compiled using typescript 3.7!
The resulting `.d.ts` are **only** compatible with typescript versions `>= 3.6`. See [typescript 3.7 release notes](www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#class-field-mitigations) for more information.

### Added

- Added `Edge.markerStart`
- Added `data-line-attachement-point` to marker templates to specify where an edge attaches to the marker if the marker is an end marker
- Added dynamic templates for Nodes, Markers,TextComponents and LinkHandles
- Added dynamic template registry
- Added static template registry
- Consolidated positioning for all objects placed along an edge (markers and text components)
- Added rotation to text components
- Added rotation to link handles
- Added `EdgePathGenerator` and `EdgePathGeneratorRegistry`

### Deprecated

- Deprecated `Marker.rotate`. Use `Marker.absoluteRotation` and `Marker.relativeRotation` instead.


### Incompatible changes

- Removed `Marker.lineOffset`. Use `data-line-attachement-point` in marker template instead.
- Removed `TextComponent.class`. Use custom dynamic templates instead.
- All text components are wrapped in a `<g>` element. This will break some css styles!


## [0.2.0] - 2019-10-27

### Added

- Use slots instead of html templates to load custom styles and templates into grapheditor
- Templating now uses standard svg groups in the `defs` section of the provided svg.
- Add ability to template link handles with marker templates
- Add default marker template (used as link handle template)

### Fixed

- `attributePath` text components not working correctly

### Incompatible changes

- Removed templating using html templates (old template content can be reused)
- All link handles are now rendered using marker templates
- Changed `template-type` attribute of templates to `data-template-type`
- The `network-graph` tag can no longer be empty it must at least contain a `svg` tag for the `graph` slot


## [0.1.3] - 2019-08-22

### Added

- `originalEdge` in detail of edgedrop for edges that have createdFrom set

### Fixed

- Dragged edge not removed if edge remove event was cancelled
- Click event key not found in newest firefox
- zoom beahviour set every render
- `getEdgesByTarget` always returning empty set
- Fix documentation dependencies to specific versions and add Pipfile for use with pipenv
- Update dependencies


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

[Unreleased]: https://github.com/UST-MICO/grapheditor/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/UST-MICO/grapheditor/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/UST-MICO/grapheditor/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/UST-MICO/grapheditor/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/UST-MICO/grapheditor/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/UST-MICO/grapheditor/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/UST-MICO/grapheditor/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/UST-MICO/grapheditor/compare/v0.0.3...v0.1.0
[0.0.3]: https://github.com/UST-MICO/grapheditor/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/UST-MICO/grapheditor/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/UST-MICO/grapheditor/releases/tag/v0.0.1
