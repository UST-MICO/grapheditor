import { DynamicNodeTemplate } from './dynamic-template';
import { handlesForRectangle } from '../link-handle';
import { Selection } from 'd3';
import { Node } from '../node';

export class DynamicBoxTemplate implements DynamicNodeTemplate {

    private linkHandleOptions: string;

    constructor(linkHandleOptions: string= 'edges') {
        this.linkHandleOptions = linkHandleOptions;
    }

    renderInitialTemplate(g: Selection<SVGGElement, Node, any, unknown>, grapheditor, context) {
        g.append('rect');
        g.append('text').classed('text', true).attr('data-content', 'title');
    }

    updateTemplate(g: Selection<SVGGElement, Node, any, unknown>, grapheditor, context) {
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

    getLinkHandles(g: Selection<SVGGElement, Node, any, unknown>, grapheditor) {
        const node = g.datum();
        const width = node.width;
        const height = node.height;
        return handlesForRectangle(-width / 2, -height / 2, width, height, this.linkHandleOptions);
    }
}
