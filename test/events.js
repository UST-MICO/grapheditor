import {assert} from '/chai/chai.js';
import simulant from '/simulant/simulant.es.js';

// TODO check why test suites need to start with "Array" to work...
describe('Array GraphEditor Events', function () {
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
    });
});
