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

import { D3DragEvent, drag } from 'd3-drag';
import { select, Selection } from 'd3-selection';
import { curveBasis } from 'd3-shape';
import { D3ZoomEvent, zoom, ZoomBehavior, zoomIdentity, zoomTransform, ZoomTransform } from 'd3-zoom';
import { NodeRenderer } from './rendering/node-renderer';
import { NodeDropZone } from './drop-zone';
import { DefaultTextComponentTemplate } from './dynamic-templates/dynamic-template';
import { EdgePathGenerator, SmoothedEdgePathGenerator } from './dynamic-templates/edge-path-generators';
import { DraggedEdge, Edge, edgeId, Point } from './edge';
import { GroupingManager } from './grouping';
import { LinkHandle } from './link-handle';
import { Node, NodeMovementInformation } from './node';
import { GraphObjectCache } from './object-cache';
import { ExtrasRenderer } from './rendering/extras-renderer';
import { DynymicTemplateRegistry, EdgePathGeneratorRegistry, StaticTemplateRegistry } from './templating';
import { Rect, squaredPointDistance } from './util';
import { EdgeRenderer } from './rendering/edge-renderer';


const SHADOW_DOM_TEMPLATE = `
<slot name="graph"></slot>
`.trim();

/**
 * An enum describing the source of the event.
 *
 * All events that happen because of API interactions will have the API value.
 * All events that were directly triggered by the user will have the USER_INTERACTION value.
 */
// eslint-disable-next-line no-shadow
export enum EventSource {
    INTERNAL = 'INTERNAL',
    API = 'API',
    USER_INTERACTION = 'USER_INTERACTION',
}

export interface NodeDragBehaviour<T> {
    subject: T;
    container?: SVGElement;
    onStart?: (event: D3DragEvent<SVGGElement, Node, NodeDragBehaviour<unknown>>, subject: T, g: GraphEditor) => void;
    onDrag?: (event: D3DragEvent<SVGGElement, Node, NodeDragBehaviour<unknown>>, subject: T, g: GraphEditor) => void;
    onEnd?: (event: D3DragEvent<SVGGElement, Node, NodeDragBehaviour<unknown>>, subject: T, g: GraphEditor) => void;
}


export default class GraphEditor extends HTMLElement {

    private resizeObserver;

    private svgTemplate: string;
    private svgDocument;

    private svg: Selection<SVGSVGElement, any, any, any>;
    private graph: Selection<SVGGElement, any, any, any>;
    private nodesGroup: Selection<SVGGElement, any, any, any>;
    private edgesGroup: Selection<SVGGElement, any, any, any>;

    private root: ShadowRoot;
    private zoom: ZoomBehavior<any, any>;
    private currentZoom: ZoomTransform;

    private contentMaxHeight = 1;
    private contentMaxWidth = 1;

    private hovered: Set<number | string> = new Set();

    private _classes: string[];
    private classesToRemove: Set<string>;
    private _nodes: Node[];
    private _edges: Edge[];
    private draggedEdges: DraggedEdge[];

    // interaction modifiers
    private _zoomMode: 'none' | 'manual' | 'automatic' | 'both' = 'both';
    private _nodeClickInteraction: 'none' | 'select' | 'link' = 'select';
    private _nodeDragInteraction: 'none' | 'move' | 'link' = 'move';
    private _edgeDragInteraction: 'none' | 'link' = 'link';
    private _backgroundDragInteraction: 'none' | 'move' | 'zoom' | 'select' | 'custom' = 'move';
    private _selectionMode: 'none' | 'single' | 'multiple' = 'multiple';

    private _selectedNodes: Set<string> = new Set<string>();
    private _selectedLinkSource: string|number = null;
    private _selectedLinkTarget: string|number = null;
    /**
     * The static template registry.
     *
     * The templates will be automatically loaded when the svg changes or `updateTemplates` gets called.
     */
    public staticTemplateRegistry: StaticTemplateRegistry;
    /**
     * The dynamic template registry of this graph.
     *
     * The dynamic template registry does not get cleared automatically when the other
     * templates get updated!
     */
    public dynamicTemplateRegistry: DynymicTemplateRegistry;
    /**
     * The edge path generator registry of this graph.
     *
     * The registry does not get cleared automatically when the other
     * templates get updated!
     */
    public edgePathGeneratorRegistry: EdgePathGeneratorRegistry;
    public readonly defaultEdgePathGenerator: EdgePathGenerator;

    /* Renderers that implement the actual rendering methods. */

    /**
     * Renderer for common rendering functionality found in nodes and edges.
     *
     * Do not call methods from this object directly!
     * Do not replace this object!
     */
    public extrasRenderer: ExtrasRenderer;

    /**
     * Renderer for node specific rendering functionality.
     *
     * Do not call methods from this object directly!
     * Do not replace this object!
     */
    public nodeRenderer: NodeRenderer;

    /**
     * Renderer for edge specific rendering functionality.
     *
     * Do not call methods from this object directly!
     * Do not replace this object!
     */
    public edgeRenderer: EdgeRenderer;

    /**
     * Object responsible for managing node groups and group behaviours.
     *
     * Do not replace this object!
     */
    public groupingManager: GroupingManager;

    /**
     * The object cache responsible for fast access of nodes and edges.
     */
    private objectCache: GraphObjectCache;


    /** Private property to determine if the graph can be drawn. */
    private get initialized(): boolean {
        return this.svg != null && !this.svg.empty() && this.isConnected;
    }

    /**
     * Callback before the graph is updated by the `completeRender` method.
     *
     * Use this callback to reorder nodeList or edgeList to change which node/edge
     * gets drawn above which node/edge. See also `GroupingManager.getGroupDepthOf`.
     *
     * @param eventSource The eventSource used for the render event dispatched later by `completeRender`.
     */
    public onBeforeCompleteRender: (eventSource: EventSource) => void;

    /**
     * Callback before a Node is moved.
     *
     * Use this callback to manipulate the provided movement information.
     * The callback must return the modified movement information.
     * If the callback returns null the node movement is cancelled.
     *
     * @param nodeMovementInfo the movement information containing the node that is about to move
     * @returns the modified movement information
     */
    public onBeforeNodeMove: (nodeMovementInfo: NodeMovementInformation) => NodeMovementInformation;

    /**
     * Callback when a new dragged edge is created.
     *
     * Use this callback only to customize the edge attributes like markers or type!
     * The callback must return the modified edge.
     * If the callback returns null the drag is cancelled.
     *
     * @param edge the newly created dragged edge
     * @returns the modified dragged edge
     */
    public onCreateDraggedEdge: (edge: DraggedEdge) => DraggedEdge;

    /**
     * Callback dragged edge has a new target.
     *
     * Only modify the existing edge!
     *
     * @param edge the dragged edge
     * @param sourceNode the source node of the edge
     * @param targetNode the target node of the edge (may be `null` if the edge currently has no target)
     */
    public onDraggedEdgeTargetChange: (edge: DraggedEdge, sourceNode: Node, targetNode?: Node) => void;

    /**
     * Callback when a existing dragged edge is dropped.
     *
     * Use this callback only to customize the edge attributes like markers or type!
     * The callback must return the modified edge.
     * The returned edge must not be `null`!
     *
     * @param edge the dragged edge
     * @param sourceNode the source node of the edge
     * @param targetNode the target node of the edge (is never `null` when dropping the edge on a target)
     * @returns the updated edge object (must NOT be `null`)
     */
    public onDropDraggedEdge: (edge: DraggedEdge, sourceNode: Node, targetNode: Node) => Edge;

    /**
     * Callback to set/unset a given class for a node.
     *
     * The callback will be called for each class defined in `classes` for each node.
     *
     * @param className the css class to be set for the node
     * @param node the node to set the class for
     * @returns `true` iff the class should be set for this node, false if not
     */
    public setNodeClass: (className: string, node: Node) => boolean;

    /**
     * Callback to set/unset a given class for an edge.
     *
     * The callback will be called for each class defined in `classes` for each edge.
     *
     * @param className the css class to be set for the edge
     * @param edge the edge to set the class for
     * @param sourceNode the source node of the edge
     * @param the target node of the edge (may be `null` for dragged edges without a target)
     * @returns `true` iff the class should be set for this edge, false if not
     */
    public setEdgeClass: (className: string, edge: Edge | DraggedEdge, sourceNode: Node, targetNode?: Node) => boolean;

    /**
     * Callback to calculate LinkHandle lists used for rendering edges.
     *
     * This will NOT affect displayed link handles of nodes!
     *
     * Use this callback to customize where an edge attaches to a node.
     * If more than one link handle is in the result list the nearest one will be used.
     * If the list is empty or null then the LinkHandles of the template will be used.
     *
     * @param edge the edge to calculate the link handles for
     * @param sourceHandles the current list of link handles for the edge source
     * @param source the source node
     * @param targetHandles the current list of link handles for the edge target
     * @param target the current target node (for dragged edges without a target this is a `Point`)
     * @returns an object containing the (altered) link handle lists
     */
    // eslint-disable-next-line max-len
    public calculateLinkHandlesForEdge: (edge: Edge | DraggedEdge, sourceHandles: LinkHandle[], source: Node, targetHandles: LinkHandle[], target: Node | Point) => { sourceHandles: LinkHandle[]; targetHandles: LinkHandle[] };


    /**
     * The current zoom transform of the zoom group in the svg.
     */
    public get currentZoomTransform(): ZoomTransform {
        return this.currentZoom;
    }

