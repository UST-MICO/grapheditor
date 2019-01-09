import { Node } from './node';
import { Edge, DraggedEdge } from './edge';
export default class GraphEditor extends HTMLElement {
    private mutationObserver;
    private initialized;
    private root;
    private xScale;
    private yScale;
    private zoom;
    private edgeGenerator;
    private contentMinHeight;
    private contentMaxHeight;
    private contentMinWidth;
    private contentMaxWidth;
    private hovered;
    private _nodes;
    private _edges;
    private draggedEdges;
    private _mode;
    private _zoomMode;
    private objectCache;
    private interactionStateData;
    private readonly isInteractive;
    /**
     * Callback when a new dragged edge is created.
     *
     * Use this callback only to customize the edge attributes like markers or type!
     */
    onCreateDraggedEdge: (edge: DraggedEdge) => DraggedEdge;
    /**
     * Callback dragged edge has a new target.
     *
     * Only modify the existing edge!
     */
    onDraggedEdgeTargetChange: (edge: DraggedEdge, sourceNode?: Node, targetNode?: Node) => void;
    /**
     * Callback when a existing dragged edge is dropped.
     *
     * Use this callback only to customize the edge attributes like markers or type!
     */
    onDropDraggedEdge: (edge: DraggedEdge, sourceNode?: Node, targetNode?: Node) => Edge;
    nodeList: Node[];
    edgeList: Edge[];
    mode: string;
    zoomMode: string;
    constructor();
    connectedCallback(): void;
    static readonly observedAttributes: string[];
    attributeChangedCallback(name: any, oldValue: any, newValue: string): void;
    /**
     * Set nodes and redraw graph.
     *
     * @param nodes new nodeList
     * @param redraw if graph should be redrawn
     */
    setNodes(nodes: Node[], redraw?: boolean): void;
    /**
     * Add a single node to the graph.
     *
     * @param node node to add
     * @param redraw if graph should be redrawn
     */
    addNode(node: Node, redraw?: boolean): void;
    /**
     * Remove a single node from the graph.
     *
     * @param node node or id to remove
     * @param redraw if the graph should be redrawn
     */
    removeNode(node: Node | number | string, redraw?: boolean): void;
    /**
     * Set edges and redraw graph.
     *
     * @param nodes new edgeList
     * @param redraw if the graph should be redrawn
     */
    setEdges(nodes: Edge[], redraw?: boolean): void;
    /**
     * Add a single edge to the graph.
     *
     * @param edge edge to add
     * @param redraw if graph should be redrawn
     */
    addEdge(edge: Edge, redraw?: boolean): void;
    /**
     * Remove a single edge from the graph.
     *
     * @param edge edge or id to remove
     * @param redraw if the graph should be redrawn
     */
    removeEdge(edge: Edge, redraw?: boolean): void;
    /**
     * Set the graph interaction mode and cleanup temp data from old interaction mode.
     *
     * @param mode interaction mode (one of ["display", "layout", "link", "select"])
     */
    setMode(mode: string): void;
    /**
     * Set the graph zoom mode.
     *
     * @param mode zoom mode (one of ["none", "manual", "automatic", "both"])
     */
    setZoomMode(mode: string): void;
    /**
     * Initialize the shadow dom with a drawing svg.
     */
    private initialize;
    private getSvg;
    /**
     * Calculate and store the size of the svg.
     */
    private updateSize;
    /**
     * Zooms and pans the graph to get all content inside the visible area.
     *
     * @param force if false only zooms in zoomMode 'automatic' and 'both' (default=true)
     */
    zoomToBoundingBox: (force?: boolean) => void;
    /**
     * Get templates in this dom-node and render them into defs node of svg or style tags.
     *
     * @param nodeTemplateList list of node templates to use instead of html templates
     * @param styleTemplateList list of style templates to use instead of html templates (not wrapped in style tag!)
     */
    updateTemplates: (nodeTemplateList?: {
        [prop: string]: any;
        id: string;
        innerHTML: string;
    }[], styleTemplateList?: {
        [prop: string]: any;
        id?: string;
        innerHTML: string;
    }[], markerTemplateList?: {
        [prop: string]: any;
        id: string;
        innerHTML: string;
    }[]) => void;
    /**
     * Render all changes of the data to the graph.
     */
    completeRender(updateTemplates?: boolean): void;
    /**
     * Add nodes to graph.
     *
     * @param nodeSelection d3 selection of nodes to add with bound data
     */
    private createNodes;
    private updateLinkHandles;
    /**
     * Update existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    private updateNodes;
    /**
     * Update node positions.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    private updateNodePositions;
    private updateEdgeGroups;
    private updateDraggedEdgeGroups;
    private updateEdgePositions;
    private updateEdgeGroup;
    /**
     * Update existing edges.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    private updateEdge;
    /**
     * Update existing edge path.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    private updateEdgePath;
    private createMarker;
    private updateMarker;
    private updateMarkerPositions;
    /**
     * Update all node positions and edge paths.
     */
    private updateGraphPositions;
    private createDraggedEdge;
    private createDraggedEdgeFromExistingEdge;
    private updateDraggedEdge;
    private dropDraggedEdge;
    /**
     * Callback for creating edgeadd events.
     *
     * @param edge the created edge
     * @returns false if event was cancelled
     */
    private onEdgeCreate;
    /**
     * Callback for creating edgeremove events.
     *
     * @param edge the created edge
     * @returns false if event was cancelled
     */
    private onEdgeRemove;
    /**
     * Callback on edges for click event.
     *
     * @param edgeDatum Corresponding datum of edge
     */
    private onEdgeClick;
    /**
     * Callback for creating nodeadd events.
     *
     * @param node the created node
     * @returns false if event was cancelled
     */
    private onNodeCreate;
    /**
     * Callback for creating noderemove events.
     *
     * @param node the created node
     * @returns false if event was cancelled
     */
    private onNodeRemove;
    /**
     * Callback for creating nodepositionchange events.
     *
     * @param nodes nodes thatchanged
     */
    private onNodePositionChange;
    /**
     * Callback on nodes for mouseEnter event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeEnter;
    /**
     * Callback on nodes for mouseLeave event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeLeave;
    /**
     * Callback on nodes for click event.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeClick;
    private onSelectionChangeInternal;
    /**
     * Selection logik in 'link' mode.
     *
     * @param nodeDatum Corresponding datum of node
     */
    private onNodeSelectLink;
    /**
     * Calculate highlighted nodes and update their classes.
     */
    private updateNodeHighligts;
    /**
     * Calculate highlighted edges and update their classes.
     */
    private updateEdgeHighligts;
}
