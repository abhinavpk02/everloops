fetch("http://localhost:3001/api/invoices/pdf", {
  "body": "{\"customerName\":\"Customer X\",\"invoiceNumber\":\"INV-2023-9792\",\"items\":[{\"id\":\"1\",\"name\":\"Test Item\",\"price\":100,\"qty\":1}],\"subtotal\":100,\"tax\":5,\"grandTotal\":105}",
  "method": "POST",
  "headers": { "content-type": "application/json" }
}).then(res => res.blob()).then(blob => console.log('Blob size:', blob.size)).catch(console.error);
