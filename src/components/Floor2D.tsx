import { useEffect, useRef, useState } from 'react';
import { FiImage, FiPlus, FiBox, FiMove, FiRotateCw } from 'react-icons/fi';
import { type Vec2 } from '../types';

type Props = {
  vertices: Vec2[];
  onMove: (index: number, v: Vec2) => void;
  onAdd?: (v: Vec2) => void; // optional: used by Add Vertex button
  onInsert?: (index: number, v: Vec2) => void; // insert at index
  onDelete: (index: number) => void;
};

const MIN_PX_PER_M = 20;
const MAX_PX_PER_M = 400;
const POINT_R_PX = 8;

export default function Floor2D({ vertices, onMove, onInsert, onDelete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const mergeCandidateRef = useRef<number | null>(null);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pxPerM, setPxPerM] = useState<number>(100);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [dragEdge, setDragEdge] = useState<number | null>(null);
  const prevPointerWorldRef = useRef<Vec2 | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const [hoverVertex, setHoverVertex] = useState<number | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const [isAddMode, setIsAddMode] = useState<boolean>(false);
  const [addPreview, setAddPreview] = useState<{ edge: number; p: Vec2 } | null>(null);

  // Object selection/transform mode (move/rotate whole polygon)
  const [isObjectMode, setIsObjectMode] = useState<boolean>(false);
  const [objectSelected, setObjectSelected] = useState<boolean>(false);
  const [objectTool, setObjectTool] = useState<'translate' | 'rotate'>('translate');
  const objectDragStartRef = useRef<Vec2 | null>(null);
  const objectCenterRef = useRef<Vec2 | null>(null);
  const objectStartAngleRef = useRef<number | null>(null);
  const originalVertsRef = useRef<Vec2[] | null>(null);

  function computePolygonAreaM2(pts: Vec2[]): number {
    if (pts.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(sum) * 0.5;
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // center world -> canvas
    const cx = rect.width / 2 + offset.x;
    const cy = rect.height / 2 + offset.y;

    // grid
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, rect.width, rect.height);
    drawGrid(ctx, rect.width, rect.height, cx, cy);

    // polygon + edges + labels
    if (vertices.length > 1) {
      // fill polygon
      ctx.beginPath();
      vertices.forEach((v, i) => {
        const [x, y] = worldToCanvas(v, cx, cy);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,144,255,0.12)';
      ctx.fill();

      // draw edges with potential highlight and length labels
      const n = vertices.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const v1 = vertices[i];
        const v2 = vertices[j];
        const [x1, y1] = worldToCanvas(v1, cx, cy);
        const [x2, y2] = worldToCanvas(v2, cx, cy);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const isSel = selectedEdge === i;
        const isHover = hoverEdge === i;
        ctx.lineWidth = isSel ? 4 : isHover ? 3 : 2;
        ctx.strokeStyle = isSel ? '#ff8c00' : isHover ? '#00c2ff' : '#1e90ff';
        ctx.stroke();

        // length label (in meters)
        const lenM = Math.hypot(v2.x - v1.x, v2.y - v1.y);
        const label = `${lenM.toFixed(2)} m`;
        const midx = (x1 + x2) / 2;
        const midy = (y1 + y2) / 2;
        drawLabel(ctx, label, midx, midy);
      }
    }

    // add-mode preview point on edge
    if (isAddMode && addPreview) {
      const rect = canvas.getBoundingClientRect();
      const cx2 = rect.width / 2 + offset.x;
      const cy2 = rect.height / 2 + offset.y;
      const [px, py] = worldToCanvas(addPreview.p, cx2, cy2);
      ctx.beginPath();
      ctx.arc(px, py, POINT_R_PX + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,0,0,0.5)';
      ctx.fill();
    }

    // points
    vertices.forEach((v, idx) => {
      const [x, y] = worldToCanvas(v, cx, cy);
      const isSel = selectedVertex === idx;
      const isHover = hoverVertex === idx;
      ctx.beginPath();
      ctx.arc(x, y, POINT_R_PX + (isSel ? 2 : isHover ? 1 : 0), 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#ff8c00' : isHover ? '#00c2ff' : '#ff5a5f';
      ctx.fill();
    });

    // object selection outline
    if (isObjectMode && objectSelected && vertices.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#8a2be2';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      vertices.forEach((v, i) => {
        const [x, y] = worldToCanvas(v, cx, cy);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // draw area label (bottom-left)
    const areaM2 = computePolygonAreaM2(vertices);
    const areaText = `${areaM2.toFixed(2)} m²`;
    const padX = 8, padY = 6;
    ctx.font = '13px system-ui, -apple-system, Segoe UI, Roboto';
    const metrics = ctx.measureText(areaText);
    const boxW = metrics.width + padX * 2;
    const boxH = 18 + padY * 2;
    const bx = 10, by = rect.height - boxH - 10;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(areaText, bx + padX, by + boxH / 2 + 1);
  }, [vertices, offset, selectedEdge, selectedVertex, hoverEdge, hoverVertex, isAddMode, addPreview, isObjectMode, objectSelected, pxPerM, containerSize.w, containerSize.h]);

  // Track container size changes (e.g., when splitter moves) and trigger redraw
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setContainerSize({ w: Math.floor(cr.width), h: Math.floor(cr.height) });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  function worldToCanvas(v: Vec2, cx: number, cy: number): [number, number] {
    return [cx + v.x * pxPerM, cy - v.y * pxPerM];
  }
  function canvasToWorld(x: number, y: number, cx: number, cy: number): Vec2 {
    return { x: (x - cx) / pxPerM, y: (cy - y) / pxPerM };
  }

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number) {
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    const step = pxPerM;
    const startX = -Math.ceil(cx / step) * step;
    const startY = -Math.ceil(cy / step) * step;
    for (let x = startX; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x + cx % step, 0); ctx.lineTo(x + cx % step, h); ctx.stroke();
    }
    for (let y = startY; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y + cy % step); ctx.lineTo(w, y + cy % step); ctx.stroke();
    }
  }

  function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const padX = 6, padY = 3;
    const metrics = ctx.measureText(text);
    const w = metrics.width + padX * 2;
    const h = 14 + padY * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.fillText(text, x, y + 1);
  }

  function getNearestIndex(px: number, py: number): number | null {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2 + offset.x;
    const cy = rect.height / 2 + offset.y;
    let best = -1, bestD2 = (POINT_R_PX + 6) ** 2;
    vertices.forEach((v, i) => {
      const [vx, vy] = worldToCanvas(v, cx, cy);
      const d2 = (vx - px) ** 2 + (vy - py) ** 2;
      if (d2 <= bestD2) { bestD2 = d2; best = i; }
    });
    return best >= 0 ? best : null;
  }

  function getNearestEdge(px: number, py: number): number | null {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2 + offset.x;
    const cy = rect.height / 2 + offset.y;
    const threshold = 10;
    let bestEdge = -1;
    let bestD = threshold;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      const [x1, y1] = worldToCanvas(vertices[i], cx, cy);
      const [x2, y2] = worldToCanvas(vertices[j], cx, cy);
      const d = pointToSegmentDistance(px, py, x1, y1, x2, y2);
      if (d <= bestD) { bestD = d; bestEdge = i; }
    }
    return bestEdge >= 0 ? bestEdge : null;
  }

  function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const vx = x2 - x1, vy = y2 - y1;
    const wx = px - x1, wy = py - y1;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - x1, py - y1);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - x2, py - y2);
    const b = c1 / c2;
    const bx = x1 + b * vx, by = y1 + b * vy;
    return Math.hypot(px - bx, py - by);
  }

  function onPointerDown(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (e.button === 2 || e.button === 1) {
      setIsPanning(true);
      lastPanRef.current = { x: px, y: py };
      return;
    }
    if (isAddMode) {
      const eIdx = getNearestEdge(px, py);
      if (eIdx !== null && onInsert) {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.width / 2 + offset.x;
        const cy = rect.height / 2 + offset.y;
        const i = eIdx, j = (i + 1) % vertices.length;
        const pWorld = canvasToWorld(px, py, cx, cy);
        const proj = projectPointOnSegment(pWorld, vertices[i], vertices[j]);
        onInsert(j, proj);
        setIsAddMode(false);
        setAddPreview(null);
        setHoverEdge(null);
        return;
      }
    }

    if (isObjectMode) {
      setObjectSelected(true);
      const rect2 = canvas.getBoundingClientRect();
      const cx2 = rect2.width / 2 + offset.x;
      const cy2 = rect2.height / 2 + offset.y;
      const p = canvasToWorld(px, py, cx2, cy2);
      objectDragStartRef.current = p;
      const center = getCentroid(vertices);
      objectCenterRef.current = center;
      originalVertsRef.current = vertices.map(v => ({ x: v.x, y: v.y }));
      if (objectTool === 'rotate') {
        objectStartAngleRef.current = Math.atan2(p.y - center.y, p.x - center.x);
      } else {
        objectStartAngleRef.current = null;
      }
      return;
    }
    const vIdx = getNearestIndex(px, py);
    if (vIdx !== null) {
      setDragIndex(vIdx);
      setSelectedVertex(vIdx);
      setDragEdge(null);
      setSelectedEdge(null);
      prevPointerWorldRef.current = null;
      return;
    }
    const eIdx = getNearestEdge(px, py);
    if (eIdx !== null) {
      setSelectedEdge(eIdx);
      setDragEdge(eIdx);
      const cx = rect.width / 2 + offset.x;
      const cy = rect.height / 2 + offset.y;
      prevPointerWorldRef.current = canvasToWorld(px, py, cx, cy);
      return;
    }
    // empty click -> clear selection and start panning
    setSelectedVertex(null);
    setSelectedEdge(null);
    setIsPanning(true);
    lastPanRef.current = { x: px, y: py };
  }
  function onPointerMove(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (isPanning) {
      const last = lastPanRef.current;
      if (last) {
        const dx = px - last.x;
        const dy = py - last.y;
        setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
        lastPanRef.current = { x: px, y: py };
      }
      return;
    }

    // object transform drag
    if (isObjectMode && objectSelected && objectDragStartRef.current) {
      const rect2 = canvas.getBoundingClientRect();
      const cx2 = rect2.width / 2 + offset.x;
      const cy2 = rect2.height / 2 + offset.y;
      const p = canvasToWorld(px, py, cx2, cy2);
      const center = objectCenterRef.current!;
      const originals = originalVertsRef.current!;
      if (objectTool === 'translate') {
        const dx = p.x - objectDragStartRef.current.x;
        const dy = p.y - objectDragStartRef.current.y;
        originals.forEach((ov, i) => {
          onMove(i, { x: ov.x + dx, y: ov.y + dy });
        });
      } else if (objectTool === 'rotate') {
        const startA = objectStartAngleRef.current ?? 0;
        const currA = Math.atan2(p.y - center.y, p.x - center.x);
        const dA = currA - startA;
        const sinA = Math.sin(dA), cosA = Math.cos(dA);
        originals.forEach((ov, i) => {
          const rx = cosA * (ov.x - center.x) - sinA * (ov.y - center.y) + center.x;
          const ry = sinA * (ov.x - center.x) + cosA * (ov.y - center.y) + center.y;
          onMove(i, { x: rx, y: ry });
        });
      }
      return;
    }
    // hover detection when not dragging
    const hv = getNearestIndex(px, py);
    setHoverVertex(hv);
    const he = hv !== null ? null : getNearestEdge(px, py);
    setHoverEdge(he);
    if (isAddMode && he !== null) {
      const cx = rect.width / 2 + offset.x;
      const cy = rect.height / 2 + offset.y;
      const i = he, j = (i + 1) % vertices.length;
      const pWorld = canvasToWorld(px, py, cx, cy);
      const proj = projectPointOnSegment(pWorld, vertices[i], vertices[j]);
      setAddPreview({ edge: he, p: proj });
    } else if (isAddMode) {
      setAddPreview(null);
    }
    const cx = rect.width / 2 + offset.x;
    const cy = rect.height / 2 + offset.y;
    if (dragEdge !== null) {
      const prev = prevPointerWorldRef.current;
      const curr = canvasToWorld(px, py, cx, cy);
      if (!prev) { prevPointerWorldRef.current = curr; return; }
      let dx = curr.x - prev.x;
      let dy = curr.y - prev.y;
      const i = dragEdge;
      const j = (i + 1) % vertices.length;
      // project delta: default move perpendicular to edge; Ctrl => axis constrained
      if (e.ctrlKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
      } else {
        const ex = vertices[j].x - vertices[i].x;
        const ey = vertices[j].y - vertices[i].y;
        const len = Math.hypot(ex, ey) || 1;
        // normal (perpendicular) unit
        const nx = -ey / len;
        const ny = ex / len;
        const proj = dx * nx + dy * ny;
        dx = nx * proj;
        dy = ny * proj;
      }
      onMove(i, { x: vertices[i].x + dx, y: vertices[i].y + dy });
      onMove(j, { x: vertices[j].x + dx, y: vertices[j].y + dy });
      prevPointerWorldRef.current = curr;
      return;
    }
    if (dragIndex === null) return;
    let target = canvasToWorld(px, py, cx, cy);
    // Shift+drag: keep adjacent edges axis-aligned (horizontal/vertical)
    if (e.shiftKey && vertices.length >= 2) {
      const n = vertices.length;
      const prev = vertices[(dragIndex - 1 + n) % n];
      const next = vertices[(dragIndex + 1) % n];
      const candidates: Vec2[] = [
        { x: target.x, y: prev.y }, // align horizontally with prev
        { x: prev.x, y: target.y }, // align vertically with prev
        { x: target.x, y: next.y }, // align horizontally with next
        { x: next.x, y: target.y }, // align vertically with next
      ];
      let best = candidates[0];
      let bestD2 = (best.x - target.x) ** 2 + (best.y - target.y) ** 2;
      for (let i = 1; i < candidates.length; i++) {
        const c = candidates[i];
        const d2 = (c.x - target.x) ** 2 + (c.y - target.y) ** 2;
        if (d2 < bestD2) { best = c; bestD2 = d2; }
      }
      target = best;
    }
    onMove(dragIndex, target);

    // When dragged near another vertex, snap and prepare to merge
    const MERGE_SNAP_PX = 10;
    const [tx, ty] = worldToCanvas(target, cx, cy);
    let candidate: number | null = null;
    let bestD = MERGE_SNAP_PX;
    for (let i = 0; i < vertices.length; i++) {
      if (i === dragIndex) continue;
      const [vx, vy] = worldToCanvas(vertices[i], cx, cy);
      const d = Math.hypot(vx - tx, vy - ty);
      if (d <= bestD) { bestD = d; candidate = i; }
    }
    mergeCandidateRef.current = candidate;
    if (candidate !== null) {
      // visual snap while dragging
      onMove(dragIndex, { x: vertices[candidate].x, y: vertices[candidate].y });
    }
  }
  function onPointerUp() {
    // If we have a merge candidate, merge by deleting the dragged vertex
    if (dragIndex !== null && mergeCandidateRef.current !== null) {
      onDelete(dragIndex);
    }
    mergeCandidateRef.current = null;
    setDragIndex(null);
    setDragEdge(null);
    setIsPanning(false);
    lastPanRef.current = null;
    prevPointerWorldRef.current = null;
    objectDragStartRef.current = null;
    originalVertsRef.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cx = rect.width / 2 + offset.x;
    const cy = rect.height / 2 + offset.y;
    const worldBefore = canvasToWorld(px, py, cx, cy);
    const nextScale = Math.min(MAX_PX_PER_M, Math.max(MIN_PX_PER_M, pxPerM * Math.exp(-e.deltaY * 0.001)));
    setPxPerM(nextScale);
    // keep cursor anchored
    const newCx = rect.width / 2 + offset.x;
    const newCy = rect.height / 2 + offset.y;
    const newPx = newCx + worldBefore.x * nextScale;
    const newPy = newCy - worldBefore.y * nextScale;
    setOffset(o => ({ x: o.x + (px - newPx), y: o.y + (py - newPy) }));
  }
  function projectPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
    const abx = b.x - a.x; const aby = b.y - a.y;
    const apx = p.x - a.x; const apy = p.y - a.y;
    const ab2 = abx * abx + aby * aby || 1;
    let t = (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    return { x: a.x + abx * t, y: a.y + aby * t };
  }

  function getCentroid(pts: Vec2[]): Vec2 {
    if (pts.length === 0) return { x: 0, y: 0 };
    const sx = pts.reduce((s, v) => s + v.x, 0);
    const sy = pts.reduce((s, v) => s + v.y, 0);
    return { x: sx / pts.length, y: sy / pts.length };
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && selectedVertex !== null && vertices.length > 3) {
        onDelete(selectedVertex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedVertex, vertices.length, onDelete]);

  return (
    <div ref={containerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <HeaderBar
        onExportPNG={() => {
          const canvas = canvasRef.current; if (!canvas) return;
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a'); a.href = url; a.download = 'blueprint-2d.png'; a.click();
        }}
        isAddMode={isAddMode}
        toggleAddMode={() => setIsAddMode(m => !m)}
        isObjectMode={isObjectMode}
        toggleObjectMode={() => { setIsObjectMode(m => !m); setObjectSelected(false); }}
        objectTool={objectTool}
        setObjectTool={setObjectTool}
      />
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: isPanning ? 'grabbing' : isObjectMode ? (objectTool === 'rotate' ? 'crosshair' : 'move') : (hoverVertex !== null || hoverEdge !== null) ? 'pointer' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

type HeaderBarProps = {
  onExportPNG: () => void;
  isAddMode: boolean;
  toggleAddMode: () => void;
  isObjectMode: boolean;
  toggleObjectMode: () => void;
  objectTool: 'translate' | 'rotate';
  setObjectTool: (t: 'translate' | 'rotate') => void;
};

function HeaderBar(props: HeaderBarProps) {
  const { onExportPNG, isAddMode, toggleAddMode, isObjectMode, toggleObjectMode,  objectTool, setObjectTool } = props;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const IconBtn = ({ id, active, title, onClick, children }: { id: string; active?: boolean; title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      title={title}
      onMouseEnter={() => setHoverId(id)}
      onMouseLeave={() => setHoverId(h => h === id ? null : h)}
      onClick={onClick}
      style={{ width: 40, height: 40, border: '1px solid #dcdfe3', borderRadius: 6, background: active ? '#e9ecef' : (hoverId === id ? '#f4f5f7' : '#ffffff'), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >{children}</button>
  );
  return (
    <div style={{ padding: '6px 10px', borderBottom: '1px solid #e6e8eb', display: 'flex', alignItems: 'center', gap: 8, background: '#333333' }}>
      <IconBtn id="add" title={isAddMode ? 'Exit Add Vertex' : 'Add Vertex'} onClick={toggleAddMode} active={isAddMode}><FiPlus style={{ fontSize: 16 }} /></IconBtn>
      <IconBtn id="obj" title={isObjectMode ? 'Exit Object Mode' : 'Object Mode'} onClick={toggleObjectMode} active={isObjectMode}><FiBox style={{ fontSize: 16 }} /></IconBtn>
      {isObjectMode && (
        <>
          <IconBtn id="move" title="Move" onClick={() => setObjectTool('translate')} active={objectTool === 'translate'}><FiMove style={{ fontSize: 16 }} /></IconBtn>
          <IconBtn id="rotate" title="Rotate" onClick={() => setObjectTool('rotate')} active={objectTool === 'rotate'}><FiRotateCw style={{ fontSize: 16 }} /></IconBtn>
        </>
      )}
      <IconBtn id="png" title="Export PNG" onClick={onExportPNG}><FiImage style={{ fontSize: 16 }} /></IconBtn>
    </div>
  );
}