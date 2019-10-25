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

import { LinkHandle, calculateNormal, handlesForCircle, handlesForRectangle, handlesForPolygon, handlesForPath } from './link-handle';
import { Selection, select } from 'd3-selection';
import { Point } from './edge';

export class TemplateCache {

    private nodeTemplates: Map<string, Selection<SVGGElement, unknown, any, unknown>>;
    private nodeTemplateLinkHandles: Map<string, LinkHandle[]>;
    private markerTemplates: Map<string, Selection<SVGGElement, unknown, any, unknown>>;
    private templateBBoxes: Map<string, DOMRect>;

    constructor() {
        this.nodeTemplates = new Map<string, Selection<SVGGElement, unknown, any, unknown>>();
        this.nodeTemplateLinkHandles = new Map<string, LinkHandle[]>();
        this.markerTemplates = new Map<string, Selection<SVGGElement, unknown, any, unknown>>();
        this.templateBBoxes = new Map<string, DOMRect>();
    }

    /**
     * Update template cache from the given svg.
     *
     * @param svg the svg to search for templates
     */
    updateTemplateCache(svg: Selection<SVGSVGElement, unknown, any, unknown>) {
        const nodeTemplates = new Map<string, Selection<SVGGElement, unknown, any, unknown>>();
        const nodeTemplateLinkHandles = new Map<string, LinkHandle[]>();
        const markerTemplates = new Map<string, Selection<SVGGElement, unknown, any, unknown>>();
        const templateBBoxes = new Map<string, DOMRect>();
        const templates = svg.select('defs').selectAll<SVGGElement, unknown>('g[data-template-type]');
        const idSet = new Set<string>();
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
            let bBox: DOMRect;
            // temp svg group, only used if getBBox() does not work in defs tag (e.g. firefox)
            let temp: Selection<SVGGElement, unknown, any, unknown>;
            try {
                bBox = this.getBBox();
            } catch (error) {
                // workaround to get BBox in firefox (copy it into temp group, then get BBox)
                temp = svg.append('g').attr('id', 'temp-template-measurements');
                temp.node().appendChild(this.cloneNode(true));
                bBox = temp.select<SVGGElement>('g').node().getBBox();
            }
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
            }
            // cleanup temp
            if (temp != null) {
                temp.remove();
            }
        });

        this.templateBBoxes = templateBBoxes;
        this.nodeTemplates = nodeTemplates;
        this.nodeTemplateLinkHandles = nodeTemplateLinkHandles;
        this.markerTemplates = markerTemplates;
    }

    getTemplateBBox(id: string) {
        return this.templateBBoxes.get(id);
    }

    getNodeTemplateId(nodeType: string) {
        if (nodeType == null || !this.nodeTemplates.has(nodeType)) {
            return 'default';
        } else {
            return nodeType;
        }
    }

    getNodeTemplate(id: string) {
        return this.nodeTemplates.get(this.getNodeTemplateId(id));
    }

    getNodeTemplateLinkHandles(id: string): LinkHandle[] {
        const handles = this.nodeTemplateLinkHandles.get(this.getNodeTemplateId(id));
        if (handles == null) {
            return [];
        }
        return handles;
    }

    getMarkerTemplateId(markerType: string) {
        if (markerType == null || !this.markerTemplates.has(markerType)) {
            return 'default-marker';
        } else {
            return markerType;
        }
    }

    getMarkerTemplate(markerType: string) {
        if (markerType == null || markerType === '') {
            console.warn('Cannot retrieve marker template for type ' + markerType + '!');
            return;
        }
        return this.markerTemplates.get(markerType);
    }

}

/**
 * Calculate link handle positions for the given template.
 *
 * @param nodeTemplate the template to calculate link handles for
 */
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
        const radius = parseFloat(backgroundSelection.attr('r'));
        linkHandles = handlesForCircle(radius, linkHandlesOptions);
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
    linkHandles.forEach(calculateNormal);

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
            console.warn('Could not parse "data-link-handles" attribute: ' + linkHandles);
        }
    }
    return null;
}
