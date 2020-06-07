/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import GraphEditor from './grapheditor';
import { Selection, select, event } from 'd3-selection';
import { drag } from 'd3-drag';
import { Rect, removeAllChildNodes, copyTemplateSelectionIntoNode } from './util';
import { Point } from './edge';
import { Node } from './node';
import { RotationVector } from './rotation-vector';

/**
 * A strategy to apply the new dimensions to a node when a resize happens.
 */
export interface ResizeStrategy {

    /**
     * Apply the new width/height dimensions to the given node.
     *
     * This method is called before `fitIntoBoundingBox`.
     *
     * @param node the node to apply the dimensions to
     * @param width the new width of the bounding box of the node
     * @param width the new height of the bounding box of the node
     * @param graphEditor the grapheditor instance
     */
    applyNewDimensions: (node: Node, width: number, height: number, graphEditor: GraphEditor) => void;

    /**
     * Fit the given node into the given bounding box.
     *
     * This method is called after `applyNewDimensions`.
     *
     * The given bounding box has the same width and height that are used in the
     * call of the `applyNewDimensions` method.
     *
     * If the center of the new bounding box is not (0,0) then the node should be moved
     * such that the resulting bounding box of the node is again centered around (0,0)
     * relative to the node.
     *
     * @param node the node to apply the dimensions to
     * @param rect the new bounding box (relative to the node) the node should fit into
     * @param graphEditor the grapheditor instance
     */
    fitIntoBoundingBox: (node: Node, rect: Rect, graphEditor: GraphEditor) => void;
}

/**
 * The default resize strategy.
 *
 * This strategy uses `node.width` and `node.height`.
 */
export class DefaultResizeStrategy implements ResizeStrategy {

    /**
     * @override
     *
     * The width and height are set as `node.width` and `node.height`.
     *
     * @param node the node to apply the dimensions to
     * @param width the new width of the bounding box of the node
     * @param width the new height of the bounding box of the node
     * @param graphEditor the grapheditor instance
     */
    applyNewDimensions(node: Node, width: number, height: number, graphEditor: GraphEditor): void {
        node.width = width;
        node.height = height;
    }

    /**
     * @override
     *
     * The node position is first adjusted such that the center of the new bounding
     * box of the node is at the node coordinates.
     *
     * Then the node is moved to that location with the `GraphEditor.moveNode`
     * method to run all movement logic without changing child node positions.
     *
     * This ensures that child nodes that have a fixed position or a drop zone
     * still get moved to the correct position.
     *
     * @param node the node to apply the dimensions to
     * @param rect the new bounding box (relative to the node) the node should fit into
     * @param graphEditor the grapheditor instance
     */
    fitIntoBoundingBox(node: Node, rect: Rect, graphEditor: GraphEditor): RotationVector {
        const dx = rect.x + (rect.width / 2);
        const dy = rect.y + (rect.height / 2);
        node.x += dx;
        node.y += dy;
        graphEditor.moveNode(node.id, node.x, node.y);
        return {dx: dx, dy: dy};
    };
}

/**
 * Options for the resize overlay to control appeareance and behaviour.
 */
export interface ResizeOverlayOptions {
    /** The id of a static marker template to use for all resize handles. */
    handleTemplate?: string;
    /** The id of a static marker template to use for corner resize handles. (Overwrites `handleTemplate` for corner handles) */
    cornerHandleTemplate?: string;
    /** True if all handles should be rotated. (Handles are rotated such that the upward facing side is facing out of the rectangle overlay) */
    rotateHandles?: boolean;
    /** True if handles on the edges of the rectangle overlay should be rotated. (see `rotateHandles`) */
    rotateEdgeHandles?: boolean;
    /** True if handles on the corners of the rectangle overlay should be rotated. (see `rotateHandles`) */
    rotateCornerHandles?: boolean;
    /** True if the overlay should not have handles for horizontal resizing (left and right). */
    noHorizontalHandles?: boolean;
    /** True if the overlay should not have handles for vertical resizing (top and bottom). */
    noVerticalHandles?: boolean;
    /** True if the overlay should not have handles in the corners. */
    noCornerHandles?: boolean;

