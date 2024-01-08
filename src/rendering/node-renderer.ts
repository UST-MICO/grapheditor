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
import { NodeDragBehaviour, EventSource, Point, DraggedEdge } from '..';
import { DynamicMarkerTemplate, DynamicNodeTemplate } from '../dynamic-templates/dynamic-template';
import GraphEditor from '../grapheditor';
import { LinkHandle } from '../link-handle';
import { getNodeLinkHandles } from '../link-handle-helper';
import { calculateRotationTransformationAngle } from '../rotation-vector';
import { recursiveAttributeGet } from '../util';
import { wrapText } from '../textwrap';
import { NodeDropZone } from '../drop-zone';
import { GraphObjectCache } from '../object-cache';
import { Node, NodeMovementInformation } from '../node';

/**
 * Class handling the rendering of nodes to the svg dom.
 *
 * This class is only used internally in the grapheditor. The methods of this
 * class should not be called by user code directly!
 */
export class NodeRenderer {

    protected graph: WeakRef<GraphEditor>;
    protected objectCache: GraphObjectCache;

    /**
     * Create a new instance of a node renderer.
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
     * Render a full node update for all nodes.
     *
     * @param nodesGroup the svg group element selection to render the nodes into
     * @param nodes the nodes to render
     * @param forceUpdateTemplates if the templates hould be completelty reapplied
     */
    public completeNodeGroupsRender(nodesGroup: Selection<SVGGElement, unknown, any, unknown>, nodes: Node[], forceUpdateTemplates: boolean = false) {
        const graph = this.derefGraph();
        if (forceUpdateTemplates) {
            nodesGroup.selectAll('g.node').remove();
        }

        const nodeSelection = nodesGroup
            .selectAll<SVGGElement, Node>('g.node')
            .data<Node>(nodes, (d: Node) => d.id.toString())
            .join(
                enter => enter.append('g')
                    .classed('node', true)
                    .attr('data-id', (d) => d.id)
            )
            .call(this.updateNodes)
            .call(this.updateNodePositions)
            .order()
            .on('mouseover', (event, d) => { graph.onNodeEnter.bind(graph)(event, d); })
            .on('mouseout', (event, d) => { graph.onNodeLeave.bind(graph)(event, d); })
            .on('click', (event, d) => { graph.onNodeClick.bind(graph)(event, d); });

        nodeSelection.call(
            drag<SVGGElement, Node, NodeDragBehaviour<unknown>>()
                .subject((e, n) => {
                    if (graph.nodeDragInteraction === 'none') {
                        return; // no node dragging allowed!
                    }
                    const event = e as unknown as D3DragEvent<SVGGElement, Node, NodeDragBehaviour<unknown>>;
                    const node = n as unknown as Node;
                    if (graph.nodeDragInteraction === 'link') {
                        return this.getNodeLinkDragBehaviour(event, node);
                    }

                    return this.getNodeMoveDragBehaviour(event, node);
                })
                .container(function (e) {
                    // use edges group as container in linking mode
                    if (graph.nodeDragInteraction === 'link') {
                        // eslint-disable-next-line newline-per-chained-call
                        return graph.getSVG().select('g.zoom-group').select<SVGGElement>('g.edges').node();
                    } else {
                        return this.parentElement;
                    }
                })
                .on('start', (e) => {
                    const event = e as unknown as D3DragEvent<SVGGElement, Node, NodeDragBehaviour<unknown>>;
                    const onStart = event.subject.onStart;
                    if (onStart != null) {
                        onStart(event, event.subject.subject, graph);
                    }
                })
                .on('drag', (e) => {
                    const event = e as unknown as D3DragEvent<SVGGElement, Node, NodeDragBehaviour<unknown>>;
                    const onDrag = event.subject.onDrag;
                    if (onDrag != null) {
                        onDrag(event, event.subject.subject, graph);
                    }
                })
                .on('end', (e) => {
                    const event = e as unknown as D3DragEvent<SVGGElement, Node, NodeDragBehaviour<unknown>>;
                    const onEnd = event.subject.onEnd;
                    if (onEnd != null) {
                        onEnd(event, event.subject.subject, graph);
                    }
                })
        );
    }


