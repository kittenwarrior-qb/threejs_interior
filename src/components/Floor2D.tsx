import { useEffect, useRef, useState } from 'react';
import { type Vec2 } from '../types';

type Props = {
  vertices: Vec2[];
  onMove: (index: number, v: Vec2) => void;
  onAdd: (v: Vec2) => void;
};

const PX_PER_M = 100; // 1m = 100px
const POINT_R_PX = 8;

export default function Floor2D({ vertices, onMove, onAdd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

    // polygon
    if (vertices.length > 1) {
      ctx.beginPath();
      vertices.forEach((v, i) => {
        const [x, y] = worldToCanvas(v, cx, cy);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,144,255,0.15)';
      ctx.strokeStyle = '#1e90ff';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }

    // points
    ctx.fillStyle = '#ff5a5f';
    vertices.forEach(v => {
      const [x, y] = worldToCanvas(v, cx, cy);
      ctx.beginPath();
      ctx.arc(x, y, POINT_R_PX, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [vertices, offset]);

  function worldToCanvas(v: Vec2, cx: number, cy: number): [number, number] {
    return [cx + v.x * PX_PER_M, cy - v.y * PX_PER_M];
    // y up in world -> y down on canvas
  }
  function canvasToWorld(x: number, y: number, cx: number, cy: number): Vec2 {
    return { x: (x - cx) / PX_PER_M, y: (cy - y) / PX_PER_M };
  }

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number) {
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    const step = PX_PER_M;
    const startX = -Math.ceil(cx / step) * step;
    const startY = -Math.ceil(cy / step) * step;
    for (let x = startX; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x + cx % step, 0); ctx.lineTo(x + cx % step, h); ctx.stroke();
    }
    for (let y = startY; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y + cy % step); ctx.lineTo(w, y + cy % step); ctx.stroke();
    }
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

  function onPointerDown(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const idx = getNearestIndex(px, py);
    if (idx !== null) setDragIndex(idx);
    else {
      const cx = rect.width / 2 + offset.x;
      const cy = rect.height / 2 + offset.y;
      const w = canvasToWorld(px, py, cx, cy);
      onAdd(w);
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragIndex === null) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2 + offset.x;
    const cy = rect.height / 2 + offset.y;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    onMove(dragIndex, canvasToWorld(px, py, cx, cy));
  }
  function onPointerUp() { setDragIndex(null); }

  function onWheel(e: React.WheelEvent) {
    // simple pan with wheel button pressed
    if (e.buttons !== 1) return;
    setOffset(o => ({ x: o.x - e.deltaX, y: o.y - e.deltaY }));
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>
        2D Blueprint — click để thêm điểm, kéo để di chuyển
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
    </div>
  );
}