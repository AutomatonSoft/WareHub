# Marketplace image relay

XL Create Product sends the remaining remote gallery URLs together with new files.
Removing a source photo from the gallery excludes it from publication. Remote
photos precede newly appended files. JV previews deduplicate resolved image URLs
without lowercasing case-sensitive paths.

`POST /api/v1/uploads/images/` accepts `source_urls` in JSON or as a JSON array in
multipart form data alongside `images`. Remote downloads complete before FTP
uploads begin. A failed download stops the request: photos are not silently
discarded and publication must not continue. The response identifies the failed
remote image's one-based index in `image_errors`, with an `images` field error.

Remote-download limits:

- Public HTTP/HTTPS URLs only, on standard ports, without URL credentials.
- Every redirect is revalidated; at most three redirects.
- DNS must return only globally routable addresses; the connection is pinned to
  the validated IP. HTTPS still verifies the original hostname and certificate.
- At most 10 MiB per remote photo, 50 MiB per mixed batch, and 50 mixed images.
- A 20-second download deadline with bounded connect/read timeouts.
- Compressed HTTP responses are rejected; image file formats remain supported.

These batch limits apply when a request includes remote URLs. Local file-only
uploads retain their existing validation. FTP failures after some files were
uploaded do not currently roll back those files; this is a separate lifecycle
limitation, not a successful product publication.

Local checks:

```sh
venv/bin/python services/database-service/manage.py test database.tests_remote_images database.tests_upload_images --noinput
cd apps/frontend
npm test
npm run typecheck
```

No deployment or external product writes are performed by these tests.
