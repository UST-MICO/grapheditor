export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface NodeDropZone {
    id: string;
    bbox: Rect;
    whitelist: Set<string>;
    blacklist: Set<string>;
}
