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

import { LinkHandle, calculateLinkHandleNormal, handlesForCircle, handlesForRectangle, handlesForPolygon, handlesForPath } from './link-handle';
import { Selection, select } from 'd3-selection';
import { Point, TextComponent } from './edge';
import { LineAttachementInfo, Marker } from './marker';
import { DynamicTemplate } from './dynamic-templates/dynamic-template';
import { Node } from './node';
import { EdgePathGenerator } from './dynamic-templates/edge-path-generators';
import { Rect } from './util';

/**
 * Registry for edge path generators.
 *
 * The current instance can be retrieved from the GraphEditor object.
 */
export class EdgePathGeneratorRegistry {

    private pathGenerators: Map<string, EdgePathGenerator>;

    constructor() {
        this.pathGenerators = new Map<string, EdgePathGenerator>();
    }

    /**
     * Clears all path generators (including the default path generator).
     */
    clearAllPathGenerators(): void {
        this.pathGenerators  = new Map<string, EdgePathGenerator>();
    }

    /**
     * Add a new path generator to the registry.
     *
     * @param pathGeneratorId the key to register the path generator with
     * @param pathGenerator the path generator to register (`null` will remove the path generator with `pathGeneratorId`)
     */
    addEdgePathGenerator(pathGeneratorId: string, pathGenerator: EdgePathGenerator): void {
        if (pathGenerator == null) {
            this.removePathGenerator(pathGeneratorId);
            return;
        }
        if (this.pathGenerators.has(pathGeneratorId)) {
            console.warn(`Path generator id ${pathGeneratorId} was already in use!`);
        }
        this.pathGenerators.set(pathGeneratorId, pathGenerator);
    }

    /**
     * Remove a registered path generator.
     *
     * @param pathGeneratorId the id to remove
     */
    removePathGenerator(pathGeneratorId: string): void {
        this.pathGenerators.delete(pathGeneratorId);
    }

    /**
     * Get the edge path generator.
     *
     * If the id was not found the id 'default' will be used instead.
     * @param pathGeneratorId the id to retrieve
     */
    getEdgePathGenerator(pathGeneratorId: string): EdgePathGenerator {
        if (pathGeneratorId == null || !this.pathGenerators.has(pathGeneratorId)) {
            return this.pathGenerators.get('default');
        }
        return this.pathGenerators.get(pathGeneratorId);
    }
}

/**
 * Template registry for static templates.
 *
 * The current instance can be retrieved from the GraphEditor object.
 */
export class StaticTemplateRegistry {

    private nodeTemplates: Map<string, Selection<SVGGElement, unknown, any, unknown>>;
    private nodeTemplateLinkHandles: Map<string, LinkHandle[]>;
    private markerTemplates: Map<string, Selection<SVGGElement, unknown, any, unknown>>;
    private markerTemplateLineAttachements: Map<string, LineAttachementInfo>;
    private templateBBoxes: Map<string, Rect>;

    constructor() {
        this.nodeTemplates = new Map<string, Selection<SVGGElement, unknown, any, unknown>>();
        this.nodeTemplateLinkHandles = new Map<string, LinkHandle[]>();
        this.markerTemplates = new Map<string, Selection<SVGGElement, unknown, any, unknown>>();
        this.markerTemplateLineAttachements = new Map<string, LineAttachementInfo>();
        this.templateBBoxes = new Map<string, Rect>();
    }

