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

import { drag } from 'd3-drag';
import { select, Selection } from 'd3-selection';
import { DraggedEdge, Edge, EdgeDragHandle, edgeId, EventSource, Node, normalizePositionOnLine, setDefaultEdgeDragHandles, TextComponent } from '..';
import { DynamicMarkerTemplate, DynamicTextComponentTemplate } from '../dynamic-templates/dynamic-template';
import GraphEditor from '../grapheditor';
import { applyUserLinkHandleCalculationCallback, calculateNearestHandles, getNodeLinkHandles } from '../link-handle-helper';
import { LineAttachementInfo, Marker } from '../marker';
import { GraphObjectCache } from '../object-cache';
import { wrapText } from '../textwrap';
import { calculateAbsolutePositionOnLine, Rect, recursiveAttributeGet } from '../util';
import { Point, PathPositionRotationAndScale } from '..';
import { calculateAngle, calculateRotationTransformationAngle, normalizeVector, RotationVector } from '../rotation-vector';
import { LinkHandle } from '../link-handle';


/**
 * Class handling the rendering of edges to the svg dom.
 *
 * This class is only used internally in the grapheditor. The methods of this
 * class should not be called by user code directly!
 */
export class EdgeRenderer {

    protected graph: WeakRef<GraphEditor>;
    protected objectCache: GraphObjectCache;

    /**
     * Create a new instance of a edge renderer.
     *
     * @param graph reference to the grapheditor
     * @param cache reference to the private object cache of the grapheditor, used to update node bounding boxes and drop zones
     */
    constructor(graph: GraphEditor, cache: GraphObjectCache) {
        this.graph = new WeakRef<GraphEditor>(graph);
        this.objectCache = cache;
    }

    /**
     * Safely deref the grapheditor weak reference.
     *
     * @returns the grapheditor instance or throws an error
     */
    protected derefGraph(): GraphEditor {
        const graph = this.graph.deref();
        if (graph == null) {
            throw new Error('Grapheditor instance is already dereferenced!');
        }
        return graph;
    }

    /**
     * Render a full update for all edges.
     *
     * @param edgesGroup the svg group element selection to render the edges into
     * @param edges the edges to render
     * @param forceUpdateTemplates if the templates hould be completelty reapplied
     */
    public completeEdgeGroupsRender(edgesGroup: Selection<SVGGElement, unknown, any, unknown>, edges: Edge[], forceUpdateTemplates: boolean = false) {
        if (forceUpdateTemplates) {
            edgesGroup.selectAll('g.edge-group:not(.dragged)').remove();
        }
        const self = this;
        edgesGroup
            .selectAll<SVGGElement, Edge>('g.edge-group:not(.dragged)')
            .data<Edge>(edges, edgeId)
            .join(
                enter => enter.append('g')
                    .attr('data-id', (d) => edgeId(d))
                    .classed('edge-group', true)
                    .each(function (d) {
                        const edgeGroup = select(this);
                        edgeGroup.append('path')
                            .classed('edge', true)
                            .attr('fill', 'none');
                    })
            )
            .call(this.updateEdgeGroups.bind(this))
            .call(self.updateEdgePositions.bind(this))
            .order()
            .on('click', (event, d) => { this.onEdgeClick(event as any, d); });
    }


    /**
     * Update edge groups.
     *
     * @param edgeGroupSelection d3 selection of edgeGroups
     */
    public updateEdgeGroups(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>) {
        const graph = this.derefGraph();
        if (edgeGroupSelection == null) {
            edgeGroupSelection = graph.getEdgeSelection();
        }
        const self = this;
        edgeGroupSelection
            .each(function (d) {
                self.updateEdgeGroup(select(this), d);
            })
            .call(graph.updateEdgeGroupClasses.bind(graph))
            .call(graph.updateEdgeHighligts.bind(graph));
    }

