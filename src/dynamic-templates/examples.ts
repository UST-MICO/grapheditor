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

import { DynamicNodeTemplate, DynamicTemplateContext } from './dynamic-template';
import { handlesForRectangle, LinkHandle } from '../link-handle';
import { Selection } from 'd3-selection';
import { Node } from '../node';
import GraphEditor from '../grapheditor';

/**
 * Example dynamic node template rendering a `rect` centered around (0, 0).
 */
export class DynamicBoxTemplate implements DynamicNodeTemplate {

    private linkHandleOptions: string;

    /**
     * Create a new dynamic node template.
     *
     * @param linkHandleOptions link handle options for a `rect` default: 'edges'
     */
    constructor(linkHandleOptions: string= 'edges') {
        this.linkHandleOptions = linkHandleOptions;
    }

    renderInitialTemplate(g: Selection<SVGGElement, Node, any, unknown>, grapheditor: GraphEditor, context: DynamicTemplateContext<Node>): void {
        g.append('rect');
        g.append('text').classed('text', true).attr('data-content', 'title');
    }

    updateTemplate(g: Selection<SVGGElement, Node, any, unknown>, grapheditor: GraphEditor, context: DynamicTemplateContext<Node>): void {
        const width = g.datum().width;
        const height = g.datum().height;
        g.select('rect')
            .attr('x', -width / 2)
            .attr('y', -height / 2)
            .attr('width', width)
            .attr('height', height);
        g.select('text')
            .attr('x', (-width / 2) + 5)
            .attr('y', (-height / 2) + 8)
            .attr('width', Math.max(width - 10, 1));
    }

    getLinkHandles(g: Selection<SVGGElement, Node, any, unknown>, grapheditor: GraphEditor): LinkHandle[] {
        const node = g.datum();
        const width = node.width;
        const height = node.height;
        return handlesForRectangle(-width / 2, -height / 2, width, height, this.linkHandleOptions);
    }
}
