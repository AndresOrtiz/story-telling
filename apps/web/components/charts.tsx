"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AXES, type ValueTags } from "@cs/schemas";

/** Horizontal magnitude bars with direct labels. One hue, so no legend. */
export function VoteBars({
  rows,
}: {
  rows: { key: string; label: string; count: number; percent: number; names?: string[] | null; top?: boolean }[];
}) {
  const t = useTranslations("results");
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className={r.top ? "font-semibold" : ""}>{r.label}</span>
            <span className="shrink-0 text-sm text-muted tabular-nums">
              {t("votes", { count: r.count })} · {r.percent}%
            </span>
          </div>
          <div className="mt-1 h-3 rounded-sm bg-raised">
            <div
              className={`h-3 rounded-r transition-[width] duration-700 ${r.top ? "bg-amber-deep" : "bg-line"}`}
              style={{ width: `${r.percent}%` }}
            />
          </div>
          {r.names?.length ? <p className="mt-1 text-sm text-muted">{r.names.join(", ")}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** Diverging bars from -2 to 2 around a neutral midline. */
export function TraitBars({ values }: { values: ValueTags }) {
  const t = useTranslations("traits");
  return (
    <ul className="space-y-2.5">
      {AXES.map((a) => {
        const v = values[a];
        const width = (Math.min(2, Math.abs(v)) / 2) * 50;
        return (
          <li key={a} title={`${t(`${a}.low`)} / ${t(`${a}.high`)}: ${v.toFixed(1)}`}>
            <div className="flex justify-between text-sm">
              <span className={v < -0.15 ? "text-ink" : "text-muted"}>{t(`${a}.low`)}</span>
              <span className={v > 0.15 ? "text-ink" : "text-muted"}>{t(`${a}.high`)}</span>
            </div>
            <div className="relative h-2.5 rounded-sm bg-raised" role="img" aria-label={`${t(`${a}.low`)} / ${t(`${a}.high`)}: ${v.toFixed(1)}`}>
              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-muted" />
              <div
                className={`absolute inset-y-0 ${v < 0 ? "rounded-l bg-teal" : "rounded-r bg-amber-deep"}`}
                style={v < 0 ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** How divided the first vote was on each dilemma. Single series with a hover readout and a table. */
export function SplitChart({ data, titles }: { data: { k: number; split: number }[]; titles: Record<number, string> }) {
  const t = useTranslations("analysis");
  const [active, setActive] = useState<number | null>(null);
  if (data.length === 0) return null;
  const W = 600;
  const H = 200;
  const pad = { l: 44, r: 16, t: 16, b: 30 };
  const x = (i: number) => pad.l + (data.length === 1 ? 0 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const shown = active === null ? null : data[active];
  return (
    <figure>
      <figcaption className="mb-1 font-semibold">{t("splitTitle")}</figcaption>
      <p className="min-h-6 text-sm text-muted" aria-hidden>
        {shown ? `${titles[shown.k] ?? shown.k}: ${Math.round(shown.split * 100)}%` : t("splitHint")}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("splitTitle")} onMouseLeave={() => setActive(null)}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--color-muted)">
              {v * 100}%
            </text>
          </g>
        ))}
        {active !== null ? <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} stroke="var(--color-muted)" /> : null}
        <polyline
          points={data.map((d, i) => `${x(i)},${y(d.split)}`).join(" ")}
          fill="none"
          stroke="var(--color-amber-deep)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {data.map((d, i) => (
          <g key={d.k}>
            <circle cx={x(i)} cy={y(d.split)} r="5" fill="var(--color-amber-deep)" stroke="var(--color-panel)" strokeWidth="2" />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--color-muted)">
              {d.k}
            </text>
            <rect
              x={x(i) - 18}
              y={0}
              width={36}
              height={H}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
            />
          </g>
        ))}
      </svg>
      <details className="mt-1 text-sm">
        <summary className="min-h-8 text-muted">{t("asTable")}</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {data.map((d) => (
              <tr key={d.k} className="border-t border-line/50">
                <th scope="row" className="py-1 font-normal">
                  {d.k}. {titles[d.k]}
                </th>
                <td className="py-1 text-right tabular-nums">{Math.round(d.split * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