    /**
     * Update existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    protected updateNodes = (nodeSelection?: Selection<SVGGElement, Node, any, unknown>) => {
        const graph = this.derefGraph();
        if (nodeSelection == null) {
            nodeSelection = graph.getNodeSelection();
        }

        // alias for this for use in closures
        const self = this;

        // update templates
        const extrasRenderer = graph.extrasRenderer;
        nodeSelection.each(function (d) {
            const g: Selection<SVGGElement, Node, any, unknown> = select(this).datum(d);
            if (d.dynamicTemplate != null && d.dynamicTemplate !== '') {
                extrasRenderer.updateContentTemplate<Node>(g, d.dynamicTemplate, 'node', true);
            } else {
                const templateId = graph.staticTemplateRegistry.getNodeTemplateId(d.type);
                extrasRenderer.updateContentTemplate<Node>(g, templateId, 'node');
            }
        });

        // update dynamic templates and link handles for node
        nodeSelection.each(function (node) {
            const g: Selection<SVGGElement, Node, any, unknown> = select(this).datum(node);
            let handles: LinkHandle[] = [];
            if (node.dynamicTemplate != null && node.dynamicTemplate !== '') {
                // update dynamic template
                const dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicNodeTemplate>(node.dynamicTemplate);
                if (dynTemplate != null) {
                    try {
                        dynTemplate.updateTemplate(g, graph, null);
                    } catch (error) {
                        console.error(`An error occured while updating the dynamic template for node ${node.id}!`, error);
                    }
                }
            }
            try {
                handles = getNodeLinkHandles(g, graph.staticTemplateRegistry, graph.dynamicTemplateRegistry, graph);
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
                    const templateId = graph.staticTemplateRegistry.getMarkerTemplateId(d.template);
                    extrasRenderer.updateContentTemplate<LinkHandle>(linkHandleG, templateId, 'marker', d.isDynamicTemplate, node);
                    if (d.isDynamicTemplate) {
                        const dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicMarkerTemplate>(templateId);
                        if (dynTemplate != null) {
                            try {
                                dynTemplate.updateTemplate(linkHandleG, graph, { parent: node });
                            } catch (error) {
                                console.error(`An error occured while updating the dynamic link handle template in node ${node.id}!`, error);
                            }
                        }
                    }
                })
                .attr('transform', (d) => {
                    const x = d.x != null ? d.x : 0;
                    const y = d.y != null ? d.y : 0;
                    const angle = calculateRotationTransformationAngle(d, d.normal ?? { dx: 0, dy: 0 });
                    if (angle !== 0) {
                        return `translate(${x},${y})rotate(${angle})`;
                    }
                    return `translate(${x},${y})`;
                });

            // allow edge drag from link handles
            handleSelection.call(
                drag<SVGGElement, LinkHandle, NodeDragBehaviour<{ edge: DraggedEdge; capturingGroup?: string }>>()
                    .subject((e) => {
                        if (graph.edgeDragInteraction === 'none') {
                            return; // edge dragging is disabled
                        }
                        const event = e as unknown as D3DragEvent<SVGGElement, LinkHandle, NodeDragBehaviour<{ edge: DraggedEdge; capturingGroup?: string }>>;
                        return self.getNodeLinkDragBehaviour(event, node);
                    })
                    // eslint-disable-next-line newline-per-chained-call
                    .container(() => graph.getSVG().select('g.zoom-group').select<SVGGElement>('g.edges').node())
                    .on('start', (e) => {
                        const event = e as unknown as D3DragEvent<SVGGElement, LinkHandle, NodeDragBehaviour<{ edge: DraggedEdge; capturingGroup?: string }>>;
                        const onStart = event.subject.onStart;
                        if (onStart != null) {
                            onStart(event, event.subject.subject, graph);
                        }
                    })
                    .on('drag', (e) => {
                        const event = e as unknown as D3DragEvent<SVGGElement, LinkHandle, NodeDragBehaviour<{ edge: DraggedEdge; capturingGroup?: string }>>;
                        const onDrag = event.subject.onDrag;
                        if (onDrag != null) {
                            onDrag(event, event.subject.subject, graph);
                        }
                    })
                    .on('end', (e) => {
                        const event = e as unknown as D3DragEvent<SVGGElement, LinkHandle, NodeDragBehaviour<{ edge: DraggedEdge; capturingGroup?: string }>>;
                        const onEnd = event.subject.onEnd;
                        if (onEnd != null) {
                            onEnd(event, event.subject.subject, graph);
                        }
                    })
            );
        });

        nodeSelection
            .call(graph.updateNodeClasses.bind(graph))
            .call(graph.updateNodeHighligts.bind(graph))
            .call(this.updateNodeText)
            .call(graph.extrasRenderer.updateDynamicProperties)
            .call(this.updateNodeDropAreas)
            .each(function (d) {
                self.objectCache.setNodeBBox(d.id, this.getBBox());
            });
    };

    /**
     * Update node positions.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    public updateNodePositions = (nodeSelection: Selection<SVGGElement, Node, any, unknown>) => {
        nodeSelection.attr('transform', (d) => {
            const x = d.x != null ? d.x : 0;
            const y = d.y != null ? d.y : 0;
            return `translate(${x},${y})`;
        });
    };


    /**
     * Update node classes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     * @param classesToRemove a list of css classes to be removed from all nodes
     */
    public updateNodeClasses = (nodeSelection: Selection<SVGGElement, Node, any, unknown>, classesToRemove: Set<string> = new Set()): void => {
        const graph = this.derefGraph();
        if (classesToRemove != null) {
            classesToRemove.forEach((className) => {
                nodeSelection.classed(className, () => false);
            });
        }
        if (graph.classes != null) {
            graph.classes.forEach((className) => {
                nodeSelection.classed(className, (d) => {
                    if (graph.setNodeClass != null) {
                        return graph.setNodeClass(className, d);
                    }
                    return false;
                });
            });
        }
    };