    /** The name of the strategy that is used to resize the node when the resize overlay changes. */
    resizeStrategy?: string;
    /** True if all resizing handles should preserve the aspect ratio of the node. */
    preserveRatio?: boolean;
    /** True if corner resizing handles should preserve the aspect ratio of the node. */
    preserveRatioOnDiagonals?: boolean;
    /** True if all resizing operations are mirrored at the center of the resize overlay. */
    symmetric?: boolean;
    /** True if the horizontal part of all resizing operations is mirrored at the center of the resize overlay. */
    symmetricHorizontal?: boolean;
    /** True if the vertical part of all resizing operations is mirrored at the center of the resize overlay. */
    symmetricVertical?: boolean;
    /** True if the node is resized while dragging. If unset or `false` the node is only resized after the resize overlay is not dragged anymore. */
    liveResize?: boolean;

    /** The minimal width of the node. Must be `> 0`. */
    minWidth?: number;
    /** The minimal height of the node. Must be `> 0`. */
    minHeight?: number;
    /** The maximal width of the node. Must be `>= minWidth`. Set this to `minWidth` to disable horizontal resizing. */
    maxWidth?: number;
    /** The maximal height of the node. Must be `>= minHeight`. Set this to `minHeight` to disable vertical resizing. */
    maxHeight?: number;
}

/**
 * A single handle of the resize overlay.
 */
interface ResizeHandle {
    /** The static marker template id used for this handle. */
    template: string;
    /** The rotation of the handle in degree (default 0). */
    rotation?: number;
    /** The position of the handle in the resize overlay. */
    type: 'top-left'|'top'|'top-right'|'right'|'bottom-right'|'bottom'|'bottom-left'|'left';
    /** Wether the handle is a corner handle. */
    isCorner: boolean;
    /** The x position of the handle relative to the resize overlay origin. */
    x: number;
    /** The y position of the handle relative to the resize overlay origin. */
    y: number;
}

/**
 * A function that takes the displacement of a resize handle and applies it to
 * the given bounding box.
 *
 * @param dx the displacement in x direction
 * @param dy the displacement in y direction
 * @param rect the bounding box to apply the displacement to
 * @returns a new and resized bounding box
 */
type ResizeHandler = (dx: number, dy: number, rect: Rect) => Rect;

/**
 * A data holder for information used while dragging a resize handle.
 */
interface ResizeInformation {
    /** The handler function that applies the handle displacement to the bounding box. */
    handler: ResizeHandler;
    /** The start coordinates of the event. */
    start: Point;
    /** The initial bounding box of the node. */
    startRect: Rect;
    /** The node that is resized. */
    node: Node;
    /** The strategy to apply the resized bounding box to the node. */
    resizeStrategy: ResizeStrategy;
}

/**
 * Get a list of resize handles for a node given ResizeOverlayOptions and dimensions of the overlay.
 *
 * @param options the options in effect for the resize overlay
 * @param bbox the bounding box of the node used as dimensions of the overlay
 */
// eslint-disable-next-line complexity
function resizeHandlesFromOptions(options: ResizeOverlayOptions|null, bbox: Rect): ResizeHandle[] {
    const handles: ResizeHandle[] = [];
    if (!options?.noCornerHandles) {
        const template = options?.cornerHandleTemplate ?? options?.handleTemplate ?? 'default-marker';
        const rotateHandles = options?.rotateCornerHandles || options?.rotateHandles;
        handles.push({
            template: template,
            isCorner: true,
            type: 'top-left',
            rotation: rotateHandles ? -45 : 0,
            x: bbox.x,
            y: bbox.y,
        });
        handles.push({
            template: template,
            isCorner: true,
            type: 'top-right',
            rotation: rotateHandles ? 45 : 0,
            x: bbox.x + bbox.width,
            y: bbox.y,
        });
        handles.push({
            template: template,
            isCorner: true,
            type: 'bottom-right',
            rotation: rotateHandles ? 135 : 0,
            x: bbox.x + bbox.width,
            y: bbox.y + bbox.height,
        });
        handles.push({
            template: template,
            isCorner: true,
            type: 'bottom-left',
            rotation: rotateHandles ? -135 : 0,
            x: bbox.x,
            y: bbox.y + bbox.height,
        });
    }
    const template = options?.handleTemplate ?? 'default-marker';
    const rotateHandles = options?.rotateEdgeHandles || options?.rotateHandles;
    if (!options?.noHorizontalHandles) {
        handles.push({
            template: template,
            isCorner: false,
            type: 'left',
            rotation: rotateHandles ? -90 : 0,
            x: bbox.x,
            y: bbox.y + (bbox.height / 2),
        });
        handles.push({
            template: template,
            isCorner: false,
            type: 'right',
            rotation: rotateHandles ? 90 : 0,
            x: bbox.x + bbox.width,
            y: bbox.y + (bbox.height / 2),
        });
    }
    if (!options?.noVerticalHandles) {
        handles.push({
            template: template,
            isCorner: false,
            type: 'top',
            rotation: 0,
            x: bbox.x + (bbox.width / 2),
            y: bbox.y,
        });
        handles.push({
            template: template,
            isCorner: false,
            type: 'bottom',
            rotation: rotateHandles ? 180 : 0,
            x: bbox.x + (bbox.width / 2),
            y: bbox.y + bbox.height,
        });
    }

    return handles;
}

