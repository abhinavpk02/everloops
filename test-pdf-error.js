fetch("http://localhost:3001/api/invoices/pdf", {
  "body": "{\"customerName\":\"Customer X\",\"invoiceNumber\":\"INV-2023-9792\",\"items\":[{\"id\":\"1\",\"name\":\"Test Item\",\"price\":100,\"qty\":1}],\"subtotal\":100,\"tax\":5,\"grandTotal\":105}",
  "method": "POST",
  "headers": { "content-type": "application/json" }
}).then(res => res.text().then(text => console.log('Status code:', res.status, 'Body:', text.substring(0,250)))).catch(console.error);
