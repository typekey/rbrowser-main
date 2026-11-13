/**
 * Registry mapping `blob:` object URLs back to their originating `File`
 * objects.
 *
 * Local files imported via the Custom Reference dialog are exposed to the rest
 * of the renderer as `blob:` URLs (with a `#filename` fragment appended for
 * extension sniffing). When a consumer needs the *whole* file in memory — e.g.
 * loading a local `.rbi` / `.rba` SQLite catalogue with `sql.js` — fetching the
 * blob URL can be unreliable: Range requests are unsupported and a trailing
 * `#fragment` trips up the blob-store lookup in some browsers. Reading the
 * registered `File` directly via `File.arrayBuffer()` sidesteps both issues.
 */

/** Strip the `#fragment` we append to blob URLs so lookups are canonical. */
function canonical(url: string): string {
  return url.split("#")[0];
}

const registry = new Map<string, File>();

/** Associate a `blob:` URL (with or without fragment) with its `File`. */
export function registerLocalBlob(url: string, file: File): void {
  registry.set(canonical(url), file);
}

/** Return the `File` registered for a `blob:` URL, if any. */
export function getLocalBlobFile(url: string): File | undefined {
  return registry.get(canonical(url));
}
