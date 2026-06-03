export default function ApiDocsPage() {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WareHub API v1 - Scalar</title>
    <style>
      html, body { margin: 0; background: #0b1020; }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/docs/openapi"
      data-configuration='{"theme":"purple","layout":"modern","showSidebar":true}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

  return <iframe title="API Docs" srcDoc={html} className="h-[calc(100vh-2rem)] w-full border-0" />;
}
