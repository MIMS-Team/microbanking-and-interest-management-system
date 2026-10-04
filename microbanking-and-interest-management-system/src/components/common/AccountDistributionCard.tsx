'use client';

import React from 'react';

// Account distribution breakdown card matching reference template
export default function AccountDistributionCard() {
  const accountBreakdown = [
    { label: 'Regular Savings', count: '5,200', color: 'bg-blue-600', percent: 40.5 },
    { label: 'Children Savings', count: '2,100', color: 'bg-teal-500', percent: 16.4 },
    { label: 'Senior Citizens', count: '1,800', color: 'bg-indigo-500', percent: 14.0 },
    { label: 'Fixed Deposits', count: '3,745', color: 'bg-slate-400', percent: 29.1 },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Account Distribution</h3>
        <p className="text-xs text-slate-500 mt-0.5">Breakdown by account type</p>

        {/* Proportional Segment Bar */}
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex my-6">
          {accountBreakdown.map((item) => (
            <div
              key={item.label}
              style={{ width: `${item.percent}%` }}
              className={`${item.color} h-full transition-all duration-300`}
              title={`${item.label}: ${item.percent}%`}
            />
          ))}
        </div>
      </div>

      {/* Account Type Legend and Exact Counts */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        {accountBreakdown.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${item.color}`}></span>
              <span className="text-slate-600 font-medium">{item.label}</span>
            </div>
            <span className="font-bold text-slate-900">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
