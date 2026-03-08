fetch("http://localhost:3001/api/invoices", {
  "body": "{\"customer_id\":\"1\",\"total_amount\":105,\"items\":[{\"id\":\"1\",\"name\":\"Test Item\",\"price\":100,\"qty\":1}]}",
  "method": "POST",
  "headers": { "content-type": "application/json" }
}).then(res => res.json()).then(console.log).catch(console.error);