/**
 * Clamp a delta such that adjusting the value by that delta does not exceed the values bounds.
 *
 * @param d the delta to adjust value by
 * @param value the value that is to be adjusted
 * @param min the minimal allowed value for the value in question
 * @param maxthe maximal allowed value for the value in question
 */
function clampDelta(d: number, value: number, min: number, max: number): number {
    if (d > 0) {
        return Math.min(d, max - value);
    }
    if (d < 0) {
        return -Math.min(-d, value - min);
    }
    return d;
}

/**
 * A class to add interactive node resizing to a grapheditor instance.
 *
 * _Usage:_
 *
 * Initialize a new ResizeManager for a grapheditor instance.
 *
 * `const resizeManager = new ResizeManager(grapheditor);`
 *
 * Show the resize overlay for a Node
 *
 * `resizeManager.showResizeOverlay(node.id);`
 *
 * OR resize Node via api.
 *
 * `resizeManager.resizeNode(node.id, newWidth, newHeight);`
 *
 * For cleanup call `resizeManager.unlink()`!
 */
export class ResizingManager {

    /** The grapheditor instance this object is bound to. */
    readonly graphEditor: GraphEditor;
    /** The map containing all resize strategies to be used for resizing nodes. */
    readonly resizeStrategies: Map<string, ResizeStrategy> = new Map();

    // event subscriptions
    /** Subscription to the 'svginitialized' events of the grapheditor. */
    private svgChange;
    /** Subscription to the 'nodepositionchange' events of the grapheditor. */
    private nodePositionChange;

    // overlay group selection
    /** The selection of the group layer containing all resize overlays. */
    private overlayGroup: Selection<SVGGElement, any, any, any>;

    /** The currently active resize overlays by node id with resize options. */
    private resizeOptions: Map<string, ResizeOverlayOptions> = new Map();
    /** The current dimensions of the nodes beeing resized. */
    private currentlyResizing: Map<string, Rect> = new Map();

    /** A list of nodeId's with active resize overlays for efficient d3 joins. */
    private resizeOverlays: string[] = [];


    constructor(graphEditor: GraphEditor) {
        this.graphEditor = graphEditor;
        this.svgChange = (changeEvent: CustomEvent) => { this.initializeGraph(this.graphEditor.getGraphGroup()); };
        this.graphEditor.addEventListener('svginitialized', this.svgChange);
        this.initializeGraph(this.graphEditor.getGraphGroup());

        this.nodePositionChange = (positionChangeEvent: CustomEvent) => {
            const nodeId = positionChangeEvent.detail.node.id;
            if (this.isResizeOverlayVisible(nodeId)) {
                this.overlayGroup.selectAll<SVGGElement, string>('g.resize-overlay')
                    .data<string>(this.resizeOverlays)
                    .call(this.updateOverlayPositions.bind(this));
            }
        };
        this.graphEditor.addEventListener('nodepositionchange', this.nodePositionChange);
        this.resizeStrategies.set('default', new DefaultResizeStrategy());
    }

    /**
     * Unsubscribe all event subscriptions of this object on the grapheditor instance.
     */
    public unlink(): void {
        // TODO
        this.graphEditor.removeEventListener('svginitialized', this.svgChange);
        this.graphEditor.removeEventListener('nodepositionchange', this.nodePositionChange);
    }