    /**
     * The currently visible area in graph coordinates.
     */
    public get currentViewWindow(): Rect {
        const minX = this.currentZoom.invertX(0);
        const minY = this.currentZoom.invertY(0);
        const maxX = this.currentZoom.invertX(this.contentMaxWidth);
        const maxY = this.currentZoom.invertY(this.contentMaxHeight);
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }

    public get classes(): string[] {
        return this._classes;
    }

    /**
     * The list of css classes used for dynamic css classes together with `setNodeClass` or `setEdgeClass`.
     */
    public set classes(classes: string[]) {
        const deduped = new Set<string>();
        classes.forEach(className => deduped.add(className));

        if (this._classes != null && this._classes.length === deduped.size && this._classes.every(cls => deduped.has(cls))) {
            // nothing has changed, skip updates
            return;
        }

        if (this._classes != null) {
            this._classes.forEach(className => this.classesToRemove.add(className));
        }
        const newClasses = new Array(...deduped);
        newClasses.sort();
        this._classes = newClasses;
        newClasses.forEach(className => this.classesToRemove.delete(className));

        // update attribute
        const isJson = this.getAttribute('classes').trim().startsWith('[');
        if (isJson) {
            this.setAttribute('classes', JSON.stringify(newClasses));
        } else {
            this.setAttribute('classes', newClasses.join(' '));
        }
    }

    public get nodeList(): Node[] {
        return this._nodes;
    }

    /**
     * The list of nodes.
     *
     * This list should **not** be altered outside without updating the cache!
     * Use `addNode` and `removeNode` to keep the cache consistent.
     *
     * Changing this list directly may lead to **inconsistencies** as there may
     * still be **edges pointing to already** removed nodes!
     */
    public set nodeList(nodes: Node[]) {
        const oldNodes = this._nodes;

        // save added nodes for later
        const addedNodes: Node[] = [];
        nodes.forEach(node => {
            if (this.objectCache.getNode(node.id) == null) {
                addedNodes.push(node);
            }
        });

        // update data and cache
        this._nodes = nodes;
        this.objectCache.updateNodeCache(nodes);

        // save removed nodes for later
        const removedNodes: Node[] = [];
        oldNodes.forEach(node => {
            if (this.objectCache.getNode(node.id) == null) {
                removedNodes.push(node);
            }
        });

        // fire events
        removedNodes.forEach(node => {
            this.onNodeRemove(node, EventSource.API);
        });
        addedNodes.forEach(node => {
            this.onNodeCreate(node, EventSource.API);
        });
    }

    public get edgeList(): Edge[] {
        return this._edges;
    }

    public get draggedEdgeList(): DraggedEdge[] {
        return this.draggedEdges;
    }

    /**
     * The list of edges.
     *
     * This list should **not** be altered without updating the cache!
     * Use `addEdge` and `removeEdge` to keep the cache consistent.
     */
    public set edgeList(edges: Edge[]) {
        const oldEdges = this._edges;

        // save added edges for later
        const addedEdges: Edge[] = [];
        edges.forEach(edge => {
            if (this.objectCache.getEdge(edgeId(edge)) == null) {
                addedEdges.push(edge);
            }
        });

        // update data and cache
        this._edges = edges;
        this.objectCache.updateEdgeCache(edges);

        // save removed edges for later
        const removedEdges: Edge[] = [];
        oldEdges.forEach(edge => {
            if (this.objectCache.getEdge(edgeId(edge)) == null) {
                removedEdges.push(edge);
            }
        });

        // fire events
        removedEdges.forEach(edge => {
            this.onEdgeRemove(edge, EventSource.API, false);
        });
        addedEdges.forEach(edge => {
            this.onEdgeCreate(edge, EventSource.API, false);
        });
    }

    /**
     * The currently selected nodes.
     */
    public get selected(): Set<string> {
        const selected: Set<string> = this._selectedNodes ?? new Set();
        return selected;
    }

    public get zoomMode(): 'none' | 'manual' | 'automatic' | 'both' {
        return this._zoomMode;
    }

    /**
     * The zoom mode of the grapheditor.
     *
     * Controls how the grapheditor handles automatic and manual zoom to fit graph to view.
     * Does not affect zoom using `this.zoomToBoundingBox(true)` or `this.zoomToBox`.
     *
     * - `none` - Disables automatic and manual zoom (disables all zoom gestures)
     * - `manual`- Disables automatic zoom but allows for manual zoom gestures
     * - `automatic` - Disables all user zoom gestures but allows automatic zoom to bounding box
     * - `both` - Allows both user zoom gestures and automatic zoom
     */
    public set zoomMode(mode: 'none' | 'manual' | 'automatic' | 'both') {
        this.setAttribute('zoom', mode);
    }

    public get nodeClickInteraction(): 'none' | 'select' | 'link' {
        return this._nodeClickInteraction;
    }

    /**
     * The current node-click interaction of the grapheditor.
     *
     * Controls the default behaviour on node click events.
     *
     * - `none` - No default behaviour (use this to implement custom behaviours)
     * - `select` - Clicking selects/deselects a node
     * - `link` - Clicking on the first node selects it as source and clicking
     *   on the second node creates an edge from the source to the second node
     */
    public set nodeClickInteraction(mode: 'none' | 'select' | 'link') {
        this.setAttribute('node-click', mode);
    }

    public get nodeDragInteraction(): 'none' | 'move' | 'link' {
        return this._nodeDragInteraction;
    }

    /**
     * The current node-drag interaction of the grapheditor.
     *
     * Controls what happens when a node is dragged.
     *
     * - `none` - Disables node dragging entirely
     * - `move` - Moves the node around
     * - `link` - Dragging creates a new edge (same as dragging a link handle of a node)
     */
    public set nodeDragInteraction(mode: 'none' | 'move' | 'link') {
        this.setAttribute('node-drag', mode);
    }

    public get edgeDragInteraction(): 'none' | 'link' {
        return this._edgeDragInteraction;
    }

    /**
     * The current edge-drag interaction of the grapheditor.
     *
     * Controls what happens when an edge is dragged.
     *
     * - `none` - Disables dragging entirely
     * - `link` - Dragging edges allows linking/unlinking nodes
     */
    public set edgeDragInteraction(mode: 'none' | 'link') {
        this.setAttribute('edge-drag', mode);
    }

    public get backgroundDragInteraction(): 'none' | 'move' | 'zoom' | 'select' | 'custom' {
        return this._backgroundDragInteraction;
    }

    /**
     * The current background-drag interaction of the grapheditor.
     *
     * Controls how drag gestures on the graph background are handled.
     *
     * - `none` - Drag gesture is ignored
     * - `move` - Dragging moves the entire graph around
     * - `zoom` - Dragging draws a bounding box, which will be zoomed to on drag end
     * - `select` - Dragging draws a bounding box, which will select all nodes inside on drag end
     * - `custom` - Dragging draws a bounding box without any default behaviour (use this to implement custom behaviour)
     */
    public set backgroundDragInteraction(mode: 'none' | 'move' | 'zoom' | 'select' | 'custom') {
        this.setAttribute('background-drag', mode);
    }

    public get selectionMode(): 'none' | 'single' | 'multiple' {
        return this._selectionMode;
    }

    /**
     * The current selection mode of the grapheditor.
     *
     * Controls how node selections are handled.
     * This only applies to future selections and does not impact the current selected nodes!
     *
     * - `none` - Node selections are disabled
     * - `single` - Only a single node can be selected at the same time
     * - `multiple` - Multiple nodes can be selected at the same time
     */
    public set selectionMode(mode: 'none' | 'single' | 'multiple') {
        this.setAttribute('select', mode);
    }

    constructor() {
        super();
        this._classes = [];
        this.classesToRemove = new Set();
        this._nodes = [];
        this._edges = [];
        this.draggedEdges = [];
        this.staticTemplateRegistry = new StaticTemplateRegistry();
        this.dynamicTemplateRegistry = new DynymicTemplateRegistry();
        this.objectCache = new GraphObjectCache();
        this.edgePathGeneratorRegistry = new EdgePathGeneratorRegistry();
        this.defaultEdgePathGenerator = new SmoothedEdgePathGenerator(curveBasis, true, 10);
        this.edgePathGeneratorRegistry.addEdgePathGenerator('default', this.defaultEdgePathGenerator);

        this.extrasRenderer = new ExtrasRenderer(this);
        this.nodeRenderer = new NodeRenderer(this, this.objectCache);
        this.edgeRenderer = new EdgeRenderer(this, this.objectCache);
        this.groupingManager = new GroupingManager(this);

        this.root = this.attachShadow({ mode: 'open' });

        // preload shadow dom with html
        select(this.root as any).html(SHADOW_DOM_TEMPLATE);

        // monitor graph slot
        const self = this;
        select(this.root as any).select('slot[name="graph"]').on('slotchange', function () {
            self.graphSlotChanged(this as HTMLSlotElement);
        });

        // update size if window was resized
        if ((window as any).ResizeObserver != null) {
            this.resizeObserver = new (window as any).ResizeObserver((entries) => {
                if (this.svg != null) { // only if svg is initialized
                    this.updateSize();
                }
            });
        }
    }

    connectedCallback(): void {
        if (!this.isConnected) {
            return;
        }

        // bind resize observer to parent node
        if (this.resizeObserver != null) {
            this.resizeObserver.disconnect();
            this.resizeObserver.observe(this.parentElement);
        }

        // load svg template
        this.loadSvgFromTemplate();

        // initial render after connect
        this.completeRender(false, EventSource.INTERNAL);
        this.zoomToBoundingBox(false);
    }

