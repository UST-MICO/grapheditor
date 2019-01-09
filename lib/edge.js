"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Return edge id if set or calculate a new id from target and source.
 *
 * @param edge edge to get the id from
 */
function edgeId(edge) {
    if (edge.id != null) {
        return edge.id.toString();
    }
    return `s${edge.source},t${edge.target}`;
}
exports.edgeId = edgeId;
//# sourceMappingURL=edge.js.map