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

import { select, event, Selection } from 'd3-selection';
import { zoom, zoomIdentity, zoomTransform, ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { drag } from 'd3-drag';
import { curveBasis } from 'd3-shape';

import { Node, NodeMovementInformation } from './node';
import { Edge, DraggedEdge, edgeId, Point, TextComponent, PathPositionRotationAndScale, normalizePositionOnLine, EdgeDragHandle, setDefaultEdgeDragHandles } from './edge';
import { LinkHandle } from './link-handle';
import { GraphObjectCache } from './object-cache';
import { wrapText } from './textwrap';
import { calculateAngle, normalizeVector, RotationVector, RotationData } from './rotation-vector';
import { StaticTemplateRegistry, DynymicTemplateRegistry, EdgePathGeneratorRegistry } from './templating';
import { Marker, LineAttachementInfo } from './marker';
import { DynamicNodeTemplate, DynamicMarkerTemplate, DynamicTextComponentTemplate, DefaultTextComponentTemplate } from './dynamic-templates/dynamic-template';
import { getNodeLinkHandles, applyUserLinkHandleCalculationCallback, calculateNearestHandles } from './link-handle-helper';
import { SmoothedEdgePathGenerator, EdgePathGenerator } from './dynamic-templates/edge-path-generators';
import { GroupingManager } from './grouping';
import { NodeDropZone } from './drop-zone';
import { Rect, copyTemplateSelectionIntoNode, removeAllChildNodes } from './util';

const SHADOW_DOM_TEMPLATE = `
<slot name="style"></slot>
<slot name="graph"></slot>
`.trim();

/**
 * An enum describing the source of the event.
 *
 * All events that happen because of API interactions will have the API value.
 * All events that were directly triggered by the user will have the USER_INTERACTION value.
 */
export enum EventSource {
    INTERNAL = 'INTERNAL',
    API = 'API',
    USER_INTERACTION = 'USER_INTERACTION',
}


export default class GraphEditor extends HTMLElement {

    private resizeObserver;

    private svg: Selection<SVGSVGElement, any, any, any>;
    private graph: Selection<SVGGElement, any, any, any>;
    private nodesGroup: Selection<SVGGElement, any, any, any>;
    private edgesGroup: Selection<SVGGElement, any, any, any>;

    private root: ShadowRoot;
    private zoom: ZoomBehavior<any, any>;
    private zoomActive: boolean = false;
    private currentZoom: ZoomTransform;

    private contentMaxHeight = 1;
    private contentMaxWidth = 1;

    private hovered: Set<number | string> = new Set();

    private _classes: string[];
    private classesToRemove: Set<string>;
    private _nodes: Node[];
    private _edges: Edge[];
    private draggedEdges: DraggedEdge[];
    private _mode: string = 'display'; // interaction mode ['display', 'layout', 'link', 'select']
    private _zoomMode: string = 'both'; // ['none', 'manual', 'automatic', 'both']

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
    private defaultEdgePathGenerator: EdgePathGenerator;

    public groupingManager: GroupingManager;

    /**
     * The object cache responsible for fast access of nodes and edges.
     */
    private objectCache: GraphObjectCache;

    private interactionStateData: {
        source?: number | string;
        target?: number | string;
        selected?: Set<string>;
        fromMode?: string;
        [property: string]: any;
    } = null;

    /** Private property to determine if the graph can be drawn. */
    private get initialized(): boolean {
        return this.svg != null && !this.svg.empty() && this.isConnected;
    }

    private get isInteractive(): boolean {
        return (this._mode !== 'display') && !(this._mode === 'select' && this.interactionStateData.fromMode === 'display');
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
    public setEdgeClass: (className: string, edge: Edge|DraggedEdge, sourceNode: Node, targetNode?: Node) => boolean;

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
    public calculateLinkHandlesForEdge: (edge: Edge|DraggedEdge, sourceHandles: LinkHandle[], source: Node, targetHandles: LinkHandle[], target: Node|Point) => {sourceHandles: LinkHandle[]; targetHandles: LinkHandle[]};


    /**
     * The current zoom transform of the zoom group in the svg.
     */
    get currentZoomTransform(): ZoomTransform {
        return this.currentZoom;
    }

    /**
     * The currently visible area in graph coordinates.
     */
    get currentViewWindow(): Rect {
        const minX = this.currentZoom.invertX(0);
        const minY = this.currentZoom.invertY(0);
        const maxX = this.currentZoom.invertX(this.contentMaxWidth);
        const maxY = this.currentZoom.invertY(this.contentMaxHeight);
        return {
            x: minX,
            y: minY,
            width: maxX -  minX,
            height: maxY - minY,
        };
    }

    get classes(): string[] {
        return this._classes;
    }

    /**
     * The list of css classes used for dynamic css classes together with `setNodeClass` or `setEdgeClass`.
     */
    set classes(classes: string[]) {
        if (this._classes != null) {
            this._classes.forEach(className => this.classesToRemove.add(className));
        }
        const deduped = new Set<string>();
        classes.forEach(className => deduped.add(className));
        this._classes = new Array(...deduped);
        this._classes.forEach(className => this.classesToRemove.delete(className));
    }

    get nodeList(): Node[] {
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
    set nodeList(nodes: Node[]) {
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

    get edgeList(): Edge[] {
        return this._edges;
    }

    /**
     * The list of edges.
     *
     * This list should **not** be altered without updating the cache!
     * Use `addEdge` and `removeEdge` to keep the cache consistent.
     */
    set edgeList(edges: Edge[]) {
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
    get selected(): Set<string> {
        const selected: Set<string> = this.interactionStateData?.selected ?? new Set();
        return selected;
    }

    get mode(): string {
        return this._mode;
    }

    /**
     * The interaction mode of the grapheditor.
     */
    set mode(mode: string) {
        this.setMode(mode.toLowerCase());
        select(this).attr('mode', mode);
    }

    get zoomMode(): string {
        return this._zoomMode;
    }

    /**
     * The zoom mode of the grapheditor.
     */
    set zoomMode(mode: string) {
        this.setZoomMode(mode.toLowerCase());
        select(this).attr('zoom', mode);
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

        this.groupingManager = new GroupingManager(this);

        this.root = this.attachShadow({ mode: 'open' });

        // preload shadow dom with html
        select(this.root).html(SHADOW_DOM_TEMPLATE);

        // monitor graph slot
        const self = this;
        select(this.root).select('slot[name="graph"]').on('slotchange', function () {
            self.graphSlotChanged(this as HTMLSlotElement);
        });

        // update size if window was resized
        if ((window as any).ResizeObserver != null) {
            this.resizeObserver = new (window as any).ResizeObserver((entries) => {
                this.updateSize();
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

        // initial render after connect
        this.completeRender(false, EventSource.INTERNAL);
        this.zoomToBoundingBox(false);
    }

    /**
     * Get all observed attributes of this webcomponent.
     */
    static get observedAttributes(): string[] {
        return ['nodes', 'edges', 'classes', 'mode', 'zoom'];
    }

    /**
     * Callback when an attribute changed in html dom.
     *
     * @param name name of the attribute that changed
     * @param oldValue old value
     * @param newValue new value
     */
    attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
        if (name === 'nodes') {
            newValue = newValue.replace(/'/g, '"');
            this.nodeList = JSON.parse(newValue);
        }
        if (name === 'edges') {
            newValue = newValue.replace(/'/g, '"');
            this.edgeList = JSON.parse(newValue);
        }
        if (name === 'classes') {
            if (newValue.startsWith('[')) {
                newValue = newValue.replace(/'/g, '"');
                this.classes = JSON.parse(newValue);
            } else {
                this.classes = newValue.split(' ');
            }
        }
        if (name === 'zoom') {
            this.setZoomMode(newValue.toLowerCase());
        }
        if (name === 'mode') {
            this.setMode(newValue.toLowerCase());
        }
        this.completeRender(false, EventSource.INTERNAL);
        this.zoomToBoundingBox(false);
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
    public getNode(nodeId: number|string): Node {
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
     *
     * To update the graph the `updateHighlights` method is used iff `updateHighlights` is `true`.
     *
     * @param nodeId the id of the node to select
     * @param updateHighlights set this to true to update highlights immediately (default `false`)
     */
    public selectNode(nodeId: number | string, updateHighlights: boolean = false): void {
        if (this._mode !== 'select') {
            this.setMode('select');
        }
        if (this.interactionStateData.selected.has(nodeId.toString())) {
            return; // nothing changed
        }
        this.interactionStateData.selected.add(nodeId.toString());
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
     *
     * To update the graph the `updateHighlights` method is used iff `updateHighlights` is `true`.
     *
     * @param nodeId the id of the node to deselect
     * @param updateHighlights set this to true to update highlights immediately (default `false`)
     */
    public deselectNode(nodeId: number | string, updateHighlights: boolean = false): void {
        if (this._mode !== 'select') {
            return; // no selection
        }
        if (!this.interactionStateData.selected.has(nodeId.toString())) {
            return; // nothing changed
        }
        this.interactionStateData.selected.delete(nodeId.toString());
        this.onSelectionChangeInternal(EventSource.API);
        if (this.interactionStateData.selected.size <= 0) {
            this.setMode(this.interactionStateData.fromMode);
        }
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
     *
     * @param selected the new set of selected node id's
     * @param updateHighlights set this to true to update highlights immediately (default `false`)
     */
    public changeSelected(selected: Set<string>, updateHighlights: boolean = false): void {
        if (selected == null || selected.size <= 0) {
            if (this._mode === 'select') {
                // selection is not empty
                this.setMode(this.interactionStateData.fromMode);
                this.onSelectionChangeInternal(EventSource.API);
            }
        } else {
            if (this._mode !== 'select') {
                this.setMode('select');
            }
            this.interactionStateData.selected = selected;
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
     */
    public addEdge(edge: Edge, redraw: boolean = false): void {
        this._edges.push(edge);
        this.objectCache.addEdgeToCache(edge);
        this.onEdgeCreate(edge, EventSource.API, false);
        if (redraw) {
            this.completeRender(false, EventSource.API);
            this.zoomToBoundingBox(false);
        }
    }

    /**
     * Get the edge with the given id.
     *
     * @param edgeId the id of the edge (use the `edgeId` function to compute the id)
     */
    // eslint-disable-next-line no-shadow
    public getEdge(edgeId: number|string): Edge {
        return this.objectCache.getEdge(edgeId);
    }

    /**
     * Remove a single edge from the graph.
     *
     * @param edge edge to remove
     * @param redraw if the graph should be redrawn (default: `false`)
     */
    public removeEdge(edge: Edge|number|string, redraw: boolean = false): void {
        let edgeIdToDelete: string;
        if (typeof(edge) === 'number') {
            edgeIdToDelete = edge.toString();
        } else if (typeof(edge) !== 'string') {
            edgeIdToDelete = edgeId(edge);
        }
        const index = this._edges.findIndex((e) => edgeId(e) === edgeIdToDelete);
        if (index >= 0) {
            const removedEdge = this._edges[index];
            this.onEdgeRemove(removedEdge, EventSource.API, false);
            this._edges.splice(index, 1);
            this.objectCache.removeEdgeFromCache(removedEdge);
            if (redraw) {
                this.completeRender(false, EventSource.API);
                this.zoomToBoundingBox(false);
            }
        }
    }

    /**
     * Get all edges that have the given nodeId as source.
     *
     * @param sourceNodeId the node id of the edge source
     */
    public getEdgesBySource(sourceNodeId: number|string): Set<Edge> {
        return this.objectCache.getEdgesBySource(sourceNodeId);
    }

    /**
     * Get all edges that have the given nodeId as target.
     *
     * @param targetNodeId the node id of the edge target
     */
    public getEdgesByTarget(targetNodeId: number|string): Set<Edge> {
        return this.objectCache.getEdgesByTarget(targetNodeId);
    }

    /**
     * Set the graph interaction mode and cleanup temp data from old interaction mode.
     *
     * @param mode interaction mode (one of ["display", "layout", "link", "select"])
     */
    // eslint-disable-next-line complexity
    public setMode(mode: string): void {
        if (mode === this._mode) {
            return;
        }
        const oldMode = this._mode;
        if (mode === 'display') {
            if (this._mode !== 'display') {
                this.interactionStateData = null;
                this._mode = 'display';
            }
        } else if (mode === 'layout') {
            if (this._mode !== 'layout') {
                this.interactionStateData = null;
                this._mode = 'layout';
            }
        } else if (mode === 'link') {
            if (this._mode !== 'link') {
                this.interactionStateData = {
                    source: null,
                    target: null,
                    allowedTargets: new Set(),
                };
                this._mode = 'link';
            }
        } else if (mode === 'select') {
            if (this._mode !== 'select') {
                this.interactionStateData = {
                    selected: new Set(),
                    fromMode: this._mode,
                };
                this._mode = 'select';
            }
        } else {
            console.warn(`Wrong mode "${mode}". Allowed are: ["display", "layout", "link", "select"]`);
            return;
        }

        if (oldMode !== mode) {
            const ev = new CustomEvent('modechange', {
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
     * Set the graph zoom mode.
     *
     * @param mode zoom mode (one of ["none", "manual", "automatic", "both"])
     */
    // eslint-disable-next-line complexity
    public setZoomMode(mode: string): void {
        if (mode === this._mode) {
            return;
        }
        const oldMode = this._mode;
        if (mode === 'none') {
            if (this._zoomMode !== 'none') {
                this._zoomMode = 'none';
            }
        } else if (mode === 'manual') {
            if (this._zoomMode !== 'manual') {
                this._zoomMode = 'manual';
            }
        } else if (mode === 'automatic') {
            if (this._mode !== 'automatic') {
                this._zoomMode = 'automatic';
            }
        } else if (mode === 'both') {
            if (this._mode !== 'both') {
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

        const newZoom = zoom().on('zoom', (d) => {
            graph.attr('transform', event.transform);
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
        newSvg.on('click', () => {
            if (event.target === newSvg.node()) {
                this.onBackgroundClick();
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
     */
    public zoomToBox(box: Rect): void {
        const scale = 0.9 * Math.min(this.contentMaxWidth / box.width, this.contentMaxHeight / box.height);

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

        const svg = this.svg;

        if (this._zoomMode === 'manual' || this._zoomMode === 'both') {
            if (!this.zoomActive) {
                this.zoomActive = true;
                svg.call(this.zoom);
            }
        } else {
            this.zoomActive = false;
            svg.on('.zoom', null);
        }

        this.updateSize();

        // update nodes ////////////////////////////////////////////////////////
        if (forceUpdateTemplates) {
            this.nodesGroup.selectAll('g.node').remove();
        }

        const nodeSelection = this.nodesGroup
            .selectAll<SVGGElement, Node>('g.node')
            .data<Node>(this._nodes, (d: Node) => d.id.toString())
            .join(
                enter => enter.append('g')
                    .classed('node', true)
                    .attr('id', (d) => `node-${d.id}`)
            )
            .call(this.updateNodes.bind(this))
            .call(this.updateNodePositions.bind(this))
            .order()
            .on('mouseover', (d) => { this.onNodeEnter.bind(this)(d); })
            .on('mouseout', (d) => { this.onNodeLeave.bind(this)(d); })
            .on('click', (d) => { this.onNodeClick.bind(this)(d); });

        if (this.isInteractive) {
            nodeSelection.call(
                drag<SVGGElement, Node, NodeMovementInformation>()
                    .subject((node) => {
                        const movementInfo = this.getNodeMovementInformation(node, event.x, event.y);
                        if (movementInfo == null) {
                            return; // move was cancelled by callback
                        }
                        const startTreeParent = this.groupingManager.getTreeParentOf(movementInfo.node.id);
                        if (startTreeParent != null) {
                            const behaviour = this.groupingManager.getGroupBehaviourOf(startTreeParent);
                            if (behaviour.onNodeMoveStart != null) {
                                const needRender = Boolean(
                                    behaviour.onNodeMoveStart(startTreeParent, movementInfo.node.id.toString(), this.objectCache.getNode(startTreeParent), movementInfo.node, this)
                                );
                                movementInfo.needsFullRender = needRender || movementInfo.needsFullRender;
                            }
                        }
                        return movementInfo;
                    })
                    .on('start', () => this.onNodeDrag('start', event.subject, EventSource.USER_INTERACTION))
                    .on('drag', () => {
                        let x = event.x;
                        let y = event.y;
                        if (event.subject != null) {
                            const movementInfo: NodeMovementInformation = event.subject;
                            if (movementInfo.offset?.dx !== null) {
                                x -= movementInfo.offset.dx;
                            }
                            if (movementInfo.offset?.dy !== null) {
                                y -= movementInfo.offset.dy;
                            }
                            movementInfo.needsFullRender = movementInfo.needsFullRender ?? false;
                            movementInfo.needsFullRender = this.tryToLeaveCurrentGroup(event.subject, x, y, EventSource.USER_INTERACTION, event) || movementInfo.needsFullRender;
                            movementInfo.needsFullRender = this.tryJoinNodeIntoGroup(event.subject, x, y, EventSource.USER_INTERACTION, event) || movementInfo.needsFullRender;
                            movementInfo.needsFullRender = this._moveNode(event.subject, event.x, event.y, EventSource.USER_INTERACTION) || movementInfo.needsFullRender;
                            if (movementInfo.needsFullRender) {
                                this.completeRender(false, EventSource.USER_INTERACTION);
                            } else {
                                this.updateGraphPositions(EventSource.USER_INTERACTION);
                            }
                            movementInfo.needsFullRender = false;
                        }
                    })
                    .on('end', () => {
                        const movementInfo: NodeMovementInformation = event.subject;
                        const node = movementInfo.node;
                        const endTreeParent = this.groupingManager.getTreeParentOf(node.id);
                        if (endTreeParent != null) {
                            const behaviour = this.groupingManager.getGroupBehaviourOf(endTreeParent);
                            if (behaviour.onNodeMoveEnd != null) {
                                behaviour.onNodeMoveEnd(endTreeParent, node.id.toString(), this.objectCache.getNode(endTreeParent), node, this);
                            }
                        }

                        // rerender if needed
                        if (movementInfo.needsFullRender) {
                            this.completeRender(false, EventSource.USER_INTERACTION);
                            movementInfo.needsFullRender = false;
                        }

                        this.onNodeDrag('end', event.subject, EventSource.USER_INTERACTION);
                    })
            );
        } else {
            nodeSelection.on('.drag', null);
        }

        // update edges ////////////////////////////////////////////////////////
        if (forceUpdateTemplates) {
            this.edgesGroup.selectAll('g.edge-group:not(.dragged)').remove();
        }
        const self = this;
        this.edgesGroup
            .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
            .data<Edge>(this._edges, edgeId)
            .join(
                enter => enter.append('g')
                    .attr('id', (d) => `edge-${edgeId(d)}`)
                    .classed('edge-group', true)
                    .each(function (d) {
                        const edgeGroup = select(this);
                        edgeGroup.append('path')
                            .classed('edge', true)
                            .attr('fill', 'none');
                    })
            )
            .classed('ghost', (d) => {
                const id = edgeId(d);
                return this.draggedEdges.some((edge) => edge.createdFrom === id);
            })
            .call(self.updateEdgeGroups.bind(this))
            .call(self.updateEdgePositions.bind(this))
            .order()
            .on('click', (d) => { this.onEdgeClick.bind(this)(d); });

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
        const possibleTargets = document.elementsFromPoint(clientX, clientY);
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
                    const id = target.attr('id').replace(/^node-/, '');
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
     * Get the movement information for moving a Node.
     *
     * The calculated movement information contains the actual node to move, the start offset and all affected nodes.
     * The actual node to move may be a (indirect) parent of the given node.
     * If the group that captured the movement of the given node has no node a dummy node is used instead to track the movement.
     *
     * This method calls onBeforeNodeMove with the node movement information.
     *
     * @param node the original node that is to be moved
     * @param x the x coordinate from where the move should start (can be substituted by node.x)
     * @param y the y coordinate from where the move should start (can be substituted by node.y)
     */
    private getNodeMovementInformation(node: Node, x: number, y: number): NodeMovementInformation {
        const movementInfo: NodeMovementInformation = {node: node};
        const groupId = this.groupingManager.getGroupCapturingMovementOfChild(node);
        if (groupId != null && groupId !== node.id.toString()) {
            const groupNode = this.objectCache.getNode(groupId);
            if (groupNode == null) {
                movementInfo.node = {
                    id: groupId,
                    x: x,
                    y: y,
                    type: 'dummy',
                };
            } else {
                movementInfo.node = groupNode;
            }
        }
        if (this.groupingManager.getGroupBehaviourOf(movementInfo.node.id)?.moveChildrenAlongGoup ?? false) {
            movementInfo.children = this.groupingManager.getAllChildrenOf(movementInfo.node.id);
        }
        movementInfo.offset = {
            dx: x - movementInfo.node.x,
            dy: y - movementInfo.node.y,
        };
        if (this.onBeforeNodeMove != null) {
            try {
                return this.onBeforeNodeMove(movementInfo);
            } catch (error) {
                console.error('An error has occured in the onBeforeNodeMove callback.', node, movementInfo);
            }
        }
        return movementInfo;
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
    public moveNode(nodeId: string | number, x: number, y: number, updatePositions: boolean= false): boolean {
        const node = this.objectCache.getNode(nodeId);
        const nodeMovementInfo = this.getNodeMovementInformation(node, node.x, node.y);
        if (nodeMovementInfo == null) {
            return; // move was cancelled by callback
        }
        nodeMovementInfo.needsFullRender = nodeMovementInfo.needsFullRender ?? false;
        this.onNodeDrag('start', nodeMovementInfo, EventSource.API);
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
        nodeMovementInfo.needsFullRender = this.tryToLeaveCurrentGroup(nodeMovementInfo, x, y, EventSource.API) || nodeMovementInfo.needsFullRender;
        nodeMovementInfo.needsFullRender = this.tryJoinNodeIntoGroup(nodeMovementInfo, x, y, EventSource.API) || nodeMovementInfo.needsFullRender;

        nodeMovementInfo.needsFullRender = this._moveNode(nodeMovementInfo, x, y, EventSource.API) || nodeMovementInfo.needsFullRender;

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
        this.onNodeDrag('end', nodeMovementInfo, EventSource.API);
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
     * Get the position the group dictates for this node.
     *
     * If the node is not in a group or has no fixed position in that group this method returns null.
     *
     * @param node the node to get the position for
     * @returns the absolute node position (or null)
     */
    private getGroupDictatedPositionOfNode(node: Node): Point {
        let groupRelativePosition: string|Point;
        let relativeToGroup: string;
        const treeParent = this.groupingManager.getTreeParentOf(node.id);
        if (treeParent != null) {
            relativeToGroup = treeParent;
            groupRelativePosition = this.groupingManager.getGroupBehaviourOf(relativeToGroup)?.childNodePositions?.get(node.id.toString());
        } else {
            this.groupingManager.getParentsOf(node.id)?.forEach(parentId => {
                if (relativeToGroup == null) {
                    return;
                }
                const parentBehaviour = this.groupingManager.getGroupBehaviourOf(parentId);
                const relPos = parentBehaviour?.childNodePositions?.get(node.id.toString());
                if (relPos != null) {
                    relativeToGroup = parentId;
                    groupRelativePosition = relPos;
                }
            });
        }
        if (typeof(groupRelativePosition) === 'string') {
            const dropZone = this.objectCache.getDropZone(relativeToGroup, groupRelativePosition);
            if (dropZone == null) {
                return null;
            }
            groupRelativePosition = {
                x: dropZone.bbox.x + (dropZone.bbox.width / 2),
                y: dropZone.bbox.y + (dropZone.bbox.height / 2),
            };
        }
        if (groupRelativePosition != null && relativeToGroup != null) {
            const parentNode = this.objectCache.getNode(relativeToGroup);
            if (parentNode != null) {
                return {
                    x: parentNode.x + groupRelativePosition.x,
                    y: parentNode.y + groupRelativePosition.y,
                };
            }
        }
        return null;
    }

    /**
     * Move a node to the desired point (x,y).
     *
     * If the node has a fixed position dictated by its group it will not be moved from that position!
     * If the nodeMovementInfo contains children every child will be moved the same offset as the node.
     * Group dictated positions are not checked for these children!
     *
     * @param nodeMovementInfo the movement info for this node move operation
     * @param x the target x coordinate
     * @param y the target y coordinate
     * @param eventSource the event source used in movement events
     */
    private _moveNode(nodeMovementInfo: NodeMovementInformation, x: number, y: number, eventSource: EventSource): boolean {
        let needsFullRender = false;

        if (nodeMovementInfo.offset != null) {
            x -= nodeMovementInfo.offset?.dx ?? 0;
            y -= nodeMovementInfo.offset?.dy ?? 0;
        }
        const node = nodeMovementInfo.node;

        // call parent groups beforeNodeMove
        const currentTreeParent = this.groupingManager.getTreeParentOf(node.id);
        if (currentTreeParent != null) {
            const groupBehaviour = this.groupingManager.getGroupBehaviourOf(currentTreeParent);
            if (groupBehaviour.beforeNodeMove != null) {
                const groupNode = this.objectCache.getNode(currentTreeParent);
                needsFullRender = Boolean(groupBehaviour.beforeNodeMove(currentTreeParent, node.id.toString(), groupNode, node, {x: x, y: y}, this));
            }
        }

        // check for fixed group positions
        const groupDictatedPosition = this.getGroupDictatedPositionOfNode(node);
        if (groupDictatedPosition != null) {
            x = groupDictatedPosition.x;
            y = groupDictatedPosition.y;
        }

        const dx = x - node.x;
        const dy = y - node.y;
        if (dx !== 0 || dy !== 0) {
            // perform actual movement
            node.x = x;
            node.y = y;
            if (nodeMovementInfo.children != null) {
                nodeMovementInfo.children.forEach(childId => {
                    const child = this.objectCache.getNode(childId);
                    if (child != null) {
                        child.x += dx;
                        child.y += dy;
                        this.onNodePositionChange(child, eventSource);
                    }
                });
            }
        }

        // always fire position change
        this.onNodePositionChange(node, eventSource);
        return needsFullRender;
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
     * Try for the given node to leave its group if it moves to the point (x, y).
     *
     * This method checks if the node can leave its group when it moves to the given coordinates.
     * If the node can leave the group then the node is removed from the group.
     *
     * @param nodeMovementInformation the movement information of the node to move
     * @param x the target x coordinates for the node
     * @param y the target y coordinates for the node
     * @param eventSource the event source to be used in triggered events
     * @param sourceEvent the source event (may be null)
     */
    private tryToLeaveCurrentGroup(nodeMovementInformation: NodeMovementInformation, x: number, y: number, eventSource: EventSource, sourceEvent?: Event): boolean {
        const node = nodeMovementInformation.node;

        const currentGroup = this.groupingManager.getTreeParentOf(node.id);
        if (currentGroup == null) {
            return false; // is not part of a group
        }
        if (!(this.groupingManager.getGroupBehaviourOf(currentGroup)?.allowDraggedNodesLeavingGroup ?? false)) {
            return false; // group does not allow dragged nodes to leave
        }

        const clientPoint = this.getClientPointFromGraphCoordinates({x: x, y: y});

        const possibleTargetNodes = this.getNodesFromPoint(clientPoint.x, clientPoint.y);
        const allChildren = this.groupingManager.getAllChildrenOf(currentGroup);

        const isOutsideGroup = !possibleTargetNodes.some(targetNode => {
            if (targetNode.id === node.id) {
                return false; // ignore dragged node
            }
            if (targetNode.id.toString() === currentGroup) {
                return true; // is over the group node
            }
            return allChildren.has(targetNode.id.toString()); // is over a child node of the group
        });

        if (isOutsideGroup) {
            if (this.groupingManager.getCanDraggedNodeLeaveGroup(currentGroup, node.id, node)) {
                this.groupingManager.removeNodeFromGroup(currentGroup, node.id, eventSource, sourceEvent);
                return true;
            }
        }
        return false;
    }

    /**
     * Try for the given node to join a group if it moves to the point (x, y).
     *
     * This method checks if the node can join a group when it moves to the given coordinates.
     * If the node can join a group it is added to the group.
     *
     * The node will join in the same tree as the group it joined.
     * If the group it joined was not part of a tree it is marked as a tree root.
     * If the joining node was a tree root it will no longer be a tree root as it is joined to the parent tree.
     *
     * @param nodeMovementInformation the movement information of the node to move
     * @param x the target x coordinates for the node
     * @param y the target y coordinates for the node
     * @param eventSource the event source to be used in triggered events
     * @param sourceEvent the source event (may be null)
     */
    private tryJoinNodeIntoGroup(nodeMovementInformation: NodeMovementInformation, x: number, y: number, eventSource: EventSource, sourceEvent?: Event): boolean {
        const node = nodeMovementInformation.node;

        if (this.groupingManager.getTreeParentOf(node.id) != null) {
            return false;
        }

        const clientPoint = this.getClientPointFromGraphCoordinates({x: x, y: y});

        const possibleTargetNodes = this.getNodesFromPoint(clientPoint.x, clientPoint.y);
        const targetNode = possibleTargetNodes.find(target => target.id !== node.id);
        if (targetNode != null) {
            const canJoinGroup = this.groupingManager.getGroupCapturingDraggedNode(targetNode.id, node.id, targetNode, node);
            if (canJoinGroup != null) {
                if (this.groupingManager.getTreeRootOf(canJoinGroup) == null) {
                    // canJoinGroup is not part of a tree => mark it as a tree root
                    this.groupingManager.markAsTreeRoot(canJoinGroup, eventSource, sourceEvent);
                }
                this.groupingManager.addNodeToGroup(canJoinGroup, node.id, {x: x, y: y}, eventSource, sourceEvent);
                if (this.groupingManager.getTreeDepthOf(node.id) === 0) {
                    this.groupingManager.joinTreeOfParent(node.id, canJoinGroup, eventSource, sourceEvent);
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Updates and reflows all text elements in nodes and edges.
     *
     * @param force force text rewrap even when text has not changed
     *      (useful if node classes can change text attributes like size)
     */
    public updateTextElements(force: boolean = false): void {
        const self = this;

        this.nodesGroup
            .selectAll<SVGGElement, Node>('g.node')
            .data<Node>(this._nodes, (d: Node) => d.id.toString())
            .call(this.updateNodeText.bind(this), force);

        this.edgesGroup
            .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
            .data<Edge>(this._edges, edgeId)
            .each(function (d) {
                self.updateEdgeText(select(this), d, force);
            });
        this.onRender(EventSource.API, 'text');
    }

    /**
     * Update the content template of a `SVGGElement` to the new template id.
     *
     * If the `SVGGElement` already uses the template the content is not touched.
     *
     * @param element the lement to update the content
     * @param templateId the new template ID
     * @param templateType the template type to use
     * @param dynamic `true` iff the template is a dynamic template (default: `false`)
     */
    // eslint-disable-next-line complexity, max-len
    private updateContentTemplate<T extends Node|Marker|LinkHandle|TextComponent>(element: Selection<SVGGElement, T, any, unknown>, templateId: string, templateType: string, dynamic: boolean= false, parent?: Node|Edge) {
        const oldTemplateID = element.attr('data-template');
        const oldDynamic = element.attr('data-dynamic-template') === 'true';
        if (oldTemplateID != null && oldTemplateID === templateId && dynamic === oldDynamic) {
            return; // already using right template
        }
        removeAllChildNodes(element);
        if (dynamic) {
            // dynamic template
            if (templateType === 'node') {
                const dynTemplate = this.dynamicTemplateRegistry.getDynamicTemplate<DynamicNodeTemplate>(templateId);
                const g = element as Selection<SVGGElement, Node, any, unknown>;
                if (dynTemplate != null) {
                    try {
                        dynTemplate.renderInitialTemplate(g, this, null);
                    } catch (error) {
                        console.error(`An error occured while rendering the dynamic template for node ${g.datum().id}!`, error);
                    }
                } else {
                    this.updateStaticContentTemplate<Node>(g, templateId, templateType);
                }
            } else if (templateType === 'marker') {
                const dynTemplate = this.dynamicTemplateRegistry.getDynamicTemplate<DynamicMarkerTemplate>(templateId);
                const g = element as Selection<SVGGElement, Marker, any, unknown>;
                if (dynTemplate != null) {
                    try {
                        dynTemplate.renderInitialTemplate(g, this, {parent: parent});
                    } catch (error) {
                        console.error('An error occured while rendering the dynamic marker template!', {parent: parent}, error);
                    }
                } else {
                    this.updateStaticContentTemplate<Marker>(g, templateId, templateType);
                }
            } else if (templateType === 'textcomponent') {
                let dynTemplate = this.dynamicTemplateRegistry.getDynamicTemplate<DynamicTextComponentTemplate>(templateId);
                if (dynTemplate == null) {
                    dynTemplate = this.dynamicTemplateRegistry.getDynamicTemplate<DynamicTextComponentTemplate>('default-textcomponent');
                }
                const g = element as Selection<SVGGElement, TextComponent, any, unknown>;
                if (dynTemplate != null) {
                    try {
                        dynTemplate.renderInitialTemplate(g, this, {parent: parent});
                    } catch (error) {
                        console.error('An error occured while rendering the dynamic text component template!', {parent: parent}, error);
                    }
                } else {
                    console.error(`No template found for textcomponent! (templateID: ${templateId})`);
                }
            } else {
                console.warn(`Tried to use unsupported template type: ${templateType}`);
            }
        } else {
            // static templates
            const g = element as Selection<SVGGElement, Node|Marker|LinkHandle, any, unknown>;
            this.updateStaticContentTemplate(g, templateId, templateType);
        }
        // set template id used by the element to new id
        element.attr('data-template', templateId);
        if (dynamic) {
            element.attr('data-dynamic-template', 'true');
        } else {
            element.attr('data-dynamic-template', null);
        }
    }

    /**
     * Update the static content template of a `SVGGElement` to the new template id.
     *
     * If the `SVGGElement` already uses the template the content is not touched.
     *
     * @param element the lement to update the content
     * @param templateId the new template ID
     * @param templateType the template type to use
     */
    private updateStaticContentTemplate<T extends Node | Marker | LinkHandle>(element: Selection<SVGGElement, T, any, unknown>, templateId: string, templateType: string) {
        let newTemplate: Selection<SVGGElement, unknown, any, unknown>;
        if (templateType === 'node') {
            newTemplate = this.staticTemplateRegistry.getNodeTemplate(templateId);
        } else if (templateType === 'marker') {
            newTemplate = this.staticTemplateRegistry.getMarkerTemplate(templateId);
        } else {
            console.warn(`Tried to use unsupported template type: ${templateType}`);
        }
        // copy template content into element
        copyTemplateSelectionIntoNode(element, newTemplate);
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
     * Get a single node selection with bound datum.
     *
     * @param nodeId the id of the node to select
     */
    private getSingleNodeSelection(nodeId: string|number): Selection<SVGGElement, Node, any, unknown> {
        const node = this.objectCache.getNode(nodeId);
        if (node != null) {
            return this.nodesGroup.select<SVGGElement>(`g.node#node-${nodeId}`).datum(node);
        }
        return null;
    }

    /**
     * Update existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    private updateNodes(nodeSelection?: Selection<SVGGElement, Node, any, unknown>) {
        if (nodeSelection == null) {
            nodeSelection = this.getNodeSelection();
        }

        // alias for this for use in closures
        const self = this;

        // update templates
        nodeSelection.each(function (d) {
            const g: Selection<SVGGElement, Node, any, unknown> = select(this).datum(d);
            if (d.dynamicTemplate != null && d.dynamicTemplate !== '') {
                self.updateContentTemplate<Node>(g, d.dynamicTemplate, 'node', true);
            } else {
                const templateId = self.staticTemplateRegistry.getNodeTemplateId(d.type);
                self.updateContentTemplate<Node>(g, templateId, 'node');
            }
        });

        // update dynamic templates and link handles for node
        nodeSelection.each(function (node) {
            const g: Selection<SVGGElement, Node, any, unknown> = select(this).datum(node);
            let handles: LinkHandle[] = [];
            if (node.dynamicTemplate != null && node.dynamicTemplate !== '') {
                // update dynamic template
                const dynTemplate = self.dynamicTemplateRegistry.getDynamicTemplate<DynamicNodeTemplate>(node.dynamicTemplate);
                if (dynTemplate != null) {
                    try {
                        dynTemplate.updateTemplate(g, self, null);
                    } catch (error) {
                        console.error(`An error occured while updating the dynamic template for node ${node.id}!`, error);
                    }
                }
            }
            try {
                handles = getNodeLinkHandles(g, self.staticTemplateRegistry, self.dynamicTemplateRegistry, self);
            } catch (error) {
                console.error(`An error occured while calculating the link handles for node ${node.id}!`, error);
            }
            if (handles == null) {
                return;
            }
            const handleSelection = g.selectAll<SVGGElement, LinkHandle>('g.link-handle')
                .data<LinkHandle>(handles as any, (handle: LinkHandle) => handle.id.toString())
                .join(
                    enter => enter.append('g').classed('link-handle', true)
                )
                .each(function (d: LinkHandle) {
                    const linkHandleG = select(this).datum(d);
                    const templateId = self.staticTemplateRegistry.getMarkerTemplateId(d.template);
                    self.updateContentTemplate<LinkHandle>(linkHandleG, templateId, 'marker', d.isDynamicTemplate, node);
                    if (d.isDynamicTemplate) {
                        const dynTemplate = self.dynamicTemplateRegistry.getDynamicTemplate<DynamicMarkerTemplate>(templateId);
                        if (dynTemplate != null) {
                            try {
                                dynTemplate.updateTemplate(linkHandleG, self, {parent: node});
                            } catch (error) {
                                console.error(`An error occured while updating the dynamic link handle template in node ${node.id}!`, error);
                            }
                        }
                    }
                })
                .attr('transform', (d) => {
                    const x = d.x != null ? d.x : 0;
                    const y = d.y != null ? d.y : 0;
                    const angle = self.calculateRotationTransformationAngle(d, d.normal ?? {dx: 0, dy: 0});
                    if (angle !== 0) {
                        return `translate(${x},${y})rotate(${angle})`;
                    }
                    return `translate(${x},${y})`;
                });

            // allow edge drag from link handles
            if (self.isInteractive) {
                handleSelection.call(
                    drag<SVGGElement, LinkHandle, {edge: DraggedEdge; capturingGroup?: string}>()
                        .subject((handle) => {
                            const groupCapturingEdge = self.groupingManager.getGroupCapturingOutgoingEdge(node);
                            if (groupCapturingEdge != null && groupCapturingEdge !== node.id.toString()) {
                                const groupNode = self.getNode(groupCapturingEdge);
                                if (groupNode != null) {
                                    return {edge: self.createDraggedEdge(groupNode), capturingGroup: groupCapturingEdge};
                                }
                            }
                            return {edge: self.createDraggedEdge(node), capturingGroup: node.id.toString()};
                        })
                        .container(() => self.svg.select('g.zoom-group').select<SVGGElement>('g.edges').node())
                        .on('drag', () => {
                            self.updateDraggedEdge(event.subject.edge, event.subject.capturingGroup);
                            self.updateDraggedEdgeGroups();
                        })
                        .on('end', () => {
                            self.dropDraggedEdge(event.subject.edge, false);
                        })
                );
            } else {
                handleSelection.on('.drag', null);
            }
        });

        nodeSelection
            .call(this.updateNodeClasses.bind(this))
            .call(this.updateNodeHighligts.bind(this))
            .call(this.updateNodeText.bind(this))
            .call(this.updateDynamicProperties.bind(this))
            .call(this.updateNodeDropAreas.bind(this))
            .each(function(d) {
                self.objectCache.setNodeBBox(d.id, this.getBBox());
            });
    }

    /**
     * Update node drop zones.
     *
     * @param nodeSelection d3 selection of nodes to calculate drop zones for with bound data
     */
    private updateNodeDropAreas(nodeSelection: Selection<SVGGElement, Node, any, unknown>) {
        const self = this;
        nodeSelection.each(function(node) {
            const dropZones = new Map<string, NodeDropZone>();
            select(this)
                .selectAll<SVGGraphicsElement, NodeDropZone>('[data-node-drop-zone]')
                .datum(function() {
                    const dropZoneSelection = select(this);
                    const id = dropZoneSelection.attr('data-node-drop-zone');
                    const bbox = this.getBBox();
                    const whitelist = new Set<string>();
                    const blacklist = new Set<string>();
                    dropZoneSelection.attr('data-node-type-filter').split(' ').forEach((type: string) => {
                        if (type !== '') {
                            if (type.startsWith('!')) {
                                blacklist.add(type.substring(1));
                            } else {
                                whitelist.add(type);
                            }
                        }
                    });
                    return {
                        id: id,
                        bbox: bbox,
                        whitelist: whitelist,
                        blacklist: blacklist,
                    };
                })
                .each(function (dropZone) {
                    dropZones.set(dropZone.id, dropZone);
                });
            self.objectCache.setNodeDropZones(node.id, dropZones);
        });
    }

    /**
     * Update text of existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    private updateNodeText(nodeSelection: Selection<SVGGElement, Node, any, unknown>, force: boolean= false) {
        const self = this;
        nodeSelection.each(function (d) {
            const singleNodeSelection = select(this);
            const textSelection = singleNodeSelection.selectAll<SVGTextElement, unknown>('text.text').datum(function () {
                return this.getAttribute('data-content');
            });
            textSelection.each(function (attr) {
                let newText = self.recursiveAttributeGet(d, attr);
                if (newText == null) {
                    newText = '';
                }
                // make sure it is a string
                newText = newText.toString();
                wrapText(this, newText, force);
            });
        });
    }

    /**
     * Update non text elements of existing nodes or edges.
     *
     * @param groupSelection d3 selection of nodes or edges to update with bound data
     */
    private updateDynamicProperties(groupSelection: Selection<SVGGElement, Node|Edge, any, unknown>) {
        const self = this;
        const updatableAttributes = ['fill', 'stroke'];
        groupSelection.each(function (d) {
            const singleGoupSelection = select(this);
            // update text
            singleGoupSelection.selectAll<Element, any>('[data-content]:not(.text)').datum(function () {
                const attribute = this.getAttribute('data-content');
                return self.recursiveAttributeGet(d, attribute)?.toString();
            }).text(text => text);
            // update attributes
            updatableAttributes.forEach(attr => {
                singleGoupSelection.selectAll<Element, any>(`[data-${attr}]`).datum(function () {
                    const attribute = this.getAttribute(`data-${attr}`);
                    return self.recursiveAttributeGet(d, attribute)?.toString();
                }).attr(attr, value => value);
            });
            // update href
            singleGoupSelection.selectAll<Element, any>('[data-href]').datum(function () {
                const attribute = this.getAttribute('data-href');
                return self.recursiveAttributeGet(d, attribute)?.toString();
            }).attr('xlink:href', value => value);
        });
    }

    /**
     * Recursively retrieve an attribute.
     *
     * The attribute path is a string split at the '.' character.
     * The attribute path is processed recursively by applying `obj = obj[attr[0]]`.
     * If a path segment is '()' then `obj = obj()` is applied instead.
     *
     * @param obj the object to get the attribute from
     * @param attr the attribute or attribute path to get
     */
    public recursiveAttributeGet(obj: unknown, attr: string): unknown {
        let result = null;
        try {
            if (attr != null) {
                if (attr.includes('.')) {
                    // recursive decend along path
                    const path = attr.split('.');
                    let temp = obj;
                    path.forEach(segment => {
                        if (segment === '()') {
                            temp = (temp as () => unknown)();
                        } else if (temp?.hasOwnProperty(segment)) {
                            temp = temp[segment];
                        } else {
                            temp = null;
                        }
                    });
                    result = temp;
                } else {
                    result = obj[attr];
                }
            }
        } catch (error) { // TODO at debug output
            return null;
        }
        return result;
    }

    /**
     * Update node classes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    public updateNodeClasses(nodeSelection?: Selection<SVGGElement, Node, any, unknown>): void {
        const calledDirectly = nodeSelection == null;
        if (nodeSelection == null) {
            nodeSelection = this.getNodeSelection();
        }
        if (this.classesToRemove != null) {
            this.classesToRemove.forEach((className) => {
                nodeSelection.classed(className, () => false);
            });
        }
        if (this.classes != null) {
            this.classes.forEach((className) => {
                nodeSelection.classed(className, (d) => {
                    if (this.setNodeClass != null) {
                        return this.setNodeClass(className, d);
                    }
                    return false;
                });
            });
        }
        if (calledDirectly) {
            this.onRender(EventSource.API, 'classes');
        }
    }


    /**
     * Update node positions.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    private updateNodePositions(nodeSelection: Selection<SVGGElement, Node, any, unknown>) {
        nodeSelection.attr('transform', (d) => {
            const x = d.x != null ? d.x : 0;
            const y = d.y != null ? d.y : 0;
            return `translate(${x},${y})`;
        });
    }

    /**
     * Update edge groups.
     *
     * @param edgeGroupSelection d3 selection of edgeGroups
     */
    private updateEdgeGroups(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>) {
        if (edgeGroupSelection == null) {
            edgeGroupSelection = this.edgesGroup
                .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
                .data<Edge>(this._edges, edgeId);
        }
        const self = this;
        edgeGroupSelection
            .each(function (d) {
                self.updateEdgeGroup(select(this), d);
            })
            .call(this.updateEdgeGroupClasses.bind(this))
            .call(this.updateEdgeHighligts.bind(this));
    }


    /**
     * Update draggededge groups.
     */
    private updateDraggedEdgeGroups() {
        this.edgesGroup
            .selectAll<SVGGElement, DraggedEdge>('g.edge-group.dragged')
            .data<DraggedEdge>(this.draggedEdges, edgeId)
            .join(
                enter => enter.append('g')
                    .attr('id', (d) => `edge-${edgeId(d)}`)
                    .classed('edge-group', true)
                    .classed('dragged', true)
                    .each(function () {
                        select(this).append('path')
                            .classed('edge', true)
                            .attr('fill', 'none');
                    })
            )
            .call(this.updateEdgeGroupClasses.bind(this))
            .call(this.updateEdgeGroups.bind(this))
            .call(this.updateEdgePositions.bind(this));
    }

    /**
     * Update classes of edgeGroups
     *
     * @param edgeGroupSelection d3 selection
     */
    private updateEdgeGroupClasses(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>) {
        if (this.classesToRemove != null) {
            this.classesToRemove.forEach((className) => {
                edgeGroupSelection.classed(className, () => false);
            });
        }
        if (this.classes != null) {
            this.classes.forEach((className) => {
                edgeGroupSelection.classed(className, (d) => {
                    if (this.setEdgeClass != null) {
                        return this.setEdgeClass(className, d, this.objectCache.getNode(d.source),
                            (d.target != null) ? this.objectCache.getNode(d.target) : null);
                    }
                    return false;
                });
            });
        }
    }

    /**
     * Update edge path and marker positions.
     *
     * @param edgeGroupSelection d3 selection
     */
    private updateEdgePositions(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>) {
        const self = this;
        edgeGroupSelection.select<SVGPathElement>('path.edge')
            .call(this.updateEdgeLinkHandles.bind(this))
            .call(this.updateEdgePath.bind(this));
        edgeGroupSelection.each(function (d) {
            self.updateEdgeTextPositions(select(this), d);
        });
        edgeGroupSelection.each(function (d) {
            select(this).selectAll('g.marker:not(.marker-special)').data(d.markers != null ? d.markers : [])
                .call(self.updateMarkerPositions.bind(self));
        }).each(function (d) {
            self.updateEndMarkerPositions(select(this), d);
        }).each(function (d) {
            // update link handle position
            setDefaultEdgeDragHandles(d);
            select(this).selectAll('g.link-handle').data(d.dragHandles)
                .call(self.updateMarkerPositions.bind(self));
        });
    }

    /**
     * Update markers and path attributes.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    private updateEdgeGroup(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {
        const pathSelection = edgeGroupSelection.select<SVGPathElement>('path.edge:not(.dragged)').datum(d);
        pathSelection.attr('stroke', 'black');

        // update markers
        this.updateEndMarkers(edgeGroupSelection, d);
        edgeGroupSelection.selectAll<SVGGElement, Marker>('g.marker:not(.marker-special)')
            .data(d.markers != null ? d.markers : [])
            .join(
                enter => enter.append('g')
                    .classed('marker', true)
            )
            .call(this.updateMarker.bind(this), d);

        // update edge drag handles
        setDefaultEdgeDragHandles(d);
        const edgeDragHandles = edgeGroupSelection.selectAll<SVGGElement, EdgeDragHandle>('g.link-handle')
            .data(d.dragHandles)
            .join(
                enter => enter.append('g')
                    .classed('link-handle', true)
            )
            .call(this.updateMarker.bind(this), d)
            .raise(); // raise the drag handles to the top of the edge

        this.updateEdgeText(edgeGroupSelection, d);
        this.updateDynamicProperties(edgeGroupSelection);

        if (this.isInteractive) {
            edgeDragHandles.call(
                drag<SVGGElement, EdgeDragHandle, {edge: DraggedEdge; capturingGroup?: string; isReversedEdge: boolean}>()
                    .subject((handle) => {
                        const edge = d;
                        let sourceNode: Node;
                        if (handle.isReverseHandle ?? false) {
                            // a reverse handle flips the edge direction
                            sourceNode = this.getNode(edge.target);
                        } else {
                            sourceNode = this.getNode(edge.source);
                        }
                        const groupCapturingEdge = this.groupingManager.getGroupCapturingOutgoingEdge(sourceNode);
                        if (groupCapturingEdge != null && groupCapturingEdge !== sourceNode.id.toString()) {
                            const groupNode = this.getNode(groupCapturingEdge);
                            if (groupNode != null) {
                                const newEdge = this.createDraggedEdgeFromExistingEdge(edge);
                                newEdge.source = groupCapturingEdge;
                                return {
                                    edge: newEdge,
                                    capturingGroup: groupCapturingEdge,
                                    isReversedEdge: handle.isReverseHandle ?? false,
                                };
                            }
                        }
                        return {
                            edge: this.createDraggedEdgeFromExistingEdge(edge, handle.isReverseHandle ?? false),
                            capturingGroup: sourceNode.id.toString(),
                            isReversedEdge: handle.isReverseHandle ?? false,
                        };
                    })
                    .container(() => this.edgesGroup.node() as any)
                    .on('start', () => this.completeRender(false, EventSource.USER_INTERACTION))
                    .on('drag', () => {
                        this.updateDraggedEdge(event.subject.edge, event.subject.capturingGroup);
                        this.updateDraggedEdgeGroups();
                    })
                    .on('end', () => {
                        this.dropDraggedEdge(event.subject.edge, event.subject.isReversedEdge);
                    })
            );
        } else {
            edgeGroupSelection.select('g.link-handle').on('.drag', null);
        }
    }

    /**
     * Update all edge texts in a edge group.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     * @param force force text to re-wrap
     */
    private updateEdgeText(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge, force: boolean= false) {
        const self = this;
        edgeGroupSelection.each(function (edge) {
            const textSelection = select(this).selectAll<SVGGElement, TextComponent>('g.text-component')
                .data(edge.texts != null ? edge.texts : [])
                .join(enter => enter.append('g').classed('text-component', true))
                .each(function(textComponent) {
                    const g: Selection<SVGGElement, TextComponent, any, unknown> = select(this).datum<TextComponent>(textComponent);
                    const templateId = textComponent.template ?? 'default-textcomponent';
                    self.updateContentTemplate<TextComponent>(g, templateId, 'textcomponent', true, edge);
                    const dynTemplate = self.dynamicTemplateRegistry.getDynamicTemplate<DynamicTextComponentTemplate>(templateId);
                    try {
                        dynTemplate?.updateTemplate(g, self, {parent: edge});
                    } catch (error) {
                        console.error(`An error occured updating the text component in edge ${edgeId(edge)} before text wrapping`, textComponent, error);
                    }
                })
                .attr('data-click', (t) => t.clickEventKey);

            textSelection.select('text')
                .classed('text', true)
                .attr('width', (t) => t.width)
                .attr('height', (t) => t.height)
                .each(function (text) {
                    let newText = '';
                    if (text.value != null) {
                        newText = text.value;
                    } else {
                        newText = self.recursiveAttributeGet(d, text.attributePath)?.toString();
                    }
                    if (newText == null) {
                        newText = '';
                    }
                    // make sure it is a string
                    newText = newText.toString();
                    wrapText(this as SVGTextElement, newText, force);
                });
            textSelection.each(function(textComponent) {
                const g: Selection<SVGGElement, TextComponent, any, unknown> = select(this).datum<TextComponent>(textComponent);
                const templateId = textComponent.template ?? 'default-textcomponent';
                const dynTemplate = self.dynamicTemplateRegistry.getDynamicTemplate<DynamicTextComponentTemplate>(templateId);
                try {
                    dynTemplate?.updateAfterTextwrapping(g, self, {parent: edge});
                } catch (error) {
                    console.error(`An error occured updating the text component in edge ${edgeId(edge)} after text wrapping`, textComponent, error);
                }
            });
            if (self.isInteractive) {
                const path = edgeGroupSelection.select<SVGPathElement>('path.edge');
                textSelection.call(drag()
                    .on('start', (text: TextComponent) => {
                        self.onEdgeTextDrag('start', text, edge, EventSource.USER_INTERACTION);
                    })
                    .on('drag', (text: TextComponent) => {
                        const length = path.node().getTotalLength();
                        const positionOnLine = normalizePositionOnLine(text.positionOnLine);
                        const absolutePositionOnLine = self.calculateAbsolutePositionOnLine(length, positionOnLine, text.absolutePositionOnLine);
                        const referencePoint = path.node().getPointAtLength(absolutePositionOnLine);
                        text.offsetX = event.x - referencePoint.x;
                        text.offsetY = event.y - referencePoint.y;
                        self.onEdgeTextPositionChange(text, edge);
                        self.updateEdgeTextPositions(edgeGroupSelection, edge);
                    })
                    .on('end', (text: TextComponent) => {
                        self.onEdgeTextDrag('end', text, edge, EventSource.USER_INTERACTION);
                    })
                );
            } else {
                textSelection.on('drag', null);
            }
        });
    }

    /**
     * Calculate the attachement vector for a marker.
     *
     * @param startingAngle the line angle for the marker
     * @param marker the selection of a single marker
     * @param strokeWidth the current stroke width
     */
    private calculateLineAttachementVector(startingAngle: number|RotationVector, markerSelection: Selection<SVGGElement, Marker, any, unknown>, strokeWidth: number) {
        if (markerSelection.empty()) {
            return {dx: 0, dy: 0};
        }
        const marker = markerSelection.datum();
        let attachementPointInfo: LineAttachementInfo;
        if (marker.isDynamicTemplate) {
            const dynTemplate = this.dynamicTemplateRegistry.getDynamicTemplate<DynamicMarkerTemplate>(marker.template);
            try {
                attachementPointInfo = dynTemplate?.getLineAttachementInfo(markerSelection);
            } catch (error) {
                console.error('An error occured while calculating the line attachement info for an edge marker!', marker, error);
            }
        } else {
            attachementPointInfo = this.staticTemplateRegistry.getMarkerAttachementPointInfo(marker.template);
        }
        if (attachementPointInfo != null) {
            let scale = 1;
            if (marker.scale != null) {
                scale *= marker.scale;
            }
            if (Boolean(marker.scaleRelative)) {
                scale *= strokeWidth;
            }
            if (typeof startingAngle === 'number') {
                return attachementPointInfo.getRotationVector(startingAngle, scale);
            } else {
                const normalAngle = calculateAngle(startingAngle);
                return attachementPointInfo.getRotationVector(normalAngle, scale);
            }
        }
        return {dx: 0, dy: 0};
    }

    /**
     * Calculate the link handles for each edge and store them into the edge.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    private updateEdgeLinkHandles(edgeSelection: Selection<SVGPathElement, Edge | DraggedEdge, any, unknown>) {
        edgeSelection.each(edge => {

            const sourceNodeSelection = this.getSingleNodeSelection(edge.source);
            const targetNodeSelection = (edge.target != null) ? this.getSingleNodeSelection(edge.target) : null;
            let initialSourceHandles, initialTargetHandles;
            try {
                initialSourceHandles = getNodeLinkHandles(sourceNodeSelection, this.staticTemplateRegistry, this.dynamicTemplateRegistry, this);
            } catch (error) {
                console.error(`An error occured while calculating the link handles for node ${edge.source}!`, error);
            }
            try {
                initialTargetHandles = getNodeLinkHandles(targetNodeSelection, this.staticTemplateRegistry, this.dynamicTemplateRegistry, this);
            } catch (error) {
                console.error(`An error occured while calculating the link handles for node ${edge.target}!`, error);
            }

            let sourceNode: Node, targetNode: Node | Point;
            if (sourceNodeSelection != null && !sourceNodeSelection.empty()) {
                sourceNode = sourceNodeSelection.datum();
            } else {
                console.warn('Attempting to render edge without a valid source!');
            }
            if (targetNodeSelection != null && !targetNodeSelection.empty()) {
                targetNode = targetNodeSelection.datum();
            } else if (edge.currentTarget != null) {
                targetNode = edge.currentTarget as Point;
            } else {
                console.warn('Attempting to render edge without a valid target!');
            }

            const newHandles = applyUserLinkHandleCalculationCallback(
                edge,
                initialSourceHandles,
                sourceNode,
                initialTargetHandles,
                targetNode,
                this.calculateLinkHandlesForEdge
            );

            const nearestHandles = calculateNearestHandles(newHandles.sourceHandles, sourceNode, newHandles.targetHandles, targetNode);
            edge.sourceHandle = nearestHandles.sourceHandle;
            edge.targetHandle = nearestHandles.targetHandle;
        });
    }

    /**
     * Update existing edge path.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    private updateEdgePath(edgeSelection: Selection<SVGPathElement, Edge, any, unknown>) {
        const self = this;
        edgeSelection.each(function (edge) {
            const singleEdgeSelection = select(this).datum(edge);
            const strokeWidth: number = parseFloat(singleEdgeSelection.style('stroke-width').replace(/px/, ''));
            // eslint-disable-next-line complexity
            singleEdgeSelection.attr('d', (d) => {
                let sourceCoordinates: Point = d.source != null ? self.objectCache.getNode(d.source) : null;
                let targetCoordinates: Point = d.target != null ? self.objectCache.getNode(d.target) : null;

                if (sourceCoordinates == null) {
                    sourceCoordinates = { x: 0, y: 0 };
                }
                if (targetCoordinates == null) {
                    if (d.currentTarget != null) {
                        targetCoordinates = d.currentTarget;
                    } else {
                        targetCoordinates = { x: 0, y: 1 };
                    }
                }

                // apply link handle offsets
                if (d.sourceHandle != null) {
                    sourceCoordinates = {
                        x: sourceCoordinates.x + d.sourceHandle.x,
                        y: sourceCoordinates.y + d.sourceHandle.y,
                    };
                }
                if (d.targetHandle != null) {
                    targetCoordinates = {
                        x: targetCoordinates.x + d.targetHandle.x,
                        y: targetCoordinates.y + d.targetHandle.y,
                    };
                }

                let sourceHandleNormal: RotationVector;
                let targetHandleNormal: RotationVector;

                // rotation vector between edge start and end
                let baseNormal: RotationVector = {
                    dx: sourceCoordinates.x - targetCoordinates.x,
                    dy: sourceCoordinates.y - targetCoordinates.y,
                };
                if (baseNormal.dx === 0 && baseNormal.dy === 0) {
                    baseNormal.dx = 1;
                }
                baseNormal = normalizeVector(baseNormal);

                if (d.sourceHandle?.normal != null) {
                    sourceHandleNormal = d.sourceHandle.normal;
                } else {
                    sourceHandleNormal = baseNormal;
                }
                if (d.targetHandle?.normal != null) {
                    targetHandleNormal = d.targetHandle.normal;
                } else {
                    targetHandleNormal = { dx: -baseNormal.dx, dy: -baseNormal.dy };
                }

                // calculate path
                const points: { x: number; y: number; [prop: string]: any }[] = [];

                // Calculate line attachement point for startMarker
                let startAttachementPointVector: RotationVector = { dx: 0, dy: 0 };
                if (d.markerStart != null) {
                    const markerSelection: Selection<SVGGElement, Marker, any, unknown> = select(this.parentNode)
                        .select<SVGGElement>('g.marker.marker-start')
                        .datum(d.markerStart);
                    startAttachementPointVector = self.calculateLineAttachementVector(sourceHandleNormal, markerSelection, strokeWidth);
                }

                points.push({
                    x: sourceCoordinates.x - startAttachementPointVector.dx,
                    y: sourceCoordinates.y - startAttachementPointVector.dy,
                });
                points.push({
                    x: sourceCoordinates.x - startAttachementPointVector.dx + (sourceHandleNormal.dx * 10),
                    y: sourceCoordinates.y - startAttachementPointVector.dy + (sourceHandleNormal.dy * 10),
                });

                // Calculate line attachement point for endMarker
                let endAttachementPointVector: RotationVector = { dx: 0, dy: 0 };
                if (d.markerEnd != null) {
                    const markerSelection: Selection<SVGGElement, Marker, any, unknown> = select(this.parentNode)
                        .select<SVGGElement>('g.marker.marker-end')
                        .datum(d.markerEnd);
                    endAttachementPointVector = self.calculateLineAttachementVector(targetHandleNormal, markerSelection, strokeWidth);
                }

                if (d.target != null) {
                    points.push({
                        x: targetCoordinates.x - endAttachementPointVector.dx + (targetHandleNormal.dx * 10),
                        y: targetCoordinates.y - endAttachementPointVector.dy + (targetHandleNormal.dy * 10),
                    });
                    points.push({
                        x: targetCoordinates.x - endAttachementPointVector.dx,
                        y: targetCoordinates.y - endAttachementPointVector.dy,
                    });
                } else {
                    points.push(targetCoordinates);
                }
                const pathGenerator = self.edgePathGeneratorRegistry.getEdgePathGenerator(d.pathType) ?? self.defaultEdgePathGenerator;
                let path: string;
                try {
                    path = pathGenerator.generateEdgePath(points[0], points[points.length - 1], sourceHandleNormal, (d.target != null) ? targetHandleNormal : null);
                } catch (error) {
                    console.error(`An error occurred while generating the edge path for the edge ${edgeId(edge)}`, error);
                    path = self.defaultEdgePathGenerator.generateEdgePath(points[0], points[points.length - 1], sourceHandleNormal, (d.target != null) ? targetHandleNormal : null);
                }
                return path;
            });
        });
    }

    /**
     * Update existing edge marker.
     *
     * @param markerSelection d3 selection
     * @param edge the edge datum this marker belongs to
     */
    private updateMarker(markerSelection: Selection<SVGGElement, Marker, any, unknown>, edge: Edge) {
        const self = this;
        markerSelection
            .attr('data-click', (d) => d.clickEventKey)
            .each(function (marker) {
                const templateId = self.staticTemplateRegistry.getMarkerTemplateId(marker.template);
                self.updateContentTemplate<Marker>(select(this), templateId, 'marker');
                if (marker.isDynamicTemplate) {
                    const g = select(this).datum(marker);
                    const dynTemplate = self.dynamicTemplateRegistry.getDynamicTemplate<DynamicMarkerTemplate>(templateId);
                    if (dynTemplate != null) {
                        try {
                            dynTemplate.updateTemplate(g, self, {parent: edge});
                        } catch (error) {
                            console.error(`An error occured while updating the dynamic marker template in edge ${edgeId(edge)}!`, error);
                        }
                    }
                }
            });
    }


    /**
     * Update edge-end and edge-start marker.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    private updateEndMarkers(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {
        this.updateEndMarker(edgeGroupSelection, d.markerStart, 'marker-start', d);
        this.updateEndMarker(edgeGroupSelection, d.markerEnd, 'marker-end', d);
    }

    /**
     * Update a specific edge end marker (either start or end marker).
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param marker the special end marker
     * @param markerClass the css class to select for
     * @param edge the edge datum this marker belongs to
     */
    private updateEndMarker(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, marker: Marker, markerClass: string, edge: Edge) {
        if (marker == null) {
            // delete
            edgeGroupSelection.select('g.marker.marker-end').remove();
            return;
        }
        let markerEndSelection: Selection<SVGGElement, Marker, any, unknown>;
        markerEndSelection = edgeGroupSelection.select<SVGGElement>(`g.marker.${markerClass}`)
            .datum<Marker>(marker);
        if (markerEndSelection.empty()) {
            // create
            markerEndSelection = edgeGroupSelection.append('g')
                .classed('marker', true)
                .classed(markerClass, true)
                .classed('marker-special', true)
                .datum<Marker>(marker);
        }
        this.updateMarker(markerEndSelection, edge);
    }

    /**
     * Calculate the safe absolutePositionOnLine value for the given path length.
     *
     * If absolutePositidragHandlesonOnLine is negative it is counted from the end of the path.
     * If absolutePositidragHandlesonOnLine exceeds the path length positionOnLine will be used as fallback.
     *
     * @param pathLength the length of the path
     * @param positionOnLine the relative position on the line (between 0 and 1)
     * @param absolutePositidragHandlesonOnLine the absolute position on line (between 0 and length)
     * @returns the positive absolute positionOnLine to be used with `path.getPointAtLength(absolutePositionOnLine)`.
     */
    public calculateAbsolutePositionOnLine(pathLength: number, positionOnLine: number, absolutePositionOnLine?: number): number {
        let result = null;
        if (absolutePositionOnLine != null) {
            if (absolutePositionOnLine < 0) {
                // actually a substraction...
                result = pathLength + absolutePositionOnLine;
            } else {
                result = absolutePositionOnLine;
            }
        }

        // else case & sanity checks for if case
        if (result == null || result < 0 || result > pathLength) {
            // always fall back to relative position
            result = pathLength * positionOnLine;
        }
        return result;
    }

    /**
     * Calculate a normal vector pointing in the direction of the path at the positonOnLine.
     *
     * @param path the path object
     * @param absolutePositionOnLine the absolute position on the path (between 0 and length)
     * @param point the point at positionOnLine (will be calculated if not supplied)
     * @param length the length of the path (will be calculated if not supplied)
     */
    public calculatePathNormalAtPosition(path: SVGPathElement, absolutePositionOnLine: number, point?: DOMPoint, length?: number): RotationVector {
        if (length == null) {
            length = path.getTotalLength();
        }
        if (point == null) {
            point = path.getPointAtLength(absolutePositionOnLine);
        }
        const isSecondHalve = absolutePositionOnLine > (length / 2);
        // calculate a second point at a small offset
        const epsilon = Math.min(1, length / 100);
        const delta = isSecondHalve ? -epsilon : epsilon;
        const point2 = path.getPointAtLength(absolutePositionOnLine + delta);
        return normalizeVector({
            dx: isSecondHalve ? (point.x - point2.x) : (point2.x - point.x),
            dy: isSecondHalve ? (point.y - point2.y) : (point2.y - point.y),
        });
    }

    /**
     * Calculate the transformation attribute for a path object placed on an edge.
     *
     * @param point the path object position position
     * @param pathObject the path object to place
     * @param strokeWidth the stroke width of the edge
     * @param normal the normal vector of the edge at the path object position
     */
    private calculatePathObjectTransformation(point: { x: number; y: number }, pathObject: PathPositionRotationAndScale, strokeWidth: number, normal: RotationVector) {
        let transform = `translate(${point.x},${point.y})`;
        if (pathObject.scale != null) {
            let scale = pathObject.scale;
            if (Boolean(pathObject.scaleRelative)) {
                scale *= strokeWidth;
            }
            if (scale !== 1) {
                transform += `scale(${scale})`;
            }
        }
        const angle = this.calculateRotationTransformationAngle(pathObject, normal);
        if (angle !== 0) {
            transform += `rotate(${angle})`;
        }
        return transform;
    }

    /**
     * Calculate the rotation vector from rotation data and a normal vector.
     *
     * @param rotationData the rotation data object
     * @param normal the normal vector used for relative rotation
     * @param ignorePathDirectionForRotation iff true the normal rotation is limited to half a circle (useful for text components)
     */
    private calculateRotationTransformationAngle(rotationData: RotationData, normal: RotationVector, ignorePathDirectionForRotation: boolean= false): number {
        let angle = rotationData.absoluteRotation ?? 0;
        if (rotationData.relativeRotation != null && rotationData.absoluteRotation == null) {
            const normalAngle = calculateAngle(normal);
            angle += normalAngle;
            if (ignorePathDirectionForRotation) {
                if (normalAngle > 90 || normalAngle < -90) {
                    angle += 180;
                }
            }
            angle += rotationData.relativeRotation;
        }
        return angle;
    }

    /**
     * Update positions of edge-end and edge-start marker.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    private updateEndMarkerPositions(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {

        // calculate position size and rotation
        const path = edgeGroupSelection.select<SVGPathElement>('path.edge');
        const length = path.node().getTotalLength();
        const strokeWidth: number = parseFloat(path.style('stroke-width').replace(/px/, ''));

        if (d.markerStart != null) {
            this.updateEndMarkerPosition(path, length, 0, d.markerStart, d.sourceHandle, 'marker-start', strokeWidth, edgeGroupSelection);
        }

        if (d.markerEnd != null) {
            this.updateEndMarkerPosition(path, length, 1, d.markerEnd, d.targetHandle, 'marker-end', strokeWidth, edgeGroupSelection);
        }
    }

    /**
     * Update a single end marker position (either start or end marker).
     *
     * @param path the path selection
     * @param length the path length
     * @param positionOnLine positionOnLine at the marker
     * @param marker the marker
     * @param handle the link handle at the path end of the marker; can be `null`
     * @param markerClass the class of the marker
     * @param strokeWidth the edge stroke width
     * @param edgeGroupSelection d3 selection of a single edge group
     */
    // eslint-disable-next-line complexity
    private updateEndMarkerPosition(
        path: Selection<SVGPathElement, Edge, any, unknown>,
        length: number, positionOnLine: number,
        marker: Marker, handle: LinkHandle, markerClass: string,
        strokeWidth: number,
        edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>
    ) {
        const markerSelection: Selection<SVGGElement, Marker, any, unknown> = edgeGroupSelection
            .select<SVGGElement>(`g.marker.${markerClass}`)
            .datum(marker);
        // path end point
        const absolutePositionOnLine = this.calculateAbsolutePositionOnLine(length, positionOnLine);
        const pathPointA = path.node().getPointAtLength(absolutePositionOnLine);
        // calculate angle for marker
        let markerStartingNormal: RotationVector;
        if (handle?.normal?.dx !== 0 || handle?.normal?.dy !== 0) {
            markerStartingNormal = handle?.normal;
        }
        if (markerClass === 'marker-end' && markerStartingNormal != null) {
            markerStartingNormal = { dx: -markerStartingNormal.dx, dy: -markerStartingNormal.dy};
        }
        if (markerStartingNormal == null) {
            // no link handle for marker present, calculate starting angle from path
            markerStartingNormal = this.calculatePathNormalAtPosition(path.node(), absolutePositionOnLine, pathPointA, length);
        }
        // calculate marker offset
        const attachementPointVector: RotationVector = this.calculateLineAttachementVector(markerStartingNormal, markerSelection, strokeWidth);
        const point = {
            x: pathPointA.x + (positionOnLine === 0 ? attachementPointVector.dx : -attachementPointVector.dx),
            y: pathPointA.y + (positionOnLine === 0 ? attachementPointVector.dy : -attachementPointVector.dy),
        };
        // account for deprecated attributes:
        if (marker.rotate != null) {
            console.warn('The marker.rotate attribute is deprecated!');
            if (marker.rotate.normal != null) {
                marker.absoluteRotation = calculateAngle(marker.rotate.normal);
            }
            marker.relativeRotation = marker.rotate.relativeAngle ?? null;
        }
        let markerTemplateStartingNormal: RotationVector;
        // flip normal for markerStart
        if (markerClass === 'marker-start' && markerStartingNormal != null) {
            markerTemplateStartingNormal = { dx: -markerStartingNormal.dx, dy: -markerStartingNormal.dy};
        } else {
            markerTemplateStartingNormal = markerStartingNormal;
        }
        // calculate marker transformation
        const transformEnd = this.calculatePathObjectTransformation(point, marker, strokeWidth, markerTemplateStartingNormal);
        // apply transformation
        markerSelection.attr('transform', transformEnd);
    }

    /**
     * Update all edge marker positions
     *
     * @param markerSelection d3 selection
     */
    private updateMarkerPositions(markerSelection: Selection<SVGGElement, Marker, any, unknown>) {
        const self = this;
        markerSelection.each(function (d) {
            const parent = select(this.parentElement);
            const marker = select(this);
            const path = parent.select<SVGPathElement>('path.edge');
            const length = path.node().getTotalLength();
            const strokeWidth: number = parseFloat(path.style('stroke-width').replace(/px/, ''));
            const positionOnLine = normalizePositionOnLine(d.positionOnLine);
            const absolutePositionOnLine = self.calculateAbsolutePositionOnLine(length, positionOnLine, d.absolutePositionOnLine);

            const point = path.node().getPointAtLength(absolutePositionOnLine);
            const normal = self.calculatePathNormalAtPosition(path.node(), absolutePositionOnLine, point, length);
            // account for deprecated attributes:
            if (d.rotate != null) {
                console.warn('The marker.rotate attribute is deprecated!');
                if (d.rotate.normal != null) {
                    d.absoluteRotation = calculateAngle(d.rotate.normal);
                }
                d.relativeRotation = d.rotate.relativeAngle ?? null;
            }
            const transform = self.calculatePathObjectTransformation(point, d, strokeWidth, normal);

            marker.attr('transform', transform);
        });
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

        return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
    }

    /**
     * Update all edge text positions in a edge group.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    private updateEdgeTextPositions(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {
        const self = this;
        const path = edgeGroupSelection.select<SVGPathElement>('path.edge');
        const length = path.node().getTotalLength();
        const strokeWidth: number = parseFloat(path.style('stroke-width').replace(/px/, ''));
        const textSelection = edgeGroupSelection.selectAll<SVGGElement, TextComponent>('g.text-component')
            .data<TextComponent>(d.texts != null ? d.texts : []);

        // calculate the node bounding boxes for collision detection
        let sourceBB = {x: 0, y: 0, width: 0, height: 0};
        let targetBB = {x: 0, y: 0, width: 0, height: 0};
        try {
            const sourceNode = this.objectCache.getNode(d.source);
            const targetNode = this.objectCache.getNode(d.target);
            const sourceNodeBB = this.objectCache.getNodeBBox(d.source);
            const targetNodeBB = this.objectCache.getNodeBBox(d.target);
            // add node position to bounding box
            sourceBB = {
                x: sourceNodeBB.x + sourceNode.x,
                y: sourceNodeBB.y + sourceNode.y,
                width: sourceNodeBB.width,
                height: sourceNodeBB.height,
            };
            targetBB = {
                x: targetNodeBB.x + targetNode.x,
                y: targetNodeBB.y + targetNode.y,
                width: targetNodeBB.width,
                height: targetNodeBB.height,
            };
        } catch (error) {
            // use line endpoints as fallback
            const sourceEndpoint = path.node().getPointAtLength(0);
            const targetEndpoint = path.node().getPointAtLength(0);
            sourceBB.x = sourceEndpoint.x;
            sourceBB.y = sourceEndpoint.y;
            targetBB.x = targetEndpoint.x;
            targetBB.y = targetEndpoint.y;
        }

        // update text selections
        // eslint-disable-next-line complexity
        textSelection.each(function (t) {
            const text = select(this);
            const positionOnLine = normalizePositionOnLine(t.positionOnLine);
            const absolutePositionOnLine = self.calculateAbsolutePositionOnLine(length, positionOnLine, t.absolutePositionOnLine);
            const pathPoint = path.node().getPointAtLength(absolutePositionOnLine);

            const edgeNormal = self.calculatePathNormalAtPosition(path.node(), absolutePositionOnLine, pathPoint, length);

            // factor in offset coordinates of text component
            const referencePoint = {
                x: pathPoint.x + (t.offsetX ?? 0),
                y: pathPoint.y + (t.offsetY ?? 0),
            };

            // apply transformation fisrt
            const initialTransform = self.calculatePathObjectTransformation(referencePoint, t, strokeWidth, edgeNormal);
            text.attr('transform', initialTransform);

            // calculate center of nearest node (line distance, not euklidean distance)
            const nodeBB = (absolutePositionOnLine > (length / 2)) ? targetBB : sourceBB;
            const nodeCenter = {
                x: nodeBB.x + (nodeBB.width / 2),
                y: nodeBB.y + (nodeBB.height / 2),
            };

            // use node center point to calculate the angle with the reference point
            const normal = {
                dx: nodeCenter.x - referencePoint.x,
                dy: nodeCenter.y - referencePoint.y,
            };
            let angle = calculateAngle(normal);
            if (angle < 0) {
                angle += 380;
            }
            if (angle > 360) {
                angle -= 360;
            }

            let bbox: Rect = text.node().getBBox();

            if (initialTransform.includes('scale') || initialTransform.includes('rotate')) {
                const svgNode = text.node();
                const ctm = (svgNode.parentElement as unknown as SVGGElement).getScreenCTM().inverse().multiply(svgNode.getScreenCTM());
                bbox = self.transformBBox(bbox, ctm);
            } else {
                bbox = {
                    x: referencePoint.x + bbox.x,
                    y: referencePoint.y + bbox.y,
                    width: bbox.width,
                    height: bbox.height,
                };
            }

            const targetPoint: Point = {
                x: referencePoint.x,
                y: referencePoint.y,
            };

            let deltaX = 0;
            let deltaY = 0;
            if (angle > 0 && angle < 180) {
                // bottom of the text (possibly) overlaps
                let delta = (nodeBB.y) - (bbox.y + bbox.height);
                if (t.padding) {
                    delta -= t.padding;
                }
                if (delta < 0) {
                    deltaY = delta;
                }
            }
            if (angle > 180 && angle < 360) {
                // top of the text (possibly) overlaps
                let delta = (nodeBB.y + nodeBB.height) - bbox.y;
                if (t.padding) {
                    delta += t.padding;
                }
                if (delta > 0) {
                    deltaY = delta;
                }
            }
            if (angle > 90 && angle < 270) {
                // left side of text (possibly) overlaps
                let delta = (nodeBB.x + nodeBB.width) - bbox.x;
                if (t.padding) {
                    delta += t.padding;
                }
                if (delta > 0) { // only update target if text actually overlaps
                    deltaX = delta;
                }
            }
            if (angle > 270 || angle < 90) {
                // right side of text (possibly) overlaps
                let delta = (nodeBB.x) - (bbox.x + bbox.width);
                if (t.padding) {
                    delta -= t.padding;
                }
                if (delta < 0) { // only update target if text actually overlaps
                    deltaX = delta;
                }
            }

            // only adjust for actual overlap in both directions
            if (deltaX !== 0 && deltaY !== 0) {
                // only adjust in one direction
                if ((angle > 45 && angle < 135) || (angle > 225 && angle < 315)) {
                    targetPoint.y += deltaY;
                } else {
                    targetPoint.x += deltaX;
                }
            }

            const finalTransform = initialTransform.replace(/^translate\([^\)]*\)/, `translate(${targetPoint.x},${targetPoint.y})`);
            text.attr('transform', finalTransform);
        });

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
            .call(this.updateNodePositions.bind(this));

        this.edgesGroup
            .selectAll('g.edge-group:not(.dragged)')
            .data(this._edges, edgeId)
            .call(this.updateEdgePositions.bind(this));

        this.edgesGroup
            .selectAll('g.edge-group.dragged')
            .data(this.draggedEdges, edgeId)
            .call(this.updateEdgePositions.bind(this));

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
     * Create a new dragged edge from a source node.
     *
     * @param sourceNode node that edge was dragged from
     */
    private createDraggedEdge(sourceNode: Node): DraggedEdge {
        const validTargets = new Set<string>();
        this._nodes.forEach(node => validTargets.add(node.id.toString()));
        this.objectCache.getEdgesBySource(sourceNode.id).forEach(edge => validTargets.delete(edge.target.toString()));
        validTargets.delete(sourceNode.id.toString());
        let draggedEdge: DraggedEdge = {
            id: sourceNode.id.toString() + Date.now().toString(),
            source: sourceNode.id,
            target: null,
            validTargets: validTargets,
            currentTarget: { x: event.x, y: event.y },
        };
        if (this.onCreateDraggedEdge != null) {
            draggedEdge = this.onCreateDraggedEdge(draggedEdge);
            if (draggedEdge == null) {
                return null;
            }
        }
        this.draggedEdges.push(draggedEdge);
        return draggedEdge;
    }

    /**
     * Create a dragged edge from an existing edge.
     *
     * @param edge existing edge
     * @param reverseEdgeDirection reverse the direction of the returned edge
     */
    // eslint-disable-next-line complexity
    private createDraggedEdgeFromExistingEdge(edge: Edge, reverseEdgeDirection: boolean= false): DraggedEdge {
        const validTargets = new Set<string>();
        this._nodes.forEach(node => validTargets.add(node.id.toString()));
        const source = reverseEdgeDirection ? edge.target : edge.source;
        this.objectCache.getEdgesBySource(source).forEach(edgeOutgoing => {
            if (edgeId(edge) !== edgeId(edgeOutgoing)) {
                validTargets.delete(edgeOutgoing.target.toString());
            }
        });
        let draggedEdge: DraggedEdge = {
            id: source.toString() + Date.now().toString(),
            createdFrom: edgeId(edge),
            source: reverseEdgeDirection ? edge.target : edge.source,
            target: null,
            type: edge.type,
            pathType: edge.pathType,
            validTargets: validTargets,
            currentTarget: { x: event.x, y: event.y },
            markers: [],
            texts: [],
            dragHandles: null,
            isBidirectional: edge.isBidirectional,
        };
        for (const key in edge) {
            if (edge.hasOwnProperty(key) && key !== 'id' && key !== 'type' && key !== 'createdFrom' && key !== 'sourceHandle' &&
                key !== 'targetHandle' && key !== 'source' && key !== 'target' && key !== 'validTargets' && key !== 'currentTarget') {
                try {
                    draggedEdge[key] = JSON.parse(JSON.stringify(edge[key]));
                } catch (error) {
                    draggedEdge[key] = edge.key;
                }
            }
        }
        if (reverseEdgeDirection) {
            const flipDirections = (element: PathPositionRotationAndScale) => {
                // flip positionOnLine
                if (element.positionOnLine === 'start') {
                    element.positionOnLine = 'end';
                } else if (element.positionOnLine === 'end') {
                    element.positionOnLine = 'start';
                } else {
                    element.positionOnLine = 1 - element.positionOnLine;
                }
                // rotate relative rotation by 180°
                if (element.relativeRotation != null) {
                    element.relativeRotation += element.relativeRotation > 180 ? -180 : 180;
                }
                // flip absolutePositionOnLine
                if (element.absolutePositionOnLine != null) {
                    element.absolutePositionOnLine = -element.absolutePositionOnLine;
                }
            };
            draggedEdge.markers.forEach(flipDirections);
            draggedEdge.texts.forEach(flipDirections);
            draggedEdge.dragHandles.forEach(handle => {
                flipDirections(handle);
                // flip isReverseHandle
                handle.isReverseHandle = !handle.isReverseHandle;
            });
            // flip end markers
            const temp = draggedEdge.markerEnd;
            if (draggedEdge.markerStart != null) {
                draggedEdge.markerEnd = draggedEdge.markerStart;
            }
            if (temp != null) {
                draggedEdge.markerStart = temp;
            }
        }
        if (this.onCreateDraggedEdge != null) {
            draggedEdge = this.onCreateDraggedEdge(draggedEdge);
            if (draggedEdge == null) {
                return null;
            }
        }
        this.draggedEdges.push(draggedEdge);
        return draggedEdge;
    }

    /**
     * Update dragged edge on drag event.
     */
    // eslint-disable-next-line complexity
    private updateDraggedEdge(edge: DraggedEdge, capturingGroup?: string) {
        const oldTarget = edge.target;
        edge.target = null;
        edge.currentTarget.x = event.x;
        edge.currentTarget.y = event.y;

        const sourceEvent = event.sourceEvent;
        const possibleTargetNodes = this.getNodesFromPoint(sourceEvent.clientX, sourceEvent.clientY);
        if (possibleTargetNodes.length > 0) {
            const targetNode = possibleTargetNodes[0];
            const targetNodeId = targetNode.id.toString();

            // validate target
            let isValidTarget = true;

            // allow target to be source
            // isValidTarget = isValidTarget && (edge.source.toString() === targetNodeId);

            // check group capture
            const targetGroupCapturingEdge = this.groupingManager.getGroupCapturingIncomingEdge(targetNode);

            if (targetGroupCapturingEdge == null) {
                // no group capture, node must be a valid target
                isValidTarget = isValidTarget && edge.validTargets.has(targetNodeId);
            } else {
                // group capture, group must be a valid target
                isValidTarget = isValidTarget && edge.validTargets.has(targetGroupCapturingEdge);
            }

            if (isValidTarget) {
                // initially always set the target node
                edge.target = targetNodeId;
            } else {
                // remove target if no valid target found
                edge.target = null;
            }

            // handle group captures
            if (isValidTarget && targetGroupCapturingEdge != null) {
                const targetGroupBehaviour = this.groupingManager.getGroupBehaviourOf(targetGroupCapturingEdge);
                const targetGroupNode = this.getNode(targetGroupCapturingEdge);
                if (targetGroupBehaviour?.delegateIncomingEdgeTargetToNode != null && targetGroupNode != null) {
                    const newTarget = targetGroupBehaviour.delegateIncomingEdgeTargetToNode(targetGroupCapturingEdge, targetGroupNode, edge, this);
                    if (newTarget != null && newTarget !== '' && this.getNode(newTarget) !== null) {
                        edge.target = newTarget;
                    }
                }
            }
        }

        // dispatch event if target changed and handle source group link capture
        if (edge.target !== oldTarget) {
            if (capturingGroup != null) {
                const groupBehaviour = this.groupingManager.getGroupBehaviourOf(capturingGroup);
                const groupNode = this.getNode(capturingGroup);
                if (groupBehaviour != null && groupNode != null && groupBehaviour.delegateOutgoingEdgeSourceToNode != null) {
                    const newSource = groupBehaviour.delegateOutgoingEdgeSourceToNode(capturingGroup, groupNode, edge, this);
                    if (newSource != null && newSource !== '' && this.getNode(newSource) !== null) {
                        edge.source = newSource;
                    }
                }
            }
            if (this.onDraggedEdgeTargetChange != null) {
                const source = this.objectCache.getNode(edge.source);
                const target = edge.target != null ? this.objectCache.getNode(edge.target) : null;
                this.onDraggedEdgeTargetChange(edge, source, target);
            }
        }
    }

    /**
     * Drop dragged edge.
     *
     * @param edge the edge that was dropped
     * @param isReversedEdge true if the edge is bidirectional and was dragged
     *      from a reverse handle flipping the edge direction
     */
    // eslint-disable-next-line complexity
    private dropDraggedEdge(edge: DraggedEdge, isReversedEdge: boolean) {
        let updateEdgeCache = false;
        const existingEdge = this.objectCache.getEdge(edge.createdFrom);
        let existingTarget = existingEdge?.target.toString();
        if (isReversedEdge) {
            existingTarget = existingEdge?.source.toString();
        }
        if (edge.createdFrom != null) {
            if (edge.target?.toString() !== existingTarget) {
                // only remove original edge if target of dropped edge is different then original target
                const i = this._edges.findIndex(e => edgeId(e) === edge.createdFrom);
                if (this.onEdgeRemove(this._edges[i], EventSource.USER_INTERACTION)) {
                    this._edges.splice(i, 1);
                    updateEdgeCache = true;
                }
            }
        }

        const index = this.draggedEdges.findIndex(e => e.id === edge.id);
        this.draggedEdges.splice(index, 1);
        this.updateDraggedEdgeGroups();
        if (edge.target != null) {
            // dragged edge has a target
            let finalEdge: Edge = edge;
            delete finalEdge.id;
            if (this.onDropDraggedEdge != null) {
                finalEdge = this.onDropDraggedEdge(edge, this.objectCache.getNode(edge.source),
                                              this.objectCache.getNode(edge.target));
            }
            if (edge.createdFrom != null && edge.target === existingTarget) {
                // edge was dropped on the node that was the original target for the edge
                this.completeRender(false, EventSource.USER_INTERACTION);
            } else {
                if (this.onEdgeCreate(edge, EventSource.USER_INTERACTION)) {
                    this._edges.push(edge);
                    updateEdgeCache = true;
                }
            }
        } else {
            this.onEdgeDrop(edge, {x: event.x, y: event.y});
        }
        if (updateEdgeCache) {
            this.objectCache.updateEdgeCache(this._edges);
            this.completeRender(false, EventSource.USER_INTERACTION);
        }
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
     * Callback for creating edgedrop events.
     *
     * The event is only for dragged edges that are dropped in the void.
     *
     * @param edge the dropped dragged edge
     * @param dropPosition the position where the edge was dropped at
     * @returns false if event was cancelled
     */
    private onEdgeDrop(edge: DraggedEdge, dropPosition: Point) {
        const detail: any = {
            eventSource: EventSource.USER_INTERACTION,
            edge: edge,
            sourceNode: this.objectCache.getNode(edge.source),
            dropPosition: dropPosition,
        };
        if (edge.createdFrom != null && edge.createdFrom !== '') {
            detail.originalEdge = this.objectCache.getEdge(edge.createdFrom);
        }
        const ev = new CustomEvent('edgedrop', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: detail,
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
     * Callback on edges for click event.
     *
     * @param edgeDatum Corresponding datum of edge
     */
    private onEdgeClick(edgeDatum) {
        const eventDetail: any = {};
        eventDetail.eventSource = EventSource.USER_INTERACTION;
        const path = event.composedPath();
        if (path != null) {
            let i = 0;
            let target;
            // search in event path for data-click attribute
            while (i === 0 || target != null && i < path.length) {
                target = select(path[i]);
                const key = target.attr('data-click');
                if (key != null) {
                    eventDetail.key = key;
                    break;
                }
                if (target.classed('edge-group')) {
                    // reached edge boundary in dom
                    break;
                }
                i++;
            }
        }
        eventDetail.sourceEvent = event;
        eventDetail.edge = edgeDatum;
        const ev = new CustomEvent('edgeclick', { bubbles: true, composed: true, cancelable: true, detail: eventDetail });
        if (!this.dispatchEvent(ev)) {
            return; // prevent default / event cancelled
        }
    }

    /**
     * Create and dispatch 'edgetextdragstart' and 'edgetextdragend' events.
     *
     * @param eventType the type of the event
     * @param textComponent The text component that was dragged.
     * @param edge The edge the text component belongs to.
     * @param eventSource the event source
     */
    private onEdgeTextDrag(eventType: 'start'|'end', textComponent: TextComponent, edge: Edge, eventSource) {
        const ev = new CustomEvent(`edgetextdrag${eventType}`, {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: eventSource,
                text: textComponent,
                edge: edge,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Callback for creating edgetextpositionchange events.
     *
     * @param textComponent The text component that was dragged.
     * @param edge The edge the text component belongs to.
     */
    private onEdgeTextPositionChange(textComponent: TextComponent, edge: Edge) {
        const ev = new CustomEvent('edgetextpositionchange', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                text: textComponent,
                edge: edge,
            },
        });
        this.dispatchEvent(ev);
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
     * Create and dispatch 'nodedragstart' and 'nodedragend' events.
     *
     * @param eventType the type of the event
     * @param movementInfo the node movement information
     * @param eventSource the event source
     */
    private onNodeDrag(eventType: 'start'|'end', movementInfo: NodeMovementInformation, eventSource) {
        const ev = new CustomEvent(`nodedrag${eventType}`, {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: eventSource,
                node: movementInfo.node,
                affectedChildren: movementInfo.children,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Callback for creating nodepositionchange events.
     *
     * @param nodes nodes that changed
     * @param eventSource the source of the selection event (default: EventSource.USER_INTERACTION)
     */
    private onNodePositionChange(node: Node, eventSource: EventSource= EventSource.USER_INTERACTION) {
        const ev = new CustomEvent('nodepositionchange', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: eventSource,
                node: node,
            },
        });
        this.dispatchEvent(ev);
    }

    /**
     * Callback on nodes for mouseEnter event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeEnter(nodeDatum: Node) {
        this.hovered.add(nodeDatum.id);
        if (this._mode === 'link' && this.interactionStateData.source != null) {
            this.interactionStateData.target = nodeDatum.id;
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
    private onNodeLeave(nodeDatum: Node) {
        this.hovered.delete(nodeDatum.id);
        if (this._mode === 'link' && this.interactionStateData.target === nodeDatum.id) {
            this.interactionStateData.target = null;
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
    private onNodeClick = (nodeDatum: Node) => {
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
                target = select(path[i]);
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
        if (this._mode === 'link') {
            return this.onNodeSelectLink(nodeDatum);
        }
        if (this._mode !== 'select') {
            this.setMode('select');
            this.interactionStateData.selected.add(nodeDatum.id.toString());
            this.onSelectionChangeInternal();
        } else if (this.interactionStateData.selected.has(nodeDatum.id.toString())) {
            this.interactionStateData.selected.delete(nodeDatum.id.toString());
            this.onSelectionChangeInternal();
            if (this.interactionStateData.selected.size <= 0) {
                this.setMode(this.interactionStateData.fromMode);
            }
        } else {
            this.interactionStateData.selected.add(nodeDatum.id.toString());
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
    private onSelectionChangeInternal(eventSource= EventSource.USER_INTERACTION) {
        let selected: Set<string> = new Set();
        if (this.mode === 'select') {
            selected = this.interactionStateData.selected;
        }
        const ev = new CustomEvent('selection', {
            bubbles: true,
            composed: true,
            detail: {
                eventSource: eventSource,
                selection: selected,
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
        if (this.interactionStateData.source == null) {
            this.interactionStateData.source = nodeDatum.id;
            return;
        }
        if (nodeDatum.id === this.interactionStateData.source) {
            // doesn't handle edges to self
            this.interactionStateData.source = null;
            this.interactionStateData.target = null;
            return;
        }
        this.interactionStateData.target = nodeDatum.id;
        // eslint-disable-next-line arrow-body-style
        const oldEdge = this._edges.findIndex((e) => {
            return (e.source === this.interactionStateData.source) &&
                (e.target === this.interactionStateData.target);
        });
        if (oldEdge !== -1) {
            if (!this.onEdgeRemove(this._edges[oldEdge], EventSource.USER_INTERACTION)) {
                return; // event cancelled
            }
            this._edges.splice(oldEdge, 1);
        } else {
            const newEdge: Edge = {
                source: this.interactionStateData.source,
                target: this.interactionStateData.target,
            };
            if (!this.onEdgeCreate(newEdge, EventSource.USER_INTERACTION)) {
                return; // event cancelled
            }
            this._edges.push(newEdge);
        }
        this.objectCache.updateEdgeCache(this._edges);
        this.completeRender(false, EventSource.USER_INTERACTION);
        this.interactionStateData.source = null;
        this.interactionStateData.target = null;
    }

    /**
     * Calculate highlighted nodes and update their classes.
     */
    private updateNodeHighligts(nodeSelection?: Selection<SVGGElement, Node, any, unknown>) {
        if (nodeSelection == null) {
            nodeSelection = this.getNodeSelection();
        }

        nodeSelection
            .classed('hovered', (d) => this.hovered.has(d.id))
            .classed('selected', (d) => {
                if (this._mode === 'select') {
                    const selected = this.interactionStateData.selected;
                    if (selected != null) {
                        return selected.has(d.id.toString());
                    }
                }
                if (this._mode === 'link') {
                    if (this.interactionStateData.source != null) {
                        if (d.id === this.interactionStateData.source) {
                            return true;
                        }
                    }
                }
                return false;
            });
    }

    /**
     * Calculate highlighted edges and update their classes.
     */
    private updateEdgeHighligts(edgeSelection?: Selection<SVGGElement, Edge, any, unknown>) {
        if (edgeSelection == null) {
            edgeSelection = this.edgesGroup
                .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
                .data<Edge>(this._edges, edgeId);
        }

        let nodes: Set<number | string> = new Set();

        if (this.mode === 'link') {
            if (this.interactionStateData.source != null) {
                nodes.add(this.interactionStateData.source);
            }
        } else {
            nodes = this.hovered;
        }

        edgeSelection
            .classed('highlight-outgoing', (d) => nodes.has(d.source))
            .classed('highlight-incoming', (d) => nodes.has(d.target));
    }

    /**
     * Create and dispatch a 'backgroundclick' event.
     */
    private onBackgroundClick() {
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
                    x: this.currentZoom.invertX(event.x),
                    y: this.currentZoom.invertY(event.y),
                },
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
    private onRender(eventSource: EventSource, type: 'complete'|'text'|'classes'|'positions', affectedNodes?: Set<string>) {
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

