async function run() {
  const res = await fetch('http://localhost:3000/api/savings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountNumber: 'sav-0040',
      customerId: 1,
      branchId: 1,
      agentId: 1,
      rateId: 1,
      balance: 500
    })
  });
  console.log(await res.json());
}
run();
