import { Selection } from 'd3';
import { Node } from '../node';
import { Marker } from '../marker';
import GraphEditor from '../grapheditor';
import { LinkHandle } from '../link-handle';
import { Edge } from '../edge';

export interface DynamicTemplateContext<T extends Node|LinkHandle|Marker|Edge> {
    [prop: string]: any;
}

export interface DynamicMarkerTemplateContext extends DynamicTemplateContext<Marker|LinkHandle> {
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
export interface DynamicTemplate<T extends Node|Marker> {

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
    getLinkHandles(Node, grapheditor: GraphEditor): LinkHandle[];
}

/**
 * Interface for dynamic templates for graph nodes.
 */
export interface DynamicMarkerTemplate extends DynamicTemplate<Marker|LinkHandle> {

    /**
     * @override
     * @param g the group that should be updated
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering
     */
    // tslint:disable-next-line:max-line-length
    renderInitialTemplate(g: Selection<SVGGElement, Marker|LinkHandle, any, unknown>, grapheditor: GraphEditor, context: DynamicMarkerTemplateContext): void;

    /**
     * @override
     * @param g the group that should be updated
     * @param grapheditor the grapheditor managing this graph
     * @param context additional context for rendering
     */
    // tslint:disable-next-line:max-line-length
    updateTemplate(g: Selection<SVGGElement, Marker|LinkHandle, any, unknown>, grapheditor: GraphEditor, context: DynamicMarkerTemplateContext): void;
}
