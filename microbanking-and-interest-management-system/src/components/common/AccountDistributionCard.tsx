'use client';

/**
 * AccountDistributionCard Component
 * Faithfully matches the right card from the reference screenshot:
 * - Header: "Account Distribution"
 * - Subtitle: "Breakdown by account type"
 * - Donut visualization / bar segments
 * - Itemized list:
 *   - Regular Savings: 5,200
 *   - Children Savings: 2,100
 *   - Senior Citizens: 1,800
 *   - Fixed Deposits: 3,745
 */

import React from 'react';
import { accountDistributionData } from '@/data/mockData';

export default function AccountDistributionCard() {
  const total = accountDistributionData.reduce((acc, item) => acc + item.count, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
      <div>
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">
          Account Distribution
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Breakdown by account type
        </p>

        {/* Visual Donut / Ratio Bar */}
        <div className="mt-6 mb-6">
          <div className="h-3.5 w-full rounded-full flex overflow-hidden shadow-inner bg-slate-100 p-0.5">
            {accountDistributionData.map((item) => {
              const widthPct = (item.count / total) * 100;
              return (
                <div
                  key={item.name}
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: item.color,
                  }}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300 hover:opacity-85"
                  title={`${item.name}: ${item.count.toLocaleString()} (${item.percent})`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
            <span>Portfolio Total: {total.toLocaleString()}</span>
            <span className="font-medium text-slate-600">100% Active Accounts</span>
          </div>
        </div>
      </div>

      {/* Itemized Legend & Counts matching the screenshot layout */}
      <div className="space-y-3.5 pt-2 border-t border-slate-100">
        {accountDistributionData.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between text-xs hover:bg-slate-50 px-2 py-1.5 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-700 font-medium">{item.name}</span>
              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-md">
                {item.percent}
              </span>
            </div>
            <span className="font-bold text-slate-900 font-mono">
              {item.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
