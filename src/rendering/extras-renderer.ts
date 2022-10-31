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

import { select, Selection } from "d3-selection";
import { Edge, Node, TextComponent } from "..";
import { DynamicMarkerTemplate, DynamicNodeTemplate, DynamicTextComponentTemplate } from "../dynamic-templates/dynamic-template";
import GraphEditor from "../grapheditor";
import { LinkHandle } from "../link-handle";
import { Marker } from "../marker";
import { copyTemplateSelectionIntoNode, recursiveAttributeGet, removeAllChildNodes } from "../util";

/**
 * Class to render features found in nodes and in edges.
 */
export class ExtrasRenderer {

    /** List of dynamically updatable attributes. */
    protected readonly updatableAttributes = ['fill', 'stroke'];

    protected graph: WeakRef<GraphEditor>;

    constructor(graph: GraphEditor) {
        this.graph = new WeakRef<GraphEditor>(graph);
    }

    /**
     * Safely deref the grapheditor weak reference.
     *
     * @returns the grapheditor instance or throws an error
     */
    protected derefGraph(): GraphEditor {
        const graph = this.graph.deref();
        if (graph == null) {
            throw new Error("Grapheditor instance is already dereferenced!")
        }
        return graph;
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
    public updateContentTemplate<T extends Node | Marker | LinkHandle | TextComponent>(element: Selection<SVGGElement, T, any, unknown>, templateId: string, templateType: string, dynamic: boolean = false, parent?: Node | Edge) {
        const oldTemplateID = element.attr('data-template');
        const oldDynamic = element.attr('data-dynamic-template') === 'true';
        if (oldTemplateID != null && oldTemplateID === templateId && dynamic === oldDynamic) {
            return; // already using right template
        }
        removeAllChildNodes(element);
        if (dynamic) {
            // dynamic template
            if (templateType === 'node') {
                this.updateDynamicNodeContentTemplate(templateId, element as Selection<SVGGElement, Node, any, unknown>);
            } else if (templateType === 'marker') {
                this.updateDynamicMarkerContentTemplate(templateId, element as Selection<SVGGElement, Marker|LinkHandle, any, unknown>, parent);
            } else if (templateType === 'textcomponent') {
                this.updateDynamicTextComponentContentTemplate(templateId, element as Selection<SVGGElement, TextComponent, any, unknown>, parent);
            } else {
                console.warn(`Tried to use unsupported template type: ${templateType}`);
            }
        } else {
            // static templates
            const g = element as Selection<SVGGElement, Node | Marker | LinkHandle, any, unknown>;
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
     * Update a node group with the corresponding template.
     *
     * @param templateId the template to instantiate
     * @param element d3 selection of the element in which to instatiate the template
     */
    protected updateDynamicNodeContentTemplate(templateId: string, element: Selection<SVGGElement, Node, any, unknown>) {
        const graph = this.derefGraph();
        const dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicNodeTemplate>(templateId);
        if (dynTemplate != null) {
            try {
                dynTemplate.renderInitialTemplate(element, graph, null);
            } catch (error) {
                console.error(`An error occured while rendering the dynamic template for node ${element.datum().id}!`, error);
            }
        } else {
            this.updateStaticContentTemplate<Node>(element, templateId, 'node');
        }
    }

    /**
     * Update a marker (edge marker or link handle) group with the corresponding template.
     *
     * @param templateId the template to instantiate
     * @param element d3 selection of the element in which to instatiate the template
     */
    protected updateDynamicMarkerContentTemplate(templateId: string, element: Selection<SVGGElement, Marker|LinkHandle, any, unknown>, parent: Node | Edge) {
        const graph = this.derefGraph();
        const dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicMarkerTemplate>(templateId);
        if (dynTemplate != null) {
            try {
                dynTemplate.renderInitialTemplate(element, graph, { parent: parent });
            } catch (error) {
                console.error('An error occured while rendering the dynamic marker template!', { parent: parent }, error);
            }
        } else {
            this.updateStaticContentTemplate<Marker|LinkHandle>(element, templateId, 'marker');
        }
    }

    /**
     * Update a text component group with the corresponding template.
     *
     * @param templateId the template to instantiate
     * @param element d3 selection of the element in which to instatiate the template
     */
    protected updateDynamicTextComponentContentTemplate(templateId: string, element: Selection<SVGGElement, TextComponent, any, unknown>, parent: Node | Edge) {
        const graph = this.derefGraph();
        let dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicTextComponentTemplate>(templateId);
        if (dynTemplate == null) {
            dynTemplate = graph.dynamicTemplateRegistry.getDynamicTemplate<DynamicTextComponentTemplate>('default-textcomponent');
        }
        if (dynTemplate != null) {
            try {
                dynTemplate.renderInitialTemplate(element, graph, { parent: parent });
            } catch (error) {
                console.error('An error occured while rendering the dynamic text component template!', { parent: parent }, error);
            }
        } else {
            console.error(`No template found for textcomponent! (templateID: ${templateId})`);
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
    protected updateStaticContentTemplate<T extends Node | Marker | LinkHandle>(element: Selection<SVGGElement, T, any, unknown>, templateId: string, templateType: string) {
        const graph = this.derefGraph();
        let newTemplate: Selection<SVGGElement, unknown, any, unknown>;
        if (templateType === 'node') {
            newTemplate = graph.staticTemplateRegistry.getNodeTemplate(templateId);
        } else if (templateType === 'marker') {
            newTemplate = graph.staticTemplateRegistry.getMarkerTemplate(templateId);
        } else {
            console.warn(`Tried to use unsupported template type: ${templateType}`);
        }
        // copy template content into element
        copyTemplateSelectionIntoNode(element, newTemplate);
    }

    /**
     * Update non text elements of existing nodes or edges.
     *
     * @param groupSelection d3 selection of nodes or edges to update with bound data
     */
    public updateDynamicProperties = (groupSelection: Selection<SVGGElement, Node | Edge, any, unknown>) => {
        const self = this;
        groupSelection.each(function (d) {
            const singleGoupSelection = select(this);
            // update text
            singleGoupSelection.selectAll<Element, any>('[data-content]:not(text)').datum(function () {
                const attribute = this.getAttribute('data-content');
                return recursiveAttributeGet(d, attribute)?.toString();
            }).text(text => text);
            // update attributes
            self.updatableAttributes.forEach(attr => {
                singleGoupSelection.selectAll<Element, any>(`[data-${attr}]`).datum(function () {
                    const attribute = this.getAttribute(`data-${attr}`);
                    return recursiveAttributeGet(d, attribute)?.toString();
                }).attr(attr, value => value);
            });
            // update href
            singleGoupSelection.selectAll<Element, any>('[data-href]').datum(function () {
                const attribute = this.getAttribute('data-href');
                return recursiveAttributeGet(d, attribute)?.toString();
            }).attr('xlink:href', value => value);
        });
    }
}
