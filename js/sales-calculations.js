// sales-calculations.js - pure checkout totals, shared with Lab 31 unit tests.
// Batches must be in the same earliest-expiry-first order used at checkout.
function calculateFefoTotal(batches, quantity) {
  let remaining = quantity;
  let total = 0;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, batch.qty);
    total += taken * batch.price;
    remaining -= taken;
  }
  return Math.round(total * 100) / 100;
}

function calculateCartTotal(batchesByMedicine, cart) {
  const total = cart.reduce((sum, line) => {
    const batches = batchesByMedicine[line.medicine_id] || [];
    return sum + calculateFefoTotal(batches, line.qty);
  }, 0);
  return Math.round(total * 100) / 100;
}