    /**
     * Initialize the svg and add a layer for displaying resize-overlays.
     *
     * The rsize overlay group will always be raised to the top of the zoom group stack!
     *
     * @param graph the zoom group selection of the active svg of the grapheditor instance
     */
    private initializeGraph(graph: Selection<SVGGElement, any, any, any>) {
        let overlayGroup = graph.select<SVGGElement>('g.resize-overlays');
        if (overlayGroup.empty()) {
            overlayGroup = graph.append('g')
                .classed('resize-overlays', true);
        }
        overlayGroup.raise(); // raise overlay to the top
        this.overlayGroup = overlayGroup;
    }

    /**
     * Show a resize overlay with the given options for the given node.
     *
     * This method will quietly return without changing the resize options
     * if the overlay is already visible!
     *
     * @param nodeId the node id to select the node that should be resized
     * @param options the options object for the resize overlay
     */
    public showResizeOverlay(nodeId: number|string, options?: ResizeOverlayOptions): void {
        nodeId = nodeId.toString();
        if (this.resizeOptions.has(nodeId)) {
            return;
        }

        const node = this.graphEditor.getNode(nodeId);
        const bbox = this.graphEditor.getNodeBBox(nodeId);

        if (node == null || bbox == null) {
            return;
        }

        this.resizeOptions.set(nodeId, options);

        this.resizeOverlays.push(nodeId);
        this.renderOverlays();
    }

    /**
     * Hide a visible resize overlay.
     *
     * This method will completely remove the resize overlay from the dom and
     * discard the resize options associated with that resize overlay.
     *
     * This method will quietly return if the resize overlay is not visible for
     * the requested node id.
     *
     * @param nodeId the node id for which to hide the resize overlay
     */
    public hideResizeOverlay(nodeId: number|string): void {
        nodeId = nodeId.toString();

        if (!this.resizeOptions.has(nodeId)) {
            return;
        }

        this.resizeOptions.delete(nodeId);
        this.resizeOverlays = this.resizeOverlays.filter((id) => id !== nodeId);
        this.renderOverlays();
    }

    /**
     * Check if the resize overlay is currently visible for the given node id.
     *
     * @param nodeId the node id to check
     */
    public isResizeOverlayVisible(nodeId: number|string): boolean {
        return this.resizeOptions.has(nodeId.toString());
    }

    /**
     * Update all resize overlays including positions.
     *
     * This method performs the full d3 join.
     */
    private renderOverlays() {
        const self = this;
        this.overlayGroup.selectAll<SVGGElement, string>('g.resize-overlay')
            .data<string>(this.resizeOverlays)
            .join(
                enter => {
                    const group = enter.append('g')
                        .classed('resize-overlay', true);
                    group.append('rect')
                        .classed('outline', true);
                    return group;
                }
            )
            .each(function(nodeId) {
                self.updateOverlay(select(this), nodeId);
            })
            .call(this.updateOverlayPositions.bind(this));
    }

