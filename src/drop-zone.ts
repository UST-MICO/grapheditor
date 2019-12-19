import { Rect } from './util';


export interface NodeDropZone {
    id: string;
    bbox: Rect;
    whitelist: Set<string>;
    blacklist: Set<string>;
}
