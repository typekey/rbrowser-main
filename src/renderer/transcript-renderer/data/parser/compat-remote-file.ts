import { RemoteFile } from "generic-filehandle";
import { Buffer } from "buffer";

/**
 * Maximum number of distinct byte-range entries to keep per file handle.
 * Each entry is typically 0.4 – 2.4 kB (BigWig B-tree / R-tree nodes).
 * 512 entries ≈ 1–2 MB RAM per `CompatRemoteFile` instance.
 */
const MAX_CACHE_ENTRIES = 512;

// ─── CORS proxy support ─────────────────────────────────────────────────
//
// Some upstream servers (e.g. UCSC `cgl.gi.ucsc.edu`) do not return the
// CORS headers required for browser-side Range requests against bigBed /
// bigWig / BAM / CRAM files.  The user can configure a self-hosted
// reverse proxy (Nginx, Cloudflare Worker, etc.) that forwards the
// request and injects `Access-Control-Allow-Origin` while transparently
// passing through `Range` / `Content-Range` headers.
//
// Usage from application code:
//
//   import { setCorsProxy } from ".../compat-remote-file";
//   setCorsProxy({
//     url: "https://my-proxy.example.com/cors-proxy/",
//     // optional – which URLs to rewrite (default: every http/https URL
//     // whose origin differs from window.location.origin)
//     match: (u) => u.includes("cgl.gi.ucsc.edu"),
//   });
//
// The constructor of CompatRemoteFile consults this config and, when a
// match fires, transparently rewrites the URL to `${proxy}${original}`.
// All caching, Range handling, blob-URL handling continue to work
// unchanged because they operate on the (already rewritten) `this.url`.

export type CorsProxyMatcher =
  | string
  | string[]
  | RegExp
  | ((url: string) => boolean);

export interface CorsProxyConfig {
  /** Proxy endpoint, e.g. "https://my-proxy.example.com/cors-proxy/".
   *  Must end with "/" or be ready to have the original URL appended. */
  url: string;
  /**
   * Which URLs should be proxied.  Defaults to "all cross-origin
   * http/https URLs" when omitted.
   *  - string: substring match
   *  - string[]: any substring match
   *  - RegExp: regex test
   *  - function: custom predicate
   */
  match?: CorsProxyMatcher;
  /**
   * When true, append the original URL verbatim (proxy + originalUrl).
   * When false, URI-encode the original URL first
   * (proxy + encodeURIComponent(originalUrl)).
   * Default: true (matches the Nginx / Worker examples in our docs).
   */
  raw?: boolean;
}

let _corsProxy: CorsProxyConfig | null = null;

/** Configure (or disable, by passing null) the global CORS proxy. */
export function setCorsProxy(config: CorsProxyConfig | null): void {
  _corsProxy = config;
}

/** Read the current CORS proxy configuration (mainly for tests / debug). */
export function getCorsProxy(): CorsProxyConfig | null {
  return _corsProxy;
}