    /**
     * Update the content of a single resize overlay.
     *
     * Also set drag behaviour for resize handles.
     *
     * @param overlaySelection the selection of a single resize overlay to update
     * @param nodeId the node id for that selection
     */
    private updateOverlay(overlaySelection: Selection<SVGGElement, any, any, any>, nodeId: string) {
        const bbox: Rect = this.currentlyResizing.get(nodeId) ?? this.graphEditor.getNodeBBox(nodeId);
        const options: ResizeOverlayOptions = this.resizeOptions.get(nodeId);

        overlaySelection.select('rect.outline')
            .attr('x', bbox.x)
            .attr('y', bbox.y)
            .attr('width', bbox.width)
            .attr('height', bbox.height)
            .attr('fill', 'none')
            .attr('stroke', 'black');

        const templateRegistry = this.graphEditor.staticTemplateRegistry;

        const resizeHandles = resizeHandlesFromOptions(options, bbox);

        overlaySelection.selectAll<SVGGElement, ResizeHandle>('g.resize-handle')
            .data<ResizeHandle>(resizeHandles)
            .join(
                enter => {
                    return enter.append('g')
                        .classed('resize-handle', true);
                }
            )
            .each(function (handle) {
                const handleSelection = select(this);

                // handle templates
                const oldTemplate = handleSelection.attr('template');
                if (oldTemplate !== handle.template) {
                    removeAllChildNodes(handleSelection);
                    const template = templateRegistry.getMarkerTemplate(handle.template);
                    if (template != null) {
                        copyTemplateSelectionIntoNode(handleSelection, template);
                        handleSelection.attr('template', handle.template);
                    } else {
                        console.warn(`ould not find a static marker template ${handle.template}! Trying default marker template.`);
                        const defaultTemplate = templateRegistry.getMarkerTemplate('default-marker');
                        if (defaultTemplate != null) {
                            copyTemplateSelectionIntoNode(handleSelection, defaultTemplate);
                        }
                        handleSelection.attr('template', 'default-marker');
                    }
                }

                // handle classes
                handleSelection
                    .classed('corner', handle.isCorner)
                    .classed('horizontal', handle.type === 'left' || handle.type === 'right')
                    .classed('vertical', handle.type === 'top' || handle.type === 'bottom')
                    .classed('top', handle.type.startsWith('top'))
                    .classed('bottom', handle.type.startsWith('bottom'))
                    .classed('left', handle.type.endsWith('left'))
                    .classed('right', handle.type.endsWith('right'));
            })
            .call(this.updateResizeHandlePositions.bind(this))
            .call(
                drag<SVGGElement, ResizeHandle, ResizeInformation>()
                    .subject((handle) => {
                        if (this.currentlyResizing.has(nodeId)) {
                            return;
                        }
                        const node = this.graphEditor.getNode(nodeId);
                        // eslint-disable-next-line no-shadow
                        const bbox = this.graphEditor.getNodeBBox(nodeId);
                        this.currentlyResizing.set(nodeId, bbox);
                        const handler = this.resizeHandlerFromHandle(options, handle);
                        const resizeStrategy = this.resizeStrategies.get(options.resizeStrategy ?? 'default');
                        if (resizeStrategy == null) {
                            console.warn(`Could not find the resize strategy "${options.resizeStrategy ?? 'default'}"!`);
                        }
                        return {
                            handler: handler,
                            start: {x: event.x, y: event.y},
                            startRect: bbox,
                            node: node,
                            resizeStrategy: resizeStrategy,
                        };
                    })
                    .on('drag', () => {
                        const resizeHandler: ResizeHandler = event.subject.handler;
                        const start: Point = event.subject.start;
                        const startRect: Rect = event.subject.startRect;
                        const newRect = resizeHandler(event.x - start.x, event.y - start.y, startRect);

                        if (options.liveResize) {
                            const resizeInfo: ResizeInformation = event.subject;
                            const nodeShift = this._resizeNode(resizeInfo.resizeStrategy, resizeInfo.node, newRect);
                            const shiftedRect = {
                                x: newRect.x - nodeShift.dx,
                                y: newRect.y - nodeShift.dy,
                                width: newRect.width,
                                height: newRect.height,
                            };
                            this.currentlyResizing.set(nodeId, shiftedRect);
                            event.subject.startRect = {
                                x: startRect.x - nodeShift.dx,
                                y: startRect.y - nodeShift.dy,
                                width: startRect.width,
                                height: startRect.height,
                            };
                            event.subject.start = {
                                x: start.x - nodeShift.dx,
                                y: start.y - nodeShift.dy,
                            };
                            this.updateOverlayPositions(overlaySelection);
                            this.updateOverlayDimensions(overlaySelection, nodeId, resizeHandlesFromOptions(options, shiftedRect));
                        } else {
                            this.currentlyResizing.set(nodeId, newRect);
                            this.updateOverlayDimensions(overlaySelection, nodeId, resizeHandlesFromOptions(options, newRect));
                        }
                    })
                    .on('end', () => {
                        const resizeInfo: ResizeInformation = event.subject;
                        this._resizeNode(resizeInfo.resizeStrategy, resizeInfo.node, this.currentlyResizing.get(nodeId));
                        this.currentlyResizing.delete(nodeId);

                        // eslint-disable-next-line no-shadow
                        const bbox = this.graphEditor.getNodeBBox(nodeId);

                        this.updateOverlayDimensions(overlaySelection, nodeId, resizeHandlesFromOptions(options, bbox));
                    })
            );
    }


