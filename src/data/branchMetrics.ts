// Executive performance metrics across all bank branches
export function getBranchMetrics() {
  return [
    {
      id: 'BR001',
      name: 'Colombo Central Main',
      deposits: 'Rs. 48.5M',
      customers: 6240,
      activeAccounts: 4890,
      growthRate: '+14.2%',
      status: 'Optimal',
    },
    {
      id: 'BR002',
      name: 'Kandy Metro Branch',
      deposits: 'Rs. 18.2M',
      customers: 3120,
      activeAccounts: 2280,
      growthRate: '+9.8%',
      status: 'Good',
    },
    {
      id: 'BR003',
      name: 'Galle Fort Coastal',
      deposits: 'Rs. 11.4M',
      customers: 2150,
      activeAccounts: 1450,
      growthRate: '+7.4%',
      status: 'Normal',
    },
    {
      id: 'BR004',
      name: 'Jaffna Northern Hub',
      deposits: 'Rs. 6.1M',
      customers: 1335,
      activeAccounts: 692,
      growthRate: '+5.1%',
      status: 'Expanding',
    },
  ];
}