    /**
     * Update template cache from the given svg.
     *
     * This method searches for templates in the first `<defs>` element of the given svg.
     *
     * @param svg the svg to search for templates
     */
    updateTemplateCache(svg: Selection<SVGSVGElement, unknown, any, unknown>): void {
        const nodeTemplates = new Map<string, Selection<SVGGElement, unknown, any, unknown>>();
        const nodeTemplateLinkHandles = new Map<string, LinkHandle[]>();
        const markerTemplates = new Map<string, Selection<SVGGElement, unknown, any, unknown>>();
        const markerTemplateLineAttachements = new Map<string, LineAttachementInfo>();
        const templateBBoxes = new Map<string, DOMRect>();
        const templates = svg.select('defs').selectAll<SVGGElement, unknown>('g[data-template-type]');
        const idSet = new Set<string>();

        const getWorkableTemplate = (id, templateNode, finishedCallback: (bBox: DOMRect, temp: Selection<SVGGElement, unknown, any, unknown>) => void) => {
            let bBox: DOMRect;
            // temp svg group, only used if getBBox() does not work in defs tag (e.g. firefox)
            let temp: Selection<SVGGElement, unknown, any, unknown>;
            try {
                bBox = templateNode.getBBox();
                finishedCallback?.(bBox, temp);
            } catch (error) {
                console.log('Work around firefox bug')
                // workaround to get BBox in firefox (copy it into temp group, then get BBox)
                temp = svg.append('g').attr('id', 'temp-template-measurements');
                const node = temp.node();
                node.appendChild(templateNode.cloneNode(true));
                if (node.isConnected) {
                    bBox = temp.select<SVGGElement>('g').node().getBBox();
                    finishedCallback?.(bBox, temp);
                    return;
                }
                console.log('Wait for node to be connected to dom')
                // wait until node is connected before taking measurements...
                let tries = 0;
                // use setInterval to avoid busy waiting
                const intervalId = setInterval(() => {
                    if (node.isConnected) {
                        bBox = temp.select<SVGGElement>('g').node().getBBox();
                        finishedCallback?.(bBox, temp);
                        clearInterval(intervalId);
                        return;
                    }
                    tries += 1;
                    if (tries > 50) {
                        console.warn(`Could not load template for id ${ id }!`);
                        clearInterval(intervalId);
                    }
                }, 15);
            }
        };

        templates.each(function() {
            const template = select(this);
            const id = template.attr('id');
            if (id == null || id === '') {
                console.error('All templates must have a id!');
            }
            if (idSet.has(id)) {
                console.error('All template id\'s must be unique!');
            }
            idSet.add(id);

            getWorkableTemplate(id, this, (bBox: DOMRect, temp: Selection<SVGGElement, unknown, any, unknown>) => {
                // this part may be executed asynchrounously if the workaround for firefox engages...
                templateBBoxes.set(id, bBox);
                if (template.attr('data-template-type').toLowerCase() === 'node') {
                    nodeTemplates.set(id, template);
                    let workableTemplate: Selection<SVGGElement, unknown, any, unknown>;
                    if (temp == null || temp.empty()) {
                        workableTemplate = template;
                    } else {
                        workableTemplate = temp.select<SVGGElement>('g[data-template-type]');
                    }
                    nodeTemplateLinkHandles.set(id, calculateLinkHandles(workableTemplate));
                }
                if (template.attr('data-template-type').toLowerCase() === 'marker') {
                    markerTemplates.set(id, template);
                    const attachementInfo = new LineAttachementInfo(template.attr('data-line-attachement-point'));
                    markerTemplateLineAttachements.set(id, attachementInfo);
                }
                // cleanup temp
                if (temp != null) {
                    temp.remove();
                }
            });
        });

        this.templateBBoxes = templateBBoxes;
        this.nodeTemplates = nodeTemplates;
        this.nodeTemplateLinkHandles = nodeTemplateLinkHandles;
        this.markerTemplates = markerTemplates;
        this.markerTemplateLineAttachements = markerTemplateLineAttachements;
    }

    /**
     * Get the bounding box of a static template (without link handles!).
     *
     * @param id the template id
     */
    getTemplateBBox(id: string): Rect {
        return this.templateBBoxes.get(id);
    }

    /**
     * Get the template id for the given node type.
     *
     * If the type is null or has no registered template the id `'default'` is returned instead.
     *
     * @param nodeType the type of the node
     */
    getNodeTemplateId(nodeType: string): string {
        if (nodeType == null || !this.nodeTemplates.has(nodeType)) {
            return 'default';
        } else {
            return nodeType;
        }
    }

    /**
     * Get the static template for the given node type.
     *
     * This method uses `getNodeTemplateId`.
     * @param id the template id (normally the node type)
     */
    getNodeTemplate(id: string): Selection<SVGGElement, unknown, any, unknown> {
        return this.nodeTemplates.get(this.getNodeTemplateId(id));
    }

    /**
     * Get the link handles for the given node type.
     *
     * This method uses `getNodeTemplateId`.
     * @param id the template id (normally the node type)
     */
    getNodeTemplateLinkHandles(id: string): LinkHandle[] {
        const handles = this.nodeTemplateLinkHandles.get(this.getNodeTemplateId(id));
        if (handles == null) {
            return [];
        }
        return handles;
    }

    /**
     * Get the template id for the given marker type.
     *
     * If the type is null or has no registered template the id `'default-marker'` is returned instead.
     *
     * @param nodeType the type of the marker
     */
    getMarkerTemplateId(markerType: string): string {
        if (markerType == null || !this.markerTemplates.has(markerType)) {
            return 'default-marker';
        } else {
            return markerType;
        }
    }

    /**
     * Get the static template for the given marker type.
     *
     * This method uses `getMarkerTemplateId`.
     * @param id the template id (normally the marker type)
     */
    getMarkerTemplate(markerType: string): Selection<SVGGElement, unknown, any, unknown> {
        return this.markerTemplates.get(this.getMarkerTemplateId(markerType));
    }

    /**
     * Get the line attachement point for the given marker type.
     *
     * This method uses `getMarkerTemplateId`.
     * @param id the template id (normally the marker type)
     */
    getMarkerAttachementPointInfo(markerType: string): LineAttachementInfo {
        return this.markerTemplateLineAttachements.get(this.getMarkerTemplateId(markerType));
    }

}

/**
 * Template registry for dynamic templates.
 *
 * The current instance can be retrieved from the GraphEditor object.
 */
export class DynymicTemplateRegistry {

    private templates: Map<string, DynamicTemplate<Node|Marker|LinkHandle|TextComponent>>;

