"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const d3_1 = require("d3");
const edge_1 = require("./edge");
const link_handle_1 = require("./link-handle");
const object_cache_1 = require("./object-cache");
const textwrap_1 = require("./textwrap");
const rotation_vector_1 = require("./rotation-vector");
const SHADOW_DOM_TEMPLATE = `
<style>
</style>
`;
class GraphEditor extends HTMLElement {
    constructor() {
        super();
        this.contentMinHeight = 0;
        this.contentMaxHeight = 1;
        this.contentMinWidth = 0;
        this.contentMaxWidth = 1;
        this.hovered = new Set();
        this._mode = 'display'; // interaction mode ['display', 'layout', 'link', 'select']
        this._zoomMode = 'both'; // ['none', 'manual', 'automatic', 'both']
        this.interactionStateData = null;
        /**
         * Zooms and pans the graph to get all content inside the visible area.
         *
         * @param force if false only zooms in zoomMode 'automatic' and 'both' (default=true)
         */
        this.zoomToBoundingBox = (force = true) => {
            if (!this.initialized || !this.isConnected) {
                return;
            }
            if (!(force || this._zoomMode === 'automatic' || this._zoomMode === 'both')) {
                return;
            }
            const svg = this.getSvg();
            // reset zoom
            svg.call(this.zoom.transform, d3_1.zoomIdentity);
            const box = svg.select('g.zoom-group').select('g.nodes').node().getBBox();
            const scale = 0.9 * Math.min(this.contentMaxWidth / box.width, this.contentMaxHeight / box.height);
            const xCorrection = (-box.x * scale) + ((this.contentMaxWidth - (box.width * scale)) / 2);
            const yCorrection = (-box.y * scale) + ((this.contentMaxHeight - (box.height * scale)) / 2);
            let newZoom = d3_1.zoomTransform(svg.node())
                .translate(xCorrection, yCorrection)
                .scale(scale);
            if (isNaN(xCorrection) || isNaN(yCorrection)) {
                newZoom = d3_1.zoomIdentity;
            }
            svg.call(this.zoom.transform, newZoom);
        };
        /**
         * Get templates in this dom-node and render them into defs node of svg or style tags.
         *
         * @param nodeTemplateList list of node templates to use instead of html templates
         * @param styleTemplateList list of style templates to use instead of html templates (not wrapped in style tag!)
         */
        this.updateTemplates = (nodeTemplateList, styleTemplateList, markerTemplateList) => {
            const templates = d3_1.select(this).selectAll('template');
            const stylehtml = styleTemplateList != null ? styleTemplateList : [];
            const nodehtml = nodeTemplateList != null ? nodeTemplateList : [];
            const markerhtml = markerTemplateList != null ? markerTemplateList : [];
            if (styleTemplateList == null) {
                const styleTemplates = templates.filter(function () {
                    return this.getAttribute('template-type') === 'style';
                });
                styleTemplates.each(function () {
                    // extract style attribute from template
                    d3_1.select(this.content).selectAll('style').each(function () {
                        stylehtml.push(this);
                    });
                });
            }
            const styles = d3_1.select(this.root).selectAll('style').data(stylehtml);
            styles.exit().remove();
            styles.enter().merge(styles).html((d) => d.innerHTML);
            if (nodeTemplateList == null) {
                const nodeTemplates = templates.filter(function () {
                    return this.getAttribute('template-type') === 'node';
                });
                nodeTemplates.each(function () {
                    nodehtml.push(this);
                });
            }
            this.objectCache.updateNodeTemplateCache(nodehtml);
            if (markerTemplateList == null) {
                const markerTemplates = templates.filter(function () {
                    return this.getAttribute('template-type') === 'marker';
                });
                markerTemplates.each(function () {
                    markerhtml.push(this);
                });
            }
            this.objectCache.updateMarkerTemplateCache(markerhtml);
        };
        this.createMarker = (markerSelection) => {
            markerSelection
                .attr('data-template', (d) => d.template)
                .html((d) => {
                return this.objectCache.getMarkerTemplate(d.template);
            });
        };
        /**
         * Callback on nodes for click event.
         *
         * @param nodeDatum Corresponding datum of node
         */
        this.onNodeClick = (nodeDatum) => {
            const eventDetail = {};
            eventDetail.sourceEvent = d3_1.event;
            eventDetail.node = nodeDatum;
            if (d3_1.event.target != null) {
                const target = d3_1.select(d3_1.event.target);
                const key = target.attr('data-click');
                if (key != null) {
                    eventDetail.key = key;
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
            }
            else if (this.interactionStateData.selected.has(nodeDatum.id)) {
                this.interactionStateData.selected.delete(nodeDatum.id);
                this.onSelectionChangeInternal();
                if (this.interactionStateData.selected.size <= 0) {
                    this.setMode(this.interactionStateData.fromMode);
                }
            }
            else {
                this.interactionStateData.selected.add(nodeDatum.id);
                this.onSelectionChangeInternal();
            }
            this.updateNodeHighligts();
            this.updateEdgeHighligts();
        };
        this._nodes = [];
        this._edges = [];
        this.draggedEdges = [];
        this.objectCache = new object_cache_1.GraphObjectCache();
        this.initialized = false;
        this.edgeGenerator = d3_1.line().x((d) => d.x)
            .y((d) => d.y).curve(d3_1.curveBasis);
        this.root = this.attachShadow({ mode: 'open' });
        d3_1.select(this.root).html(SHADOW_DOM_TEMPLATE);
        this.mutationObserver = new MutationObserver((mutations) => {
            this.updateTemplates();
            this.completeRender(true);
            this.zoomToBoundingBox(false);
        });
    }
    get isInteractive() {
        return (this._mode !== 'display') && !(this._mode === 'select' && this.interactionStateData.fromMode === 'display');
    }
    get nodeList() {
        return this._nodes;
    }
    set nodeList(nodes) {
        this._nodes = nodes;
        this.objectCache.updateNodeCache(nodes);
    }
    get edgeList() {
        return this._edges;
    }
    set edgeList(edges) {
        this._edges = edges;
        this.objectCache.updateEdgeCache(edges);
    }
    get mode() {
        return this._mode;
    }
    set mode(mode) {
        this.setMode(mode.toLowerCase());
        d3_1.select(this).attr('mode', mode);
    }
    get zoomMode() {
        return this._zoomMode;
    }
    set zoomMode(mode) {
        this.setZoomMode(mode.toLowerCase());
        d3_1.select(this).attr('zoom', mode);
    }
    connectedCallback() {
        if (!this.isConnected) {
            return;
        }
        // this.initialize();
        this.completeRender();
        this.zoomToBoundingBox(false);
        this.mutationObserver.observe(this, {
            childList: true,
            characterData: false,
            subtree: false,
        });
    }
    static get observedAttributes() { return ['nodes', 'edges', 'mode', 'zoom']; }
    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'nodes') {
            newValue = newValue.replace(/'/g, '"');
            console.log('Nodes ' + newValue);
            this.nodeList = JSON.parse(newValue);
        }
        if (name === 'edges') {
            newValue = newValue.replace(/'/g, '"');
            console.log('Edges ' + newValue);
            this.edgeList = JSON.parse(newValue);
        }
        if (name === 'zoom') {
            this.setZoomMode(newValue.toLowerCase());
            this.completeRender();
        }
        if (name === 'mode') {
            this.setMode(newValue.toLowerCase());
        }
        this.initialize();
        this.completeRender();
        this.zoomToBoundingBox(false);
    }
    /**
     * Set nodes and redraw graph.
     *
     * @param nodes new nodeList
     * @param redraw if graph should be redrawn
     */
    setNodes(nodes, redraw = false) {
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
    addNode(node, redraw = false) {
        this._nodes.push(node);
        this.objectCache.updateNodeCache(this._nodes);
        this.onNodeCreate(node);
        if (redraw) {
            this.completeRender();
            this.zoomToBoundingBox(false);
        }
    }
    /**
     * Remove a single node from the graph.
     *
     * @param node node or id to remove
     * @param redraw if the graph should be redrawn
     */
    removeNode(node, redraw = false) {
        const id = node.id != null ? node.id : node;
        const index = this._nodes.findIndex(n => n.id === id);
        if (index >= 0) {
            this.onNodeRemove(this._nodes[index]);
            this._nodes.splice(index, 1);
            this.objectCache.updateNodeCache(this._nodes);
            const newEdgeList = [];
            this._edges.forEach(edge => {
                if (edge.source === id) {
                    this.onEdgeRemove(edge);
                    return;
                }
                if (edge.target === id) {
                    this.onEdgeRemove(edge);
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
     * @param nodes new edgeList
     * @param redraw if the graph should be redrawn
     */
    setEdges(nodes, redraw = false) {
        this.edgeList = nodes;
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
    addEdge(edge, redraw = false) {
        this._edges.push(edge);
        this.objectCache.updateEdgeCache(this._edges);
        if (redraw) {
            this.completeRender();
            this.zoomToBoundingBox(false);
        }
    }
    /**
     * Remove a single edge from the graph.
     *
     * @param edge edge or id to remove
     * @param redraw if the graph should be redrawn
     */
    removeEdge(edge, redraw = false) {
        const index = this._edges.findIndex((e) => {
            return (e.source === edge.source) &&
                (e.target === edge.target);
        });
        if (index >= 0) {
            this.onEdgeRemove(this._edges[index]);
            this._edges.splice(index, 1);
            this.objectCache.updateEdgeCache(this._edges);
            if (redraw) {
                this.completeRender();
                this.zoomToBoundingBox(false);
            }
        }
    }
    /**
     * Set the graph interaction mode and cleanup temp data from old interaction mode.
     *
     * @param mode interaction mode (one of ["display", "layout", "link", "select"])
     */
    setMode(mode) {
        if (mode === this._mode) {
            return;
        }
        const oldMode = this._mode;
        if (mode === 'display') {
            if (this._mode !== 'display') {
                this.interactionStateData = null;
                this._mode = 'display';
            }
        }
        else if (mode === 'layout') {
            if (this._mode !== 'layout') {
                this.interactionStateData = null;
                this._mode = 'layout';
            }
        }
        else if (mode === 'link') {
            if (this._mode !== 'link') {
                this.interactionStateData = {
                    source: null,
                    target: null,
                    allowedTargets: new Set(),
                };
                this._mode = 'link';
            }
        }
        else if (mode === 'select') {
            if (this._mode !== 'select') {
                this.interactionStateData = {
                    selected: new Set(),
                    fromMode: this._mode,
                };
                this._mode = 'select';
            }
        }
        else {
            console.log(`Wrong mode "${mode}". Allowed are: ["display", "layout", "link", "select"]`);
            return;
        }
        if (oldMode !== mode) {
            const ev = new CustomEvent('modechange', {
                bubbles: true,
                composed: true,
                cancelable: false,
                detail: { oldMode: oldMode, newMode: mode }
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
    setZoomMode(mode) {
        if (mode === this._mode) {
            return;
        }
        const oldMode = this._mode;
        if (mode === 'none') {
            if (this._zoomMode !== 'none') {
                this._zoomMode = 'none';
            }
        }
        else if (mode === 'manual') {
            if (this._zoomMode !== 'manual') {
                this._zoomMode = 'manual';
            }
        }
        else if (mode === 'automatic') {
            if (this._mode !== 'automatic') {
                this._zoomMode = 'automatic';
            }
        }
        else if (mode === 'both') {
            if (this._mode !== 'both') {
                this._zoomMode = 'both';
            }
        }
        else {
            console.log(`Wrong zoom mode "${mode}". Allowed are: ["none", "manual", "automatic", "both"]`);
            return;
        }
        if (oldMode !== mode) {
            const ev = new CustomEvent('zoommodechange', {
                bubbles: true,
                composed: true,
                cancelable: false,
                detail: { oldMode: oldMode, newMode: mode }
            });
            this.dispatchEvent(ev);
            this.completeRender();
        }
    }
    /**
     * Initialize the shadow dom with a drawing svg.
     */
    initialize() {
        if (!this.initialized) {
            this.initialized = true;
            const svg = d3_1.select(this.root).append('svg')
                .attr('class', 'graph-editor')
                .attr('width', '100%')
                .attr('height', '100%');
            svg.append('defs');
            this.xScale = d3_1.scaleLinear()
                .domain([10, 0])
                .range([0, 10]);
            this.yScale = d3_1.scaleLinear()
                .domain([10, 0])
                .range([0, 10]);
            // setup graph groups //////////////////////////////////////////////
            const graph = svg.append('g')
                .attr('class', 'zoom-group');
            this.zoom = d3_1.zoom().on('zoom', (d) => {
                graph.attr('transform', d3_1.event.transform);
            });
            graph.append('g')
                .attr('class', 'edges');
            graph.append('g')
                .attr('class', 'nodes');
            this.updateSize();
        }
    }
    getSvg() {
        return d3_1.select(this.root).select('svg.graph-editor');
    }
    /**
     * Calculate and store the size of the svg.
     */
    updateSize() {
        const svg = this.getSvg();
        this.contentMaxHeight = parseInt(svg.style('height').replace('px', ''), 10);
        this.contentMaxWidth = parseInt(svg.style('width').replace('px', ''), 10);
        this.yScale.range([0, Math.max(this.contentMaxHeight, this.contentMinHeight)]);
        this.xScale.range([0, Math.max(this.contentMaxWidth, this.contentMinWidth)]);
    }
    /**
     * Render all changes of the data to the graph.
     */
    completeRender(updateTemplates = false) {
        if (!this.initialized || !this.isConnected) {
            return;
        }
        const svg = this.getSvg();
        if (this._zoomMode === 'manual' || this._zoomMode === 'both') {
            svg.call(this.zoom);
        }
        else {
            svg.on('.zoom', null);
        }
        this.updateSize();
        const graph = svg.select('g.zoom-group');
        // update nodes ////////////////////////////////////////////////////////
        if (updateTemplates) {
            graph.select('.nodes').selectAll('g.node').remove();
        }
        let nodeSelection = graph.select('.nodes')
            .selectAll('g.node')
            .data(this._nodes, (d) => d.id.toString());
        nodeSelection.exit().remove();
        nodeSelection = nodeSelection.enter().append('g')
            .classed('node', true)
            .attr('id', (d) => d.id)
            .call(this.createNodes.bind(this))
            .merge(nodeSelection)
            .call(this.updateNodes.bind(this))
            .call(this.updateNodePositions.bind(this))
            .on('mouseover', (d) => { this.onNodeEnter.bind(this)(d); })
            .on('mouseout', (d) => { this.onNodeLeave.bind(this)(d); })
            .on('click', (d) => { this.onNodeClick.bind(this)(d); });
        if (this.isInteractive) {
            nodeSelection.call(d3_1.drag().on('drag', (d) => {
                d.x = d3_1.event.x;
                d.y = d3_1.event.y;
                this.onNodePositionChange.bind(this)(d);
                this.updateGraphPositions.bind(this)();
            }));
        }
        else {
            nodeSelection.on('.drag', null);
        }
        // update edges ////////////////////////////////////////////////////////
        if (updateTemplates) {
            graph.select('.edges').selectAll('g.edge:not(.dragged)').remove();
        }
        const self = this;
        const edgeGroupSelection = graph.select('.edges')
            .selectAll('g.edge-group:not(.dragged)')
            .data(this._edges, edge_1.edgeId);
        edgeGroupSelection.exit().remove();
        edgeGroupSelection.enter().append('g')
            .attr('id', (d) => edge_1.edgeId(d))
            .classed('edge-group', true)
            .each(function () {
            const edgeGroup = d3_1.select(this);
            edgeGroup.append('path')
                .classed('edge', true)
                .attr('fill', 'none');
            edgeGroup.append('circle')
                .classed('link-handle', true)
                .attr('fill', 'black')
                .attr('r', 3);
        })
            .merge(edgeGroupSelection)
            .classed('ghost', (d) => {
            const id = edge_1.edgeId(d);
            return this.draggedEdges.some((edge) => edge.createdFrom === id);
        })
            .call(self.updateEdgeGroups.bind(this))
            .call(self.updateEdgePositions.bind(this))
            .on('click', (d) => { this.onEdgeClick.bind(this)(d); });
    }
    /**
     * Add nodes to graph.
     *
     * @param nodeSelection d3 selection of nodes to add with bound data
     */
    createNodes(nodeSelection) {
        nodeSelection
            .attr('data-template', (d) => this.objectCache.getNodeTemplateId(d.type))
            .html((d) => {
            return this.objectCache.getNodeTemplate(d.type);
        })
            .call(this.updateLinkHandles.bind(this));
    }
    updateLinkHandles(nodeSelection) {
        const self = this;
        nodeSelection.each(function (d) {
            if (self.objectCache.getNodeTemplateLinkHandles(d.type) != null) {
                return;
            }
            let backgroundSelection = d3_1.select(this).select('.outline');
            if (backgroundSelection.empty()) {
                backgroundSelection = d3_1.select(this).select(':first-child');
            }
            if (backgroundSelection.empty()) {
                self.objectCache.setNodeTemplateLinkHandles(d.type, [{
                        id: 1,
                        x: 0,
                        y: 0,
                    }]);
                return;
            }
            let linkHandles = backgroundSelection.attr('data-link-handles');
            if (linkHandles == null) {
                linkHandles = 'all';
            }
            else {
                if (linkHandles.startsWith('[')) {
                    try {
                        linkHandles = JSON.parse(linkHandles);
                        linkHandles.forEach((element, index) => element.id = index);
                        linkHandles.forEach(link_handle_1.calculateNormal);
                        self.objectCache.setNodeTemplateLinkHandles(d.type, linkHandles);
                        return;
                    }
                    catch (error) {
                        linkHandles = 'all';
                    }
                }
                linkHandles = linkHandles.toLowerCase();
            }
            if (backgroundSelection.node().tagName === 'circle') {
                const radius = parseFloat(backgroundSelection.attr('r'));
                const handles = link_handle_1.handlesForCircle(radius, linkHandles);
                self.objectCache.setNodeTemplateLinkHandles(d.type, handles);
            }
            else if (backgroundSelection.node().tagName === 'rect') {
                const x = parseFloat(backgroundSelection.attr('x'));
                const y = parseFloat(backgroundSelection.attr('y'));
                const width = parseFloat(backgroundSelection.attr('width'));
                const height = parseFloat(backgroundSelection.attr('height'));
                if (!isNaN(x + y + width + height)) {
                    const handles = link_handle_1.handlesForRectangle(x, y, width, height, linkHandles);
                    self.objectCache.setNodeTemplateLinkHandles(d.type, handles);
                }
            }
            else {
                self.objectCache.setNodeTemplateLinkHandles(d.type, []);
            }
        });
    }
    /**
     * Update existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    updateNodes(nodeSelection) {
        if (nodeSelection == null) {
            const svg = this.getSvg();
            const graph = svg.select('g.zoom-group');
            nodeSelection = graph.select('.nodes')
                .selectAll('g.node')
                .data(this._nodes, (d) => d.id.toString());
        }
        // alias for this for use in closures
        const self = this;
        nodeSelection.each(function (d) {
            const node = d3_1.select(this);
            const templateType = node.attr('data-template');
            if (templateType !== self.objectCache.getNodeTemplateId(d.type)) {
                node.selectAll().remove();
                self.createNodes(node);
            }
        });
        nodeSelection.each(function (node) {
            const handles = self.objectCache.getNodeTemplateLinkHandles(node.type);
            if (handles == null) {
                return;
            }
            let handleSelection = d3_1.select(this).selectAll('circle.link-handle')
                .data(handles, (handle) => handle.id.toString());
            handleSelection.exit().remove();
            handleSelection = handleSelection.enter().append('circle')
                .classed('link-handle', true)
                .merge(handleSelection)
                .attr('fill', 'black')
                .attr('cx', (d) => d.x)
                .attr('cy', (d) => d.y)
                .attr('r', 3);
            if (self.isInteractive) {
                handleSelection.call(d3_1.drag()
                    .subject((handle) => {
                    return self.createDraggedEdge(node);
                })
                    .container(() => self.getSvg().select('g.zoom-group').select('g.edges').node())
                    .on('drag', () => {
                    self.updateDraggedEdge();
                    self.updateDraggedEdgeGroups();
                })
                    .on('end', self.dropDraggedEdge.bind(self)));
            }
            else {
                handleSelection.on('.drag', null);
            }
        });
        nodeSelection
            .call(this.updateNodeHighligts.bind(this));
        nodeSelection.each(function (d) {
            const singleNodeSelection = d3_1.select(this);
            const textSelection = singleNodeSelection.selectAll('.text').datum(function () {
                return this.getAttribute('data-content');
            });
            textSelection.each(function (attr) {
                let newText = '';
                if (attr != null) {
                    newText = d[attr];
                }
                if (newText == null) {
                    newText = '';
                }
                textwrap_1.wrapText(this, newText);
            });
        });
    }
    /**
     * Update node positions.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    updateNodePositions(nodeSelection) {
        nodeSelection.attr('transform', (d) => {
            const x = d.x != null ? d.x : 0;
            const y = d.y != null ? d.y : 0;
            return `translate(${x},${y})`;
        });
    }
    updateEdgeGroups(edgeGroupSelection) {
        if (edgeGroupSelection == null) {
            const svg = this.getSvg();
            const graph = svg.select('g.zoom-group');
        }
        const self = this;
        edgeGroupSelection.each(function (d) {
            self.updateEdgeGroup(d3_1.select(this), d);
        }, this)
            .call(this.updateEdgeHighligts.bind(this));
    }
    updateDraggedEdgeGroups() {
        const svg = this.getSvg();
        const graph = svg.select('g.zoom-group');
        const edgeGroupSelection = graph.select('.edges')
            .selectAll('g.edge-group.dragged')
            .data(this.draggedEdges, edge_1.edgeId);
        edgeGroupSelection.exit().remove();
        edgeGroupSelection.enter().append('g')
            .attr('id', (d) => edge_1.edgeId(d))
            .classed('edge-group', true)
            .classed('dragged', true)
            .each(function () {
            d3_1.select(this).append('path')
                .classed('edge', true)
                .attr('fill', 'none');
        })
            .merge(edgeGroupSelection)
            .call(this.updateEdgeGroups.bind(this))
            .call(this.updateEdgePositions.bind(this));
    }
    updateEdgePositions(edgeGroupSelection) {
        if (edgeGroupSelection == null) {
            const svg = this.getSvg();
            const graph = svg.select('g.zoom-group');
        }
        const self = this;
        edgeGroupSelection.select('path.edge')
            .call(this.updateEdgePath.bind(this));
        edgeGroupSelection.each(function (d) {
            d3_1.select(this).selectAll('g.marker').data(d.markers != null ? d.markers : [])
                .call(self.updateMarkerPositions.bind(self));
        }).each(function () {
            const edgeGroup = d3_1.select(this);
            const path = edgeGroup.select('path.edge');
            const length = path.node().getTotalLength();
            const linkMarkerOffset = 10;
            const linkHandlePos = path.node().getPointAtLength(length - linkMarkerOffset);
            edgeGroup.select('circle.link-handle')
                .attr('cx', linkHandlePos.x)
                .attr('cy', linkHandlePos.y)
                .raise();
        });
    }
    updateEdgeGroup(edgeGroupSelection, d) {
        const pathSelection = edgeGroupSelection.select('path.edge:not(.dragged)').datum(d);
        pathSelection.call(this.updateEdge.bind(this));
        const markerSelection = edgeGroupSelection.selectAll('g.marker').data(d.markers != null ? d.markers : []);
        markerSelection.exit().remove();
        markerSelection.enter().append('g')
            .classed('marker', true)
            .call(this.createMarker.bind(this))
            .merge(markerSelection)
            .call(this.updateMarker.bind(this))
            .call(this.updateMarkerPositions.bind(this));
        if (this.isInteractive) {
            edgeGroupSelection.select('circle.link-handle').call(d3_1.drag()
                .subject(() => {
                return this.createDraggedEdgeFromExistingEdge(d);
            })
                .container(() => this.getSvg().select('g.zoom-group').select('g.edges').node())
                .on('start', () => this.completeRender())
                .on('drag', () => {
                this.updateDraggedEdge();
                this.updateDraggedEdgeGroups();
            })
                .on('end', this.dropDraggedEdge.bind(this)));
        }
        else {
            edgeGroupSelection.select('circle.link-handle').on('.drag', null);
        }
    }
    /**
     * Update existing edges.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    updateEdge(edgeSelection) {
        if (edgeSelection == null) {
            const svg = this.getSvg();
            const graph = svg.select('g.zoom-group');
            edgeSelection = graph.select('.edges')
                .selectAll('path.edge:not(.dragged)')
                .data(this._edges, edge_1.edgeId);
        }
        edgeSelection
            .attr('stroke', 'black');
    }
    /**
     * Update existing edge path.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    updateEdgePath(edgeSelection) {
        edgeSelection.attr('d', (d) => {
            const handles = this.objectCache.getEdgeLinkHandles(d);
            const points = [];
            points.push(handles.sourceCoordinates);
            if (handles.sourceHandle.normal != null) {
                points.push({
                    x: handles.sourceCoordinates.x + (handles.sourceHandle.normal.dx * 10),
                    y: handles.sourceCoordinates.y + (handles.sourceHandle.normal.dy * 10),
                });
            }
            if (handles.targetHandle.normal != null) {
                points.push({
                    x: handles.targetCoordinates.x + (handles.targetHandle.normal.dx * 10),
                    y: handles.targetCoordinates.y + (handles.targetHandle.normal.dy * 10),
                });
            }
            points.push(handles.targetCoordinates);
            return this.edgeGenerator(points);
        });
    }
    updateMarker(markerSelection) {
        const self = this;
        markerSelection.each(function (d) {
            const marker = d3_1.select(this);
            const templateType = marker.attr('data-template');
            if (templateType !== d.template) {
                marker.selectAll().remove();
                self.createMarker(marker);
            }
        });
    }
    updateMarkerPositions(markerSelection) {
        markerSelection.each(function (d) {
            const parent = d3_1.select(this.parentElement);
            const marker = d3_1.select(this);
            const path = parent.select('path.edge');
            const length = path.node().getTotalLength();
            let positionOnLine = d.positionOnLine;
            if (positionOnLine === 'end') {
                positionOnLine = 1;
            }
            if (positionOnLine === 'start') {
                positionOnLine = 0;
            }
            positionOnLine = parseFloat(positionOnLine);
            if (isNaN(positionOnLine)) {
                positionOnLine = 0;
            }
            let transform = '';
            const point = path.node().getPointAtLength(length * positionOnLine);
            transform += `translate(${point.x},${point.y})`;
            if (d.scale != null) {
                transform += `scale(${d.scale})`;
            }
            if (d.rotate != null) {
                let angle = 0;
                if (d.rotate.normal == null) {
                    const epsilon = positionOnLine > 0.5 ? -1e-5 : 1e-5;
                    const point2 = path.node().getPointAtLength(length * (positionOnLine + epsilon));
                    const normal = {
                        dx: positionOnLine > 0.5 ? (point.x - point2.x) : (point2.x - point.x),
                        dy: positionOnLine > 0.5 ? (point.y - point2.y) : (point2.y - point.y),
                    };
                    angle += rotation_vector_1.calculateAngle(normal);
                }
                else {
                    angle += rotation_vector_1.calculateAngle(d.rotate.normal);
                }
                angle += d.rotate.relativeAngle != null ? d.rotate.relativeAngle : 0;
                transform += `rotate(${angle})`;
            }
            marker.attr('transform', transform);
        });
    }
    /**
     * Update all node positions and edge paths.
     */
    updateGraphPositions() {
        const svg = this.getSvg();
        const graph = svg.select('g.zoom-group');
        graph.select('.nodes')
            .selectAll('g.node')
            .data(this._nodes, (d) => d.id.toString())
            .call(this.updateNodePositions.bind(this));
        graph.select('.edges')
            .selectAll('g.edge-group:not(.dragged)')
            .data(this._edges, edge_1.edgeId)
            .call(this.updateEdgePositions.bind(this));
        graph.select('.edges')
            .selectAll('g.edge-group.dragged')
            .data(this.draggedEdges, edge_1.edgeId)
            .call(this.updateEdgePositions.bind(this));
    }
    createDraggedEdge(sourceNode) {
        const validTargets = new Set();
        this._nodes.forEach(node => validTargets.add(node.id.toString()));
        this.objectCache.getEdgesBySource(sourceNode.id).forEach(edge => validTargets.delete(edge.target.toString()));
        validTargets.delete(sourceNode.id.toString());
        let draggedEdge = {
            id: sourceNode.id.toString() + Date.now().toString(),
            source: sourceNode.id,
            target: null,
            validTargets: validTargets,
            currentTarget: { x: d3_1.event.x, y: d3_1.event.y },
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
    createDraggedEdgeFromExistingEdge(edge) {
        const validTargets = new Set();
        this._nodes.forEach(node => validTargets.add(node.id.toString()));
        this.objectCache.getEdgesBySource(edge.source).forEach(edgeOutgoing => {
            if (edge_1.edgeId(edge) !== edge_1.edgeId(edgeOutgoing)) {
                validTargets.delete(edgeOutgoing.target.toString());
            }
        });
        let draggedEdge = {
            id: edge.source.toString() + Date.now().toString(),
            createdFrom: edge_1.edgeId(edge),
            source: edge.source,
            target: null,
            validTargets: validTargets,
            currentTarget: { x: d3_1.event.x, y: d3_1.event.y },
            markers: [],
        };
        if (edge.markers != null) {
            draggedEdge.markers = JSON.parse(JSON.stringify(edge.markers));
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
    updateDraggedEdge() {
        const oldTarget = d3_1.event.subject.target;
        d3_1.event.subject.target = null;
        d3_1.event.subject.currentTarget.x = d3_1.event.x;
        d3_1.event.subject.currentTarget.y = d3_1.event.y;
        const possibleTarget = this.root.elementFromPoint(d3_1.event.sourceEvent.clientX, d3_1.event.sourceEvent.clientY);
        if (possibleTarget != null) {
            let target = d3_1.select(possibleTarget);
            while (!target.empty()) {
                if (target.classed('node')) {
                    const id = target.attr('id');
                    if (d3_1.event.subject.source.toString() === id) {
                        break;
                    }
                    d3_1.event.subject.target = id;
                    break;
                }
                target = d3_1.select(target.node().parentElement);
            }
        }
        if (d3_1.event.subject.target != null) {
            if (!d3_1.event.subject.validTargets.has(d3_1.event.subject.target)) {
                d3_1.event.subject.target = null;
            }
        }
        if (d3_1.event.subject.target !== oldTarget) {
            if (this.onDraggedEdgeTargetChange != null) {
                const source = this.objectCache.getNode(d3_1.event.subject.source);
                const target = d3_1.event.subject.target != null ? this.objectCache.getNode(d3_1.event.subject.target) : null;
                this.onDraggedEdgeTargetChange(d3_1.event.subject, source, target);
            }
        }
    }
    dropDraggedEdge() {
        let updateEdgeCache = false;
        if (d3_1.event.subject.createdFrom != null) {
            const edge = this.objectCache.getEdge(d3_1.event.subject.createdFrom);
            if (d3_1.event.subject.target !== edge.target.toString()) {
                const index = this._edges.findIndex(edge => edge_1.edgeId(edge) === d3_1.event.subject.createdFrom);
                if (!this.onEdgeRemove(this._edges[index])) {
                    return;
                }
                this._edges.splice(index, 1);
                updateEdgeCache = true;
            }
        }
        const index = this.draggedEdges.findIndex(edge => edge.id === d3_1.event.subject.id);
        this.draggedEdges.splice(index, 1);
        this.updateDraggedEdgeGroups();
        if (d3_1.event.subject.target != null) {
            let edge = d3_1.event.subject;
            delete edge.id;
            if (this.onDropDraggedEdge != null) {
                edge = this.onDropDraggedEdge(edge, this.objectCache.getNode(edge.source), this.objectCache.getNode(edge.target));
            }
            if (d3_1.event.subject.createdFrom != null &&
                d3_1.event.subject.target === this.objectCache.getEdge(d3_1.event.subject.createdFrom).target.toString()) {
                this.completeRender();
            }
            else {
                if (this.onEdgeCreate(edge)) {
                    this._edges.push(edge);
                    updateEdgeCache = true;
                }
            }
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
    onEdgeCreate(edge) {
        const ev = new CustomEvent('edgeadd', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: { edge: edge }
        });
        return this.dispatchEvent(ev);
    }
    /**
     * Callback for creating edgeremove events.
     *
     * @param edge the created edge
     * @returns false if event was cancelled
     */
    onEdgeRemove(edge) {
        const ev = new CustomEvent('edgeremove', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: { edge: edge }
        });
        return this.dispatchEvent(ev);
    }
    /**
     * Callback on edges for click event.
     *
     * @param edgeDatum Corresponding datum of edge
     */
    onEdgeClick(edgeDatum) {
        const eventDetail = {};
        eventDetail.sourceEvent = d3_1.event;
        eventDetail.edge = edgeDatum;
        const ev = new CustomEvent('edgeclick', { bubbles: true, composed: true, cancelable: true, detail: eventDetail });
        if (!this.dispatchEvent(ev)) {
            return; // prevent default / event cancelled
        }
    }
    /**
     * Callback for creating nodeadd events.
     *
     * @param node the created node
     * @returns false if event was cancelled
     */
    onNodeCreate(node) {
        const ev = new CustomEvent('nodeadd', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: { node: node }
        });
        return this.dispatchEvent(ev);
    }
    /**
     * Callback for creating noderemove events.
     *
     * @param node the created node
     * @returns false if event was cancelled
     */
    onNodeRemove(node) {
        const ev = new CustomEvent('noderemove', {
            bubbles: true,
            composed: true,
            cancelable: true,
            detail: { node: node }
        });
        return this.dispatchEvent(ev);
    }
    /**
     * Callback for creating nodepositionchange events.
     *
     * @param nodes nodes thatchanged
     */
    onNodePositionChange(node) {
        const ev = new CustomEvent('nodepositionchange', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: { node: node }
        });
        this.dispatchEvent(ev);
    }
    /**
     * Callback on nodes for mouseEnter event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    onNodeEnter(nodeDatum) {
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
            detail: { sourceEvent: d3_1.event, node: nodeDatum }
        });
        this.dispatchEvent(ev);
    }
    /**
     * Callback on nodes for mouseLeave event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    onNodeLeave(nodeDatum) {
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
            detail: { sourceEvent: d3_1.event, node: nodeDatum }
        });
        this.dispatchEvent(ev);
    }
    onSelectionChangeInternal() {
        let selected = new Set();
        if (this.mode === 'select') {
            selected = this.interactionStateData.selected;
        }
        const ev = new CustomEvent('selection', { bubbles: true, composed: true, detail: { selection: selected } });
        this.dispatchEvent(ev);
    }
    /**
     * Selection logik in 'link' mode.
     *
     * @param nodeDatum Corresponding datum of node
     */
    onNodeSelectLink(nodeDatum) {
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
            if (!this.onEdgeRemove(this._edges[oldEdge])) {
                return; // event cancelled
            }
            this._edges.splice(oldEdge, 1);
        }
        else {
            const newEdge = {
                source: this.interactionStateData.source,
                target: this.interactionStateData.target,
            };
            if (!this.onEdgeCreate(newEdge)) {
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
    updateNodeHighligts(nodeSelection) {
        if (nodeSelection == null) {
            const svg = this.getSvg();
            const graph = svg.select('g.zoom-group');
            nodeSelection = graph.select('.nodes')
                .selectAll('g.node')
                .data(this._nodes, (d) => d.id.toString());
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
    updateEdgeHighligts(edgeSelection) {
        if (edgeSelection == null) {
            const svg = this.getSvg();
            const graph = svg.select('g.zoom-group');
            edgeSelection = graph.select('.edges')
                .selectAll('g.edge-group:not(.dragged)')
                .data(this._edges, edge_1.edgeId);
        }
        let nodes = new Set();
        if (this.mode === 'link') {
            if (this.interactionStateData.source != null) {
                nodes.add(this.interactionStateData.source);
            }
        }
        else {
            nodes = this.hovered;
        }
        edgeSelection
            .classed('highlight-outgoing', (d) => nodes.has(d.source))
            .classed('highlight-incoming', (d) => nodes.has(d.target));
    }
}
exports.default = GraphEditor;
//# sourceMappingURL=grapheditor.js.map