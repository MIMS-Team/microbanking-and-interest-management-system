'use client';

interface MonthlyTransactionPoint {
  month: string;
  deposits: number;
  withdrawals: number;
  savingsInterest: number;
  fixedDepositInterest: number;
}

// Monthly transaction volume line chart with explicitly marked numerical axes
export default function LineChartWithAxes({
  monthlyData,
}: {
  monthlyData?: MonthlyTransactionPoint[];
}) {
  const defaultMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  const months = monthlyData?.map((point) => {
    const [year, month] = point.month.split('-').map(Number);
    return Number.isInteger(year) && Number.isInteger(month)
      ? new Date(year, month - 1, 1).toLocaleString('en', { month: 'short' })
      : point.month;
  }) ?? defaultMonths;

  // Deposits (blue curve)
  const defaultDepositPoints = [
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
  const defaultWithdrawalPoints = [
    { x: 50, y: 155, val: 2.8 },
    { x: 120, y: 152, val: 2.9 },
    { x: 190, y: 145, val: 3.1 },
    { x: 260, y: 140, val: 3.3 },
    { x: 330, y: 135, val: 3.5 },
    { x: 400, y: 128, val: 3.8 },
    { x: 470, y: 120, val: 4.1 },
    { x: 540, y: 115, val: 4.3 },
  ];

  const chartWidth = 490;
  const chartTop = 30;
  const chartBottom = 200;
  // Keep the branch dashboard's existing illustration when no live series is provided.
  const transactionData = monthlyData?.length ? monthlyData : null;
  const largestTransaction = transactionData
    ? Math.max(0, ...transactionData.flatMap((point) => [
        point.deposits,
        point.withdrawals,
        point.savingsInterest + point.fixedDepositInterest,
      ]))
    : 0;
  const amountScale = largestTransaction > 0
    ? 10 ** Math.floor(Math.log10(largestTransaction))
    : 1;
  const scaleSuffix = amountScale >= 1_000
    ? [
        { base: 1_000_000_000_000, suffix: 'T' },
        { base: 1_000_000_000, suffix: 'B' },
        { base: 1_000_000, suffix: 'M' },
        { base: 1_000, suffix: 'K' },
      ].find(({ base }) => amountScale >= base)
    : undefined;
  const amountUnit = scaleSuffix
    ? `Rs. ${(amountScale / scaleSuffix.base).toLocaleString('en')}${scaleSuffix.suffix}`
    : `Rs. ${amountScale.toLocaleString('en')}`;
  const scaledMaximum = transactionData ? largestTransaction / amountScale : 8;
  const chartMax = transactionData
    ? Math.max(1, Math.ceil(scaledMaximum / 2) * 2)
    : 8;
  const yTicks = [chartMax, chartMax * 0.75, chartMax * 0.5, chartMax * 0.25, 0];
  const formatTick = (tick: number) =>
    Number.isInteger(tick) ? String(tick) : tick.toFixed(1);
  const toChartPoints = (values: number[]) =>
    values.map((value, index) => ({
      x: 50 + index * (chartWidth / Math.max(values.length - 1, 1)),
      y: chartBottom - (value / chartMax) * (chartBottom - chartTop),
      val: value,
    }));
  const depositPoints = transactionData
    ? toChartPoints(transactionData.map((point) => point.deposits / amountScale))
    : defaultDepositPoints;
  const withdrawalPoints = transactionData
    ? toChartPoints(transactionData.map((point) => point.withdrawals / amountScale))
    : defaultWithdrawalPoints;
  const interestPoints = transactionData
    ? toChartPoints(transactionData.map(
        (point) => (point.savingsInterest + point.fixedDepositInterest) / amountScale
      ))
    : [];

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
          <h3 className="text-sm font-bold text-slate-900">Monthly Deposits, Withdrawals & Interest</h3>
          <p className="text-xs text-slate-500">
            {transactionData
              ? `Transaction volume in ${amountUnit} since February 2026`
              : 'Transaction volume in millions (Rs.) over the last 8 months'}
          </p>
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
          {transactionData && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-amber-500 rounded-full inline-block"></span>
              <span className="text-slate-600 font-medium">Total Interest (Savings + FD)</span>
            </div>
          )}
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
            const yPos = chartTop + index * ((chartBottom - chartTop) / (yTicks.length - 1));
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
                  {formatTick(tick)}
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
            const xPos = 50 + index * (chartWidth / Math.max(months.length - 1, 1));
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
            d={`${depositPath} L ${depositPoints[depositPoints.length - 1]?.x ?? 540} ${chartBottom} L ${depositPoints[0]?.x ?? 50} ${chartBottom} Z`}
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

          {transactionData && (
            <path
              d={interestPoints.reduce(
                (acc, curr, index) => `${acc} ${index === 0 ? 'M' : 'L'} ${curr.x} ${curr.y}`,
                ''
              )}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

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
          {interestPoints.map((pt, i) => (
            <circle
              key={`interest-${i}`}
              cx={pt.x}
              cy={pt.y}
              r="3.5"
              fill="#ffffff"
              stroke="#f59e0b"
              strokeWidth="2"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