    /**
     * Update draggededge groups.
     */
    public updateDraggedEdgeGroups() {
        const graph = this.derefGraph();
        graph.getEdgesGroup()
            .selectAll<SVGGElement, DraggedEdge>('g.edge-group.dragged')
            .data<DraggedEdge>(graph.draggedEdgeList, edgeId)
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
     * @param edgeGroupSelection d3 selection of edges to update with bound data
     */
    public updateEdgeGroupClasses = (edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, classesToRemove: Set<string> = new Set()): void => {
        const graph = this.derefGraph();
        edgeGroupSelection.classed('ghost', (d) => graph.isEdgeCurrentlyDragged(edgeId(d)));
        if (classesToRemove != null) {
            classesToRemove.forEach((className) => {
                edgeGroupSelection.classed(className, () => false);
            });
        }
        if (graph.classes != null) {
            graph.classes.forEach((className) => {
                edgeGroupSelection.classed(className, (d) => {
                    if (graph.setEdgeClass != null) {
                        return graph.setEdgeClass(
                            className,
                            d,
                            this.objectCache.getNode(d.source),
                            (d.target != null) ? this.objectCache.getNode(d.target) : null
                        );
                    }
                    return false;
                });
            });
        }
    };


    /**
     * Calculate highlighted edges and update their classes.
     */
    // eslint-disable-next-line max-len
    public updateEdgeHighligts = (edgeSelection: Selection<SVGGElement, Edge, any, unknown>, hovered: Set<string | number>, linkSource?: string | number, linkTarget?: string | number) => {
        let nodes: Set<number | string> = new Set();

        if (linkSource != null) {
            nodes.add(linkSource);
            if (linkTarget != null) {
                nodes.add(linkTarget);
            }
        } else {
            nodes = hovered;
        }

        edgeSelection
            .classed('highlight-outgoing', (d) => nodes.has(d.source))
            .classed('highlight-incoming', (d) => nodes.has(d.target));
    };


    /**
     * Update markers and path attributes.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    protected updateEdgeGroup(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {
        const graph = this.derefGraph();
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
        graph.extrasRenderer.updateDynamicProperties(edgeGroupSelection);

        edgeDragHandles.call(
            drag<SVGGElement, EdgeDragHandle, { edge: DraggedEdge; capturingGroup?: string; isReversedEdge: boolean }>()
                .subject((e, h) => {
                    if (graph.edgeDragInteraction === 'none') {
                        return; // edge dragging is disabled
                    }
                    const event = e as unknown as Event;
                    const handle = h as unknown as EdgeDragHandle;
                    const edge = d;
                    let sourceNode: Node;
                    if ((handle).isReverseHandle ?? false) {
                        // a reverse handle flips the edge direction
                        sourceNode = graph.getNode(edge.target);
                    } else {
                        sourceNode = graph.getNode(edge.source);
                    }
                    const groupCapturingEdge = graph.groupingManager.getGroupCapturingOutgoingEdge(sourceNode);
                    if (groupCapturingEdge != null && groupCapturingEdge !== sourceNode.id.toString()) {
                        const groupNode = graph.getNode(groupCapturingEdge);
                        if (groupNode != null) {
                            const newEdge = this.createDraggedEdgeFromExistingEdge(event, edge);
                            newEdge.source = groupCapturingEdge;
                            return {
                                edge: newEdge,
                                capturingGroup: groupCapturingEdge,
                                isReversedEdge: handle.isReverseHandle ?? false,
                            };
                        }
                    }
                    return {
                        edge: this.createDraggedEdgeFromExistingEdge(event, edge, handle.isReverseHandle ?? false),
                        capturingGroup: sourceNode.id.toString(),
                        isReversedEdge: handle.isReverseHandle ?? false,
                    };
                })
                .container(() => graph.getEdgeSelection().node() as any)
                .on('start', () => graph.completeRender(false, EventSource.USER_INTERACTION))
                .on('drag', (event) => {
                    this.updateDraggedEdge(event as any, (event as any).subject.edge, (event as any).subject.capturingGroup);
                    this.updateDraggedEdgeGroups();
                })
                .on('end', (event) => {
                    this.dropDraggedEdge(event as any, (event as any).subject.edge, (event as any).subject.isReversedEdge);
                })
        );
    }


    /**
     * Update all edge texts in a edge group.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     * @param force force text to re-wrap
     */
    public updateEdgeText(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge, force: boolean = false) {
        const graph = this.derefGraph();
        const self = this;
        edgeGroupSelection.each(function (edge) {
            const textSelection = select(this).selectAll<SVGGElement, TextComponent>('g.text-component')
                .data(edge.texts != null ? edge.texts : [])
                .join(enter => enter.append('g').classed('text-component', true))
                .each(function (textComponent) {
                    const g: Selection<SVGGElement, TextComponent, any, unknown> = select(this).datum<TextComponent>(textComponent);
                    const templateId = textComponent.template ?? 'default-textcomponent';
                    graph.extrasRenderer.updateContentTemplate<TextComponent>(g, templateId, 'textcomponent', true, edge);
                    const dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicTextComponentTemplate>(templateId);
                    try {
                        dynTemplate?.updateTemplate(g, graph, { parent: edge });
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
                        newText = recursiveAttributeGet(d, text.attributePath)?.toString();
                    }
                    if (newText == null) {
                        newText = '';
                    }
                    // make sure it is a string
                    newText = newText.toString();
                    wrapText(this as SVGTextElement, newText, force);
                });
            textSelection.each(function (textComponent) {
                const g: Selection<SVGGElement, TextComponent, any, unknown> = select(this).datum<TextComponent>(textComponent);
                const templateId = textComponent.template ?? 'default-textcomponent';
                const dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicTextComponentTemplate>(templateId);
                try {
                    dynTemplate?.updateAfterTextwrapping(g, graph, { parent: edge });
                } catch (error) {
                    console.error(`An error occured updating the text component in edge ${edgeId(edge)} after text wrapping`, textComponent, error);
                }
            });
            const path = edgeGroupSelection.select<SVGPathElement>('path.edge');
            textSelection.call(drag()
                .subject((event, text) => {
                    if (!((text as unknown as TextComponent).draggable ?? true)) {
                        return; // text component is not draggable
                    }
                    return text;
                })
                .on('start', (event, text) => {
                    self.onEdgeTextDrag('start', text as unknown as TextComponent, edge, EventSource.USER_INTERACTION);
                })
                .on('drag', ((event, text: TextComponent) => {
                    const length = path.node().getTotalLength();
                    const positionOnLine = normalizePositionOnLine(text.positionOnLine);
                    const absolutePositionOnLine = calculateAbsolutePositionOnLine(length, positionOnLine, text.absolutePositionOnLine);
                    const referencePoint = path.node().getPointAtLength(absolutePositionOnLine);
                    text.offsetX = event.x - referencePoint.x;
                    text.offsetY = event.y - referencePoint.y;
                    self.onEdgeTextPositionChange(text, edge);
                    self.updateEdgeTextPositions(edgeGroupSelection, edge);
                }) as any) // FIXME: remove type hack when types are up to date
                .on('end', ((event, text: TextComponent) => {
                    self.onEdgeTextDrag('end', text, edge, EventSource.USER_INTERACTION);
                }) as any) // FIXME: remove type hack when types are up to date
            );
        });
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
    protected calculateAbsolutePositionOnLine(pathLength: number, positionOnLine: number, absolutePositionOnLine?: number): number {
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
    protected calculatePathNormalAtPosition(path: SVGPathElement, absolutePositionOnLine: number, point?: DOMPoint, length?: number): RotationVector {
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
    protected calculatePathObjectTransformation(point: { x: number; y: number }, pathObject: PathPositionRotationAndScale, strokeWidth: number, normal: RotationVector) {
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
        const angle = calculateRotationTransformationAngle(pathObject, normal);
        if (angle !== 0) {
            transform += `rotate(${angle})`;
        }
        return transform;
    }

    /**
     * Update edge path and marker positions.
     *
     * @param edgeGroupSelection d3 selection
     */
    public updateEdgePositions(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>) {
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
     * Calculate the link handles for each edge and store them into the edge.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    protected updateEdgeLinkHandles(edgeSelection: Selection<SVGPathElement, Edge | DraggedEdge, any, unknown>) {
        const graph = this.derefGraph();
        edgeSelection.each(edge => {

            const sourceNodeSelection = graph.getSingleNodeSelection(edge.source);
            const targetNodeSelection = (edge.target != null) ? graph.getSingleNodeSelection(edge.target) : null;
            let initialSourceHandles, initialTargetHandles;
            try {
                initialSourceHandles = getNodeLinkHandles(sourceNodeSelection, graph.staticTemplateRegistry, graph.dynamicTemplateRegistry, graph);
            } catch (error) {
                console.error(`An error occured while calculating the link handles for node ${edge.source}!`, error);
            }
            try {
                initialTargetHandles = getNodeLinkHandles(targetNodeSelection, graph.staticTemplateRegistry, graph.dynamicTemplateRegistry, graph);
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
                graph.calculateLinkHandlesForEdge
            );

            const nearestHandles = calculateNearestHandles(newHandles.sourceHandles, sourceNode, newHandles.targetHandles, targetNode);
            edge.sourceHandle = nearestHandles.sourceHandle;
            edge.targetHandle = nearestHandles.targetHandle;
        });
    }

    /**
     * Calculate the attachement vector for a marker.
     *
     * @param startingAngle the line angle for the marker
     * @param marker the selection of a single marker
     * @param strokeWidth the current stroke width
     */
    protected calculateLineAttachementVector(startingAngle: number | RotationVector, markerSelection: Selection<SVGGElement, Marker, any, unknown>, strokeWidth: number) {
        const graph = this.derefGraph();
        if (markerSelection.empty()) {
            return { dx: 0, dy: 0 };
        }
        const marker = markerSelection.datum();
        let attachementPointInfo: LineAttachementInfo;
        if (marker.isDynamicTemplate) {
            const dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicMarkerTemplate>(marker.template);
            try {
                attachementPointInfo = dynTemplate?.getLineAttachementInfo(markerSelection);
            } catch (error) {
                console.error('An error occured while calculating the line attachement info for an edge marker!', marker, error);
            }
        } else {
            attachementPointInfo = graph.staticTemplateRegistry.getMarkerAttachementPointInfo(marker.template);
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
        return { dx: 0, dy: 0 };
    }

    /**
     * Update existing edge path.
     *
     * @param edgeSelection d3 selection of edges to update with bound data
     */
    protected updateEdgePath(edgeSelection: Selection<SVGPathElement, Edge, any, unknown>) {
        const graph = this.derefGraph();
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
                    const markerSelection: Selection<SVGGElement, Marker, any, unknown> = select(this.parentNode as any)
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
                    const markerSelection: Selection<SVGGElement, Marker, any, unknown> = select(this.parentNode as any)
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
                const pathGenerator = graph.edgePathGeneratorRegistry.getEdgePathGenerator(d.pathType) ?? graph.defaultEdgePathGenerator;
                let path: string;
                try {
                    path = pathGenerator.generateEdgePath(points[0], points[points.length - 1], sourceHandleNormal, (d.target != null) ? targetHandleNormal : null);
                } catch (error) {
                    console.error(`An error occurred while generating the edge path for the edge ${edgeId(edge)}`, error);
                    path = graph.defaultEdgePathGenerator.generateEdgePath(
                        points[0], points[points.length - 1], sourceHandleNormal, (d.target != null) ? targetHandleNormal : null
                    );
                }
                return path;
            });
        });
    }




    /**
     * Update all edge text positions in a edge group.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    protected updateEdgeTextPositions(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {
        const graph = this.derefGraph();
        const self = this;
        const path = edgeGroupSelection.select<SVGPathElement>('path.edge');
        const length = path.node().getTotalLength();
        const strokeWidth: number = parseFloat(path.style('stroke-width').replace(/px/, ''));
        const textSelection = edgeGroupSelection.selectAll<SVGGElement, TextComponent>('g.text-component')
            .data<TextComponent>(d.texts != null ? d.texts : []);

        // calculate the node bounding boxes for collision detection
        let sourceBB = { x: 0, y: 0, width: 0, height: 0 };
        let targetBB = { x: 0, y: 0, width: 0, height: 0 };
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
                bbox = graph.transformBBox(bbox, ctm);
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
     * Update all edge marker positions
     *
     * @param markerSelection d3 selection
     */
    protected updateMarkerPositions(markerSelection: Selection<SVGGElement, Marker, any, unknown>) {
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
            const transform = self.calculatePathObjectTransformation(point, d, strokeWidth, normal);

            marker.attr('transform', transform);
        });
    }