    /**
     * Calculate highlighted nodes and update their classes.
     */
    // eslint-disable-next-line max-len
    public updateNodeHighligts = (nodeSelection: Selection<SVGGElement, Node, any, unknown>, hovered: Set<string | number>, linkSource?: string | number, linkTarget?: string | number) => {
        const graph = this.derefGraph();
        nodeSelection
            .classed('hovered', (d) => hovered.has(d.id))
            .classed('selected', (d) => {
                if (graph.selected.has(d.id.toString())) {
                    return true; // node is selected
                }
                if (linkSource === d.id || linkTarget === d.id) {
                    return true; // node is part of a linking interaction
                }
                return false;
            });
    };


    /**
     * Update text of existing nodes.
     *
     * @param nodeSelection d3 selection of nodes to update with bound data
     */
    public updateNodeText = (nodeSelection: Selection<SVGGElement, Node, any, unknown>, force: boolean = false) => {
        nodeSelection.each(function (d) {
            const singleNodeSelection = select(this);
            const textSelection = singleNodeSelection.selectAll<SVGTextElement, unknown>('text').datum(function () {
                return this.getAttribute('data-content');
            });
            textSelection.each(function (attr) {
                let newText = recursiveAttributeGet(d, attr);
                if (newText == null) {
                    newText = '';
                }
                // make sure it is a string
                wrapText(this, newText.toString(), force);
            });
        });
    };

