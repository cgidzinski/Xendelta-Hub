// GIFs in chat. A sent GIF is a message with a picture hosted by the GIF provider (GIPHY); the server never stores it.

/** One GIF as the picker lists it and a message carries it. */
export interface ChatGif {
  /** The animated picture. */
  url: string;
  /** A still frame, shown to people who ask their device to reduce motion. */
  stillUrl: string;
  width: number;
  height: number;
  title: string;
}

export const GIF_PAGE = 24;
export const GIF_QUERY_MAX = 50;

/** Only pictures served by GIPHY's own media hosts may be sent as a GIF, so a message can't point readers' browsers anywhere else. */
export const isGifHost = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^(media\d*|i)\.giphy\.com$/.test(u.hostname);
  } catch {
    return false;
  }
};
