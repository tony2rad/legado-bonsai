param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [int]$Port = 5500
)

# Servidor estático mínimo (la máquina no tiene Node ni Python).
# Sirve index.html en carpetas (p. ej. /admin/ → /admin/index.html).

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/"

$mimeMap = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "application/javascript; charset=utf-8";
  ".mjs" = "application/javascript; charset=utf-8"; ".json" = "application/json"; ".webmanifest" = "application/manifest+json";
  ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".gif" = "image/gif"; ".webp" = "image/webp";
  ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"; ".woff" = "font/woff"; ".woff2" = "font/woff2"; ".pdf" = "application/pdf"
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  try {
    $path = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
    if ($path.EndsWith("/")) { $path = $path + "index.html" }
    $filePath = Join-Path $Root ($path.TrimStart("/"))
    if ((Test-Path $filePath -PathType Container)) { $filePath = Join-Path $filePath "index.html" }
    $resolvedRoot = (Resolve-Path $Root).Path
    if ((Test-Path $filePath -PathType Leaf) -and ((Resolve-Path $filePath).Path).StartsWith($resolvedRoot)) {
      $ext = [System.IO.Path]::GetExtension($filePath)
      $contentType = $mimeMap[$ext]
      if (-not $contentType) { $contentType = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $response.ContentType = $contentType
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $response.StatusCode = 404
      $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $response.OutputStream.Write($notFound, 0, $notFound.Length)
    }
  } catch {
    $response.StatusCode = 500
  } finally {
    $response.OutputStream.Close()
  }
}
