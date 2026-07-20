import { Card } from 'antd';
import { ReactNode } from 'react';
import { AES } from '../../theme';
import type { Segment } from './palette';

/** SVG donut with a value in the centre. */
export function Donut({
  segments,
  size = 168,
  stroke = 24,
  centerLabel,
  centerValue,
}: {
  segments: Segment[];
  size?: number;
  stroke?: number;
  centerLabel?: string;
  centerValue?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${c} ${c})`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#eef0f2" strokeWidth={stroke} />
          {total > 0 &&
            segments.map((s, i) => {
              const dash = (s.value / total) * circ;
              const el = (
                <circle
                  key={i}
                  cx={c}
                  cy={c}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += dash;
              return el;
            })}
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{centerValue ?? total}</div>
          {centerLabel && (
            <div style={{ fontSize: 12, color: '#8c96a0', marginTop: 2 }}>{centerLabel}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Colour-keyed legend rows with values. */
export function Legend({ segments }: { segments: Segment[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {segments.map((s) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span
            style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }}
          />
          <span style={{ flex: 1, color: '#4b5563' }}>{s.label}</span>
          <strong>{s.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** SVG area sparkline that scales to its container width. */
export function Sparkline({
  points,
  height = 120,
  color = AES.green,
}: {
  points: number[];
  height?: number;
  color?: string;
}) {
  const width = 600;
  const pad = 8;
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const xy = points.map((p, i) => [
    i * stepX,
    height - pad - ((p - min) / range) * (height - pad * 2),
  ]);
  const line = xy.map((co, i) => `${i ? 'L' : 'M'}${co[0].toFixed(1)},${co[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = `spark-${color.replace('#', '')}`;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Horizontal proportional bars. */
export function BarList({ items }: { items: Segment[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <div style={{ color: '#9aa4af', fontSize: 13 }}>No data yet.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              marginBottom: 4,
            }}
          >
            <span style={{ color: '#4b5563' }}>{it.label}</span>
            <strong>{it.value}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: '#f0f2f4', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(it.value / max) * 100}%`,
                background: it.color,
                borderRadius: 6,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Headline metric card with an accent icon chip. */
export function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
  loading,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent: string;
  loading?: boolean;
}) {
  return (
    <Card styles={{ body: { padding: 18 } }} style={{ borderTop: `3px solid ${accent}`, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 46,
            height: 46,
            borderRadius: 12,
            background: `${accent}1a`,
            color: accent,
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
            {loading ? '—' : value}
          </div>
          <div style={{ fontSize: 13, color: '#8c96a0' }}>{label}</div>
        </div>
      </div>
      {sub != null && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>{sub}</div>
      )}
    </Card>
  );
}
