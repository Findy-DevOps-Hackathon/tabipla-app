const preloaded = new Set<string>();

/** 表示前に画像 URL を preload する（重複は抑止）。 */
export function preloadImage(url: string): void {
  if (!url || preloaded.has(url)) return;
  preloaded.add(url);

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = url;
  document.head.appendChild(link);
}

/** 複数 URL を preload する。 */
export function preloadImages(urls: string[]): void {
  for (const url of urls) preloadImage(url);
}
