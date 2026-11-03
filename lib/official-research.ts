import { load } from "cheerio";
import { officialSource } from "./research-catalog";
export const normalizeExcerpt = (text: string) =>
  text.replace(/\s+/g, " ").trim();
export async function retrieveOfficialSource(
  id: string,
  fetcher: typeof fetch = fetch,
) {
  const source = officialSource(id);
  if (!source) throw new Error("Choose a supported official source.");
  const response = await fetcher(source.url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Pfew/1.0 (user-requested travel source preview)",
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error(
      "This source cannot be previewed here. Open its official website to read the current guidance.",
    );
  if (Number(response.headers.get("content-length")) > 524288)
    throw new Error(
      "This page is too large to preview. Open the official website.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source text unavailable.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 524288) {
        await reader.cancel();
        throw new Error(
          "This page is too large to preview. Open the official website.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks));
  const $ = load(html);
  $(
    'script,style,noscript,nav,header,footer,form,iframe,svg,[hidden],[aria-hidden="true"]',
  ).remove();
  const main = $('main,article,[role="main"]').first();
  const text = normalizeExcerpt((main.length ? main : $("body")).text()).slice(
    0,
    18000,
  );
  if (
    text.length < 100 ||
    /^(just a moment|access denied|verify you are human|checking your browser)/i.test(
      text,
    )
  )
    throw new Error(
      "The official page did not provide readable guidance. Open its website instead.",
    );
  return { source, text, retrievedAt: new Date().toISOString() };
}
