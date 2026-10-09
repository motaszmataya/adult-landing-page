// ... (Your existing code goes here) ...
if (username === VALID_USERNAME && password === VALID_PASSWORD) {
  
  // 1. Define your HTML string
  const LANDING_PAGE_HTML = `
    <!DOCTYPE html>
    <html>
      <head><title>My Secure Site</title></head>
      <body><h1>Welcome! You passed both layers of security.</h1></body>
    </html>
  `;

  // 2. Return the HTML to the browser
  return new Response(LANDING_PAGE_HTML, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}

// Fallback if password was wrong
return new Response('Invalid Credentials', { status: 401 });