function matchesProxy(
  url: string,
  matcher: CorsProxyMatcher | undefined,
): boolean {
  if (matcher === undefined) {
    // Default: rewrite cross-origin http(s) URLs only.
    if (typeof window === "undefined" || !window.location) return true;
    try {
      const u = new URL(url, window.location.href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      return u.origin !== window.location.origin;
    } catch {
      return false;
    }
  }
  if (typeof matcher === "string") return url.includes(matcher);
  if (Array.isArray(matcher)) return matcher.some((m) => url.includes(m));
  if (matcher instanceof RegExp) return matcher.test(url);
  if (typeof matcher === "function") {
    try {
      return !!matcher(url);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Apply the configured CORS proxy to a URL when applicable.
 * Returns the (possibly rewritten) URL.  Non-string inputs (Files,
 * Blobs, blob: URLs already produced via URL.createObjectURL) are
 * returned untouched.
 */
export function applyCorsProxy(url: unknown): any {
  if (typeof url !== "string") return url;
  if (!_corsProxy) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  // Already proxied – don't double-wrap.
  if (url.startsWith(_corsProxy.url)) return url;
  if (!matchesProxy(url, _corsProxy.match)) return url;
  const target = _corsProxy.raw === false ? encodeURIComponent(url) : url;
  return _corsProxy.url + target;
}

export class CompatRemoteFile extends RemoteFile {
  constructor(source: any, opts?: any) {
    super(applyCorsProxy(source), opts);
  }

  /**
   * Byte-range read cache (used for normal http/https URLs).
   *
   * Key   = "<position>:<length>"
   * Value = a Promise<Buffer> so that two concurrent callers for the same
   *         range await the same network request instead of issuing two.
   *
   * Cached indefinitely because genomic index files are immutable during a
   * browser session.  Eviction is FIFO once MAX_CACHE_ENTRIES is reached.
   */
  private readonly _rangeCache = new Map<string, Promise<Buffer>>();

  // ── blob: URL support ──────────────────────────────────────────────────
  // blob: URLs (created by URL.createObjectURL for local File objects) do
  // NOT support HTTP Range requests – the browser always returns the full
  // content with status 200.  RemoteFile.read() throws when it receives
  // status 200 at a non-zero position.
  //
  // Fix: detect blob: URLs, fetch the entire blob once on first access,
  // cache the Buffer, and serve all subsequent reads from the cache.
  // This is fine for typical drag-and-drop / file-pick files (< ~200 MB).

  /** Cached full-file buffer for blob: URLs (null until first read). */
  private _blobBuffer: Buffer | null = null;
  /** In-flight fetch promise so concurrent readers share one network call. */
  private _blobFetchPromise: Promise<Buffer> | null = null;

  /** True when the wrapped URL is a blob: object URL. */
  private get _isBlobUrl(): boolean {
    return typeof this.url === "string" && this.url.startsWith("blob:");
  }

  /** Lazily fetch the full blob content and cache it as a Buffer. */
  private _ensureBlobBuffer(): Promise<Buffer> {
    if (this._blobBuffer) return Promise.resolve(this._blobBuffer);
    if (!this._blobFetchPromise) {
      this._blobFetchPromise = (async () => {
        const res = await (this as any).fetchImplementation(this.url);
        const ab = await res.arrayBuffer();
        this._blobBuffer = Buffer.from(new Uint8Array(ab));
        return this._blobBuffer;
      })();
    }
    return this._blobFetchPromise;
  }

  // @ts-ignore – overload signature differs from base class
  async read(bufferOrLen: any, offset: any, length: any, position: any) {
    // ── blob: URL path ────────────────────────────────────────────────
    if (this._isBlobUrl) {
      const cached = await this._ensureBlobBuffer();

      if (typeof bufferOrLen === "number") {
        // 2-arg overload: read(length, position)
        const len = bufferOrLen;
        const pos = offset ?? 0;
        return cached.subarray(pos, pos + len);
      }

      // 5-arg overload: read(buffer, offset, length, position)
      const buf: Buffer = bufferOrLen;
      const off: number = offset ?? 0;
      const len: number = length ?? cached.length;
      const pos: number = position ?? 0;
      const copyLen = Math.min(len, cached.length - pos);
      cached.copy(buf, off, pos, pos + copyLen);
      return { bytesRead: copyLen, buffer: buf };
    }

    // ── Normal (http/https) URL path with range cache ─────────────────
    if (typeof bufferOrLen === "number") {
      const len = bufferOrLen;
      const pos = offset;

      const key = `${pos}:${len}`;
      let pending = this._rangeCache.get(key);

      if (!pending) {
        pending = (async () => {
          const buf = Buffer.alloc(len);
          const res = await super.read(buf, 0, len, pos);
          // @ts-ignore
          return (
            res.bytesRead < len
              ? res.buffer.subarray(0, res.bytesRead)
              : res.buffer
          ) as Buffer;
        })();

        // Evict oldest entry when the cache is full (FIFO)
        if (this._rangeCache.size >= MAX_CACHE_ENTRIES) {
          this._rangeCache.delete(this._rangeCache.keys().next().value!);
        }
        this._rangeCache.set(key, pending);
      }

      return pending;
    }
    return super.read(bufferOrLen, offset, length, position);
  }

  /**
   * Override stat() for blob: URLs.
   *
   * RemoteFile.stat() reads 10 bytes at position 0 and expects the
   * Content-Range header to contain the file size.  blob: responses
   * never include Content-Range, so _stat is never populated and
   * stat() throws.  We fix this by returning the cached buffer length.
   */
  // @ts-ignore
  async stat() {
    if (this._isBlobUrl) {
      const buf = await this._ensureBlobBuffer();
      return { size: buf.length };
    }
    // For normal URLs, delegate to the parent implementation
    // which reads 10 bytes and parses Content-Range.
    return super.stat();
  }
}
