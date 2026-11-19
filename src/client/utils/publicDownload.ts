/**
 * Download from a public link. The password (when there is one) goes in the body of a request for a ticket, and the
 * browser then downloads from an address that holds only the ticket: the password never appears in a URL (history, logs,
 * referrers), and the file streams straight to disk instead of being read into the page's memory first.
 */
export class PublicDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PublicDownloadError";
  }
}

/** Ask for a ticket (throws a PublicDownloadError saying why not), then start the download. */
export async function startPublicDownload(
  ticketUrl: string,
  fileUrl: string,
  password?: string,
  /** More fields for the ticket request (which folder a zip is of). */
  extra: Record<string, string> = {},
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(ticketUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(password ? { ...extra, password } : extra),
    });
  } catch {
    throw new PublicDownloadError("Couldn't reach the server. Try again.", 0);
  }
  const body = await response.json().catch(() => ({}));
  const ticket = body?.data?.ticket;
  if (!response.ok || !body?.status || typeof ticket !== "string") {
    throw new PublicDownloadError(body?.message || "Failed to download the file", response.status);
  }
  // The server answers with the file as an attachment, so the page stays where it is while the browser saves it.
  window.location.assign(`${fileUrl}${fileUrl.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket)}`);
}
