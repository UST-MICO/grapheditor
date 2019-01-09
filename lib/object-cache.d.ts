import { Node } from './node';
import { Edge } from './edge';
import { LinkHandle } from './link-handle';
export declare class GraphObjectCache {
    private nodeTemplates;
    private nodeTemplateLinkHandles;
    private markerTemplates;
    private nodes;
    private edges;
    private edgesBySource;
    private edgesByTarget;
    constructor();
    updateNodeTemplateCache(templates: {
        id: string;
        innerHTML: string;
        [prop: string]: any;
    }[]): void;
    updateMarkerTemplateCache(templates: {
        id: string;
        innerHTML: string;
        [prop: string]: any;
    }[]): void;
    updateNodeCache(nodes: Node[]): void;
    updateEdgeCache(edges: Edge[]): void;
    getMarkerTemplate(markerType: string): string;
    getNodeTemplateId(nodeType: string): string;
    getNodeTemplate(nodeType: string): string;
    setNodeTemplateLinkHandles(nodeType: string, linkHandles: LinkHandle[]): void;
    getNodeTemplateLinkHandles(nodeType: string): LinkHandle[];
    getNode(id: number | string): Node;
    getEdge(id: number | string): Edge;
    getEdgesByTarget(targetId: number | string): Set<Edge>;
    getEdgesBySource(targetId: number | string): Set<Edge>;
    getEdgeLinkHandles(edge: Edge): {
        sourceHandle: LinkHandle;
        sourceCoordinates: {
            x: number;
            y: number;
        };
        targetHandle: LinkHandle;
        targetCoordinates: {
            x: any;
            y: any;
        };
    };
    private calculateNearestHandles;
}
