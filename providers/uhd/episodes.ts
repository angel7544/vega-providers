import { EpisodeLink, ProviderContext } from "../types";

export const getEpisodes = async function ({
  url,
  providerContext,
}: {
  url: string;
  providerContext: ProviderContext;
}): Promise<EpisodeLink[]> {
  const { axios, cheerio, commonHeaders: headers } = providerContext;
  console.log("🔍 [UHD] Fetching episode list from:", url);
  
  try {
    const res = await axios.get(url, { 
      headers: {
        ...headers,
        Referer: "https://uhdmovies.ink/"
      }
    });
    const $ = cheerio.load(res.data);
    
    const episodes: EpisodeLink[] = [];
    
    // Look for common episode/server links in UHDMovies sub-pages
    $("a").each((i, el) => {
        const title = $(el).text().trim();
        const link = $(el).attr("href");
        
        if (!link) return;

        // Detection for common high-speed movie/episode hosts
        const isPlayable = link.includes("nexdrive") || 
                          link.includes("gd-hub") || 
                          link.includes("d-hub") || 
                          link.includes("hubcloud") ||
                          link.includes("pixel") ||
                          link.includes("drive.google.com");

        if (isPlayable) {
            episodes.push({
                title: title || `Server Link ${i + 1}`,
                link: link
            });
        }
    });

    // Strategy 2: If no links found, try finding buttons
    if (episodes.length === 0) {
        $(".btn, .button, .download-link").each((i, el) => {
            const link = $(el).attr("href");
            if (link) {
                episodes.push({
                    title: $(el).text().trim() || `Download Option ${i + 1}`,
                    link: link
                });
            }
        });
    }

    return episodes;
  } catch (err) {
    console.error("❌ [UHD] Episode extraction failed:", err.message);
    return [];
  }
};
