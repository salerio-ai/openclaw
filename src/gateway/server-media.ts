import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

const MEDIA_PREFIX = "/api/media";

/**
 * Allowed media directories that can be served.
 * Currently only inbound media from channels is allowed.
 */
function getAllowedMediaDirs(): string[] {
  const stateDir = resolveStateDir();
  return [path.join(stateDir, "media", "inbound"), path.join(stateDir, "media", "outbound")];
}

function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    case ".svg":
      return "image/svg+xml";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function isPathWithinAllowedDirs(filePath: string, allowedDirs: string[]): boolean {
  const realPath = fs.realpathSync(filePath);
  return allowedDirs.some((dir) => {
    try {
      const realDir = fs.realpathSync(dir);
      return realPath.startsWith(realDir + path.sep) || realPath === realDir;
    } catch {
      return false;
    }
  });
}

/**
 * Handle requests to serve media files.
 * URL format: /api/media?path=/path/to/file.png
 *
 * Security: Only serves files from allowed media directories.
 */
export function handleMediaRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const urlRaw = req.url;
  if (!urlRaw) {
    return false;
  }

  const url = new URL(urlRaw, "http://localhost");
  if (!url.pathname.startsWith(MEDIA_PREFIX)) {
    return false;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return true;
  }

  const filePath = url.searchParams.get("path");
  if (!filePath) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Missing path parameter");
    return true;
  }

  // Normalize and validate path
  const normalizedPath = path.normalize(filePath);

  // Check if file exists
  if (!fs.existsSync(normalizedPath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return true;
  }

  // Security check: ensure file is within allowed directories
  const allowedDirs = getAllowedMediaDirs();
  if (!isPathWithinAllowedDirs(normalizedPath, allowedDirs)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Forbidden");
    return true;
  }

  // Check if it's a file
  const stat = fs.statSync(normalizedPath);
  if (!stat.isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return true;
  }

  // Serve the file
  const ext = path.extname(normalizedPath);
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypeForExt(ext));
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(normalizedPath);
  stream.pipe(res);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  });

  return true;
}
