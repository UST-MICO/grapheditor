import {assert} from '/chai/chai.js';
import simulant from '/simulant/simulant.es.js';

function _fireEventsSequentially(events) {
    const nextEvent = events.pop();
    if (nextEvent == null) {
        return;
    }
    window.requestIdleCallback(() => {
        nextEvent();
        _fireEventsSequentially(events);
    });
}

describe('GraphEditor Events', function () {
    afterEach(function () {
        document.querySelectorAll("network-graph").forEach(graph => graph.remove());
    });
    describe('node events', function () {
        it('node click event should fire', function (done) {
            const node = {"id": "1", "x": 0, "y": 0};
            const graph = document.createElement("network-graph");
            graph.addEventListener("render", () => {
                try {
                    const nodeGroup = graph.getNodeSelection(node.id).node();
                    simulant.fire(nodeGroup, "click");
                } catch (err) {
                    done(err);
                }
            }, {"once": true});
            graph.addEventListener("nodeclick", function (event) {
                try {
                    assert.equal(event.detail.eventSource, "USER_INTERACTION");
                    assert.deepEqual(event.detail.node, node);
                    done();
                } catch (err) {
                    done(err);
                } finally {
                    graph.remove();
                }
            }, {"once": true});
            document.body.appendChild(graph);
            graph.setAttribute("nodes", JSON.stringify([node]));
            graph.setAttribute("svg-template", "#basicTemplate");
        });
        it('node position change event should fire on move by api', function (done) {
            const node = {"id": "1", "x": 0, "y": 0};
            const graph = document.createElement("network-graph");
            graph.addEventListener("render", () => {
                try {
                    graph.moveNode(node.id, 10, 0);
                } catch (err) {
                    done(err);
                }
            }, {"once": true});
            graph.addEventListener("nodepositionchange", function (event) {
                try {
                    assert.equal(event.detail.eventSource, "API");
                    assert.deepEqual(event.detail.node, {"id": "1", "x": 10, "y": 0});
                    done();
                } catch (err) {
                    done(err);
                } finally {
                    graph.remove();
                }
            }, {"once": true});
            document.body.appendChild(graph);
            graph.setAttribute("nodes", JSON.stringify([node]));
            graph.setAttribute("svg-template", "#basicTemplate");
        });
        it('node position change event should fire on move by user', function (done) {
            const node = {"id": "1", "x": 0, "y": 0};
            const graph = document.createElement("network-graph");
            let dragStart = null;
            let move = null;
            let moveLength = 10;
            graph.addEventListener("zoomchange", () => {
                try {
                    const nodeGroup = graph.getNodeSelection(node.id).node();
                    const nodeDim = nodeGroup.getBoundingClientRect();
                    const clientX = nodeDim.x + (nodeDim.width/2);
                    const clientY = nodeDim.y + (nodeDim.height/2);
                    const width = moveLength * graph.currentZoom.k;
                    const events = [
                        () => simulant.fire(nodeGroup, "mousedown", {screenX: clientX, screenY: clientY, clientX: clientX, clientY: clientY, button: 0}),
                        () => simulant.fire(window,"mousemove", {screenX: clientX+width, screenY: clientY, clientX: clientX+width, clientY: clientY, movementX: width, movementY: 0}),
                        () => simulant.fire(window, "mouseup", {screenX: clientX+width, screenY: clientY, clientX: clientX+width, clientY: clientY, button: 0, buttons: 0, movementX: 0, movementY: 0}),
                    ].reverse(); // reverse so that pop works correctly later
                    _fireEventsSequentially(events);
                } catch (err) {
                    done(err);
                }
            }, {"once": true});
            graph.addEventListener("nodedragstart", function (event) {
                dragStart = event.detail;
            }, {"once": true});
            graph.addEventListener("nodepositionchange", function (event) {
                move = event.detail;
            }, {"once": true});
            graph.addEventListener("nodedragend", function (event) {
                try {
                    assert.equal(dragStart.eventSource, "USER_INTERACTION", "incorrect/missing node drag start event");
                    assert.equal(move.eventSource, "USER_INTERACTION", "incorrect/missing node position changed event");
                    assert.equal(event.detail.eventSource, "USER_INTERACTION");
                    const finalNode = event.detail.node;
                    assert.equal(finalNode.id, node.id);
                    assert.approximately(finalNode.x, 10, 0.1);
                    assert.equal(finalNode.y, node.y);
                    done();
                } catch (err) {
                    done(err);
                } finally {
                    graph.remove();
                }
            }, {"once": true});
            document.body.appendChild(graph);
            graph.setAttribute("nodes", JSON.stringify([node]));
            graph.setAttribute("svg-template", "#basicTemplate");
        });
    });
});
