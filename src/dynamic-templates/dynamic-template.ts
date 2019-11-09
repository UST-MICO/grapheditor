import { Selection } from 'd3';
import { Node } from '../node';
import { Marker, LineAttachementInfo } from '../marker';
import GraphEditor from '../grapheditor';
import { LinkHandle } from '../link-handle';
import { Edge, TextComponent } from '../edge';

export interface DynamicTemplateContext<T extends Node|LinkHandle|Marker|Edge|TextComponent> {
    [prop: string]: any;
}

export interface DynamicChildElementTemplateContext extends DynamicTemplateContext<Marker|LinkHandle|TextComponent> {
    parent: Node|Edge;
}

/**
 * Interface for dynamic templates.
 *
 * A dynamic template should **never** store any state as it may be used by many nodes!
 * As the dynamic template mechanism only complements the normal static template
 * mechanism all dynamic templates can benefit from the dynamic content loading
 * already implemented for static templates. Text injection and other things can still
 * be used with dynamic templates by setting the right attributes and classes.
 */
export interface DynamicTemplate<T extends Node|Marker|LinkHandle|TextComponent> {

    /**
     * The initial render function that renders the (static part of) template structure into the svg group.
     *
     * This function is called once every time a node is assigned to this dynamic template.
     * The svg group is empty when this function gets called.
     * The intention of this function is to render the static structure of the template and not
     * the dynamic content of the template. The dynamic contetn should be rendered in
     * the `updateTemplate` function.
     *
     * @param g the group the template should be rendered into, (an empty `<g>`)
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering (default: `null`)
     */
    renderInitialTemplate(g: Selection<SVGGElement, T, any, unknown>, grapheditor: GraphEditor, context: DynamicTemplateContext<T>): void;
    /**
     * The update function updates the dynamic parts of the template.
     *
     * This function will be called on every graph render. It will only be called after
     * `renderInitialTemplate` was called for this group.
     * Dynamic text and other dynamic content that is already implemented for static
     * templates can be used by setting the corresponding attributes and classes.
     * This is preferred over updating the text in this function.
     *
     * @param g the group that should be updated
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering (default: `null`)
     */
    updateTemplate(g: Selection<SVGGElement, T, any, unknown>, grapheditor: GraphEditor, context: DynamicTemplateContext<T>): void;
}

/**
 * Interface for dynamic templates for graph nodes.
 */
export interface DynamicNodeTemplate extends DynamicTemplate<Node> {
    /**
     * Get the link handle list for the current node.
     *
     * This function should not update the group itself!
     *
     * @param node the node object
     * @param grapheditor the grapheditor managing this graph
     */
    getLinkHandles(g: Selection<SVGGElement, Node, any, unknown>, grapheditor: GraphEditor): LinkHandle[];
}

/**
 * Interface for dynamic marker/link-handle templates.
 */
export interface DynamicMarkerTemplate extends DynamicTemplate<Marker|LinkHandle> {

    /**
     * @override
     * @param g the group that should be updated
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering
     */
    // tslint:disable-next-line:max-line-length
    renderInitialTemplate(g: Selection<SVGGElement, Marker|LinkHandle, any, unknown>, grapheditor: GraphEditor, context: DynamicChildElementTemplateContext): void;

    /**
     * @override
     * @param g the group that should be updated
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering
     */
    // tslint:disable-next-line:max-line-length
    updateTemplate(g: Selection<SVGGElement, Marker|LinkHandle, any, unknown>, grapheditor: GraphEditor, context: DynamicChildElementTemplateContext): void;

    /**
     * Calculate the LineAttachement info that is used to calculate the actual point
     * where the edge attaches to the marker if it is an end marker.
     *
     * This method can safely return `null` (defaults to no offset).
     *
     * @param g the selection of the marker group
     */
    getLineAttachementInfo(g: Selection<SVGGElement, Marker, any, unknown>): LineAttachementInfo;
}

/**
 * Interface for dynamic text component templates.
 */
export interface DynamicTextComponentTemplate extends DynamicTemplate<TextComponent> {

    /**
     * @override
     * @param g the group that should be updated
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering
     */
    // tslint:disable-next-line:max-line-length
    renderInitialTemplate(g: Selection<SVGGElement, TextComponent, any, unknown>, grapheditor: GraphEditor, context: DynamicChildElementTemplateContext): void;

    /**
     * @override
     * @param g the group that should be updated
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering
     */
    // tslint:disable-next-line:max-line-length
    updateTemplate(g: Selection<SVGGElement, TextComponent, any, unknown>, grapheditor: GraphEditor, context: DynamicChildElementTemplateContext): void;

    /**
     * Same as the `updateTemplate` function but called after text was wrapped.
     *
     * This function can be used to change the template according to the actual text measures.
     *
     * @param g the group that should be updated
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering
     */
    // tslint:disable-next-line:max-line-length
    updateAfterTextwrapping(g: Selection<SVGGElement, TextComponent, any, unknown>, grapheditor: GraphEditor, context: DynamicChildElementTemplateContext): void;
}

export class DefaultTextComponentTemplate implements DynamicTextComponentTemplate {

    // tslint:disable-next-line:max-line-length
    renderInitialTemplate(g: Selection<SVGGElement, TextComponent, any, unknown>, grapheditor: GraphEditor, context: DynamicChildElementTemplateContext): void {
        g.append('text');
    }

    // tslint:disable-next-line:max-line-length
    updateTemplate(g: Selection<SVGGElement, TextComponent, any, unknown>, grapheditor: GraphEditor, context: DynamicChildElementTemplateContext): void {
        g.select('text').attr('width', d => d.width);
    }

    // tslint:disable-next-line:max-line-length
    updateAfterTextwrapping(g: Selection<SVGGElement, TextComponent, any, unknown>, grapheditor: GraphEditor, context: DynamicChildElementTemplateContext): void {
        return;
    }


}