    /**
     * Get all observed attributes of this webcomponent.
     */
    static get observedAttributes(): string[] {
        // TODO remove deprecated mode attribute later
        return ['nodes', 'edges', 'classes', 'mode', 'zoom', 'selection', 'node-click', 'node-drag', 'edge-drag', 'background-drag', 'svg-template'];
    }

    /**
     * Callback when an attribute changed in html dom.
     *
     * @param name name of the attribute that changed
     * @param oldValue old value
     * @param newValue new value
     */
    // eslint-disable-next-line complexity
    attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
        if (oldValue === newValue) {
            // nothing to change
            return;
        }
        let needsRender = false;
        let needsZoom = false;
        if (name === 'svg-template' && this.svgTemplate !== newValue) {
            this.svgTemplate = newValue;
            this.loadSvgFromTemplate();
            needsRender = true;
        }
        if (name === 'nodes') {
            try {
                this.nodeList = JSON.parse(newValue);
                needsRender = true;
            } catch (err) {
                console.warn(
                    'Passing JSON with \' instead of " is deprecated.'
                    + ' Support will be completely removed in the next major version!\n'
                    + 'Please use standard double quotes " for JSON and single quotes to wrap the JSON value for the HTML attribute.'
                );
                newValue = newValue.replace(/'/g, '"');
                this.nodeList = JSON.parse(newValue);
                needsRender = true;
            }
        }
        if (name === 'edges') {
            try {
                this.edgeList = JSON.parse(newValue);
                needsRender = true;
            } catch (err) {
                console.warn(
                    'Passing JSON with \' instead of " is deprecated.'
                    + ' Support will be completely removed in the next major version!\n'
                    + 'Please use standard double quotes " for JSON and single quotes to wrap the JSON value for the HTML attribute.'
                );
                newValue = newValue.replace(/'/g, '"');
                this.edgeList = JSON.parse(newValue);
                needsRender = true;
            }
        }
        if (name === 'classes') {
            let newClasses: string[];
            if (newValue.startsWith('[')) {
                try {
                    newClasses = JSON.parse(newValue);
                } catch (err) {
                    console.warn(
                        'Passing JSON with \' instead of " is deprecated.'
                        + ' Support will be completely removed in the next major version!\n'
                        + 'Please use standard double quotes " for JSON and single quotes to wrap the JSON value for the HTML attribute.'
                    );
                    newValue = newValue.replace(/'/g, '"');
                    newClasses = JSON.parse(newValue);
                }
            } else {
                newClasses = newValue.split(' ');
            }
            const oldClassesValue = this.classes;
            this.classes = newClasses;
            // only render on actual changes (test for object reference changes)
            needsRender = oldClassesValue !== this.classes;
        }
        if (name === 'zoom') {
            needsZoom = this._zoomMode !== newValue.toLowerCase();
            this.setZoomMode(newValue.toLowerCase());
        }
        if (name === 'mode') {
            // fallback setter, deprecated!
            // TODO remove in version >=0.8
            console.warn(
                'Using the "mode" attribute is deprecated and only partially supported in this version.'
                + ' Support will be completely removed in the next major version!\n'
                + 'Please use the new attributes ("selection", "node-click", "node-drag", "edge-drag", and "background-drag") instead.'
            );
            const val = newValue.toLowerCase();
            if (val === 'display') {
                this._selectionMode = 'multiple';
                this._backgroundDragInteraction = 'none';
                this._nodeClickInteraction = 'select';
                this._nodeDragInteraction = 'none';
                this._edgeDragInteraction = 'none';
            }
            if (val === 'layout' || val === 'select') {
                this._selectionMode = 'multiple';
                this._backgroundDragInteraction = 'move';
                this._nodeClickInteraction = 'select';
                this._nodeDragInteraction = 'move';
                this._edgeDragInteraction = 'link';
            }
            if (val === 'link') {
                this._selectionMode = 'multiple';
                this._backgroundDragInteraction = 'move';
                this._nodeClickInteraction = 'link';
                this._nodeDragInteraction = 'move';
                this._edgeDragInteraction = 'link';
            }
            // set new attributes
            this.setAttribute('selection', this._selectionMode);
            this.setAttribute('background-drag', this._backgroundDragInteraction);
            this.setAttribute('node-click', this._nodeClickInteraction);
            this.setAttribute('node-drag', this._nodeDragInteraction);
            this.setAttribute('edge-drag', this._edgeDragInteraction);
        }
        if (name === 'selection') {
            const val = newValue === '' ? 'multiple' : newValue.toLowerCase();
            if (val === 'none' || val === 'single' || val === 'multiple') {
                this._selectionMode = val;
            } else {
                console.warn(`Only "none", "single" and "multiple" are valid values for the selection attribute (got "${newValue}").`);
            }
        }
        if (name === 'node-click') {
            const val = newValue === '' ? 'select' : newValue.toLowerCase();
            if (val === 'none' || val === 'select' || val === 'link') {
                this._nodeClickInteraction = val;
            } else {
                console.warn(`Only "none", "select" and "link" are valid values for the node-click attribute (got "${newValue}").`);
            }
        }
        if (name === 'node-drag') {
            const val = newValue === '' ? 'move' : newValue.toLowerCase();
            if (val === 'none' || val === 'move' || val === 'link') {
                this._nodeDragInteraction = val;
            } else {
                console.warn(`Only "none", "move" and "link" are valid values for the node-drag attribute (got "${newValue}").`);
            }
        }
        if (name === 'edge-drag') {
            const val = newValue === '' ? 'link' : newValue.toLowerCase();
            if (val === 'none' || val === 'link') {
                this._edgeDragInteraction = val;
            } else {
                console.warn(`Only "none" and "link" are valid values for the edge-drag attribute (got "${newValue}").`);
            }
        }
        if (name === 'background-drag') {
            const val = newValue === '' ? 'move' : newValue.toLowerCase();
            if (val === 'none' || val === 'move' || val === 'zoom' || val === 'select' || val === 'custom') {
                this._backgroundDragInteraction = val;
            } else {
                console.warn(`Only "none", "move", "zoom" and "select" are valid values for the background-drag attribute (got "${newValue}").`);
            }
        }
        if (needsRender) {
            this.completeRender(false, EventSource.INTERNAL);
        }
        if (needsRender || needsZoom) {
            this.zoomToBoundingBox(false);
        }
    }

    /**
     * Set nodes and redraw graph.
     *
     * The node list should **not** be updated outside the graph without calling `setNodes` again!
     * Use `addNode` and `removeNode` to update the list instead.
     *
     * @param nodes new nodeList
     * @param redraw if graph should be redrawn (default: `false`)
     */
    public setNodes(nodes: Node[], redraw: boolean = false): void {
        this.nodeList = nodes;
        if (redraw) {
            this.completeRender(false, EventSource.API);
            this.zoomToBoundingBox(false);
        }
    }

    /**
     * Add a single node to the graph.
     *
     * @param node node to add
     * @param redraw if graph should be redrawn (default: `false`)
     */
    public addNode(node: Node, redraw: boolean = false): void {
        this._nodes.push(node);
        this.objectCache.addNodeToCache(node);
        this.onNodeCreate(node, EventSource.API);
        if (redraw) {
            this.completeRender(false, EventSource.API);
            this.zoomToBoundingBox(false);
        }
    }

    /**
     * Get the node with the given id.
     *
     * @param nodeId the id of the node
     */
    public getNode(nodeId: number | string): Node {
        return this.objectCache.getNode(nodeId);
    }

    /**
     * Remove a single node from the graph.
     *
     * This method removes all edges connected to this node from the graph.
     * This method deselects the node before removing it.
     *
     * @param node node or id to remove
     * @param redraw if the graph should be redrawn (default: `false`)
     */
    public removeNode(node: Node | number | string, redraw: boolean = false): void {
        const nodeId: string | number = (node as Node).id != null ? (node as Node).id : (node as number | string);
        const index = this._nodes.findIndex(n => n.id === nodeId);
        if (index >= 0) {
            this.deselectNode(nodeId);

            const newEdgeList = [];
            this._edges.forEach(edge => {
                // eslint-disable-next-line eqeqeq
                if (edge.source == nodeId) { // number/string conversion is needed for this test
                    this.onEdgeRemove(edge, EventSource.API, false);
                    this.objectCache.removeEdgeFromCache(edge);
                    return;
                }
                // eslint-disable-next-line eqeqeq
                if (edge.target == nodeId) { // number/string conversion is needed for this test
                    this.onEdgeRemove(edge, EventSource.API, false);
                    this.objectCache.removeEdgeFromCache(edge);
                    return;
                }
                newEdgeList.push(edge);
            });

            this._edges = newEdgeList;
            this.onNodeRemove(this._nodes[index], EventSource.API);
            this._nodes.splice(index, 1);
            this.objectCache.removeNodeFromCache(nodeId.toString());

            if (redraw) {
                this.completeRender(false, EventSource.API);
                this.zoomToBoundingBox(false);
            }
        }
    }

    /**
     * Get all declared NodeDropZones of a node.
     *
     * @param node the node to get the drop zones of
     */
    public getNodeDropZonesForNode(node: Node | number | string): Map<string, NodeDropZone> {
        const id: string | number = (node as Node).id != null ? (node as Node).id : (node as number | string);
        return this.objectCache.getAllDropZones(id);
    }

    /**
     * Get the bounding box of a node.
     *
     * The box is relative to the node. Add `node.x` and `node.y` to the `x` and `y`
     * coordinates of the box to get a box at the correct coordinates.
     *
     * The bounding box is only available/updated after the node was rendered to the graph!
     *
     * The bounding box includes **all** displayed elements in the node group.
     * This especially includes the link handles not hidden with `disply: none`!
     *
     * Do **not** change the returned object directly!
     *
     * @param node the node to get the bounding box of
     */
    public getNodeBBox(node: Node | number | string): Rect {
        const id: string | number = (node as Node).id != null ? (node as Node).id : (node as number | string);
        return this.objectCache.getNodeBBox(id);
    }

    /**
     * Add a node to the selected set.
     *
     * This method will cause a 'selection' event if the selection has changed.
     * This method does not check if the nodeId exists.
     * If the selection mode is single this method ensures that only the passed node is selected.
     * This method returns silently if the selection mode is none.
     *
     * To update the graph the `updateHighlights` method is used iff `updateHighlights` is `true`.
     *
     * @param nodeId the id of the node to select
     * @param updateHighlights set this to true to update highlights immediately (default `false`)
     */
    public selectNode(nodeId: number | string, updateHighlights: boolean = false): void {
        if (this._selectionMode === 'none') {
            return; // selections are disabled
        }
        if (this._selectedNodes.has(nodeId.toString())) {
            return; // nothing changed
        }
        if (this._selectionMode === 'single') {
            // remove any previous selected node when only one node can be selected
            this._selectedNodes.clear();
        }
        this._selectedNodes.add(nodeId.toString());
        this.onSelectionChangeInternal(EventSource.API);
        if (updateHighlights) {
            this.updateHighlights();
        }
    }

    /**
     * Remove a node from the selected set.
     *
     * This method will cause a 'selection' event if the selection has changed.
     * This method does not check if the nodeId exists.
     * This method returns silently if the selection mode is none.
     *
     * To update the graph the `updateHighlights` method is used iff `updateHighlights` is `true`.
     *
     * @param nodeId the id of the node to deselect
     * @param updateHighlights set this to true to update highlights immediately (default `false`)
     */
    public deselectNode(nodeId: number | string, updateHighlights: boolean = false): void {
        if (this._selectionMode === 'none') {
            return; // selections are disabled
        }
        if (!this._selectedNodes.has(nodeId.toString())) {
            return; // nothing changed
        }
        this._selectedNodes.delete(nodeId.toString());
        this.onSelectionChangeInternal(EventSource.API);
        if (updateHighlights) {
            this.updateHighlights();
        }
    }

    /**
     * Completely replace the current node selection.
     *
     * Use an empty set or `null` to clear the current selection.
     *
     * This method will cause a 'selection' event if the selection has changed.
     * This method does not check if the node id's in the set exist.
     * If selection mode is 'single' th given set must only contain one node!
     * This method returns silently if the selection mode is none.
     *
     * @param selected the new set of selected node id's
     * @param updateHighlights set this to true to update highlights immediately (default `false`)
     */
    public changeSelected(selected: Set<string>, updateHighlights: boolean = false): void {
        if (this._selectionMode === 'none') {
            return; // selections are disabled
        }
        if (selected == null || selected.size <= 0) {
            this._selectedNodes.clear();
            this.onSelectionChangeInternal(EventSource.API);
        } else {
            if (this._selectionMode === 'single' && selected.size > 1) {
                throw Error('In "single" selection mode only a single node can be selected at a time!');
            }
            this._selectedNodes = selected;
            this.onSelectionChangeInternal(EventSource.API);
        }
        if (updateHighlights) {
            this.updateHighlights();
        }
    }

    /**
     * Set edges and redraw graph.
     *
     * The edge list should **not** be updated outside the graph without calling `setEdges` again!
     * Use `addEdge` and `removeEdge` to update the list instead.
     *
     * @param edges new edgeList
     * @param redraw if the graph should be redrawn (default: `false`)
     */
    public setEdges(edges: Edge[], redraw: boolean = false): void {
        this.edgeList = edges;
        if (redraw) {
            this.completeRender(false, EventSource.API);
            this.zoomToBoundingBox(false);
        }
    }

    /**
     * Add a single edge to the graph.
     *
     * @param edge edge to add
     * @param redraw if graph should be redrawn (default: `false`)
     * @param eventSource specify the event source type for the fired events
     * @returns true if the graph needs to be re-rendered to display changes
     */
    public addEdge(edge: Edge, redraw: boolean = false, eventSource: EventSource= EventSource.API): boolean {
        if (this.onEdgeCreate(edge, eventSource, eventSource !== EventSource.API)) {
            // event was not cancelled
            this._edges.push(edge);
            this.objectCache.addEdgeToCache(edge);
            if (redraw) {
                this.completeRender(false, eventSource);
                this.zoomToBoundingBox(false);
            } else {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the edge with the given id.
     *
     * @param edgeId the id of the edge (use the `edgeId` function to compute the id)
     */
    // eslint-disable-next-line no-shadow
    public getEdge(edgeId: number | string): Edge {
        return this.objectCache.getEdge(edgeId);
    }

    /**
     * Remove a single edge from the graph.
     *
     * @param edge edge to remove
     * @param redraw if the graph should be redrawn (default: `false`)
     * @param eventSource specify the event source type for the fired events
     * @returns true if the graph needs to be re-rendered to display changes
     */
    public removeEdge(edge: Edge | number | string, redraw: boolean = false, eventSource: EventSource= EventSource.API): boolean {
        let edgeIdToDelete: string;
        if (typeof (edge) === 'number') {
            edgeIdToDelete = edge.toString();
        } else if (typeof (edge) === 'string') {
            edgeIdToDelete = edge;
        } else {
            edgeIdToDelete = edgeId(edge);
        }
        const index = this._edges.findIndex((e) => edgeId(e) === edgeIdToDelete);
        if (index >= 0) {
            const removedEdge = this._edges[index];
            if (this.onEdgeRemove(removedEdge, eventSource, eventSource !== EventSource.API)) {
                this._edges.splice(index, 1);
                this.objectCache.removeEdgeFromCache(removedEdge);
                if (redraw) {
                    this.completeRender(false, eventSource);
                    this.zoomToBoundingBox(false);
                } else {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Get all edges that have the given nodeId as source.
     *
     * @param sourceNodeId the node id of the edge source
     */
    public getEdgesBySource(sourceNodeId: number | string): Set<Edge> {
        return this.objectCache.getEdgesBySource(sourceNodeId);
    }

    /**
     * Get all edges that have the given nodeId as target.
     *
     * @param targetNodeId the node id of the edge target
     */
    public getEdgesByTarget(targetNodeId: number | string): Set<Edge> {
        return this.objectCache.getEdgesByTarget(targetNodeId);
    }

    /**
     * Check if an edge is currently dragged by the user.
     *
     * @param edgeId the id of the edge to check
     * @returns true if a dragged edge exists that was created from this edge
     */
    // eslint-disable-next-line no-shadow
    public isEdgeCurrentlyDragged(edgeId: string|number): boolean {
        return this.draggedEdges.some((edge) => edge.createdFrom === edgeId);
    }

    /**
     * Set the graph zoom mode.
     *
     * @param mode zoom mode (one of ["none", "manual", "automatic", "both"])
     */
    // eslint-disable-next-line complexity
    public setZoomMode(mode: string): void {
        if (mode === this._zoomMode) {
            return;
        }
        const oldMode = this._zoomMode;
        if (mode === 'none') {
            if (this._zoomMode !== 'none') {
                this._zoomMode = 'none';
            }
        } else if (mode === 'manual') {
            if (this._zoomMode !== 'manual') {
                this._zoomMode = 'manual';
            }
        } else if (mode === 'automatic') {
            if (this._zoomMode !== 'automatic') {
                this._zoomMode = 'automatic';
            }
        } else if (mode === 'both') {
            if (this._zoomMode !== 'both') {
                this._zoomMode = 'both';
            }
        } else {
            console.warn(`Wrong zoom mode "${mode}". Allowed are: ["none", "manual", "automatic", "both"]`);
            return;
        }

        if (oldMode !== mode) {
            const ev = new CustomEvent('zoommodechange', {
                bubbles: true,
                composed: true,
                cancelable: false,
                detail: {
                    eventSource: EventSource.INTERNAL,
                    oldMode: oldMode,
                    newMode: mode,
                },
            });
            this.dispatchEvent(ev);
            this.completeRender(false, EventSource.INTERNAL);
        }
    }

    /**
     * Reload the svg template.
     *
     * Use this method to manually load the svg template if the template
     * is defined later in the dom than the grapheditor.
     */
    public reloadSvgTemplate() {
        this.loadSvgFromTemplate();
    }

    /**
     * Load the svg for the grapheditor from an svg template.
     *
     * The html template containing the svg is found with `this.svgTemplate`
     * that can be set with an attribute on the network-graph tag.
     *
     * If `this.svgTemplate` is not set this method does nothing.
     */
    private loadSvgFromTemplate() {
        if (!this.isConnected || this.svgTemplate == null) {
            return;
        }
        const svgTemplate = select<HTMLTemplateElement, unknown>(this.svgTemplate);
        if (svgTemplate.empty()) {
            return;
        }
        const clone = document.importNode(svgTemplate.node().content, true);
        const slotSelection = select(this.root as any).select<HTMLDivElement>('slot[name="graph"]');
        slotSelection.selectAll('svg').remove();
        slotSelection.node().append(clone);
        const svgSelection = slotSelection.select<SVGSVGElement>('svg');
        this.initialize(svgSelection.node());
        this.svgDocument = this.shadowRoot;
    }

    /**
     * Determine the svg element to be used to render the graph.
     *
     * @param slot the slot that changed
     */
    private graphSlotChanged(slot: HTMLSlotElement) {
        let svg;
        if (this.svg != null && !this.svg.empty()) {
            const oldSvg = this.svg.node();
            svg = slot.assignedElements().find(el => el === oldSvg);
        }
        if (svg == null) {
            svg = slot.assignedElements().find(el => el.tagName === 'svg');
        }
        if (svg == null) {
            if (this.svg != null || this.svgTemplate != null) {
                return; // svg not loaded via slot
            }
            // TODO use fallback svg here
            console.error('No svg provided for the "graph" slot!');
            return;
        }
        if (this.svg == null || this.svg.empty() || svg !== this.svg.node()) {
            // the svg changed!
            this.initialize(svg);
        }
        this.completeRender(false, EventSource.INTERNAL);
        this.zoomToBoundingBox(false);
        this.svgDocument = document;
    }

    /**
     * Initialize the provided svg.
     *
     * Setup group for zooming and groups for nodes and edges.
     * Add a missing `defs` tag.
     */
    public initialize(svg: SVGSVGElement): void {
        const oldSvg = this.svg;
        const newSvg = select<SVGSVGElement, unknown>(svg);

        newSvg.classed('graph-editor', true)
            .attr('width', '100%')
            .attr('height', '100%');

        // add defs tag if missing
        if (newSvg.select('defs').empty()) {
            newSvg.append('defs');
        }

        // setup graph groups //////////////////////////////////////////////
        let graph = newSvg.select<SVGGElement>('defs ~ g');
        if (graph.empty()) {
            graph = newSvg.append('g');
        }
        graph.classed('zoom-group', true);

        const newZoom = zoom()
            // eslint-disable-next-line complexity
            .filter((event: MouseEvent|TouchEvent) => {
                // mouse wheel events and doubleclick events only zoom
                const isZoomEvent = event.type === 'wheel' || event.type === 'dblclick';
                let allowZoomEvent = true;
                let allowDragMove = true;
                if (this._zoomMode === 'none' || this._zoomMode === 'automatic') {
                    // no user zoom (mouse wheel and doubleclick events)
                    allowZoomEvent = false;
                }
                if (this._backgroundDragInteraction === 'none') {
                    // filter out all drag events
                    allowDragMove = false;
                }
                const mouseButton: number = (event as MouseEvent).button ?? 0;
                if (mouseButton !== 0) {
                    // did not press primary button => reject event
                    return false;
                }
                if (this._backgroundDragInteraction === 'move') {
                    allowDragMove = true;
                }
                if (
                    this._backgroundDragInteraction === 'select'
                    || this._backgroundDragInteraction === 'zoom'
                    || this._backgroundDragInteraction === 'custom'
                ) {
                    allowDragMove = false;
                }
                if (isZoomEvent) {
                    // is zoom event => only reject if zoom is not allowed
                    return allowZoomEvent;
                }
                // is drag event => only allow if drag should move the entire graph
                return allowDragMove;
            })
            .on('zoom', (event: D3ZoomEvent<SVGGElement, unknown>, d) => {
                graph.attr('transform', event.transform.toString());
                const oldZoom = this.currentZoom;
                this.currentZoom = event.transform;
                let eventSource = EventSource.USER_INTERACTION;
                if (event.sourceEvent == null) {
                    // only direct user interaction has a source event
                    eventSource = EventSource.API;
                }
                this.onZoomChange(oldZoom, event.transform, eventSource);
            });

        let edgesGroup = graph.select<SVGGElement>('g.edges');
        if (edgesGroup.empty()) {
            edgesGroup = graph.append('g')
                .attr('class', 'edges');
        }

        let nodesGroup = graph.select<SVGGElement>('g.nodes');
        if (nodesGroup.empty()) {
            nodesGroup = graph.append('g')
                .attr('class', 'nodes');
        }

        // TODO cleanup old svg?
        if (oldSvg != null && !oldSvg.empty()) {
            console.warn('Switching to new SVG, old SVG needs to be disposed manually!');

            // cleanup listeners
            oldSvg.on('click', null);
        }

        this.svg = newSvg;
        this.zoom = newZoom;
        this.graph = graph;
        this.nodesGroup = nodesGroup;
        this.edgesGroup = edgesGroup;

        // listener for clicks on the graph background
        newSvg.on('click', (event: Event) => {
            if (event.target === newSvg.node()) {
                this.onBackgroundClick(event);
            }
        });

        this.updateTemplates();
        this.updateSize();
        this.onInitializedSVG(oldSvg);
    }

    /**
     * Calculate and store the size of the svg.
     */
    private updateSize() {
        if (this.svg == null) {
            console.error('No SVG to calculate size of!');
            return;
        }
        const svg = this.svg;
        this.contentMaxHeight = parseInt(svg.style('height').replace('px', ''), 10);
        this.contentMaxWidth = parseInt(svg.style('width').replace('px', ''), 10);
    }

    /**
     * Zooms and pans the graph to get all content inside the visible area.
     *
     * @param force if false only zooms in zoomMode 'automatic' and 'both' (default=true)
     */
    public zoomToBoundingBox = (force: boolean = true) => {
        if (!this.initialized || !this.isConnected) {
            return;
        }

        if (this.resizeObserver == null) {
            this.updateSize();
        }

        if (!(force || this._zoomMode === 'automatic' || this._zoomMode === 'both')) {
            return;
        }

        const svg = this.svg;

        const box: SVGRect = (svg.select('g.zoom-group').select('g.nodes').node() as any).getBBox();
        this.zoomToBox(box);
    };

    /**
     * Zoom to the given box.
     *
     * The box will be centered in the view with some padding around.
     *
     * @param box a box in graph coordinates
     * @param padding percentage of applied padding to the viewbox (0.1 == 10%). Set to 0 to remove padding.
     */
    public zoomToBox(box: Rect, padding: number= 0.1): void {
        let scaleFactor = 1;
        if (padding > 0 && padding < 1) {
            scaleFactor -= padding;
        }
        const scale = scaleFactor * Math.min(this.contentMaxWidth / box.width, this.contentMaxHeight / box.height);

        const xCorrection = (-box.x * scale) + ((this.contentMaxWidth - (box.width * scale)) / 2);
        const yCorrection = (-box.y * scale) + ((this.contentMaxHeight - (box.height * scale)) / 2);

        let newZoom = zoomIdentity
            .translate(xCorrection, yCorrection)
            .scale(scale);

        if (isNaN(xCorrection) || isNaN(yCorrection)) {
            newZoom = zoomIdentity;
        }
        this.svg.call(this.zoom.transform, newZoom);
    }

    /**
     * Update the template cache from the provided svg or the current svg.
     *
     * This method will add missing `default` and `default-marker` templates before updating the template cache.
     * It will also add a `default-textcomponent` template and a `default` EdgePathGenerator to the respective registrys.
     */
    public updateTemplates(svg?: Selection<SVGSVGElement, any, any, any>): void {
        if (svg != null) {
            this.addDefaultTemplates(svg);
            this.staticTemplateRegistry.updateTemplateCache(svg);
        } else {
            this.addDefaultTemplates(this.svg);
            this.staticTemplateRegistry.updateTemplateCache(this.svg);
        }
        if (this.dynamicTemplateRegistry.getDynamicTemplate('default-textcomponent') == null) {
            this.dynamicTemplateRegistry.addDynamicTemplate('default-textcomponent', new DefaultTextComponentTemplate());
        }
        if (this.edgePathGeneratorRegistry.getEdgePathGenerator('default') == null) {
            this.edgePathGeneratorRegistry.addEdgePathGenerator('default', this.defaultEdgePathGenerator);
        }
    }

    /**
     * Add missing default templates to the `defs` tag.
     *
     * This method will be automatically called if the svg changes.
     * If templates are changed call this method and make a `completeRender(true)`
     * to render the graph with the new templates.
     *
     * @param svg the svg to update
     */
    public addDefaultTemplates(svg: Selection<SVGSVGElement, any, any, any>): void {
        const defaultNodeTemplate = svg.select('defs > g[data-template-type="node"]#default');
        if (defaultNodeTemplate == null || defaultNodeTemplate.empty()) {
            svg.select('defs').append('g')
                .attr('id', 'default')
                .attr('data-template-type', 'node')
              .append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', 10)
                .attr('data-link-handles', 'minimal');
        }
        const defaultMarkerTemplate = svg.select('defs > g[data-template-type="marker"]#default-marker');
        if (defaultMarkerTemplate == null || defaultMarkerTemplate.empty()) {
            svg.select('defs').append('g')
                .attr('id', 'default-marker')
                .attr('data-template-type', 'marker')
                .attr('data-line-attachement-point', '3')
              .append('circle')
                .attr('cx', 0)
                .attr('cy', 0)
                .attr('r', 3);
        }
    }

    private attachZoomAndBrush() {
        const svg = this.svg;

        // attach zoom behaviour, current interaction modes are applied in event filter
        svg.call(this.zoom);

        // attach brush behaviour for background drag interaction
        const container = svg.select<SVGGElement>('g.zoom-group').node();
        svg.call(drag<SVGGElement, {rect: Selection<SVGRectElement, unknown, SVGGElement, unknown>; start: Point}>()
            .container(() => container)
            .subject(() => {
                if (this._backgroundDragInteraction === 'none') {
                    return; // no drag interaction
                }
                if (this._backgroundDragInteraction === 'move') {
                    return; // handled by zoom behaviour
                }
                if (this._backgroundDragInteraction === 'select' && this._selectionMode === 'none') {
                    return; // selection brush should only work if selections are allowed
                }
                const rect = select(container).append('rect').classed('brush', true);
                return {
                    rect: rect,
                    start: {x: 0, y: 0},
                };
            })
            .on('start', (event) => {
                const start: Point = (event as any).subject.start;
                start.x = (event as any).x;
                start.y = (event as any).y;
            })
            .on('drag', (e) => {
                const event = e as unknown as D3DragEvent<SVGGElement, unknown, {rect: Selection<SVGRectElement, unknown, SVGGElement, unknown>; start: Point}>;
                const start = event.subject.start;
                const minX = event.x < start.x ? event.x : start.x;
                const minY = event.y < start.y ? event.y : start.y;
                const width = Math.abs(start.x - event.x);
                const height = Math.abs(start.y - event.y);
                // update visible brush dimensions
                event.subject.rect
                    .attr('x', minX)
                    .attr('y', minY)
                    .attr('width', width)
                    .attr('height', height);
                // dispatch event
                this.onBrushMove(event as unknown as Event, {
                    x: minX,
                    y: minY,
                    width: width,
                    height: height,
                });
            })
            // eslint-disable-next-line complexity
            .on('end', (e) => {
                const event = e as unknown as D3DragEvent<SVGGElement, unknown, {rect: Selection<SVGRectElement, unknown, SVGGElement, unknown>; start: Point}>;
                event.subject.rect.remove(); // remove visible brush
                const start = event.subject.start;
                const minX = event.x < start.x ? event.x : start.x;
                const minY = event.y < start.y ? event.y : start.y;
                const width = Math.abs(start.x - event.x);
                const height = Math.abs(start.y - event.y);
                const maxX = event.x > start.x ? event.x : start.x;
                const maxY = event.y > start.y ? event.y : start.y;
                const brushRect = {
                    x: minX,
                    y: minY,
                    width: width,
                    height: height,
                };
                // dispatch brush end event
                this.onBrushRelease(event as unknown as Event, brushRect);

                if (this._backgroundDragInteraction === 'zoom') {
                    // zoom to drawn box
                    this.zoomToBox(brushRect);
                    return;
                }
                if (this._backgroundDragInteraction === 'select') {
                    const selected = new Set<string>();
                    this._nodes.forEach(node => {
                        if (node.x < minX || node.x > maxX) {
                            return; // node is not in drawn box
                        }
                        if (node.y < minY || node.y > maxY) {
                            return; // node is not in drawn box
                        }
                        selected.add(node.id.toString());
                    });
                    if (event.sourceEvent.shiftKey) {
                        // add existing selection if shift was pressed
                        this._selectedNodes.forEach(nodeId => selected.add(nodeId));
                    }
                    if (this._selectionMode === 'single' && selected.size > 1) {
                        // select the node that is closest to the brush center
                        // this should lead to predictable selections if only
                        // single node selection is allowed
                        const center: Point = {
                            x: brushRect.x + (brushRect.width / 2),
                            y: brushRect.y + (brushRect.height / 2),
                        };
                        let distance = Infinity;
                        let selectedNode: string = null;
                        selected.forEach(nodeId => {
                            const node = this.getNode(nodeId);
                            if (node == null) {
                                return; // safety check
                            }
                            const nodeDistance = squaredPointDistance(center, node);
                            if (nodeDistance < distance) {
                                distance = nodeDistance;
                                selectedNode = nodeId;
                            }
                        });
                        if (selectedNode != null) {
                            // only the node closest to the brush center will get selected
                            selected.clear();
                            selected.add(selectedNode);
                        } else {
                            // selection a single node has failed
                            return;
                        }
                    }
                    this._selectedNodes = selected;
                    this.onSelectionChangeInternal(EventSource.USER_INTERACTION);
                }
            })
        );
    }

    /**
     * Render all changes of the data to the graph.
     *
     * @param forceUpdateTemplates set to true if a template was changed,
     *      forces an entire re render by deleting all nodes and edges before adding them again
     * @param eventSource the event source used for render events (default: `EventSource.API`)
     */
    public completeRender(forceUpdateTemplates: boolean = false, eventSource: EventSource = EventSource.API): void {
        if (!this.initialized || !this.isConnected) {
            return;
        }

        try {
            this.onBeforeCompleteRender?.(eventSource);
        } catch (err) {
            console.warn('Executing onBeforeCompleteRender callback produced an error.', err);
        }

        this.attachZoomAndBrush();

        this.updateSize();

        // update nodes ////////////////////////////////////////////////////////
        this.nodeRenderer.completeNodeGroupsRender(this.nodesGroup, this._nodes, forceUpdateTemplates);

        // update edges ////////////////////////////////////////////////////////
        this.edgeRenderer.completeEdgeGroupsRender(this.edgesGroup, this._edges, forceUpdateTemplates);


        this.classesToRemove.clear();

        this.onRender(eventSource, 'complete');
    }

    /**
     * Get all nodes that are under the given screen/client coordinates.
     *
     * Use `getClientPointFromGraphCoordinates` to convert from graph coordinates
     * to client coordinates.
     *
     * @param clientX the x coordinate in the client coordinate system
     * @param clientY the y coordinate in the client coordinate system
     */
    public getNodesFromPoint(clientX: number, clientY: number): Node[] {
        const possibleTargets = this.svgDocument.elementsFromPoint(clientX, clientY);
        if (possibleTargets.length === 0) {
            return [];
        }
        const foundNodes = new Set<string>();
        const nodes: Node[] = [];
        for (let currentIndex = 0; currentIndex < possibleTargets.length; currentIndex++) {
            const element = possibleTargets[currentIndex];
            if (element === this.svg.node()) {
                break;
            }
            let target = select(element);

            while (!target.empty()) {
                if (target.classed('node')) {
                    const id = target.attr('data-id');
                    const node = this.objectCache.getNode(id);
                    if (node != null && !foundNodes.has(id)) {
                        foundNodes.add(id);
                        nodes.push(node);
                    }
                    break;
                }
                const parent = target.node().parentElement;
                if ((parent as unknown) === this.svg.node()) {
                    break;
                }
                target = select(parent);
            }
        }
        return nodes;
    }

    /**
     * Move a node to the coordinates (x,y).
     *
     * This method handles cases where a group captures the movement of a child node correctly.
     * This method also handles all group-join and -leave mechanics like for dragging nodes manually.
     *
     * For batch updates updatePositions is set to false.
     * Be aware that nodeDropPositions are only updated if the graph is rerendered!
     * This is only relevant for adding/removing dropZones or chainging their filters.
     *
     * If this method returns true a complete render might be neccessary to correctly display all changes!
     *
     * @param nodeId the node to move
     * @param x the target x coordinate of the node
     * @param y the target y coordinate of the node
     * @param updatePositions set this to true to automatically render all position changes (default: false)
     * @returns true iff the graph possibly needs a complete render to correctly display all changes
     */
    // eslint-disable-next-line complexity
    public moveNode(nodeId: string | number, x: number, y: number, updatePositions: boolean = false): boolean {
        const node = this.objectCache.getNode(nodeId);
        const nodeMovementInfo = this.nodeRenderer.getNodeMovementInformation(node, node.x, node.y);
        if (nodeMovementInfo == null) {
            return; // move was cancelled by callback
        }
        nodeMovementInfo.needsFullRender = nodeMovementInfo.needsFullRender ?? false;
        this.nodeRenderer.onNodeDrag('start', nodeMovementInfo, EventSource.API);
        const startTreeParent = this.groupingManager.getTreeParentOf(nodeMovementInfo.node.id);
        if (startTreeParent != null) {
            const behaviour = this.groupingManager.getGroupBehaviourOf(startTreeParent);
            if (behaviour.onNodeMoveStart != null) {
                const needRender = Boolean(
                    behaviour.onNodeMoveStart(startTreeParent, nodeMovementInfo.node.id.toString(), this.objectCache.getNode(startTreeParent), nodeMovementInfo.node, this)
                );
                nodeMovementInfo.needsFullRender = needRender || nodeMovementInfo.needsFullRender;
            }
        }
        nodeMovementInfo.needsFullRender = this.nodeRenderer.tryToLeaveCurrentGroup(nodeMovementInfo, x, y, EventSource.API) || nodeMovementInfo.needsFullRender;
        nodeMovementInfo.needsFullRender = this.nodeRenderer.tryJoinNodeIntoGroup(nodeMovementInfo, x, y, EventSource.API) || nodeMovementInfo.needsFullRender;

        nodeMovementInfo.needsFullRender = this.nodeRenderer.moveNodeInternal(nodeMovementInfo, x, y, EventSource.API) || nodeMovementInfo.needsFullRender;

        const endTreeParent = this.groupingManager.getTreeParentOf(nodeMovementInfo.node.id);
        if (endTreeParent != null) {
            const behaviour = this.groupingManager.getGroupBehaviourOf(endTreeParent);
            if (behaviour.onNodeMoveEnd != null) {
                const needRender = Boolean(
                    behaviour.onNodeMoveEnd(endTreeParent, nodeMovementInfo.node.id.toString(), this.objectCache.getNode(endTreeParent), nodeMovementInfo.node, this)
                );
                nodeMovementInfo.needsFullRender = needRender || nodeMovementInfo.needsFullRender;
            }
        }
        this.nodeRenderer.onNodeDrag('end', nodeMovementInfo, EventSource.API);
        if (updatePositions) {
            if (nodeMovementInfo.needsFullRender) {
                this.completeRender(false, EventSource.API);
            } else {
                this.updateGraphPositions(EventSource.API);
            }
            nodeMovementInfo.needsFullRender = false;
        }
        return nodeMovementInfo.needsFullRender;
    }


    /**
     * Convert from graph coordinates to screen coordinates.
     *
     * This method can be useful together with getNodesFromPoint.
     *
     * Most events already contain screen/client coordinates!
     * Only use this method if no scren/client coordinates are available.
     *
     * @param graphPoint a point in graph coordinates
     * @returns the same point in screen/client coordinates
     */
    public getClientPointFromGraphCoordinates(graphPoint: Point): Point {
        const p = this.svg.node().createSVGPoint();
        p.x = graphPoint.x;
        p.y = graphPoint.y;
        return p.matrixTransform(this.nodesGroup.node().getScreenCTM());
    }


    /**
     * Convert from screen coordinates to graph coordinates.
     *
     * Inverse operation of `getClientPointFromGraphCoordinates`.
     *
     * @param graphPoint a point in screen/client coordinates
     * @returns the same point in graph coordinates
     */
    public getGraphPointFromClientCoordinates(clientPoint: Point): Point {
        const p = this.svg.node().createSVGPoint();
        p.x = clientPoint.x;
        p.y = clientPoint.y;
        return p.matrixTransform(this.nodesGroup.node().getScreenCTM().inverse());
    }


    /**
     * Updates and reflows all text elements in nodes and edges.
     *
     * @param force force text rewrap even when text has not changed
     *      (useful if node classes can change text attributes like size)
     */
    public updateTextElements(force: boolean = false): void { // TODO profile this
        const self = this;

        this.nodesGroup
            .selectAll<SVGGElement, Node>('g.node')
            .data<Node>(this._nodes, (d: Node) => d.id.toString())
            .call(this.nodeRenderer.updateNodeText.bind(this.nodeRenderer), force);

        this.edgesGroup
            .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
            .data<Edge>(this._edges, edgeId)
            .each(function (d) {
                self.edgeRenderer.updateEdgeText(select(this), d, force);
            });
        this.onRender(EventSource.API, 'text');
    }


    /**
     * Get the d3 selection of the current SVG used by this grapheditor.
     */
    public getSVG(): Selection<SVGSVGElement, any, any, any> {
        return this.svg;
    }

    /**
     * Get the d3 selection of the SVG g element containing the graph.
     */
    public getGraphGroup(): Selection<SVGGElement, any, any, any> {
        return this.graph;
    }

    /**
     * Get the d3 selection of the SVG g element containing all node groups.
     */
    public getNodesGroup(): Selection<SVGGElement, any, any, any> {
        return this.nodesGroup;
    }

    /**
     * Get the d3 selection of the SVG g element containing all edge groups.
     */
    public getEdgesGroup(): Selection<SVGGElement, any, any, any> {
        return this.edgesGroup;
    }

    /**
     * Get the node selection with bound data.
     */
    public getNodeSelection(): Selection<SVGGElement, Node, any, unknown> {
        return this.nodesGroup
            .selectAll<SVGGElement, Node>('g.node')
            .data<Node>(this._nodes, (d: Node) => d.id.toString());
    }

    /**
     * Get the edge selection with bound data.
     */
    public getEdgeSelection(): Selection<SVGGElement, Edge, any, unknown> {
        return this.edgesGroup
            .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
            .data<Edge>(this._edges, edgeId);
    }

    /**
     * Get the dragged edge selection with bound data.
     */
    public getDraggedEdgeSelection(): Selection<SVGGElement, DraggedEdge, any, unknown> {
        return this.edgesGroup
            .selectAll<SVGGElement, DraggedEdge>('g.edge-group.dragged')
            .data<DraggedEdge>(this.draggedEdges, edgeId);
    }

    /**
     * Get a single edge selection with bound datum.
     *
     * @param nodeId the id of the edge to select
     */
    // eslint-disable-next-line no-shadow
    public getSingleEdgeSelection(edgeId: string): Selection<SVGGElement, Edge, any, unknown> {
        const edge = this.objectCache.getEdge(edgeId);
        if (edge != null) {
            return this.edgesGroup.select<SVGGElement>(`g.edge-group[data-id="${CSS.escape(edgeId)}"]`).datum(edge);
        }
        return null;
    }

    /**
     * Get a single node selection with bound datum.
     *
     * @param nodeId the id of the node to select
     */
    public getSingleNodeSelection(nodeId: string | number): Selection<SVGGElement, Node, any, unknown> {
        const node = this.objectCache.getNode(nodeId);
        if (node != null) {
            return this.nodesGroup.select<SVGGElement>(`g.node[data-id="${CSS.escape(nodeId.toString())}"]`).datum(node);
        }
        return null;
    }

    /**
     * Update text of existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    public updateNodeText(nodeSelection: Selection<SVGGElement, Node, any, unknown>, force: boolean = false) {
        this.nodeRenderer.updateNodeText(nodeSelection, force);
    }


    /**
     * Update node classes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    public updateNodeClasses(nodeSelection?: Selection<SVGGElement, Node, any, unknown>): void {
        const calledDirectly = (nodeSelection == null);
        if (nodeSelection == null) {
            nodeSelection = this.getNodeSelection();
        }
        this.nodeRenderer.updateNodeClasses(nodeSelection, this.classesToRemove);
        if (calledDirectly) {
            this.onRender(EventSource.API, 'classes');
        }
    }

    /**
     * Update classes of edgeGroups
     *
     * @param edgeGroupSelection d3 selection of edges to update with bound data
     */
    public updateEdgeGroupClasses(edgeGroupSelection?: Selection<SVGGElement, Edge, any, unknown>): void {
        const calledDirectly = (edgeGroupSelection == null);
        if (edgeGroupSelection == null) {
            edgeGroupSelection = this.getEdgeSelection();
        }
        this.edgeRenderer.updateEdgeGroupClasses(edgeGroupSelection, this.classesToRemove);
        if (calledDirectly) {
            this.onRender(EventSource.API, 'classes');
        }
    }

    /**
     * Apply a transformation to a bbox.
     *
     * @param bbox the bbox to transform
     * @param transformation the transformation matrix
     */
    public transformBBox(bbox: Rect, transformation: DOMMatrix): Rect {
        const p = this.svg.node().createSVGPoint();

        p.x = bbox.x;
        p.y = bbox.y;
        const a = p.matrixTransform(transformation);

        p.x = bbox.x + bbox.width;
        p.y = bbox.y;
        const b = p.matrixTransform(transformation);

        p.x = bbox.x + bbox.width;
        p.y = bbox.y + bbox.height;
        const c = p.matrixTransform(transformation);

        p.x = bbox.x;
        p.y = bbox.y + bbox.height;
        const d = p.matrixTransform(transformation);

        const minX = Math.min(a.x, b.x, c.x, d.x);
        const maxX = Math.max(a.x, b.x, c.x, d.x);
        const minY = Math.min(a.y, b.y, c.y, d.y);
        const maxY = Math.max(a.y, b.y, c.y, d.y);

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    /**
     * Update all node positions and edge paths.
     *
     * @param eventSource the event source used for render events (default: `EventSource.API`)
     */
    public updateGraphPositions(eventSource: EventSource = EventSource.API): void {
        this.nodesGroup
            .selectAll<any, Node>('g.node')
            .data<Node>(this._nodes, (d: Node) => d.id.toString())
            .call(this.nodeRenderer.updateNodePositions);

        this.edgesGroup
            .selectAll('g.edge-group:not(.dragged)')
            .data(this._edges, edgeId)
            .call(this.edgeRenderer.updateEdgePositions.bind(this.edgeRenderer));

        this.edgesGroup
            .selectAll('g.edge-group.dragged')
            .data(this.draggedEdges, edgeId)
            .call(this.edgeRenderer.updateEdgePositions.bind(this.edgeRenderer));

        this.onRender(eventSource, 'positions');
    }

    /**
     * Update Node and Edge highlights to match the current selection state and hovered state.
     *
     * This should be called after manually changing the selection.
     */
    public updateHighlights(): void {
        this.updateNodeHighligts();
        this.updateEdgeHighligts();
    }

    /**
     * Callback for creating edgeadd events.
     *
     * @param edge the created edge
     * @param eventSource the event source
     * @param cancelable set to true if the event can be cancelled (default `true`)
     * @returns false if event was cancelled
     */
    private onEdgeCreate(edge: Edge, eventSource: EventSource, cancelable: boolean = true): boolean {
        const ev = new CustomEvent('edgeadd', {
            bubbles: true,
            composed: true,
            cancelable: Boolean(cancelable),
            detail: {
                eventSource: eventSource,
                edge: edge,
            },
        });
        return this.dispatchEvent(ev);
    }

    /**
     * Callback for creating edgeremove events.
     *
     * @param edge the created edge
     * @param eventSource the event source
     * @param cancelable set to true if the event can be cancelled (default `true`)
     * @returns false if event was cancelled
     */
    private onEdgeRemove(edge: Edge, eventSource: EventSource, cancelable: boolean = true) {
        const ev = new CustomEvent('edgeremove', {
            bubbles: true,
            composed: true,
            cancelable: Boolean(cancelable),
            detail: {
                eventSource: eventSource,
                edge: edge,
            },
        });
        return this.dispatchEvent(ev);
    }

    /**
     * Callback for creating nodeadd events.
     *
     * @param node the created node
     * @returns false if event was cancelled
     */
    private onNodeCreate(node: Node, eventSource: EventSource): boolean {
        const ev = new CustomEvent('nodeadd', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: {
                eventSource: eventSource,
                node: node,
            },
        });
        return this.dispatchEvent(ev);
    }

    /**
     * Callback for creating noderemove events.
     *
     * @param node the created node
     * @returns false if event was cancelled
     */
    private onNodeRemove(node: Node, eventSource: EventSource) {
        const ev = new CustomEvent('noderemove', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: {
                eventSource: eventSource,
                node: node,
            },
        });
        return this.dispatchEvent(ev);
    }


    /**
     * Callback on nodes for mouseEnter event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    public onNodeEnter(event: Event, nodeDatum: Node) {
        this.hovered.add(nodeDatum.id);
        if (this._selectedLinkSource != null && this._nodeClickInteraction === 'link') {
            this._selectedLinkTarget = nodeDatum.id;
        }
        this.updateHighlights();
        const ev = new CustomEvent('nodeenter', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                sourceEvent: event,
                node: nodeDatum,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Callback on nodes for mouseLeave event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    public onNodeLeave(event: Event, nodeDatum: Node) {
        this.hovered.delete(nodeDatum.id);
        if (this._selectedLinkSource === nodeDatum.id && this._nodeClickInteraction === 'link') {
            this._selectedLinkTarget = null;
        }
        this.updateHighlights();
        const ev = new CustomEvent('nodeleave', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                sourceEvent: event,
                node: nodeDatum,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Callback on nodes for click event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    // eslint-disable-next-line complexity
    public onNodeClick = (event: Event, nodeDatum: Node) => {
        const eventDetail: any = {};
        eventDetail.eventSource = EventSource.USER_INTERACTION;
        eventDetail.sourceEvent = event;
        eventDetail.node = nodeDatum;
        const path = event.composedPath();
        if (path != null) {
            let i = 0;
            let target;
            // search in event path for data-click attribute
            while (i === 0 || target != null && i < path.length) {
                target = select(path[i] as any);
                const key = target.attr('data-click');
                if (key != null) {
                    eventDetail.key = key;
                    break;
                }
                if (target.classed('node')) {
                    // reached node boundary in dom
                    break;
                }
                i++;
            }
        }
        const ev = new CustomEvent('nodeclick', { bubbles: true, composed: true, cancelable: true, detail: eventDetail });
        if (!this.dispatchEvent(ev)) {
            return; // prevent default / event cancelled
        }
        if (this._nodeClickInteraction === 'none') {
            return; // nothing to do
        }
        if (this._nodeClickInteraction === 'link') {
            return this.onNodeSelectLink(nodeDatum);
        }
        if (this._nodeClickInteraction === 'select') {
            if (this._selectionMode === 'none') {
                return; // selections are disabled
            }
            const nodeId = nodeDatum.id.toString();
            const isSelected = this._selectedNodes.has(nodeId);
            if (this.selectionMode === 'single') {
                // make sure all other nodes are deselected
                this._selectedNodes.clear();
            }
            if (isSelected) {
                // remove an already selected node (click toggles selection)
                this._selectedNodes.delete(nodeId);
            } else {
                this._selectedNodes.add(nodeId);
            }
            this.onSelectionChangeInternal();
        }
        this.updateHighlights();
    };

    /**
     * Internal selection changed callback.
     *
     * Create new 'selection' event.
     *
     * @param eventSource the source of the selection event (default: EventSource.USER_INTERACTION)
     */
    private onSelectionChangeInternal(eventSource = EventSource.USER_INTERACTION) {
        const ev = new CustomEvent('selection', {
            bubbles: true,
            composed: true,
            detail: {
                eventSource: eventSource,
                selection: this._selectedNodes,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Selection logik in 'link' mode.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeSelectLink(nodeDatum: Node) {
        if (this._selectedLinkSource == null) {
            this._selectedLinkSource = nodeDatum.id;
            return;
        }
        if (nodeDatum.id === this._selectedLinkSource) {
            // don't handle edges to self
            this._selectedLinkSource = null;
            this._selectedLinkSource = null;
            return;
        }
        this._selectedLinkTarget = nodeDatum.id;
        let oldEdge: Edge = null;
        this.objectCache.getEdgesBySource(this._selectedLinkSource).forEach((e) => {
            // only need to check target as source is guaranteed
            if (e.target.toString() === this._selectedLinkTarget.toString()) {
                // found an existing edge
                oldEdge = e;
            }
        });
        if (oldEdge != null) {
            // remove existing edge
            if (!this.onEdgeRemove(oldEdge, EventSource.USER_INTERACTION)) {
                return; // event cancelled
            }
            const index = this._edges.findIndex(e => e === oldEdge);
            if (index >= 0) {
                this._edges.splice(index, 1);
            }
            this.objectCache.removeEdgeFromCache(oldEdge);
        } else {
            // create new edge
            const newEdge: Edge = {
                source: this._selectedLinkSource,
                target: this._selectedLinkTarget,
            };
            // TODO allow customization of edge (maybe reuse drag behaviour callbacks...)
            if (!this.onEdgeCreate(newEdge, EventSource.USER_INTERACTION)) {
                return; // event cancelled
            }
            this._edges.push(newEdge);
            this.objectCache.addEdgeToCache(newEdge);
        }
        this.completeRender(false, EventSource.USER_INTERACTION);
        this._selectedLinkSource = null;
        this._selectedLinkTarget = null;
    }

    /**
     * Calculate highlighted nodes and update their classes.
     */
    public updateNodeHighligts(nodeSelection?: Selection<SVGGElement, Node, any, unknown>) {
        if (nodeSelection == null) {
            nodeSelection = this.getNodeSelection();
        }
        this.nodeRenderer.updateNodeHighligts(nodeSelection, this.hovered, this._selectedLinkSource, this._selectedLinkTarget);
    }

    /**
     * Calculate highlighted edges and update their classes.
     */
    public updateEdgeHighligts(edgeSelection?: Selection<SVGGElement, Edge, any, unknown>) {
        if (edgeSelection == null) {
            edgeSelection = this.getEdgeSelection();
        }
        this.edgeRenderer.updateEdgeHighligts(edgeSelection, this.hovered, this._selectedLinkSource, this._selectedLinkTarget);
    }

    /**
     * Create and dispatch a 'backgroundclick' event.
     */
    private onBackgroundClick(event: Event) {
        if (this.currentZoom == null) {
            this.currentZoom = zoomTransform(this.graph.node());
        }
        const ev = new CustomEvent('backgroundclick', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                sourceEvent: event,
                point: {
                    x: this.currentZoom.invertX((event as any).x),
                    y: this.currentZoom.invertY((event as any).y),
                },
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Create and dispatch a 'brushdrag' event.
     */
    private onBrushMove(event: Event, rect: Rect) {
        const ev = new CustomEvent('brushdrag', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                sourceEvent: event,
                brushArea: rect,
                brushMode: this._backgroundDragInteraction,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Create and dispatch a 'brush' event.
     */
    private onBrushRelease(event: Event, rect: Rect) {
        const ev = new CustomEvent('brush', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                sourceEvent: event,
                brushArea: rect,
                brushMode: this._backgroundDragInteraction,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Create and dispatch a 'render' event.
     *
     * @param eventSource the event source to use for the event
     * @param type what type of render was performed
     * @param affectedNodes the nodes that got updated by this render (only for partial renders)
     */
    private onRender(eventSource: EventSource, type: 'complete' | 'text' | 'classes' | 'positions', affectedNodes?: Set<string>) {
        const detail: any = {
            eventSource: eventSource,
            rendered: type,
        };
        if (affectedNodes != null) {
            detail.affectedNodes = affectedNodes;
        }
        const ev = new CustomEvent('render', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: detail,
        });
        this.dispatchEvent(ev);
    }

    /**
     * Create and dispatch a 'zoomchange' event.
     *
     * @param oldZoom the old ZoomTransform
     * @param newZoom the new ZoomTransform
     * @param eventSource the event source to use for the event
     */
    private onZoomChange(oldZoom: ZoomTransform, newZoom: ZoomTransform, eventSource: EventSource) {
        const ev = new CustomEvent('zoomchange', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: eventSource,
                oldZoom: oldZoom,
                newZoom: newZoom,
                currentViewWindow: this.currentViewWindow,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Create and dispatch a 'svginitialized' event.
     *
     * @param oldSVG the old svg if any
     */
    private onInitializedSVG(oldSVG?: Selection<SVGSVGElement, any, any, any>) {
        const detail: any = {
            eventSource: EventSource.INTERNAL,
            newSVG: this.svg,
        };
        if (oldSVG != null) {
            detail.oldSVG = oldSVG;
        }
        const ev = new CustomEvent('svginitialized', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: detail,
        });
        this.dispatchEvent(ev);
    }
}