    /**
     * Update node drop zones.
     *
     * @param nodeSelection d3 selection of nodes to calculate drop zones for with bound data
     */
    public updateNodeDropAreas = (nodeSelection: Selection<SVGGElement, Node, any, unknown>) => {
        const self = this;
        nodeSelection.each(function (node) {
            const dropZones = new Map<string, NodeDropZone>();
            select(this)
                .selectAll<SVGGraphicsElement, NodeDropZone>('[data-node-drop-zone]')
                .datum(function () {
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
    };



    // Drag Behaviours /////////////////////////////////////////////////////////
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
    public getNodeMovementInformation(node: Node, x: number, y: number): NodeMovementInformation {
        const graph = this.derefGraph();
        const movementInfo: NodeMovementInformation = { node: node };
        const gm = graph.groupingManager;
        const groupId = gm.getGroupCapturingMovementOfChild(node);
        if (groupId != null && groupId !== node.id.toString()) {
            const groupNode = graph.getNode(groupId);
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
        if (gm.getGroupBehaviourOf(movementInfo.node.id)?.moveChildrenAlongGoup ?? false) {
            movementInfo.children = gm.getAllChildrenOf(movementInfo.node.id);
        }
        movementInfo.offset = {
            dx: x - movementInfo.node.x,
            dy: y - movementInfo.node.y,
        };
        if (graph.onBeforeNodeMove != null) {
            try {
                return graph.onBeforeNodeMove(movementInfo);
            } catch (error) {
                console.error('An error has occured in the onBeforeNodeMove callback.', node, movementInfo);
            }
        }
        return movementInfo;
    }

    /**
     * Get a 'move' drag behaviour for a node.
     *
     * Moves the node with the drag pointer.
     *
     * @param event the causing event
     * @param node the node that is about to be dragged
     * @returns the 'move' drag behaviour
     */
    protected getNodeMoveDragBehaviour = (event: D3DragEvent<SVGGElement, Node, NodeDragBehaviour<unknown>>, node: Node) => {
        const graph = this.derefGraph();
        const nodeMoveInfo = this.getNodeMovementInformation(node as unknown as Node, event.x, event.y);
        if (nodeMoveInfo == null) {
            return; // move was cancelled by callback
        }
        const startTreeParent = graph.groupingManager.getTreeParentOf(nodeMoveInfo.node.id);
        if (startTreeParent != null) {
            const behaviour = graph.groupingManager.getGroupBehaviourOf(startTreeParent);
            if (behaviour.onNodeMoveStart != null) {
                const needRender = Boolean(
                    behaviour.onNodeMoveStart(startTreeParent, nodeMoveInfo.node.id.toString(), graph.getNode(startTreeParent), nodeMoveInfo.node, graph)
                );
                nodeMoveInfo.needsFullRender = needRender || nodeMoveInfo.needsFullRender;
            }
        }
        const dragBehaviour: NodeDragBehaviour<NodeMovementInformation> = {
            subject: nodeMoveInfo,
            onStart: (innerEvent, subject, g) => this.onNodeDrag('start', subject, EventSource.USER_INTERACTION),
            onDrag: (innerEvent, movementInfo, g) => {
                let x = innerEvent.x;
                let y = innerEvent.y;
                if (movementInfo != null) {
                    if (movementInfo.offset?.dx != null) {
                        x -= movementInfo.offset.dx;
                    }
                    if (movementInfo.offset?.dy != null) {
                        y -= movementInfo.offset.dy;
                    }
                    movementInfo.needsFullRender = movementInfo.needsFullRender ?? false;
                    movementInfo.needsFullRender = this.tryToLeaveCurrentGroup(
                        movementInfo, x, y, EventSource.USER_INTERACTION, innerEvent as unknown as Event
                    ) || movementInfo.needsFullRender;
                    movementInfo.needsFullRender = this.tryJoinNodeIntoGroup(
                        movementInfo, x, y, EventSource.USER_INTERACTION, innerEvent as unknown as Event
                    ) || movementInfo.needsFullRender;
                    movementInfo.needsFullRender = this.moveNodeInternal(
                        movementInfo, innerEvent.x, innerEvent.y, EventSource.USER_INTERACTION
                    ) || movementInfo.needsFullRender;
                    if (movementInfo.needsFullRender) {
                        g.completeRender(false, EventSource.USER_INTERACTION);
                    } else {
                        g.updateGraphPositions(EventSource.USER_INTERACTION);
                    }
                    movementInfo.needsFullRender = false;
                }
            },
            onEnd: (innerEvent, movementInfo, g) => {
                // eslint-disable-next-line no-shadow
                const node = movementInfo.node;
                const endTreeParent = g.groupingManager.getTreeParentOf(node.id);
                if (endTreeParent != null) {
                    const behaviour = g.groupingManager.getGroupBehaviourOf(endTreeParent);
                    if (behaviour.onNodeMoveEnd != null) {
                        behaviour.onNodeMoveEnd(endTreeParent, node.id.toString(), g.getNode(endTreeParent), node, g);
                    }
                }

                // rerender if needed
                if (movementInfo.needsFullRender) {
                    g.completeRender(false, EventSource.USER_INTERACTION);
                    movementInfo.needsFullRender = false;
                }

                this.onNodeDrag('end', movementInfo, EventSource.USER_INTERACTION);
            },
        };
        return dragBehaviour;
    };

    /**
     * Get a 'link' drag behaviour for a node.
     *
     * Behaves the same as dragging a link handle of a node.
     * Is also used to implement the link handle drag behaviour.
     *
     * @param event the causing event
     * @param node the node that is about to be dragged
     * @returns the 'move' drag behaviour
     */
    protected getNodeLinkDragBehaviour = (event: D3DragEvent<SVGGElement, unknown, NodeDragBehaviour<unknown>>, node: Node) => {
        const graph = this.derefGraph();
        const behaviour: NodeDragBehaviour<{ edge: DraggedEdge; capturingGroup?: string }> = {
            subject: null,
            onDrag: (innerEvent, subject, g) => {
                g.edgeRenderer.updateDraggedEdge(innerEvent as any, subject.edge, subject.capturingGroup);
                g.edgeRenderer.updateDraggedEdgeGroups();
            },
            onEnd: (innerEvent, subject, g) => {
                g.edgeRenderer.dropDraggedEdge(innerEvent as any, subject.edge, false);
            },
        };

        const groupCapturingEdge = graph.groupingManager.getGroupCapturingOutgoingEdge(node);
        if (groupCapturingEdge != null && groupCapturingEdge !== node.id.toString()) {
            const groupNode = graph.getNode(groupCapturingEdge);
            if (groupNode != null) {
                behaviour.subject = { edge: graph.edgeRenderer.createDraggedEdge(event as any, groupNode), capturingGroup: groupCapturingEdge };
            }
        }
        if (behaviour.subject == null) {
            behaviour.subject = { edge: graph.edgeRenderer.createDraggedEdge(event as any, node), capturingGroup: node.id.toString() };
        }

        return behaviour;
    };


    // Node Movement Internals /////////////////////////////////////////////////
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
    public moveNodeInternal(nodeMovementInfo: NodeMovementInformation, x: number, y: number, eventSource: EventSource): boolean {
        const graph = this.derefGraph();
        let needsFullRender = false;

        if (nodeMovementInfo.offset != null) {
            x -= nodeMovementInfo.offset?.dx ?? 0;
            y -= nodeMovementInfo.offset?.dy ?? 0;
        }
        const node = nodeMovementInfo.node;

        // call parent groups beforeNodeMove
        const currentTreeParent = graph.groupingManager.getTreeParentOf(node.id);
        if (currentTreeParent != null) {
            const groupBehaviour = graph.groupingManager.getGroupBehaviourOf(currentTreeParent);
            if (groupBehaviour.beforeNodeMove != null) {
                const groupNode = graph.getNode(currentTreeParent);
                needsFullRender = Boolean(groupBehaviour.beforeNodeMove(currentTreeParent, node.id.toString(), groupNode, node, { x: x, y: y }, graph));
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
                    const child = graph.getNode(childId);
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
     * Get the position the group dictates for this node.
     *
     * If the node is not in a group or has no fixed position in that group this method returns null.
     *
     * @param node the node to get the position for
     * @returns the absolute node position (or null)
     */
    protected getGroupDictatedPositionOfNode(node: Node): Point {
        const graph = this.derefGraph();
        let groupRelativePosition: string | Point;
        let relativeToGroup: string;
        const gm = graph.groupingManager;
        const treeParent = gm.getTreeParentOf(node.id);
        if (treeParent != null) {
            relativeToGroup = treeParent;
            groupRelativePosition = gm.getGroupBehaviourOf(relativeToGroup)?.childNodePositions?.get(node.id.toString());
        } else {
            gm.getParentsOf(node.id)?.forEach(parentId => {
                if (relativeToGroup == null) {
                    return;
                }
                const parentBehaviour = gm.getGroupBehaviourOf(parentId);
                const relPos = parentBehaviour?.childNodePositions?.get(node.id.toString());
                if (relPos != null) {
                    relativeToGroup = parentId;
                    groupRelativePosition = relPos;
                }
            });
        }
        if (typeof (groupRelativePosition) === 'string') {
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
            const parentNode = graph.getNode(relativeToGroup);
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
    public tryToLeaveCurrentGroup(nodeMovementInformation: NodeMovementInformation, x: number, y: number, eventSource: EventSource, sourceEvent?: Event): boolean {
        const graph = this.derefGraph();
        const node = nodeMovementInformation.node;
        const gm = graph.groupingManager;

        const currentGroup = gm.getTreeParentOf(node.id);
        if (currentGroup == null) {
            return false; // is not part of a group
        }
        if (!(gm.getGroupBehaviourOf(currentGroup)?.allowDraggedNodesLeavingGroup ?? false)) {
            return false; // group does not allow dragged nodes to leave
        }

        const clientPoint = graph.getClientPointFromGraphCoordinates({ x: x, y: y });

        const possibleTargetNodes = graph.getNodesFromPoint(clientPoint.x, clientPoint.y);
        const allChildren = gm.getAllChildrenOf(currentGroup);

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
            if (gm.getCanDraggedNodeLeaveGroup(currentGroup, node.id, node)) {
                gm.removeNodeFromGroup(currentGroup, node.id, eventSource, sourceEvent);
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
    public tryJoinNodeIntoGroup(nodeMovementInformation: NodeMovementInformation, x: number, y: number, eventSource: EventSource, sourceEvent?: Event): boolean {
        const graph = this.derefGraph();
        const node = nodeMovementInformation.node;
        const gm = graph.groupingManager;

        if (gm.getTreeParentOf(node.id) != null) {
            return false;
        }

        const clientPoint = graph.getClientPointFromGraphCoordinates({ x: x, y: y });

        const possibleTargetNodes = graph.getNodesFromPoint(clientPoint.x, clientPoint.y);
        const targetNode = possibleTargetNodes.find(target => target.id !== node.id);
        if (targetNode != null) {
            const canJoinGroup = gm.getGroupCapturingDraggedNode(targetNode.id, node.id, targetNode, node);
            if (canJoinGroup != null) {
                if (gm.getTreeRootOf(canJoinGroup) == null) {
                    // canJoinGroup is not part of a tree => mark it as a tree root
                    gm.markAsTreeRoot(canJoinGroup, eventSource, sourceEvent);
                }
                gm.addNodeToGroup(canJoinGroup, node.id, { x: x, y: y }, eventSource, sourceEvent);
                if (gm.getTreeDepthOf(node.id) === 0) {
                    gm.joinTreeOfParent(node.id, canJoinGroup, eventSource, sourceEvent);
                }
                return true;
            }
        }
        return false;
    }

    // Event Dispatching ///////////////////////////////////////////////////////
    /**
     * Create and dispatch 'nodedragstart' and 'nodedragend' events.
     *
     * @param eventType the type of the event
     * @param movementInfo the node movement information
     * @param eventSource the event source
     */
    public onNodeDrag(eventType: 'start' | 'end', movementInfo: NodeMovementInformation, eventSource) {
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
        this.derefGraph().dispatchEvent(ev);
    }

    /**
     * Callback for creating nodepositionchange events.
     *
     * @param nodes nodes that changed
     * @param eventSource the source of the selection event (default: EventSource.USER_INTERACTION)
     */
    public onNodePositionChange(node: Node, eventSource: EventSource = EventSource.USER_INTERACTION) {
        const ev = new CustomEvent('nodepositionchange', {
            bubbles: true,
            composed: true,
            cancelable: false,
            detail: {
                eventSource: eventSource,
                node: node,
            },
        });
        this.derefGraph().dispatchEvent(ev);
    }
}