    /**
     * Update only the dimensions of a single resize overlay.
     *
     * @param overlaySelection the selection of a single resize overlay
     * @param nodeId the node id for that selection
     * @param resizeHandles the resize handle list for that selection (must have the right dimensions)
     */
    private updateOverlayDimensions(overlaySelection: Selection<SVGGElement, string, SVGGElement, any>, nodeId, resizeHandles: ResizeHandle[]) {
        const bbox: Rect = this.currentlyResizing.get(nodeId) ?? this.graphEditor.getNodeBBox(nodeId);

        overlaySelection.select('rect.outline')
            .attr('x', bbox.x)
            .attr('y', bbox.y)
            .attr('width', bbox.width)
            .attr('height', bbox.height);

        overlaySelection.selectAll<SVGGElement, ResizeHandle>('g.resize-handle')
            .data<ResizeHandle>(resizeHandles)
            .call(this.updateResizeHandlePositions.bind(this));
    }

    /**
     * Update the relative positions of the resize handles in the resize overlay.
     *
     * @param handleSelection the selection of all resize handles of a resize overlay
     */
    private updateResizeHandlePositions(handleSelection: Selection<SVGGElement, ResizeHandle, any, any>) {
        handleSelection.attr('transform', (handle) => {
            const translate = `translate(${handle.x},${handle.y})`;

            // handle rotation
            if (handle.rotation != null && handle.rotation !== 0) {
                return `${translate} rotate(${handle.rotation})`;
            } else {
                return translate;
            }
        });
    }

    /**
     * Update the positions of the resize overlays.
     *
     * @param overlaySelection a selection of resize overlays
     */
    private updateOverlayPositions(overlaySelection: Selection<SVGGElement, string, SVGGElement, any>) {
        const self = this;
        overlaySelection.each(function(nodeId) {
            const node = self.graphEditor.getNode(nodeId);
            select(this).attr('transform', `translate(${node.x},${node.y})`);
        });
    }

    /**
     * Resize a node to the given dimensions.
     *
     * Equivalent to `resizeNodeToBBox(nodeId, {x: - (width / 2), y: - (height / 2), width: width, height: height}, resizeStrategy)`.
     *
     * @param nodeId the id of the node to resize
     * @param width the new width of the node
     * @param height the new height of the node
     * @param resizeStrategy the resize strategy to use (default: 'default')
     */
    public resizeNode(nodeId: string|number, width: number, height: number, resizeStrategy?: string): void {
        const dimensions: Rect = {
            x: - (width / 2),
            y: - (height / 2),
            width: width,
            height: height,
        };
        this.resizeNodeToBBox(nodeId, dimensions, resizeStrategy);
    }

    /**
     * Resize the node to fit into the given dimensions.
     *
     * The dimensions are given as a bounding box relative to the node coordinates.
     *
     * @param nodeId the id of the node to resize
     * @param dimensions the bounding box relative to the node position to which to fit the node into
     * @param resizeStrategy the resize strategy to use (default: 'default')
     */
    public resizeNodeToBBox(nodeId: string|number, dimensions: Rect, resizeStrategy?: string): void {
        if (this.currentlyResizing.has(nodeId.toString())) {
            // TODO error Cannot resize node while it is still dragged!
            return;
        }
        if (dimensions.width <= 0) {
            // TODO error
            return;
        }
        if (dimensions.height <= 0) {
            // TODO error
            return;
        }
        const node = this.graphEditor.getNode(nodeId);
        const strat = this.resizeStrategies.get(resizeStrategy ?? 'default');
        if (node == null) {
            // TODO error
            return;
        }
        if (strat == null) {
            // TODO error
            return;
        }
        this._resizeNode(strat, node, dimensions); // TODO add event subject
    }

    /**
     * Resize a node to fit into the given bounding box.
     *
     * @param resizeStrategy the resize strategy to use to resize the node
     * @param node the node to resize
     * @param newRect the new dimesnions to fit the node into
     */
    private _resizeNode(resizeStrategy: ResizeStrategy, node: Node, newRect: Rect): RotationVector {
        const oldBBox = this.graphEditor.getNodeBBox(node);
        const oldPos: Point = {x: node.x, y: node.y};
        try { // TODO better error handling for user provided resize strategies
            resizeStrategy.applyNewDimensions(node, newRect.width, newRect.height, this.graphEditor);
        } catch (error) {
            console.error(`An error occured while applying the new dimensions to the node ${node.id}.`, error);
        }
        try {
            resizeStrategy.fitIntoBoundingBox(node, newRect, this.graphEditor);
        } catch (error) {
            console.error(`An error occured while moving the node ${node.id} into the new bounding box.`, error);
        }
        this.graphEditor.completeRender();
        const newBBox = this.graphEditor.getNodeBBox(node);
        const nodeShift: RotationVector = {dx: node.x - oldPos.x, dy: node.y - oldPos.y};
        // TODO event for resizing node!
        return nodeShift;
    }


