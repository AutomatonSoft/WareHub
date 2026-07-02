function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function ApiDocsPage() {
  const scalarConfig = {
    theme: "purple",
    layout: "modern",
    showSidebar: true,
  };
  const configuration = escapeHtmlAttribute(JSON.stringify(scalarConfig));
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
<<<<<<< HEAD
    <script>
      (async function bootstrapScalarDocs() {
        const baseConfig = JSON.parse('${configuration}');

        function readCookie(name) {
          const prefix = name + "=";
          const parts = document.cookie.split(";").map((chunk) => chunk.trim());
          for (const part of parts) {
            if (part.startsWith(prefix)) {
              return decodeURIComponent(part.slice(prefix.length));
            }
          }
          return "";
        }

        async function ensureDatabaseServiceSession() {
          let sessionId = readCookie("sessionid");
          if (sessionId) {
            return sessionId;
          }

          try {
            const refreshResponse = await fetch("/api/v1/backend/auth/refresh", {
              method: "POST",
              cache: "no-store",
              credentials: "include",
            });
            if (!refreshResponse.ok) {
              return "";
            }

            const authPayload = await refreshResponse.json();
            const token = String(authPayload?.token || "").trim();
            if (!token) {
              return "";
            }

            const syncResponse = await fetch("/api/v1/services/dev/session/sync/", {
              method: "GET",
              cache: "no-store",
              credentials: "include",
              headers: {
                Authorization: "Bearer " + token,
              },
            });
            if (!syncResponse.ok) {
              return "";
            }

            return readCookie("sessionid");
          } catch {
            return "";
          }
        }

        const sessionId = await ensureDatabaseServiceSession();
        if (sessionId) {
          baseConfig.authentication = {
            preferredSecurityScheme: "sessionCookieAuth",
            securitySchemes: {
              sessionCookieAuth: {
                name: "sessionid",
                in: "cookie",
                value: sessionId,
              },
            },
          };
        }

        const referenceScript = document.createElement("script");
        referenceScript.id = "api-reference";
        referenceScript.dataset.url = "/api/v1/docs/openapi";
        referenceScript.dataset.configuration = JSON.stringify(baseConfig);
        document.body.appendChild(referenceScript);

        const scalarScript = document.createElement("script");
        scalarScript.src = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";
        document.body.appendChild(scalarScript);
      })();
    </script>
=======
    <script
      id="api-reference"
      data-url="/api/v1/docs/openapi"
      data-configuration='{"theme":"purple","layout":"modern","showSidebar":true}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
>>>>>>> origin/main
  </body>
</html>`;

  return <iframe title="API Docs" srcDoc={html} className="h-[calc(100vh-2rem)] w-full border-0" />;
}
