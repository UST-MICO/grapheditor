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
import { zoom, zoomIdentity, zoomTransform, ZoomBehavior } from 'd3-zoom';
import { drag } from 'd3-drag';
import { line, curveBasis } from 'd3-shape';

import { Node } from './node';
import { Edge, DraggedEdge, edgeId, Point, TextComponent } from './edge';
import { LinkHandle } from './link-handle';
import { GraphObjectCache } from './object-cache';
import { wrapText } from './textwrap';
import { calculateAngle, normalizeVector, RotationVector } from './rotation-vector';
import { TemplateCache } from './templating';
import { Marker, LineAttachementInfo } from './marker';

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

    private root: ShadowRoot;
    private zoom: ZoomBehavior<any, any>;
    private zoomActive: boolean = false;
    private edgeGenerator;

    private contentMinHeight = 0;
    private contentMaxHeight = 1;
    private contentMinWidth = 0;
    private contentMaxWidth = 1;

    private hovered: Set<number | string> = new Set();

    private _classes: string[];
    private classesToRemove: Set<string>;
    private _nodes: Node[];
    private _edges: Edge[];
    private draggedEdges: DraggedEdge[];
    private _mode: string = 'display'; // interaction mode ['display', 'layout', 'link', 'select']
    private _zoomMode: string = 'both'; // ['none', 'manual', 'automatic', 'both']

    private templateCache: TemplateCache;
    private objectCache: GraphObjectCache;

    private interactionStateData: {
        source?: number | string,
        target?: number | string,
        selected?: Set<number | string>,
        fromMode?: string,
        [property: string]: any
    } = null;

    /** Private property to determine if the graph can be drawn. */
    private get initialized(): boolean {
        return this.svg != null && !this.svg.empty() && this.isConnected;
    }

    private get isInteractive(): boolean {
        return (this._mode !== 'display') && !(this._mode === 'select' && this.interactionStateData.fromMode === 'display');
    }

    /**
     * Callback when a new dragged edge is created.
     *
     * Use this callback only to customize the edge attributes like markers or type!
     */
    public onCreateDraggedEdge: (edge: DraggedEdge) => DraggedEdge;

    /**
     * Callback dragged edge has a new target.
     *
     * Only modify the existing edge!
     */
    public onDraggedEdgeTargetChange: (edge: DraggedEdge, sourceNode: Node, targetNode?: Node) => void;

    /**
     * Callback when a existing dragged edge is dropped.
     *
     * Use this callback only to customize the edge attributes like markers or type!
     */
    public onDropDraggedEdge: (edge: DraggedEdge, sourceNode: Node, targetNode: Node) => Edge;

    /**
     * Callback to set/unset a given class for a node.
     */
    public setNodeClass: (className: string, node: Node) => boolean;

    /**
     * Callback to set/unset a given class for an edge.
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
     */
    // tslint:disable-next-line:max-line-length
    public calculateLinkHandlesForEdge: (edge: Edge|DraggedEdge, sourceHandles: LinkHandle[], source: Node, targetHandles: LinkHandle[], target: Node|Point) => {sourceHandles: LinkHandle[], targetHandles: LinkHandle[]};

    get classes() {
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

    get nodeList() {
        return this._nodes;
    }

    /**
     * The list of nodes.
     *
     * This list should **not** be altered without updating the cache!
     */
    set nodeList(nodes: Node[]) {
        this._nodes = nodes;
        this.objectCache.updateNodeCache(nodes);
    }

    get edgeList() {
        return this._edges;
    }

    /**
     * The list of edges.
     *
     * This list should **not** be altered without updating the cache!
     */
    set edgeList(edges: Edge[]) {
        this._edges = edges;
        this.objectCache.updateEdgeCache(edges);
    }

    get mode() {
        return this._mode;
    }

    /**
     * The interaction mode of the grapheditor.
     */
    set mode(mode: string) {
        this.setMode(mode.toLowerCase());
        select(this).attr('mode', mode);
    }

    get zoomMode() {
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
        this.templateCache = new TemplateCache();
        this.objectCache = new GraphObjectCache(this.templateCache);
        this.edgeGenerator = line<{ x: number; y: number; }>().x((d) => d.x)
            .y((d) => d.y).curve(curveBasis);

        this.root = this.attachShadow({ mode: 'open' });

        // prelaod shadow dom with html
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

    connectedCallback() {
        if (!this.isConnected) {
            return;
        }

        // bind resize observer to parent node
        if (this.resizeObserver != null) {
            this.resizeObserver.disconnect();
            this.resizeObserver.observe(this.parentElement);
        }

        // initial render after connect
        this.completeRender();
        this.zoomToBoundingBox(false);
    }

    /**
     * Get all observed attributes of this webcomponent.
     */
    static get observedAttributes() { return ['nodes', 'edges', 'classes', 'mode', 'zoom']; }

    /**
     * Callback when an attribute changed in html dom.
     *
     * @param name name of the attribute that changed
     * @param oldValue old value
     * @param newValue new value
     */
    attributeChangedCallback(name, oldValue, newValue: string) {
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
        this.completeRender();
        this.zoomToBoundingBox(false);
    }

    /**
     * Set nodes and redraw graph.
     *
     * The node list should **not** be updated outside the graph without calling `setNodes` again!
     * Use `addNode` and `removeNode` to update the list instead.
     *
     * @param nodes new nodeList
     * @param redraw if graph should be redrawn
     */
    public setNodes(nodes: Node[], redraw: boolean = false) {
        this.nodeList = nodes;
        if (redraw) {
            this.completeRender();
            this.zoomToBoundingBox(false);
        }
    }

    /**
     * Add a single node to the graph.
     *
     * @param node node to add
     * @param redraw if graph should be redrawn
     */
    public addNode(node: Node, redraw: boolean = false) {
        this._nodes.push(node);
        this.objectCache.updateNodeCache(this._nodes);
        this.onNodeCreate(node, EventSource.API);
        if (redraw) {
            this.completeRender();
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
     * @param node node or id to remove
     * @param redraw if the graph should be redrawn
     */
    public removeNode(node: Node | number | string, redraw: boolean = false) {
        const id: string | number = (node as Node).id != null ? (node as Node).id : (node as number | string);
        const index = this._nodes.findIndex(n => n.id === id);
        if (index >= 0) {
            this.onNodeRemove(this._nodes[index], EventSource.API);
            this._nodes.splice(index, 1);
            this.objectCache.updateNodeCache(this._nodes);
            const newEdgeList = [];
            this._edges.forEach(edge => {
                if (edge.source === id) {
                    this.onEdgeRemove(edge, EventSource.API);
                    return;
                }
                if (edge.target === id) {
                    this.onEdgeRemove(edge, EventSource.API);
                    return;
                }
                newEdgeList.push(edge);
            });
            this.edgeList = newEdgeList;
            if (redraw) {
                this.completeRender();
                this.zoomToBoundingBox(false);
            }
        }
    }

    /**
     * Set edges and redraw graph.
     *
     * The edge list should **not** be updated outside the graph without calling `setEdges` again!
     * Use `addEdge` and `removeEdge` to update the list instead.
     *
     * @param edges new edgeList
     * @param redraw if the graph should be redrawn
     */
    public setEdges(edges: Edge[], redraw: boolean = false) {
        this.edgeList = edges;
        if (redraw) {
            this.completeRender();
            this.zoomToBoundingBox(false);
        }
    }

    /**
     * Add a single edge to the graph.
     *
     * @param edge edge to add
     * @param redraw if graph should be redrawn
     */
    public addEdge(edge: Edge, redraw: boolean = false) {
        this._edges.push(edge);
        this.objectCache.updateEdgeCache(this._edges);
        if (redraw) {
            this.completeRender();
            this.zoomToBoundingBox(false);
        }
    }

    /**
     * Get the edge with the given id.
     *
     * @param edgeId the id of the edge
     */
    // tslint:disable-next-line:no-shadowed-variable
    public getEdge(edgeId: number|string): Edge {
        return this.objectCache.getEdge(edgeId);
    }

    /**
     * Remove a single edge from the graph.
     *
     * @param edge edge to remove
     * @param redraw if the graph should be redrawn
     */
    public removeEdge(edge: Edge, redraw: boolean = false) {
        const index = this._edges.findIndex((e) => {
            return (e.source === edge.source) &&
                (e.target === edge.target);
        });
        if (index >= 0) {
            this.onEdgeRemove(this._edges[index], EventSource.API);
            this._edges.splice(index, 1);
            this.objectCache.updateEdgeCache(this._edges);
            if (redraw) {
                this.completeRender();
                this.zoomToBoundingBox(false);
            }
        }
    }

    /**
     * Get all edges that have the given nodeId as source
     *
     * @param sourceNodeId the node id of the edge source
     */
    public getEdgesBySource(sourceNodeId: number|string): Set<Edge> {
        return this.objectCache.getEdgesBySource(sourceNodeId);
    }

    /**
     * Get all edges that have the given nodeId as target
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
    public setMode(mode: string) {
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
                    newMode: mode
                }
            });
            this.dispatchEvent(ev);
            this.completeRender();
        }
    }

    /**
     * Set the graph zoom mode.
     *
     * @param mode zoom mode (one of ["none", "manual", "automatic", "both"])
     */
    public setZoomMode(mode: string) {
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
                    newMode: mode
                }
            });
            this.dispatchEvent(ev);
            this.completeRender();
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
        this.completeRender();
        this.zoomToBoundingBox(false);
    }

    /**
     * Initialize the provided svg.
     *
     * Setup group for zooming and groups for nodes and edges.
     * Add a missing `defs` tag.
     */
    private initialize(svg) {
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
        let graph = newSvg.select('defs ~ g');
        if (graph.empty()) {
            graph = newSvg.append('g');
        }
        graph.classed('zoom-group', true);

        const newZoom = zoom().on('zoom', (d) => {
            graph.attr('transform', event.transform);
        });

        if (graph.select('g.edges').empty()) {
            graph.append('g')
                .attr('class', 'edges');
        }

        if (graph.select('g.nodes').empty()) {
            graph.append('g')
                .attr('class', 'nodes');
        }

        // TODO cleanup old svg?
        if (oldSvg != null && !oldSvg.empty()) {
            console.warn('Switching to new SVG, old SVG needs to be disposed manually!');
        }

        this.svg = newSvg;
        this.zoom = newZoom;

        this.updateTemplates();
        this.updateSize();
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

        // reset zoom
        svg.call(this.zoom.transform, zoomIdentity);

        const box: SVGRect = (svg.select('g.zoom-group').select('g.nodes').node() as any).getBBox();
        const scale = 0.9 * Math.min(this.contentMaxWidth / box.width, this.contentMaxHeight / box.height);

        const xCorrection = (-box.x * scale) + ((this.contentMaxWidth - (box.width * scale)) / 2);
        const yCorrection = (-box.y * scale) + ((this.contentMaxHeight - (box.height * scale)) / 2);

        let newZoom = zoomTransform(svg.node() as Element)
            .translate(xCorrection, yCorrection)
            .scale(scale);

        if (isNaN(xCorrection) || isNaN(yCorrection)) {
            newZoom = zoomIdentity;
        }
        svg.call(this.zoom.transform, newZoom);
    }

    /**
     * Update the template cache from the provided svg or the current svg.
     *
     * This method will add missing `default` and `default-marker` templates before updating the template cache.
     */
    public updateTemplates(svg?: Selection<SVGSVGElement, any, any, any>) {
        if (svg != null) {
            this.addDefaultTemplates(svg);
            this.templateCache.updateTemplateCache(svg);
        } else {
            this.addDefaultTemplates(this.svg);
            this.templateCache.updateTemplateCache(this.svg);
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
    public addDefaultTemplates(svg: Selection<SVGSVGElement, any, any, any>) {
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
     */
    public completeRender(forceUpdateTemplates: boolean = false) {
        if (!this.initialized || !this.isConnected) {
            return;
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

        const graph = svg.select('g.zoom-group');

        // update nodes ////////////////////////////////////////////////////////
        if (forceUpdateTemplates) {
            graph.select('.nodes').selectAll('g.node').remove();
        }

        const nodeSelection = graph.select('.nodes')
            .selectAll<SVGGElement, Node>('g.node')
            .data<Node>(this._nodes, (d: Node) => d.id.toString())
            .join(
                enter => enter.append('g')
                    .classed('node', true)
                    .attr('id', (d) => d.id)
            )
            .call(this.updateNodes.bind(this))
            .call(this.updateNodePositions.bind(this))
            .on('mouseover', (d) => { this.onNodeEnter.bind(this)(d); })
            .on('mouseout', (d) => { this.onNodeLeave.bind(this)(d); })
            .on('click', (d) => { this.onNodeClick.bind(this)(d); });

        if (this.isInteractive) {
            nodeSelection.call(drag<SVGGElement, Node>().on('drag', (d) => {
                d.x = event.x;
                d.y = event.y;
                this.onNodePositionChange.bind(this)(d);
                this.updateGraphPositions.bind(this)();
            }) as any);
        } else {
            nodeSelection.on('.drag', null);
        }

        // update edges ////////////////////////////////////////////////////////
        if (forceUpdateTemplates) {
            graph.select('.edges').selectAll('g.edge-group:not(.dragged)').remove();
        }
        const self = this;
        graph.select('.edges')
            .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
            .data<Edge>(this._edges, edgeId)
            .join(
                enter => enter.append('g')
                    .attr('id', (d) => edgeId(d))
                    .classed('edge-group', true)
                    .each(function (d) {
                        const edgeGroup = select(this);
                        edgeGroup.append('path')
                            .classed('edge', true)
                            .attr('fill', 'none');

                        edgeGroup.append<SVGGElement>('g')
                            .classed('link-handle', true)
                            .each(function () {
                                const templateId = self.templateCache.getMarkerTemplateId('default-marker');
                                self.updateContentTemplate(select(this), templateId, 'marker');
                            });
                    })
            )
            .classed('ghost', (d) => {
                const id = edgeId(d);
                return this.draggedEdges.some((edge) => edge.createdFrom === id);
            })
            .call(self.updateEdgeGroups.bind(this))
            .call(self.updateEdgePositions.bind(this))
            .on('click', (d) => { this.onEdgeClick.bind(this)(d); });

        this.classesToRemove.clear();
    }

    /**
     * Updates and reflows all text elements in nodes and edges.
     *
     * @param force force text rewrap even when text has not changed
     *      (useful if node classes can change text attributes like size)
     */
    public updateTextElements(force: boolean = false) {
        const svg = this.svg;
        const graph = svg.select('g.zoom-group');

        const self = this;

        graph.select('.nodes')
            .selectAll<SVGGElement, Node>('g.node')
            .data<Node>(this._nodes, (d: Node) => d.id.toString())
            .call(this.updateNodeText.bind(this), force);

        graph.select('.edges')
            .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
            .data<Edge>(this._edges, edgeId).each(function (d) {
                self.updateEdgeText(select(this), d, force);
            });
    }

    /**
     * Update the content template of a `SVGGElement` to the new template id.
     *
     * If the `SVGGElement` already uses the template the content is not touched.
     *
     * @param element the lement to update the content
     * @param templateId the new template ID
     * @param templateType the template type to use
     */
    private updateContentTemplate(element: Selection<SVGGElement, unknown, any, unknown>, templateId: string, templateType: string) {
        const oldTemplateID = element.attr('data-template');
        if (oldTemplateID != null && oldTemplateID === templateId) {
            return; // already using right template
        }
        element.selectAll().remove(); // clear old content
        let newTemplate: Selection<SVGGElement, unknown, any, unknown>;
        if (templateType === 'node') {
            newTemplate = this.templateCache.getNodeTemplate(templateId);
        } else if (templateType === 'marker') {
            newTemplate = this.templateCache.getMarkerTemplate(templateId);
        } else {
            console.warn('Tried to use unsupported template type: ' + templateType);
        }
        // copy template content into element
        newTemplate.node().childNodes.forEach((node) => {
            element.node().appendChild(node.cloneNode(true));
        });
        // set template id used by the element to new id
        element.attr('data-template', templateId);
    }

    /**
     * Update existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    private updateNodes(nodeSelection: Selection<SVGGElement, Node, any, unknown>) {
        if (nodeSelection == null) {
            const svg = this.svg;

            const graph = svg.select('g.zoom-group');
            nodeSelection = graph.select('.nodes')
                .selectAll<SVGGElement, Node>('g.node')
                .data<Node>(this._nodes, (d: Node) => d.id.toString());
        }

        // alias for this for use in closures
        const self = this;

        // update templates
        nodeSelection.each(function (d) {
            const templateId = self.templateCache.getNodeTemplateId(d.type);
            self.updateContentTemplate(select(this), templateId, 'node');
        });

        // update link handles for node
        nodeSelection.each(function (node) {
            const handles = self.templateCache.getNodeTemplateLinkHandles(node.type);
            if (handles == null) {
                return;
            }
            const handleSelection = select(this).selectAll<SVGGElement, LinkHandle>('g.link-handle')
                .data<LinkHandle>(handles as any, (handle: LinkHandle) => handle.id.toString())
                .join(
                    enter => enter.append('g')
                        .classed('link-handle', true)
                        .attr('transform', (d) => {
                            const x = d.x != null ? d.x : 0;
                            const y = d.y != null ? d.y : 0;
                            return `translate(${x},${y})`;
                        })
                ).each(function (d) {
                    const templateId = self.templateCache.getMarkerTemplateId('default-marker');
                    self.updateContentTemplate(select(this), templateId, 'marker');
                });

            // allow edge drag from link handles
            if (self.isInteractive) {
                handleSelection.call(
                    drag<SVGGElement, LinkHandle, DraggedEdge>()
                        .subject((handle) => {
                            return self.createDraggedEdge(node);
                        })
                        .container(() => self.svg.select('g.zoom-group').select<SVGGElement>('g.edges').node())
                        .on('drag', () => {
                            self.updateDraggedEdge();
                            self.updateDraggedEdgeGroups();
                        })
                        .on('end', self.dropDraggedEdge.bind(self))
                );
            } else {
                handleSelection.on('.drag', null);
            }
        });

        nodeSelection
            .call(this.updateNodeClasses.bind(this))
            .call(this.updateNodeHighligts.bind(this))
            .call(this.updateNodeText.bind(this))
            .call(this.updateNodeDynamicProperties.bind(this))
            .each(function(d) {
                self.objectCache.setNodeBBox(d.id, this.getBBox());
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
                return (this as Element).getAttribute('data-content');
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
     * Update non text elements of existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    private updateNodeDynamicProperties(nodeSelection: Selection<SVGGElement, Node, any, unknown>) {
        const self = this;
        const updatableAttributes = ['fill', 'stroke'];
        nodeSelection.each(function (d) {
            const singleNodeSelection = select(this);
            // update text
            singleNodeSelection.selectAll('[data-content]:not(.text)').datum(function () {
                const attribute = (this as Element).getAttribute('data-content');
                return self.recursiveAttributeGet(d, attribute);
            }).text(text => text);
            // update attributes
            updatableAttributes.forEach(attr => {
                singleNodeSelection.selectAll(`[data-${attr}]`).datum(function () {
                    const attribute = (this as Element).getAttribute(`data-${attr}`);
                    return self.recursiveAttributeGet(d, attribute);
                }).attr(attr, value => value);
            });
            // update href
            singleNodeSelection.selectAll('[data-href]').datum(function () {
                const attribute = (this as Element).getAttribute('data-href');
                return self.recursiveAttributeGet(d, attribute);
            }).attr('xlink:href', value => value);
        });
    }

    /**
     * Recursively retrieve an attribute.
     *
     * This only supports '.' access of attributes.
     *
     * @param obj the object to get the attribute from
     * @param attr the attribute or attribute path to get
     */
    private recursiveAttributeGet(obj: any, attr: string) {
        let result;
        if (attr != null) {
            if (attr.includes('.')) {
                // recursive decend along path
                const path = attr.split('.');
                let temp = obj;
                path.forEach(segment => {
                    if (temp != null && temp.hasOwnProperty(segment)) {
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
        return result;
    }

    /**
     * Update node classes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    private updateNodeClasses(nodeSelection: Selection<SVGGElement, Node, any, unknown>) {
        if (this.classesToRemove != null) {
            this.classesToRemove.forEach((className) => {
                nodeSelection.classed(className, (d) => {
                    return false;
                });
            });
        }
        if (this.classes != null) {
            this.classes.forEach((className) => {
                nodeSelection.classed(className, (d) => {
                    if (this.setNodeClass != null) {
                        return this.setNodeClass(className, d);
                    }
                    return true;
                });
            });
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
            const svg = this.svg;

            const graph = svg.select('g.zoom-group');

            edgeGroupSelection = graph.select('.edges')
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
        const svg = this.svg;

        const graph = svg.select('g.zoom-group');
        graph.select('.edges')
            .selectAll<SVGGElement, DraggedEdge>('g.edge-group.dragged')
            .data<DraggedEdge>(this.draggedEdges, edgeId)
            .join(
                enter => enter.append('g')
                    .attr('id', (d) => edgeId(d))
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
                edgeGroupSelection.classed(className, (d) => {
                    return false;
                });
            });
        }
        if (this.classes != null) {
            this.classes.forEach((className) => {
                edgeGroupSelection.classed(className, (d) => {
                    if (this.setEdgeClass != null) {
                        return this.setEdgeClass(className, d, this.objectCache.getNode(d.source),
                            (d.target != null) ? this.objectCache.getNode(d.target) : null);
                    }
                    return true;
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
            .call(this.updateEdgePath.bind(this));
        edgeGroupSelection.each(function (d) {
            self.updateEdgeTextPositions(select(this), d);
        });
        edgeGroupSelection.each(function (d) {
            select(this).selectAll('g.marker:not(.marker-special)').data(d.markers != null ? d.markers : [])
                .call(self.updateMarkerPositions.bind(self));
        }).each(function (d) {
            self.updateEndMarkerPositions(select(this), d);
        }).each(function () {
            // update link handle position
            const edgeGroup = select(this);
            const path = edgeGroup.select<SVGPathElement>('path.edge');
            const length = path.node().getTotalLength();
            const linkMarkerOffset = 10;
            const linkHandlePos = (path.node() as SVGPathElement).getPointAtLength(length - linkMarkerOffset);
            edgeGroup.select<SVGGElement>('g.link-handle')
                .attr('transform', () => {
                    return `translate(${linkHandlePos.x},${linkHandlePos.y})`;
                })
                .raise();
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
        this.updateEndMarkers(edgeGroupSelection, d);
        const self = this;
        edgeGroupSelection.selectAll<SVGGElement, Marker>('g.marker:not(.marker-special)')
            .data(d.markers != null ? d.markers : [])
            .join(
                enter => enter.append('g')
                    .classed('marker', true)
            )
            .call(this.updateMarker.bind(this));

        this.updateEdgeText(edgeGroupSelection, d);

        if (this.isInteractive) {
            edgeGroupSelection.select<SVGGElement>('g.link-handle')
                .datum<Edge>(d)
                .call(drag<SVGGElement, Edge, DraggedEdge>()
                    .subject((edge) => {
                        return this.createDraggedEdgeFromExistingEdge(edge);
                    })
                    .container(() => this.svg.select('g.zoom-group').select('g.edges').node() as any)
                    .on('start', () => this.completeRender())
                    .on('drag', () => {
                        this.updateDraggedEdge();
                        this.updateDraggedEdgeGroups();
                    })
                    .on('end', this.dropDraggedEdge.bind(this))
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
        const textSelection = edgeGroupSelection.selectAll('text')
            .data(d.texts != null ? d.texts : [])
            .join(
                enter => enter.append('text')
                    .attr('x', 0)
                    .attr('y', 0)
            )
            .attr('class', (t) => t.class)
            .classed('text', true)
            .attr('width', (t) => t.width)
            .attr('height', (t) => t.height)
            .attr('data-click', (t) => t.clickEventKey)
            .each(function (text) {
                let newText = '';
                if (text.value != null) {
                    newText = text.value;
                } else {
                    newText = self.recursiveAttributeGet(d, text.attributePath);
                }
                if (newText == null) {
                    newText = '';
                }
                // make sure it is a string
                newText = newText.toString();
                wrapText(this as SVGTextElement, newText, force);
            });
        if (this.isInteractive) {
            const path = edgeGroupSelection.select('path.edge');
            const length = (path.node() as SVGPathElement).getTotalLength();
            textSelection.call(drag().on('drag', (text: TextComponent) => {
                const referencePoint = (path.node() as SVGPathElement).getPointAtLength(length * text.positionOnLine);
                text.offsetX = event.x - referencePoint.x;
                text.offsetY = event.y - referencePoint.y;
                this.onEdgeTextPositionChange(text, d);
                this.updateEdgeTextPositions(edgeGroupSelection, d);
            }) as any);
        } else {
            textSelection.on('drag', null);
        }
    }

    /**
     * Calculate the attachement vector for a marker.
     *
     * @param startingAngle the line angle for the marker
     * @param marker the marker
     * @param strokeWidth the current stroke width
     */
    private calculateLineAttachementVector(startingAngle: number|RotationVector, marker: Marker, strokeWidth: number) {
        let attachementPointInfo: LineAttachementInfo;
        attachementPointInfo = this.templateCache.getMarkerAttachementPointInfo(marker.template);
        if (marker.lineOffset != null) {
            attachementPointInfo = new LineAttachementInfo(marker.lineOffset);
        }
        if (attachementPointInfo != null) {
            let scale = 1;
            if (marker.scale != null) {
                scale *= marker.scale;
            }
            if (!(!marker.scaleRelative)) {
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
     * Update existing edge path.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    private updateEdgePath(edgeSelection: Selection<SVGPathElement, Edge, any, unknown>) {
        const self = this;
        edgeSelection.each(function (d) {
            const singleEdgeSelection = select(this);
            const strokeWidth: number = parseFloat(singleEdgeSelection.style('stroke-width').replace(/px/, ''));
            singleEdgeSelection.attr('d', () => {
                const handles = self.objectCache.getEdgeLinkHandles(d, self.calculateLinkHandlesForEdge);
                const points: { x: number, y: number, [prop: string]: any }[] = [];

                // Calculate line attachement point for startMarker
                let startAttachementPointVector: RotationVector = {dx: 0, dy: 0};
                if (handles.sourceHandle.normal != null && d.markerStart != null &&
                    (handles.sourceHandle.normal.dx !== 0 || handles.sourceHandle.normal.dy !== 0)) {
                    // tslint:disable-next-line:max-line-length
                    startAttachementPointVector = self.calculateLineAttachementVector(handles.sourceHandle.normal, d.markerStart, strokeWidth);
                }

                points.push({
                    x: handles.sourceCoordinates.x - startAttachementPointVector.dx,
                    y: handles.sourceCoordinates.y - startAttachementPointVector.dy,
                });
                if (handles.sourceHandle.normal != null) {
                    points.push({
                        x: handles.sourceCoordinates.x - startAttachementPointVector.dx + (handles.sourceHandle.normal.dx * 10),
                        y: handles.sourceCoordinates.y - startAttachementPointVector.dy + (handles.sourceHandle.normal.dy * 10),
                    });
                }

                // Calculate line attachement point for endMarker
                let endAttachementPointVector: RotationVector = {dx: 0, dy: 0};
                if (handles.targetHandle.normal != null && d.markerEnd != null &&
                    (handles.targetHandle.normal.dx !== 0 || handles.targetHandle.normal.dy !== 0)) {
                    endAttachementPointVector = self.calculateLineAttachementVector(handles.targetHandle.normal, d.markerEnd, strokeWidth);
                }

                if (handles.targetHandle.normal != null) {
                    points.push({
                        x: handles.targetCoordinates.x - endAttachementPointVector.dx + (handles.targetHandle.normal.dx * 10),
                        y: handles.targetCoordinates.y - endAttachementPointVector.dy + (handles.targetHandle.normal.dy * 10),
                    });
                    points.push({
                        x: handles.targetCoordinates.x - endAttachementPointVector.dx,
                        y: handles.targetCoordinates.y - endAttachementPointVector.dy,
                    });
                } else {
                    points.push(handles.targetCoordinates);
                }
                return self.edgeGenerator(points);

            });
        });
    }

    /**
     * Update existing edge marker.
     *
     * @param markerSelection d3 selection
     */
    private updateMarker(markerSelection: Selection<SVGGElement, Marker, any, unknown>) {
        const self = this;
        markerSelection
            .attr('data-click', (d) => d.clickEventKey)
            .each(function (marker) {
                const templateId = self.templateCache.getMarkerTemplateId(marker.template);
                self.updateContentTemplate(select(this), templateId, 'marker');
            });
    }


    /**
     * Update edge-end and edge-start marker.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    private updateEndMarkers(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {
        this.updateEndMarker(edgeGroupSelection, d.markerStart, 'marker-start');
        this.updateEndMarker(edgeGroupSelection, d.markerEnd, 'marker-end');
    }

    /**
     * Update a specific edge end marker (either start or end marker).
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param marker the special end marker
     * @param markerClass the css class to select for
     */
    private updateEndMarker(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, marker: Marker, markerClass: string) {
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
        this.updateMarker(markerEndSelection);
    }

    /**
     * Calculate the transformation attribute for a edge marker.
     *
     * @param point the marker position
     * @param marker the marker to place
     * @param strokeWidth the stroke width of the edge
     * @param normal the normal vector of the edge at the marker position
     */
    private calculateMarkerTransformation(point: { x: number; y: number; }, marker: Marker, strokeWidth: number, normal: RotationVector) {
        let transform = `translate(${point.x},${point.y})`;
        if (marker.scale != null) {
            if (!(!marker.scaleRelative)) {
                transform += `scale(${marker.scale * strokeWidth})`;
            } else {
                transform += `scale(${marker.scale})`;
            }
        }
        if (marker.rotate != null) {
            let angle = 0;
            if (marker.rotate.normal == null) {
                angle += calculateAngle(normal);
            } else {
                angle += calculateAngle(marker.rotate.normal);
            }
            angle += marker.rotate.relativeAngle != null ? marker.rotate.relativeAngle : 0;
            transform += `rotate(${angle})`;
        }
        return transform;
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
            this.updateEndMarkerPosition(path, length, 0, 0 + 1e-3, d.markerStart, 'marker-start', strokeWidth, edgeGroupSelection);
        }

        if (d.markerEnd != null) {
            this.updateEndMarkerPosition(path, length, length, length - 1e-3, d.markerEnd, 'marker-end', strokeWidth, edgeGroupSelection);
        }
    }

    /**
     * Update a single end marker position (either start or end marker).
     *
     * @param path the path selection
     * @param length the path length
     * @param posA positionOnLine at the marker
     * @param posB positionOnLine just before the marker
     * @param marker the marker
     * @param markerClass the class of the marker
     * @param strokeWidth the edge stroke width
     * @param edgeGroupSelection d3 selection of a single edge group
     */
    private updateEndMarkerPosition(
            path: Selection<SVGPathElement, Edge, any, unknown>,
            length: number, posA: number, posB: number,
            marker: Marker, markerClass: string,
            strokeWidth: number,
            edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>
        ) {
        // calculate angle for marker
        const pathPointA = path.node().getPointAtLength(posA);
        const pathPointB = path.node().getPointAtLength(posB);
        const edgeNormal = normalizeVector({
            dx: length > 1e-3 ? pathPointA.x - pathPointB.x : 1,
            dy: length > 1e-3 ? pathPointA.y - pathPointB.y : 0,
        });
        // calculate marker offset
        const attachementPointVector: RotationVector = this.calculateLineAttachementVector(edgeNormal, marker, strokeWidth);
        const point = {
            x: pathPointA.x - attachementPointVector.dx,
            y: pathPointA.y - attachementPointVector.dy,
        };
        // calculate marker transformation
        const transformEnd = this.calculateMarkerTransformation(point, marker, strokeWidth, edgeNormal);
        // apply transformation
        const markerEndSelection: Selection<SVGGElement, Marker, any, unknown> = edgeGroupSelection
            .select<SVGGElement>(`g.marker.${markerClass}`)
            .datum(marker);
        markerEndSelection.attr('transform', transformEnd);
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
            let positionOnLine = d.positionOnLine;
            if (positionOnLine == null && positionOnLine !== 0) {
                positionOnLine = 1; // default
            }
            if (positionOnLine === 'end') {
                positionOnLine = 1;
            }
            if (positionOnLine === 'start') {
                positionOnLine = 0;
            }
            if (typeof positionOnLine === 'string') {
                positionOnLine = parseFloat(positionOnLine);
            }
            if (isNaN(positionOnLine)) {
                positionOnLine = 0;
            }

            const point = path.node().getPointAtLength(length * positionOnLine);
            const epsilon = positionOnLine > 0.5 ? -1e-5 : 1e-5;
            const point2 = path.node().getPointAtLength(length * (positionOnLine + epsilon));
            const normal = {
                dx: positionOnLine > 0.5 ? (point.x - point2.x) : (point2.x - point.x),
                dy: positionOnLine > 0.5 ? (point.y - point2.y) : (point2.y - point.y),
            };

            const transform = self.calculateMarkerTransformation(point, d, strokeWidth, normal);

            marker.attr('transform', transform);
        });
    }

    /**
     * Update all edge text positions in a edge group.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    private updateEdgeTextPositions(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {
        const path = edgeGroupSelection.select<SVGPathElement>('path.edge');
        const length = path.node().getTotalLength();
        const textSelection = edgeGroupSelection.selectAll<SVGTextElement, TextComponent>('text')
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
        textSelection.each(function (t) {
            const text = select(this);
            let positionOnLine = t.positionOnLine as number|string;
            if (positionOnLine === 'end') {
                positionOnLine = 1;
            }
            if (positionOnLine === 'start') {
                positionOnLine = 0;
            }
            if (typeof positionOnLine === 'string') {
                positionOnLine = parseFloat(positionOnLine);
            }
            if (isNaN(positionOnLine as number)) {
                positionOnLine = 0;
            }
            const pathPoint = (path.node() as SVGPathElement).getPointAtLength(length * (positionOnLine as number));

            // factor in offset coordinates of text component
            const referencePoint = {
                x: pathPoint.x + (t.offsetX != null ? t.offsetX : 0),
                y: pathPoint.y + (t.offsetY != null ? t.offsetY : 0),
            };

            // calculate center of nearest node (line distance, not euklidean distance)
            const nodeBB = (positionOnLine > 0.5) ? targetBB : sourceBB;
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

            // account for different text anchors
            let textAnchorCorrection = 1;
            const textAnchor = text.style('text-anchor');
            if (textAnchor === 'end') {
                // text is right aligned and 100% to the left of the x position
                textAnchorCorrection = 0;
            }
            if (textAnchor === 'middle') {
                // text is center aligned and 50% to the left of the x position
                textAnchorCorrection = 0.5;
            }
            const bbox = text.node().getBBox();

            const targetPoint: Point = {
                x: referencePoint.x,
                y: referencePoint.y,
            };

            const lineheight = text.attr('data-lineheight');
            // Account for text origin beeing at the bottom of the line
            let lineHeightCorrection = bbox.height; // single line texts only have bbox height
            if (lineheight) {
                // use calculated line height from text wrapping for multi line texts
                lineHeightCorrection = parseFloat(lineheight);
            }
            let deltaX = 0;
            let deltaY = 0;
            if (angle > 0 && angle < 180) {
                // bottom of the text (possibly) overlaps
                let delta = (nodeBB.y) - (referencePoint.y + bbox.height - lineHeightCorrection);
                if (t.padding) {
                    delta -= t.padding;
                }
                if (delta < 0) {
                    deltaY = delta;
                }
            }

            if (angle > 180 && angle < 360) {
                // top of the text (possibly) overlaps
                let delta = (nodeBB.y + nodeBB.height) - (referencePoint.y - lineHeightCorrection);
                if (t.padding) {
                    delta += t.padding;
                }
                if (delta > 0) {
                     deltaY = delta;
                }
            }
            if (angle > 90 && angle < 270) {
                // left side of text (possibly) overlaps
                let delta = (nodeBB.x + nodeBB.width) - (referencePoint.x - (bbox.width * (1 - textAnchorCorrection)));
                if (t.padding) {
                    delta += t.padding;
                }
                if (delta > 0) { // only update target if text actually overlaps
                    deltaX = delta;
                }
            }
            if (angle > 270 || angle < 90) {
                // right side of text (possibly) overlaps
                let delta = (nodeBB.x) - (referencePoint.x + (bbox.width * textAnchorCorrection));
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

            text.attr('x', targetPoint.x).attr('y', targetPoint.y);
            // update span positions for multiline texts
            text.selectAll('tspan').datum(function () {
                return parseFloat((this as Element).getAttribute('data-deltay'));
            }).attr('x', targetPoint.x).attr('y', (y) => targetPoint.y + y);
        });

    }

    /**
     * Update all node positions and edge paths.
     */
    private updateGraphPositions() {
        const svg = this.svg;

        const graph = svg.select('g.zoom-group');
        graph.select('.nodes')
            .selectAll<any, Node>('g.node')
            .data<Node>(this._nodes, (d: Node) => d.id.toString())
            .call(this.updateNodePositions.bind(this));

        graph.select('.edges')
            .selectAll('g.edge-group:not(.dragged)')
            .data(this._edges, edgeId)
            .call(this.updateEdgePositions.bind(this));

        graph.select('.edges')
            .selectAll('g.edge-group.dragged')
            .data(this.draggedEdges, edgeId)
            .call(this.updateEdgePositions.bind(this));
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
     */
    private createDraggedEdgeFromExistingEdge(edge: Edge): DraggedEdge {
        const validTargets = new Set<string>();
        this._nodes.forEach(node => validTargets.add(node.id.toString()));
        this.objectCache.getEdgesBySource(edge.source).forEach(edgeOutgoing => {
            if (edgeId(edge) !== edgeId(edgeOutgoing)) {
                validTargets.delete(edgeOutgoing.target.toString());
            }
        });
        let draggedEdge: DraggedEdge = {
            id: edge.source.toString() + Date.now().toString(),
            createdFrom: edgeId(edge),
            source: edge.source,
            target: null,
            validTargets: validTargets,
            currentTarget: { x: event.x, y: event.y },
            markers: [],
        };
        if (edge.markers != null) {
            draggedEdge.markers = JSON.parse(JSON.stringify(edge.markers));
        }
        if (edge.markerEnd != null) {
            draggedEdge.markerEnd = JSON.parse(JSON.stringify(edge.markerEnd));
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
    private updateDraggedEdge() {
        const oldTarget = event.subject.target;
        event.subject.target = null;
        event.subject.currentTarget.x = event.x;
        event.subject.currentTarget.y = event.y;
        const possibleTarget = document.elementFromPoint(event.sourceEvent.clientX, event.sourceEvent.clientY);
        if (possibleTarget != null) {
            let target = select(possibleTarget);
            while (!target.empty()) {
                if (target.classed('node')) {
                    const id = target.attr('id');
                    if (event.subject.source.toString() === id) {
                        break;
                    }
                    event.subject.target = id;
                    break;
                }
                target = select(target.node().parentElement);
            }
        }
        if (event.subject.target != null) {
            if (!event.subject.validTargets.has(event.subject.target)) {
                event.subject.target = null;
            }
        }
        if (event.subject.target !== oldTarget) {
            if (this.onDraggedEdgeTargetChange != null) {
                const source = this.objectCache.getNode(event.subject.source);
                const target = event.subject.target != null ? this.objectCache.getNode(event.subject.target) : null;
                this.onDraggedEdgeTargetChange(event.subject, source, target);
            }
        }
    }

    /**
     * Drop dragged edge.
     */
    private dropDraggedEdge() {
        let updateEdgeCache = false;
        if (event.subject.createdFrom != null) {
            const edge = this.objectCache.getEdge(event.subject.createdFrom);
            if (event.subject.target !== edge.target.toString()) {
                // only remove original edge if target of dropped edge is different then original target
                const i = this._edges.findIndex(e => edgeId(e) === event.subject.createdFrom);
                if (this.onEdgeRemove(this._edges[i], EventSource.USER_INTERACTION)) {
                    this._edges.splice(i, 1);
                    updateEdgeCache = true;
                }
            }
        }

        const index = this.draggedEdges.findIndex(edge => edge.id === event.subject.id);
        this.draggedEdges.splice(index, 1);
        this.updateDraggedEdgeGroups();
        if (event.subject.target != null) {
            // dragged edge has a target
            let edge = event.subject;
            delete edge.id;
            if (this.onDropDraggedEdge != null) {
                edge = this.onDropDraggedEdge(edge, this.objectCache.getNode(edge.source),
                                              this.objectCache.getNode(edge.target));
            }
            if (event.subject.createdFrom != null &&
                event.subject.target === this.objectCache.getEdge(event.subject.createdFrom).target.toString()) {
                // edge was dropped on the node that was the original target for the edge
                this.completeRender();
            } else {
                if (this.onEdgeCreate(edge, EventSource.USER_INTERACTION)) {
                    this._edges.push(edge);
                    updateEdgeCache = true;
                }
            }
        } else {
            this.onEdgeDrop(event.subject, {x: event.x, y: event.y});
        }
        if (updateEdgeCache) {
            this.objectCache.updateEdgeCache(this._edges);
            this.completeRender();
        }
    }

    /**
     * Callback for creating edgeadd events.
     *
     * @param edge the created edge
     * @returns false if event was cancelled
     */
    private onEdgeCreate(edge: Edge, eventSource: EventSource): boolean {
        const ev = new CustomEvent('edgeadd', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: {
                eventSource: eventSource,
                edge: edge
            }
        });
        return this.dispatchEvent(ev);
    }


    /**
     * Callback for creating edgedrop events.
     *
     * The event is only for dragged edges that are dropped in the void.
     *
     * @param edge the dropped dragged edge
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
     * @returns false if event was cancelled
     */
    private onEdgeRemove(edge: Edge, eventSource: EventSource) {
        const ev = new CustomEvent('edgeremove', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: {
                eventSource: eventSource,
                edge: edge
            }
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
            }
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
                node: node
            }
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
                node: node
            }
        });
        return this.dispatchEvent(ev);
    }

    /**
     * Callback for creating nodepositionchange events.
     *
     * @param nodes nodes thatchanged
     */
    private onNodePositionChange(node: Node) {
        const ev = new CustomEvent('nodepositionchange', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                node: node
            }
        });
        this.dispatchEvent(ev);
    }

    /**
     * Callback on nodes for mouseEnter event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeEnter(nodeDatum) {
        this.hovered.add(nodeDatum.id);
        if (this._mode === 'link' && this.interactionStateData.source != null) {
            this.interactionStateData.target = nodeDatum.id;
        }
        this.updateNodeHighligts();
        this.updateEdgeHighligts();
        const ev = new CustomEvent('nodeenter', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                sourceEvent: event,
                node: nodeDatum
            }
        });
        this.dispatchEvent(ev);
    }

    /**
     * Callback on nodes for mouseLeave event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeLeave(nodeDatum) {
        this.hovered.delete(nodeDatum.id);
        if (this._mode === 'link' && this.interactionStateData.target === nodeDatum.id) {
            this.interactionStateData.target = null;
        }
        this.updateNodeHighligts();
        this.updateEdgeHighligts();
        const ev = new CustomEvent('nodeleave', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                sourceEvent: event,
                node: nodeDatum
            }
        });
        this.dispatchEvent(ev);
    }

    /**
     * Callback on nodes for click event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeClick = (nodeDatum) => {
        const eventDetail: any = {};
        eventDetail.eventSource = EventSource.USER_INTERACTION,
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
            this.interactionStateData.selected.add(nodeDatum.id);
            this.onSelectionChangeInternal();
        } else if (this.interactionStateData.selected.has(nodeDatum.id)) {
            this.interactionStateData.selected.delete(nodeDatum.id);
            this.onSelectionChangeInternal();
            if (this.interactionStateData.selected.size <= 0) {
                this.setMode(this.interactionStateData.fromMode);
            }
        } else {
            this.interactionStateData.selected.add(nodeDatum.id);
            this.onSelectionChangeInternal();
        }
        this.updateNodeHighligts();
        this.updateEdgeHighligts();
    }

    /**
     * Internal selection changed callback.
     *
     * Create new 'selection' event.
     */
    private onSelectionChangeInternal() {
        let selected: Set<number | string> = new Set();
        if (this.mode === 'select') {
            selected = this.interactionStateData.selected;
        }
        const ev = new CustomEvent('selection', {
            bubbles: true,
            composed: true,
            detail: {
                eventSource: EventSource.USER_INTERACTION,
                selection: selected
            }
        });
        this.dispatchEvent(ev);
    }

    /**
     * Selection logik in 'link' mode.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeSelectLink(nodeDatum) {
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
        this.completeRender();
        this.interactionStateData.source = null;
        this.interactionStateData.target = null;
    }

    /**
     * Calculate highlighted nodes and update their classes.
     */
    private updateNodeHighligts(nodeSelection?) {
        if (nodeSelection == null) {
            const svg = this.svg;

            const graph = svg.select('g.zoom-group');
            nodeSelection = graph.select('.nodes')
                .selectAll<any, Node>('g.node')
                .data<Node>(this._nodes, (d: Node) => d.id.toString());
        }

        nodeSelection
            .classed('hovered', (d) => this.hovered.has(d.id))
            .classed('selected', (d) => {
                if (this._mode === 'select') {
                    const selected = this.interactionStateData.selected;
                    if (selected != null) {
                        return selected.has(d.id);
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
    private updateEdgeHighligts(edgeSelection?) {
        if (edgeSelection == null) {
            const svg = this.svg;

            const graph = svg.select('g.zoom-group');
            edgeSelection = graph.select('.edges')
                .selectAll('g.edge-group:not(.dragged)')
                .data(this._edges, edgeId);
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
}

