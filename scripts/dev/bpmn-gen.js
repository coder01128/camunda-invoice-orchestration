// Dev tool: generates a Camunda 8 BPMN file (with diagram layout) from a compact grid spec.
// Used to create the initial processes; the generated .bpmn in processes/ is the source of truth
// afterwards (it is Git-synced with Web Modeler and may be edited there).
//
// Layout: every node sits in a grid cell (col,row). Edges are routed orthogonally.
const fs = require("fs");

const COL_W = 170, ROW_H = 140, X0 = 200, Y0 = 150;
const SIZE = { task: [100, 80], event: [36, 36], gateway: [50, 50] };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&#34;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kind = t => ["start", "end", "signalStart", "signalThrow", "timerCatch", "boundaryTimer", "messageStart"].includes(t) ? "event"
  : t === "gateway" ? "gateway" : "task";

function build(spec) {
  const nodes = spec.nodes, byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edges = spec.edges.map((e, i) => ({ id: e.id || `Flow_${e.from}_${e.to}`, ...e }));
  // geometry
  for (const n of nodes) {
    if (n.type === "boundaryTimer") continue;
    const [w, h] = SIZE[kind(n.type)];
    const cx = X0 + n.col * COL_W, cy = Y0 + n.row * ROW_H;
    Object.assign(n, { w, h, x: cx - w / 2, y: cy - h / 2, cx, cy });
  }
  for (const n of nodes.filter(n => n.type === "boundaryTimer")) {
    const host = byId[n.attachedTo];
    Object.assign(n, { w: 36, h: 36, x: host.x + host.w - 30, y: host.y + host.h - 18 });
    n.cx = n.x + 18; n.cy = n.y + 18;
  }
  const ins = id => edges.filter(e => e.to === id).map(e => e.id), outs = id => edges.filter(e => e.from === id).map(e => e.id);

  // ---------- semantic XML ----------
  const io = n => {
    if (!n.in && !n.out) return "";
    return `<zeebe:ioMapping>${(n.in || []).map(([s, t]) => `<zeebe:input source="${esc(s)}" target="${t}" />`).join("")}` +
      `${(n.out || []).map(([s, t]) => `<zeebe:output source="${esc(s)}" target="${t}" />`).join("")}</zeebe:ioMapping>`;
  };
  const ext = inner => inner ? `<bpmn:extensionElements>${inner}</bpmn:extensionElements>` : "";
  const flows = n => ins(n.id).map(i => `<bpmn:incoming>${i}</bpmn:incoming>`).join("") + outs(n.id).map(o => `<bpmn:outgoing>${o}</bpmn:outgoing>`).join("");
  const doc = n => n.doc ? `<bpmn:documentation>${esc(n.doc)}</bpmn:documentation>` : "";
  const name = n => n.name ? ` name="${esc(n.name)}"` : "";
  const signals = new Set();

  const el = n => {
    const a = `id="${n.id}"${name(n)}`;
    switch (n.type) {
      case "start": return `<bpmn:startEvent ${a}>${doc(n)}${ext((n.form ? `<zeebe:formDefinition formId="${n.form}" />` : "") + io(n))}${flows(n)}</bpmn:startEvent>`;
      case "signalStart": signals.add(n.signal);
        return `<bpmn:startEvent ${a}>${doc(n)}${ext(io(n))}${flows(n)}<bpmn:signalEventDefinition id="${n.id}_def" signalRef="Signal_${n.signal}" /></bpmn:startEvent>`;
      case "end": return `<bpmn:endEvent ${a}>${doc(n)}${ext(io(n))}${flows(n)}</bpmn:endEvent>`;
      case "signalThrow": signals.add(n.signal);
        return `<bpmn:intermediateThrowEvent ${a}>${doc(n)}${ext(io(n))}${flows(n)}<bpmn:signalEventDefinition id="${n.id}_def" signalRef="Signal_${n.signal}" /></bpmn:intermediateThrowEvent>`;
      case "timerCatch":
        return `<bpmn:intermediateCatchEvent ${a}>${doc(n)}${flows(n)}<bpmn:timerEventDefinition id="${n.id}_def"><bpmn:${n.timerKind || "timeDate"} xsi:type="bpmn:tFormalExpression">${esc(n.timer)}</bpmn:${n.timerKind || "timeDate"}></bpmn:timerEventDefinition></bpmn:intermediateCatchEvent>`;
      case "boundaryTimer":
        return `<bpmn:boundaryEvent ${a} cancelActivity="${n.cancel !== false}" attachedToRef="${n.attachedTo}">${flows(n)}<bpmn:timerEventDefinition id="${n.id}_def"><bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${esc(n.timer)}</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:boundaryEvent>`;
      case "gateway": return `<bpmn:exclusiveGateway ${a}${n.default ? ` default="${n.default}"` : ""}>${doc(n)}${flows(n)}</bpmn:exclusiveGateway>`;
      case "script": return `<bpmn:scriptTask ${a}>${doc(n)}${ext(`<zeebe:script expression="${esc(n.expr)}" resultVariable="${n.result}" />` + io(n))}${flows(n)}</bpmn:scriptTask>`;
      case "service": return `<bpmn:serviceTask ${a}>${doc(n)}${ext(`<zeebe:taskDefinition type="${n.taskType || "placeholder"}" />` + io(n))}${flows(n)}</bpmn:serviceTask>`;
      case "brt": return `<bpmn:businessRuleTask ${a}>${doc(n)}${ext(`<zeebe:calledDecision decisionId="${n.decision}" resultVariable="${n.result}" />` + io(n))}${flows(n)}</bpmn:businessRuleTask>`;
      case "user": return `<bpmn:userTask ${a}>${doc(n)}${ext(`<zeebe:userTask />` + (n.form ? `<zeebe:formDefinition formId="${n.form}" />` : "") +
        (n.group ? `<zeebe:assignmentDefinition candidateGroups="${n.group}" />` : "") + io(n))}${flows(n)}</bpmn:userTask>`;
      case "call": return `<bpmn:callActivity ${a}>${doc(n)}${ext(`<zeebe:calledElement processId="${n.process}" propagateAllChildVariables="false" />` + io(n))}${flows(n)}</bpmn:callActivity>`;
      default: throw new Error("unknown type " + n.type);
    }
  };
  const flowXml = e => `<bpmn:sequenceFlow id="${e.id}"${e.name ? ` name="${esc(e.name)}"` : ""} sourceRef="${e.from}" targetRef="${e.to}">` +
    (e.cond ? `<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(e.cond)}</bpmn:conditionExpression>` : "") + `</bpmn:sequenceFlow>`;

  // ---------- routing ----------
  const route = e => {
    const s = byId[e.from], t = byId[e.to];
    const sRight = [s.x + s.w, s.cy], tLeft = [t.x, t.cy];
    if (s.type === "boundaryTimer") {
      const sb = [s.cx, s.y + s.h];
      if (Math.abs(t.cx - s.cx) < 5) return [sb, [t.cx, t.y]];
      return [sb, [s.cx, t.cy], tLeft];
    }
    if (Math.abs(s.cy - t.cy) < 1) return [sRight, tLeft];
    if (s.type === "gateway") { const exit = [s.cx, t.cy > s.cy ? s.y + s.h : s.y]; return [exit, [s.cx, t.cy], tLeft]; }
    if (t.type === "gateway") { const entry = [t.cx, s.cy > t.cy ? t.y + t.h : t.y]; return [sRight, [t.cx, s.cy], entry]; }
    const mx = (s.x + s.w + t.x) / 2; return [sRight, [mx, s.cy], [mx, t.cy], tLeft];
  };
  const shape = n => `<bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${n.type === "gateway" ? ` isMarkerVisible="true"` : ""}><dc:Bounds x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" /></bpmndi:BPMNShape>`;
  const edgeDi = e => `<bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">${route(e).map(([x, y]) => `<di:waypoint x="${x}" y="${y}" />`).join("")}</bpmndi:BPMNEdge>`;

  const body = nodes.map(el).join("\n    ") + "\n    " + edges.map(flowXml).join("\n    ");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_${spec.id}" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Claude Code" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.9.0">
  <bpmn:process id="${spec.id}" name="${esc(spec.name)}" isExecutable="true">
    ${spec.doc ? `<bpmn:documentation>${esc(spec.doc)}</bpmn:documentation>\n    ` : ""}${body}
  </bpmn:process>
  ${[...signals].map(s => `<bpmn:signal id="Signal_${s}" name="${s}" />`).join("\n  ")}
  <bpmndi:BPMNDiagram id="BPMNDiagram_${spec.id}">
    <bpmndi:BPMNPlane id="BPMNPlane_${spec.id}" bpmnElement="${spec.id}">
      ${nodes.filter(n => n.type !== "boundaryTimer").map(shape).join("\n      ")}
      ${nodes.filter(n => n.type === "boundaryTimer").map(shape).join("\n      ")}
      ${edges.map(edgeDi).join("\n      ")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
  return xml;
}

module.exports = { build, write: (spec, file) => fs.writeFileSync(file, build(spec)) };
