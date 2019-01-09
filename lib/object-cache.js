"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const d3_1 = require("d3");
const edge_1 = require("./edge");
const templates_1 = require("./templates");
const link_handle_1 = require("./link-handle");
class GraphObjectCache {
    constructor() {
        this.nodeTemplates = d3_1.map();
        this.nodeTemplateLinkHandles = d3_1.map();
        this.markerTemplates = d3_1.map();
        this.nodes = d3_1.map();
        this.edges = d3_1.map();
        this.edgesBySource = d3_1.map();
        this.edgesByTarget = d3_1.map();
    }
    updateNodeTemplateCache(templates) {
        const templateMap = d3_1.map();
        templates.forEach((template) => templateMap.set(template.id, template.innerHTML));
        this.nodeTemplates = templateMap;
        this.nodeTemplateLinkHandles = d3_1.map();
    }
    updateMarkerTemplateCache(templates) {
        const templateMap = d3_1.map();
        templates.forEach((template) => templateMap.set(template.id, template.innerHTML));
        this.markerTemplates = templateMap;
    }
    updateNodeCache(nodes) {
        const nodeMap = d3_1.map();
        nodes.forEach((node) => nodeMap.set(node.id.toString(), node));
        this.nodes = nodeMap;
    }
    updateEdgeCache(edges) {
        const edgeMap = d3_1.map();
        const bySourceMap = d3_1.map();
        const byTargetMap = d3_1.map();
        edges.forEach((edge) => {
            edgeMap.set(edge_1.edgeId(edge), edge);
            let bySource = bySourceMap.get(edge.source.toString());
            if (bySource == null) {
                bySource = new Set();
                bySourceMap.set(edge.source.toString(), bySource);
            }
            bySource.add(edge);
            let byTarget = byTargetMap.get(edge.target.toString());
            if (byTarget == null) {
                byTarget = new Set();
                byTargetMap.set(edge.target.toString(), byTarget);
            }
            bySource.add(edge);
        });
        this.edges = edgeMap;
        this.edgesBySource = bySourceMap;
        this.edgesByTarget = byTargetMap;
    }
    getMarkerTemplate(markerType) {
        if (markerType == null) {
            console.log('Marker type was null!');
            return;
        }
        return this.markerTemplates.get(markerType);
    }
    getNodeTemplateId(nodeType) {
        if (nodeType == null || !this.nodeTemplates.has(nodeType)) {
            return 'default';
        }
        else {
            return nodeType;
        }
    }
    getNodeTemplate(nodeType) {
        if (nodeType == null) {
            nodeType = 'default';
        }
        let template = this.nodeTemplates.get(nodeType);
        if (template == null) {
            template = this.nodeTemplates.get('default');
        }
        if (template == null) {
            template = templates_1.DEFAULT_NODE_TEMPLATE;
        }
        return template;
    }
    setNodeTemplateLinkHandles(nodeType, linkHandles) {
        nodeType = this.getNodeTemplateId(nodeType);
        this.nodeTemplateLinkHandles.set(nodeType, linkHandles);
    }
    getNodeTemplateLinkHandles(nodeType) {
        nodeType = this.getNodeTemplateId(nodeType);
        return this.nodeTemplateLinkHandles.get(nodeType);
    }
    getNode(id) {
        return this.nodes.get(id.toString());
    }
    getEdge(id) {
        return this.edges.get(id.toString());
    }
    getEdgesByTarget(targetId) {
        const edges = this.edgesByTarget.get(targetId.toString());
        if (edges == null) {
            return new Set();
        }
        return edges;
    }
    getEdgesBySource(targetId) {
        const edges = this.edgesBySource.get(targetId.toString());
        if (edges == null) {
            return new Set();
        }
        return edges;
    }
    getEdgeLinkHandles(edge) {
        const source = this.getNode(edge.source);
        const target = edge.target != null ? this.getNode(edge.target) : edge.currentTarget;
        const sourceHandles = edge.sourceHandle != null ? [edge.sourceHandle] : this.getNodeTemplateLinkHandles(source.type);
        let targetHandles;
        if (edge.targetHandle != null) {
            targetHandles = [edge.targetHandle];
        }
        else if (edge.target != null) {
            targetHandles = this.getNodeTemplateLinkHandles(target.type);
        }
        else {
            // target only null for dragged edges
            targetHandles = [{ id: 0, x: 0, y: 0 }];
        }
        const result = this.calculateNearestHandles(sourceHandles, source, targetHandles, target);
        return {
            sourceHandle: result.sourceHandle,
            sourceCoordinates: { x: (source.x + result.sourceHandle.x), y: (source.y + result.sourceHandle.y) },
            targetHandle: result.targetHandle,
            targetCoordinates: { x: (target.x + result.targetHandle.x), y: (target.y + result.targetHandle.y) },
        };
    }
    calculateNearestHandles(sourceHandles, source, targetHandles, target) {
        let currentSourceHandle = { id: 0, x: 0, y: 0, normal: { dx: 1, dy: 1 } };
        if (sourceHandles != null && sourceHandles.length > 0) {
            currentSourceHandle = sourceHandles[0];
        }
        else {
            link_handle_1.calculateNormal(currentSourceHandle);
        }
        let currentTargetHandle = { id: 0, x: 0, y: 0, normal: { dx: 1, dy: 1 } };
        if (targetHandles != null && targetHandles.length > 0) {
            currentTargetHandle = targetHandles[0];
        }
        else {
            link_handle_1.calculateNormal(currentTargetHandle);
        }
        let currentDist = Math.pow((source.x + currentSourceHandle.x) - target.x, 2) +
            Math.pow((source.y + currentSourceHandle.y) - target.y, 2);
        targetHandles.forEach((targetHandle) => {
            for (let i = 0; i < sourceHandles.length; i++) {
                const handle = sourceHandles[i];
                const dist = Math.pow((source.x + handle.x) - (target.x + targetHandle.x), 2) +
                    Math.pow((source.y + handle.y) - (target.y + targetHandle.y), 2);
                if (dist <= currentDist) {
                    currentSourceHandle = handle;
                    currentTargetHandle = targetHandle;
                    currentDist = dist;
                }
            }
        });
        return {
            sourceHandle: currentSourceHandle,
            targetHandle: currentTargetHandle,
        };
    }
}
exports.GraphObjectCache = GraphObjectCache;
//# sourceMappingURL=object-cache.js.map