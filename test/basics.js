import {assert} from '/chai/chai.js';

describe('GraphEditor Basics', function () {
    afterEach(function () {
        document.querySelectorAll("network-graph").forEach(graph => graph.remove());
    });
    describe('load element', function () {
        it('element should load correctly', function (done) {
            const nodes = [{"id": "1", "x": 0, "y": 0}];
            const graph = document.createElement("network-graph");
            graph.addEventListener("svginitialized", () => {
                try {
                    assert.deepEqual(graph.nodeList, nodes);
                    done();
                } catch (err) {
                    done(err);
                } finally {
                    graph.remove();
                }
            }, {"once": true});
            document.body.appendChild(graph);
            graph.setAttribute("nodes", JSON.stringify(nodes));
            graph.setAttribute("svg-template", "#basicTemplate");
        });
        it('element should accept new nodes and edges correctly', function (done) {
            const nodes = [{"id": "1", "x": 0, "y": 0}];
            const graph = document.createElement("network-graph");
            graph.setAttribute("nodes", JSON.stringify(nodes));
            graph.setAttribute("svg-template", "#basicTemplate");
            graph.addEventListener("render", () => {
                try {
                    const extraNode = {"id": "2", "x": 10, "y": 0};
                    graph.addNode(extraNode);
                    const edge = {"source": "1", "target": "2"};
                    graph.addEdge(edge);
                    nodes.push(extraNode);
                    assert.deepEqual(graph.nodeList, nodes);
                    assert.deepEqual(graph.edgeList, [edge]);
                    done();
                } catch (err) {
                    done(err);
                } finally {
                    graph.remove();
                }
            }, {"once": true})
            document.body.appendChild(graph);
        });
    });
});
