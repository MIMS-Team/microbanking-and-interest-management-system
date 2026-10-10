'use client';

import React from 'react';

// Monthly transaction volume line chart with explicitly marked numerical axes
export default function LineChartWithAxes() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  const yTicks = [8, 6, 4, 2, 0];

  // Chart data coordinates (scaled to 0-8 Rs. Millions)
  // Deposits (blue curve)
  const depositPoints = [
    { x: 50, y: 110, val: 4.2 },
    { x: 120, y: 105, val: 4.4 },
    { x: 190, y: 88, val: 5.1 },
    { x: 260, y: 80, val: 5.4 },
    { x: 330, y: 65, val: 6.0 },
    { x: 400, y: 55, val: 6.4 },
    { x: 470, y: 45, val: 6.8 },
    { x: 540, y: 35, val: 7.2 },
  ];

  // Withdrawals (teal curve)
  const withdrawalPoints = [
    { x: 50, y: 155, val: 2.8 },
    { x: 120, y: 152, val: 2.9 },
    { x: 190, y: 145, val: 3.1 },
    { x: 260, y: 140, val: 3.3 },
    { x: 330, y: 135, val: 3.5 },
    { x: 400, y: 128, val: 3.8 },
    { x: 470, y: 120, val: 4.1 },
    { x: 540, y: 115, val: 4.3 },
  ];

  const depositPath = depositPoints.reduce(
    (acc, curr, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${curr.x} ${curr.y}`,
    ''
  );

  const withdrawalPath = withdrawalPoints.reduce(
    (acc, curr, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${curr.x} ${curr.y}`,
    ''
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
      {/* Chart Title and Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Monthly Deposits vs Withdrawals</h3>
          <p className="text-xs text-slate-500">Transaction volume in millions (Rs.) over the last 8 months</p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-blue-600 rounded-full inline-block"></span>
            <span className="text-slate-600 font-medium">Deposits</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-teal-500 rounded-full inline-block"></span>
            <span className="text-slate-600 font-medium">Withdrawals</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas with Marked X and Y Axes */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 600 240"
          className="w-full h-56 select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Y-Axis Horizontal Grid Lines and Labels */}
          {yTicks.map((tick, index) => {
            const yPos = 30 + index * 42.5;
            return (
              <g key={tick}>
                <line
                  x1="45"
                  y1={yPos}
                  x2="570"
                  y2={yPos}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x="30"
                  y={yPos + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#64748b"
                  fontWeight="500"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Y-Axis Line */}
          <line x1="45" y1="30" x2="45" y2="200" stroke="#94a3b8" strokeWidth="1.5" />

          {/* X-Axis Line */}
          <line x1="45" y1="200" x2="570" y2="200" stroke="#94a3b8" strokeWidth="1.5" />

          {/* X-Axis Ticks and Month Labels */}
          {months.map((month, index) => {
            const xPos = 50 + index * 70;
            return (
              <g key={month}>
                <line x1={xPos} y1="200" x2={xPos} y2="205" stroke="#94a3b8" strokeWidth="1.5" />
                <text
                  x={xPos}
                  y="220"
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748b"
                  fontWeight="500"
                >
                  {month}
                </text>
              </g>
            );
          })}

          {/* Area under deposits curve */}
          <path
            d={`${depositPath} L 540 200 L 50 200 Z`}
            fill="url(#depositGradient)"
            opacity="0.1"
          />

          <defs>
            <linearGradient id="depositGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Deposits Line */}
          <path
            d={depositPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Withdrawals Line */}
          <path
            d={withdrawalPath}
            fill="none"
            stroke="#14b8a6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Deposit Data Dots */}
          {depositPoints.map((pt, i) => (
            <circle
              key={`dep-${i}`}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth="2"
            />
          ))}

          {/* Withdrawal Data Dots */}
          {withdrawalPoints.map((pt, i) => (
            <circle
              key={`wth-${i}`}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              fill="#ffffff"
              stroke="#14b8a6"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
