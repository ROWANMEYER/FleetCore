async function insertToday() {
  try {
    const response = await fetch('https://quixotic-gopher-969.convex.cloud/api/mutation/dailyAvailability:upsert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateISO: "2026-03-13",
        drivers: ["John Doe"],
        trucks: ["T101"],
        trailers: ["TRL-05"],
        status: "available"
      })
    });
    
    const result = await response.json();
    console.log("Success:", result);
  } catch (error) {
    console.error("Error:", error);
  }
}

insertToday();