    /**
     * Update positions of edge-end and edge-start marker.
     *
     * @param edgeGroupSelection d3 selection of single edge group
     * @param d edge datum
     */
    protected updateEndMarkerPositions(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {

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
    protected updateEndMarkerPosition(
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
            markerStartingNormal = { dx: -markerStartingNormal.dx, dy: -markerStartingNormal.dy };
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
        let markerTemplateStartingNormal: RotationVector;
        // flip normal for markerStart
        if (markerClass === 'marker-start' && markerStartingNormal != null) {
            markerTemplateStartingNormal = { dx: -markerStartingNormal.dx, dy: -markerStartingNormal.dy };
        } else {
            markerTemplateStartingNormal = markerStartingNormal;
        }
        // calculate marker transformation
        const transformEnd = this.calculatePathObjectTransformation(point, marker, strokeWidth, markerTemplateStartingNormal);
        // apply transformation
        markerSelection.attr('transform', transformEnd);
    }


    /**
     * Update existing edge marker.
     *
     * @param markerSelection d3 selection
     * @param edge the edge datum this marker belongs to
     */
    protected updateMarker(markerSelection: Selection<SVGGElement, Marker, any, unknown>, edge: Edge) {
        const graph = this.derefGraph();
        markerSelection
            .attr('data-click', (d) => d.clickEventKey)
            .each(function (marker) {
                const templateId = graph.staticTemplateRegistry.getMarkerTemplateId(marker.template);
                graph.extrasRenderer.updateContentTemplate<Marker>(select(this), templateId, 'marker');
                if (marker.isDynamicTemplate) {
                    const g = select(this).datum(marker);
                    const dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicMarkerTemplate>(templateId);
                    if (dynTemplate != null) {
                        try {
                            dynTemplate.updateTemplate(g, graph, { parent: edge });
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
    protected updateEndMarkers(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, d: Edge) {
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
    protected updateEndMarker(edgeGroupSelection: Selection<SVGGElement, Edge, any, unknown>, marker: Marker, markerClass: string, edge: Edge) {
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
     * Create a new dragged edge from a source node.
     *
     * @param sourceNode node that edge was dragged from
     */
    public createDraggedEdge(event: Event, sourceNode: Node): DraggedEdge {
        const graph = this.derefGraph();
        const validTargets = new Set<string>();
        graph.nodeList.forEach(node => validTargets.add(node.id.toString()));
        this.objectCache.getEdgesBySource(sourceNode.id).forEach(edge => validTargets.delete(edge.target.toString()));
        validTargets.delete(sourceNode.id.toString());
        let draggedEdge: DraggedEdge = {
            id: sourceNode.id.toString() + Date.now().toString(),
            source: sourceNode.id,
            target: null,
            validTargets: validTargets,
            currentTarget: { x: (event as any).x, y: (event as any).y },
        };
        if (graph.onCreateDraggedEdge != null) {
            draggedEdge = graph.onCreateDraggedEdge(draggedEdge);
            if (draggedEdge == null) {
                return null;
            }
        }
        graph.draggedEdgeList.push(draggedEdge);
        return draggedEdge;
    }

    /**
     * Create a dragged edge from an existing edge.
     *
     * @param edge existing edge
     * @param reverseEdgeDirection reverse the direction of the returned edge
     */
    // eslint-disable-next-line complexity
    protected createDraggedEdgeFromExistingEdge(event: Event, edge: Edge, reverseEdgeDirection: boolean = false): DraggedEdge {
        const graph = this.derefGraph();
        const validTargets = new Set<string>();
        graph.nodeList.forEach(node => validTargets.add(node.id.toString()));
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
            currentTarget: { x: (event as any).x, y: (event as any).y },
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
        if (graph.onCreateDraggedEdge != null) {
            draggedEdge = graph.onCreateDraggedEdge(draggedEdge);
            if (draggedEdge == null) {
                return null;
            }
        }
        graph.draggedEdgeList.push(draggedEdge);
        return draggedEdge;
    }

    /**
     * Update dragged edge on drag event.
     */
    // eslint-disable-next-line complexity
    public updateDraggedEdge(event: Event, edge: DraggedEdge, capturingGroup?: string) {
        const graph = this.derefGraph();
        const oldTarget = edge.target;
        edge.target = null;
        edge.currentTarget.x = (event as any).x;
        edge.currentTarget.y = (event as any).y;

        const sourceEvent = (event as any).sourceEvent;
        const possibleTargetNodes = graph.getNodesFromPoint(sourceEvent.clientX, sourceEvent.clientY);
        if (possibleTargetNodes.length > 0) {
            const targetNode = possibleTargetNodes[0];
            const targetNodeId = targetNode.id.toString();

            // validate target
            let isValidTarget = true;

            // allow target to be source
            // isValidTarget = isValidTarget && (edge.source.toString() === targetNodeId);

            // check group capture
            const targetGroupCapturingEdge = graph.groupingManager.getGroupCapturingIncomingEdge(targetNode);

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
                const targetGroupBehaviour = graph.groupingManager.getGroupBehaviourOf(targetGroupCapturingEdge);
                const targetGroupNode = this.objectCache.getNode(targetGroupCapturingEdge);
                if (targetGroupBehaviour?.delegateIncomingEdgeTargetToNode != null && targetGroupNode != null) {
                    const newTarget = targetGroupBehaviour.delegateIncomingEdgeTargetToNode(targetGroupCapturingEdge, targetGroupNode, edge, graph);
                    if (newTarget != null && newTarget !== '' && this.objectCache.getNode(newTarget) !== null) {
                        edge.target = newTarget;
                    }
                }
            }
        }

        // dispatch event if target changed and handle source group link capture
        if (edge.target !== oldTarget) {
            if (capturingGroup != null) {
                const groupBehaviour = graph.groupingManager.getGroupBehaviourOf(capturingGroup);
                const groupNode = this.objectCache.getNode(capturingGroup);
                if (groupBehaviour != null && groupNode != null && groupBehaviour.delegateOutgoingEdgeSourceToNode != null) {
                    const newSource = groupBehaviour.delegateOutgoingEdgeSourceToNode(capturingGroup, groupNode, edge, graph);
                    if (newSource != null && newSource !== '' && this.objectCache.getNode(newSource) !== null) {
                        edge.source = newSource;
                    }
                }
            }
            if (graph.onDraggedEdgeTargetChange != null) {
                const source = this.objectCache.getNode(edge.source);
                const target = edge.target != null ? this.objectCache.getNode(edge.target) : null;
                graph.onDraggedEdgeTargetChange(edge, source, target);
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
    public dropDraggedEdge(event: Event, edge: DraggedEdge, isReversedEdge: boolean) {
        const graph = this.derefGraph();
        let updateGraph = false;
        const existingEdge = this.objectCache.getEdge(edge.createdFrom);
        let existingTarget = existingEdge?.target.toString();
        if (isReversedEdge) {
            existingTarget = existingEdge?.source.toString();
        }
        if (edge.createdFrom != null) {
            if (edge.target?.toString() !== existingTarget) {
                // only remove original edge if target of dropped edge is different then original target
                updateGraph = graph.removeEdge(edge.createdFrom, false, EventSource.USER_INTERACTION);
            }
        }

        const index = graph.draggedEdgeList.findIndex(e => e.id === edge.id);
        graph.draggedEdgeList.splice(index, 1);
        this.updateDraggedEdgeGroups();
        if (edge.target != null) {
            // dragged edge has a target
            let finalEdge: Edge = edge;
            delete finalEdge.id;
            if (graph.onDropDraggedEdge != null) {
                finalEdge = graph.onDropDraggedEdge(edge, this.objectCache.getNode(edge.source),
                    this.objectCache.getNode(edge.target));
            }
            if (edge.createdFrom != null && edge.target === existingTarget) {
                // edge was dropped on the node that was the original target for the edge
                graph.completeRender(false, EventSource.USER_INTERACTION);
            } else {
                // put the or at the and to always execute the addEdge!
                updateGraph = graph.addEdge(edge) || updateGraph;
            }
        } else {
            this.onEdgeDrop(edge, { x: (event as any).x, y: (event as any).y });
        }
        if (updateGraph) {
            graph.completeRender(false, EventSource.USER_INTERACTION);
        } else {
            graph.updateEdgeGroupClasses();
        }
    }

    // Event Dispatching ///////////////////////////////////////////////////////

    /**
     * Callback on edges for click event.
     *
     * @param edgeDatum Corresponding datum of edge
     */
    protected onEdgeClick(event: Event, edgeDatum) {
        const eventDetail: any = {};
        eventDetail.eventSource = EventSource.USER_INTERACTION;
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
        if (!this.derefGraph().dispatchEvent(ev)) {
            return; // prevent default / event cancelled
        }
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
        return this.derefGraph().dispatchEvent(ev);
    }

    /**
     * Create and dispatch 'edgetextdragstart' and 'edgetextdragend' events.
     *
     * @param eventType the type of the event
     * @param textComponent The text component that was dragged.
     * @param edge The edge the text component belongs to.
     * @param eventSource the event source
     */
    protected onEdgeTextDrag(eventType: 'start' | 'end', textComponent: TextComponent, edge: Edge, eventSource) {
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
        this.derefGraph().dispatchEvent(ev);
    }

    /**
     * Callback for creating edgetextpositionchange events.
     *
     * @param textComponent The text component that was dragged.
     * @param edge The edge the text component belongs to.
     */
    protected onEdgeTextPositionChange(textComponent: TextComponent, edge: Edge) {
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
        this.derefGraph().dispatchEvent(ev);
    }
}