    constructor() {
        this.templates = new Map<string, DynamicTemplate<Node|Marker|LinkHandle|TextComponent>>();
    }

    /**
     * Clears all dynamic templates (including any default templates).
     */
    public clearAllTemplates(): void {
        this.templates = new Map<string, DynamicTemplate<Node|Marker|LinkHandle|TextComponent>>();
    }

    /**
     * Add a new dynamic template to the registry.
     *
     * The registry does not ensure type safety for templates on get!
     *
     * @param templateId the id of the new template
     * @param template the new dynamic template (`null` will remove the template with `templateId`)
     */
    public addDynamicTemplate(templateId: string, template: DynamicTemplate<Node|Marker|LinkHandle|TextComponent>): void {
        if (template == null) {
            this.removeDynamicTemplate(templateId);
            return;
        }
        if (this.templates.has(templateId)) {
            console.warn(`Template id ${templateId} was already in use!`);
        }
        this.templates.set(templateId, template);
    }

    /**
     * Get a dynamic template from the registry.
     *
     * The registry does not ensure type safety for templates on get!
     *
     * @param templateId the template id
     */
    public getDynamicTemplate<T extends DynamicTemplate<Node|Marker|LinkHandle|TextComponent>>(templateId: string): T {
        return this.templates.get(templateId) as T;
    }

    /**
     * Remove a dynamic template from the registry.
     *
     * @param templateId the template id
     */
    public removeDynamicTemplate(templateId: string): void {
        this.templates.delete(templateId);
    }
}

/**
 * Calculate link handle positions for the given template.
 *
 * @param nodeTemplate the template to calculate link handles for
 */
// eslint-disable-next-line complexity
function calculateLinkHandles(nodeTemplate: Selection<SVGGElement, unknown, any, unknown>): LinkHandle[] {
    let backgroundSelection: Selection<SVGGeometryElement, unknown, any, unknown> = nodeTemplate.select('.outline');
    if (backgroundSelection.empty()) {
        backgroundSelection = nodeTemplate.select(':first-child');
    }

    let linkHandles: LinkHandle[];
    if (backgroundSelection.empty()) {
        linkHandles = [{
            id: 1,
            x: 0,
            y: 0,
        }];
    }

    let linkHandlesOptions = 'all';
    if (!backgroundSelection.empty()) {
        linkHandlesOptions = backgroundSelection.attr('data-link-handles');
        if (linkHandlesOptions == null || linkHandlesOptions === '') {
            linkHandlesOptions = 'all';
        }
    }

    linkHandles = getExplicitLinkHandles(backgroundSelection);

    linkHandlesOptions = linkHandlesOptions.toLowerCase();
    if (linkHandles != null) {
        // link handles were set explicitly by a json
    } else if (backgroundSelection.node().tagName === 'circle') {
        const x = parseFloat(backgroundSelection.attr('cx'));
        const y = parseFloat(backgroundSelection.attr('cy'));
        const radius = parseFloat(backgroundSelection.attr('r'));
        linkHandles = handlesForCircle(x, y, radius, linkHandlesOptions);
    } else if (backgroundSelection.node().tagName === 'rect') {
        const x = parseFloat(backgroundSelection.attr('x'));
        const y = parseFloat(backgroundSelection.attr('y'));
        const width = parseFloat(backgroundSelection.attr('width'));
        const height = parseFloat(backgroundSelection.attr('height'));
        if (!isNaN(x + y + width + height)) {
            linkHandles = handlesForRectangle(x, y, width, height, linkHandlesOptions);
        }
    } else if (backgroundSelection.node().tagName === 'polygon') {
        const points: Point[] = [];
        for (const point of backgroundSelection.property('points')) {
            points.push(point);
        }
        linkHandles = handlesForPolygon(points, linkHandlesOptions);
    } else if (backgroundSelection.node().tagName === 'path') {
        linkHandles = handlesForPath(backgroundSelection.node() as unknown as SVGPathElement, linkHandlesOptions);
    } else {
        const bBox = backgroundSelection.node().getBBox();
        linkHandles = handlesForRectangle(bBox.x, bBox.y, bBox.width, bBox.height, linkHandlesOptions);
    }

    // cleanup link handles:
    linkHandles.forEach((element, index) => element.id = index);
    linkHandles.forEach(calculateLinkHandleNormal);

    return linkHandles;
}

/**
 * Get specific link handles encoded as json.
 *
 * @param backgroundSelection the background element of the template
 */
function getExplicitLinkHandles(backgroundSelection: Selection<SVGGeometryElement, unknown, any, unknown>) {
    const linkHandles: string = backgroundSelection.attr('data-link-handles');
    if (linkHandles == null) {
        return null;
    }
    if ((linkHandles as string).startsWith('[')) {
        try {
            return JSON.parse(linkHandles as string) as LinkHandle[];
        } catch (error) {
            console.warn(`Could not parse "data-link-handles" attribute: ${linkHandles}`);
        }
    }
    return null;
}
