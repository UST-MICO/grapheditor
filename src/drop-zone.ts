import { Rect } from './util';
import { Point } from './edge';


export interface NodeDropZone {
    id: string;
    bbox: Rect;
    whitelist: Set<string>;
    blacklist: Set<string>;
}

export function *filterDropzonesByType(zones: Map<string, NodeDropZone>, nodeType: string): Iterable<NodeDropZone> {
    nodeType = nodeType || 'default';
    for (const [key, dropZone] of zones) {
        if (!dropZone.whitelist.has(nodeType)) {
            // nodeType is not in whitelist
            if (dropZone.whitelist.size > 0) {
                continue; // whitelist is not empty
            }
            if (dropZone.blacklist.has(nodeType)) {
                continue; // nodeType is in blacklist
            }
        }
        yield dropZone;
    }
}

export function calculateSquaredDistanceFromNodeToDropZone(dropZoneAnchor: Point, dropZone: NodeDropZone, nodePosition: Point): number {
    const dropZonePos = {
        x: dropZoneAnchor.x + dropZone.bbox.x + dropZone.bbox.width / 2,
        y: dropZoneAnchor.y + dropZone.bbox.y + dropZone.bbox.height / 2,
    };
    const distance = ((nodePosition.x - dropZonePos.x) ** 2) + ((nodePosition.y - dropZonePos.y) ** 2);
    return distance;
}
