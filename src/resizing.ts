import GraphEditor from './grapheditor';
import { Selection, select, event } from 'd3-selection';
import { drag } from 'd3-drag';
import { Rect, removeAllChildNodes, copyTemplateSelectionIntoNode } from './util';
import { Point } from './edge';


export interface ResizeOverlayOptions {
    handleTemplate?: string;
    cornerHandleTemplate?: string;
    rotateHandles?: boolean;
    rotateEdgeHandles?: boolean;
    rotateCornerHandles?: boolean;
    noHorizontalHandles?: boolean;
    noVerticalHandles?: boolean;
    noCornerHandles?: boolean;

    preserveRatio?: boolean;
    symmetric?: boolean;
    symmetricHorizontal?: boolean;
    symmetricVertical?: boolean;

    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
}

interface ResizeHandle {
    template: string;
    rotation?: number;
    type: 'top-left'|'top'|'top-right'|'right'|'bottom-right'|'bottom'|'bottom-left'|'left';
    isCorner: boolean;
    x: number;
    y: number;
}

type ResizeHandler = (dx: number, dy: number, rect: Rect) => Rect;


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

function clampDelta(d: number, value: number, min: number, max: number): number {
    if (d > 0) {
        return Math.min(d, max - value);
    }
    if (d < 0) {
        return -Math.min(-d, value - min);
    }
    return d;
}

export class ResizingManager {
    readonly graphEditor: GraphEditor;

    // event subscriptions
    private svgChange;
    private nodePositionChange;

    // overlay group selection
    private overlayGroup: Selection<SVGGElement, any, any, any>;

    private resizeOptions: Map<string, ResizeOverlayOptions> = new Map();
    private currentlyResizing: Map<string, Rect> = new Map();

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
    }

    public unlink(): void {
        // TODO
        this.graphEditor.removeEventListener('svginitialized', this.svgChange);
        this.graphEditor.removeEventListener('nodepositionchange', this.nodePositionChange);
    }

    private initializeGraph(graph: Selection<SVGGElement, any, any, any>) {
        let overlayGroup = graph.select<SVGGElement>('g.resize-overlays');
        if (overlayGroup.empty()) {
            overlayGroup = graph.append('g')
                .classed('resize-overlays', true);
        }
        overlayGroup.raise(); // raise overlay to the top
        this.overlayGroup = overlayGroup;
    }

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

    public hideResizeOverlay(nodeId: number|string): void {
        nodeId = nodeId.toString();

        if (!this.resizeOptions.has(nodeId)) {
            return;
        }

        this.resizeOptions.delete(nodeId);
        this.resizeOverlays = this.resizeOverlays.filter((id) => id !== nodeId);
        this.renderOverlays();
    }

    public isResizeOverlayVisible(nodeId: number|string): boolean {
        return this.resizeOptions.has(nodeId.toString());
    }

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
                drag<SVGGElement, ResizeHandle, {handler: ResizeHandler; start: Point; startRect: Rect}>()
                    .subject((handle) => {
                        if (this.currentlyResizing.has(nodeId)) {
                            return;
                        }
                        // eslint-disable-next-line no-shadow
                        const bbox = this.graphEditor.getNodeBBox(nodeId);
                        this.currentlyResizing.set(nodeId, bbox);
                        const handler = this.resizeHandlerFromHandle(nodeId, handle);
                        return {
                            handler: handler,
                            start: {x: event.x, y: event.y},
                            startRect: bbox,
                        };
                    })
                    .on('drag', () => {
                        const resizeHandler: ResizeHandler = event.subject.handler;
                        const start: Point = event.subject.start;
                        const startRect: Rect = event.subject.startRect;
                        const newRect = resizeHandler(event.x - start.x, event.y - start.y, startRect);
                        this.currentlyResizing.set(nodeId, newRect);

                        this.updateOverlayDimensions(overlaySelection, nodeId, resizeHandlesFromOptions(options, newRect));
                    })
                    .on('end', () => {
                        this.currentlyResizing.delete(nodeId);

                        // eslint-disable-next-line no-shadow
                        const bbox = this.graphEditor.getNodeBBox(nodeId);

                        this.updateOverlayDimensions(overlaySelection, nodeId, resizeHandlesFromOptions(options, bbox));
                    })
            );
    }


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

    private updateOverlayPositions(overlaySelection: Selection<SVGGElement, string, SVGGElement, any>) {
        overlaySelection.attr('transform', (nodeId) => {
            const node = this.graphEditor.getNode(nodeId);
            return `translate(${node.x},${node.y})`;
        });
    }


    // eslint-disable-next-line complexity
    private resizeHandlerFromHandle(nodeId: string, handle: ResizeHandle): ResizeHandler {
        const options = this.resizeOptions.get(nodeId);

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
        const symmetricHorizontal = options.symmetric || options.symmetricHorizontal || false;
        const symmetricVertical = options.symmetric || options.symmetricVertical || false;

        if (handle.type === 'top-left') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) {
                    dx *= 2;
                }
                if (symmetricVertical) {
                    dy *= 2;
                }
                let cdx = -clampDelta(-dx, rect.width, minWidth, maxWidth);
                let cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                if (preserveRatio) {
                    dy = cdy;
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
                    y: rect.y + (symmetricVertical ? (cdy / 2) : cdy),
                    width: rect.width - cdx,
                    height: rect.height - cdy,
                };
            };
        }

        if (handle.type === 'top-right') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) {
                    dx *= 2;
                }
                if (symmetricVertical) {
                    dy *= 2;
                }
                let cdx = clampDelta(dx, rect.width, minWidth, maxWidth);
                let cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                if (preserveRatio) {
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
                if (symmetricHorizontal) {
                    dx *= 2;
                }
                if (symmetricVertical) {
                    dy *= 2;
                }
                let cdx = -clampDelta(-dx, rect.width, minWidth, maxWidth);
                let cdy = clampDelta(dy, rect.height, minHeight, maxHeight);
                if (preserveRatio) {
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
                if (symmetricHorizontal) {
                    dx *= 2;
                }
                if (symmetricVertical) {
                    dy *= 2;
                }
                let cdx = clampDelta(dx, rect.width, minWidth, maxWidth);
                let cdy = clampDelta(dy, rect.height, minHeight, maxHeight);
                if (preserveRatio) {
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

        if (handle.type === 'top') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricVertical) {
                    dy *= 2;
                }
                let cdy = -clampDelta(-dy, rect.height, minHeight, maxHeight);
                let cdx = 0;
                if (preserveRatio) {
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
                if (symmetricVertical) {
                    dy *= 2;
                }
                let cdy = clampDelta(dy, rect.height, minHeight, maxHeight);
                let cdx = 0;
                if (preserveRatio) {
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

        if (handle.type === 'left') {
            return (dx: number, dy: number, rect: Rect) => {
                if (symmetricHorizontal) {
                    dx *= 2;
                }
                let cdx = -clampDelta(-dx, rect.width, minWidth, maxWidth);
                let cdy = 0;
                if (preserveRatio) {
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
                if (symmetricHorizontal) {
                    dx *= 2;
                }
                let cdx = clampDelta(dx, rect.width, minWidth, maxWidth);
                let cdy = 0;
                if (preserveRatio) {
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