    /**
     * Get a resize handler that maps resize handle movement to bounding box resizes.
     *
     * The handler respects the options defined in the ResizeOverlayOptions that
     * constrain the resizing operations.
     *
     * @param options the resize options for the resize overlay
     * @param handle the handle of the resize overlay that is dragged by the user
     */
    // eslint-disable-next-line complexity
    private resizeHandlerFromHandle(options: ResizeOverlayOptions, handle: ResizeHandle): ResizeHandler {

        // setup option variables for handlers
        let minWidth = 1;
        let minHeight = 1;
        let maxWidth = Infinity;
        let maxHeight = Infinity;

        if (options.minWidth > 0) {
            minWidth = options.minWidth;
        }
        if (options.minHeight > 0) {
            minHeight = options.minHeight;
        }

        if (options.maxWidth >= minWidth) {
            maxWidth = options.maxWidth;
        }
        if (options.maxHeight >= minHeight) {
            maxHeight = options.maxHeight;
        }

        const preserveRatio = options.preserveRatio ?? false;
        const preserveRatioOnDiagonals = options.preserveRatioOnDiagonals ?? preserveRatio;
        const symmetricHorizontal = options.symmetric || options.symmetricHorizontal || false;
        const symmetricVertical = options.symmetric || options.symmetricVertical || false;

        // handlers for diagonals

        if (handle.type === 'top-left') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) { // handle symmetry
                    dx *= 2; // times 2 to mirror the same amount on the other side
                }
                if (symmetricVertical) { // handle symmetry
                    dy *= 2;
                }
                let cdx = -clampDelta(-dx, rect.width, minWidth, maxWidth);
                let cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                if (preserveRatioOnDiagonals) { // handle aspect ratio
                    dy = cdy;
                    const ratio = rect.height / rect.width;
                    dy = cdx * ratio; // calculate height delta from width delta and ratio
                    cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight); // adjust to fit bounds
                    if (cdy !== 0) { // do not divide by 0
                        cdx = cdx * (cdy / dy);
                    } else {
                        cdx = 0; // do not alter width if height is not changing
                    }
                }
                return {
                    x: rect.x + (symmetricHorizontal ? (cdx / 2) : cdx),
                    y: rect.y + (symmetricVertical ? (cdy / 2) : cdy),
                    width: rect.width - cdx,
                    height: rect.height - cdy,
                };
            };
        }

        if (handle.type === 'top-right') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) { // handle symmetry
                    dx *= 2;
                }
                if (symmetricVertical) { // handle symmetry
                    dy *= 2;
                }
                let cdx = clampDelta(dx, rect.width, minWidth, maxWidth);
                let cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                if (preserveRatioOnDiagonals) { // handle aspect ratio
                    dy = cdy;
                    const ratio = rect.height / rect.width;
                    dy = -cdx * ratio;
                    cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                    if (cdy !== 0) {
                        cdx = cdx * (cdy / dy);
                    } else {
                        cdx = 0;
                    }
                }
                return {
                    x: rect.x - (symmetricHorizontal ? (cdx / 2) : 0),
                    y: rect.y + (symmetricVertical ? (cdy / 2) : cdy),
                    width: rect.width + cdx,
                    height: rect.height - cdy,
                };
            };
        }

        if (handle.type === 'bottom-left') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) { // handle symmetry
                    dx *= 2;
                }
                if (symmetricVertical) { // handle symmetry
                    dy *= 2;
                }
                let cdx = -clampDelta(-dx, rect.width, minWidth, maxWidth);
                let cdy = clampDelta(dy, rect.height, minHeight, maxHeight);
                if (preserveRatioOnDiagonals) { // handle aspect ratio
                    dy = cdy;
                    const ratio = rect.height / rect.width;
                    dy = -cdx * ratio;
                    cdy = clampDelta(dy, rect.height, minHeight, maxHeight);
                    if (cdy !== 0) {
                        cdx = cdx * (cdy / dy);
                    } else {
                        cdx = 0;
                    }
                }
                return {
                    x: rect.x + (symmetricHorizontal ? (cdx / 2) : cdx),
                    y: rect.y - (symmetricVertical ? (cdy / 2) : 0),
                    width: rect.width - cdx,
                    height: rect.height + cdy,
                };
            };
        }

        if (handle.type === 'bottom-right') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) { // handle symmetry
                    dx *= 2;
                }
                if (symmetricVertical) { // handle symmetry
                    dy *= 2;
                }
                let cdx = clampDelta(dx, rect.width, minWidth, maxWidth);
                let cdy = clampDelta(dy, rect.height, minHeight, maxHeight);
                if (preserveRatioOnDiagonals) { // handle aspect ratio
                    dy = cdy;
                    const ratio = rect.height / rect.width;
                    dy = cdx * ratio;
                    cdy = clampDelta(dy, rect.height, minHeight, maxHeight);
                    if (cdy !== 0) {
                        cdx = cdx * (cdy / dy);
                    } else {
                        cdx = 0;
                    }
                }
                return {
                    x: rect.x - (symmetricHorizontal ? (cdx / 2) : 0),
                    y: rect.y - (symmetricVertical ? (cdy / 2) : 0),
                    width: rect.width + cdx,
                    height: rect.height + cdy,
                };
            };
        }

        // handlers for vertical

        if (handle.type === 'top') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricVertical) { // handle symmetry
                    dy *= 2;
                }
                let cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                let cdx = 0;
                if (preserveRatio) { // handle aspect ratio
                    const ratio = rect.width / rect.height;
                    dx = cdy * ratio;
                    cdx = -clampDelta(-dx, rect.width, minWidth, maxWidth);
                    if (cdx !== 0) {
                        cdy = cdy * (cdx / dx);
                    } else {
                        cdy = 0;
                    }
                }
                return {
                    x: rect.x + (cdx / 2),
                    y: rect.y + (symmetricVertical ? (cdy / 2) : cdy),
                    width: rect.width - cdx,
                    height: rect.height - cdy,
                };
            };
        }

        if (handle.type === 'bottom') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricVertical) { // handle symmetry
                    dy *= 2;
                }
                let cdy = clampDelta(dy, rect.height, minHeight, maxHeight);
                let cdx = 0;
                if (preserveRatio) { // handle aspect ratio
                    const ratio = rect.width / rect.height;
                    dx = -cdy * ratio;
                    cdx = -clampDelta(-dx, rect.width, minWidth, maxWidth);
                    if (cdx !== 0) {
                        cdy = cdy * (cdx / dx);
                    } else {
                        cdy = 0;
                    }
                }
                return {
                    x: rect.x + (cdx / 2),
                    y: rect.y - (symmetricVertical ? (cdy / 2) : 0),
                    width: rect.width - cdx,
                    height: rect.height + cdy,
                };
            };
        }

        // handlers for horizontal

        if (handle.type === 'left') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) { // handle symmetry
                    dx *= 2;
                }
                let cdx = -clampDelta(-dx, rect.width, minWidth, maxWidth);
                let cdy = 0;
                if (preserveRatio) { // handle aspect ratio
                    const ratio = rect.height / rect.width;
                    dy = cdx * ratio;
                    cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                    if (cdy !== 0) {
                        cdx = cdx * (cdy / dy);
                    } else {
                        cdx = 0;
                    }
                }
                return {
                    x: rect.x + (symmetricHorizontal ? (cdx / 2) : cdx),
                    y: rect.y + (cdy / 2),
                    width: rect.width - cdx,
                    height: rect.height - cdy,
                };
            };
        }

        if (handle.type === 'right') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) { // handle symmetry
                    dx *= 2;
                }
                let cdx = clampDelta(dx, rect.width, minWidth, maxWidth);
                let cdy = 0;
                if (preserveRatio) { // handle aspect ratio
                    const ratio = rect.height / rect.width;
                    dy = -cdx * ratio;
                    cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                    cdx = cdx * (cdy / dy);
                    if (cdy !== 0) {
                        cdx = cdx * (cdy / dy);
                    } else {
                        cdx = 0;
                    }
                }
                return {
                    x: rect.x - (symmetricHorizontal ? (cdx / 2) : 0),
                    y: rect.y + (cdy / 2),
                    width: rect.width + cdx,
                    height: rect.height - cdy,
                };
            };
        }

        return (dx, dy, rect) => rect;
    }

}
