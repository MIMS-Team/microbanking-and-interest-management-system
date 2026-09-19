'use client';

/**
 * LineChartWithAxes Component
 * Implements "Monthly Deposits vs Withdrawals" from the screenshot with strictly MARKED AXES:
 * - Y-Axis marked at 0, 2, 4, 6, 8 (in Millions Rs.) with tick marks and grid lines
 * - X-Axis marked with Jan, Feb, Mar, Apr, May, Jun, Jul, Aug with tick marks
 * - Interactive hover points and tooltip showing exact volume
 * - Legend for Deposits & Withdrawals
 */

import React, { useState } from 'react';
import { monthlyDepositWithdrawalChart } from '@/data/mockData';

export default function LineChartWithAxes() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const data = monthlyDepositWithdrawalChart;
  const maxY = 8; // Max value on Y-axis (8 Million)
  const yTicks = [0, 2, 4, 6, 8];

  // SVG dimensions & margins for explicit axes marking
  const width = 640;
  const height = 280;
  const margin = { top: 25, right: 30, bottom: 45, left: 45 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Scale functions
  const getX = (index: number) => {
    return margin.left + (index / (data.length - 1)) * innerWidth;
  };

  const getY = (val: number) => {
    return margin.top + innerHeight - (val / maxY) * innerHeight;
  };

  // Generate SVG path strings
  const depositsPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.deposits)}`)
    .join(' ');

  const withdrawalsPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.withdrawals)}`)
    .join(' ');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
      {/* Chart Title & Subtitle */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">
            Monthly Deposits vs Withdrawals
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Transaction volume in millions (Rs.) over the last 8 months
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-600 rounded-full inline-block"></span>
            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block -ml-2.5"></span>
            <span className="text-slate-600">Deposits</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-cyan-500 rounded-full inline-block"></span>
            <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block -ml-2.5"></span>
            <span className="text-slate-600">Withdrawals</span>
          </div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-x-auto pt-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[300px] select-none"
        >
          {/* Axis Labels (Marked Y-Axis Unit) */}
          <text
            x={10}
            y={16}
            className="text-[10px] fill-slate-400 font-semibold"
          >
            (Rs. M)
          </text>

          {/* Horizontal Gridlines & Y-Axis Ticks */}
          {yTicks.map((val) => {
            const yPos = getY(val);
            return (
              <g key={`y-tick-${val}`}>
                <line
                  x1={margin.left}
                  y1={yPos}
                  x2={width - margin.right}
                  y2={yPos}
                  stroke="#e2e8f0"
                  strokeDasharray={val === 0 ? 'none' : '3 3'}
                  strokeWidth={val === 0 ? 1.5 : 1}
                />
                {/* Y-Axis Value Labels */}
                <text
                  x={margin.left - 10}
                  y={yPos + 3.5}
                  textAnchor="end"
                  className="text-[11px] fill-slate-500 font-medium font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Y-Axis Vertical Line */}
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={margin.top + innerHeight}
            stroke="#94a3b8"
            strokeWidth={1.5}
          />

          {/* X-Axis Horizontal Line */}
          <line
            x1={margin.left}
            y1={margin.top + innerHeight}
            x2={width - margin.right}
            y2={margin.top + innerHeight}
            stroke="#94a3b8"
            strokeWidth={1.5}
          />

          {/* X-Axis Ticks & Month Labels */}
          {data.map((d, i) => {
            const xPos = getX(i);
            const isHovered = hoveredIndex === i;
            return (
              <g key={`x-tick-${d.month}`}>
                {/* Tick mark */}
                <line
                  x1={xPos}
                  y1={margin.top + innerHeight}
                  x2={xPos}
                  y2={margin.top + innerHeight + 5}
                  stroke="#94a3b8"
                  strokeWidth={1.2}
                />
                {/* Month Label */}
                <text
                  x={xPos}
                  y={margin.top + innerHeight + 18}
                  textAnchor="middle"
                  className={`text-[11px] transition-colors ${
                    isHovered ? 'fill-blue-600 font-bold' : 'fill-slate-500 font-medium'
                  }`}
                >
                  {d.month}
                </text>

                {/* Vertical hover crosshair guideline */}
                {isHovered && (
                  <line
                    x1={xPos}
                    y1={margin.top}
                    x2={xPos}
                    y2={margin.top + innerHeight}
                    stroke="#cbd5e1"
                    strokeDasharray="2 2"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          })}

          {/* Deposits Line & Area Fill */}
          <path
            d={depositsPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Withdrawals Line */}
          <path
            d={withdrawalsPath}
            fill="none"
            stroke="#06b6d4"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points and Hover Trigger Targets */}
          {data.map((d, i) => {
            const xPos = getX(i);
            const depY = getY(d.deposits);
            const wthY = getY(d.withdrawals);
            const isHovered = hoveredIndex === i;

            return (
              <g key={`points-${i}`}>
                {/* Hit target transparent rectangle for easy hovering */}
                <rect
                  x={xPos - 18}
                  y={margin.top}
                  width={36}
                  height={innerHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />

                {/* Deposits Point Circle */}
                <circle
                  cx={xPos}
                  cy={depY}
                  r={isHovered ? 5.5 : 3.5}
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  className="transition-all duration-150 pointer-events-none"
                />

                {/* Withdrawals Point Circle */}
                <circle
                  cx={xPos}
                  cy={wthY}
                  r={isHovered ? 5.5 : 3.5}
                  fill="#ffffff"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  className="transition-all duration-150 pointer-events-none"
                />
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Popup */}
        {hoveredIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none bg-slate-900 text-white rounded-lg shadow-lg py-1.5 px-3 text-xs border border-slate-700"
            style={{
              left: `${(getX(hoveredIndex) / width) * 100}%`,
              top: '15%',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="font-semibold text-slate-200 border-b border-slate-700 pb-1 mb-1">
              Month: {data[hoveredIndex].month}
            </div>
            <div className="flex items-center justify-between gap-3 text-blue-300">
              <span>Deposits:</span>
              <span className="font-mono font-bold">Rs. {data[hoveredIndex].deposits}M</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-cyan-300">
              <span>Withdrawals:</span>
              <span className="font-mono font-bold">Rs. {data[hoveredIndex].withdrawals}M</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 pt-1 border-t border-slate-800">
              Net Surplus: Rs. {(data[hoveredIndex].deposits - data[hoveredIndex].withdrawals).toFixed(1)}M
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] text-slate-400 mt-2 flex justify-between items-center">
        <span>* X-axis: Gregorian months • Y-axis: Values calibrated in Sri Lankan Rupees (Rs. Millions)</span>
        <span className="text-emerald-600 font-medium">Healthy Inflow: +47.5% YoY</span>
      </div>
    </div>
  );
}
