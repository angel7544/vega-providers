import { ProviderContext, Stream } from "../types";

const headers = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Cache-Control": "no-store",
  "Accept-Language": "en-US,en;q=0.9",
  DNT: "1",
  "sec-ch-ua":
    '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
};

export const getStream = async ({
  link: url,
  providerContext,
}: {
  link: string;
  providerContext: ProviderContext;
}): Promise<Stream[]> => {
  try {
    const { axios, cheerio } = providerContext;
    if (!url) return [];

    let downloadLinkRes = await modExtractor(url, providerContext);
    const ddl = downloadLinkRes?.data?.match(/content="0;url=(.*?)"/)?.[1] || url;

    console.log("ddl", ddl);
    const driveLink = await isDriveLink(ddl, axios);
    const ServerLinks: Stream[] = [];

    if (!driveLink) return [];

    const driveRes = await axios.get(driveLink, { headers });
    const driveHtml = driveRes.data;
    const $drive = cheerio.load(driveHtml);

    // instant link
    try {
      const seed = $drive(".btn-danger").attr("href") || "";
      if (seed) {
        const instantToken = seed.split("=")[1];
        const videoSeedUrl = seed.split("/").slice(0, 3).join("/") + "/api";
        
        // Use URLSearchParams for form data in Node.js
        const params = new URLSearchParams();
        params.append("keys", instantToken);

        const instantLinkRes = await axios.post(videoSeedUrl, params, {
          headers: {
            "x-token": videoSeedUrl,
            "Content-Type": "application/x-www-form-urlencoded"
          },
        });
        
        const instantLinkData = instantLinkRes.data;
        if (instantLinkData && instantLinkData.error === false) {
          ServerLinks.push({
            server: "Gdrive-Instant",
            link: instantLinkData.url,
            type: "mkv",
          });
        }
      }
    } catch (err) {
      console.log("Instant link 1 error", err);
    }

    // instant link 2
    try {
      const seed = $drive(".btn-danger").attr("href") || "";
      if (seed) {
        const newLinkRes = await axios.head(seed, {
          headers,
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
        });
        
        let newLink = newLinkRes.headers.location || seed;
        const streamUrl = newLink.split("?url=")[1] || newLink;
        if (streamUrl) {
            ServerLinks.push({
                server: "Gdrive-Instant-2",
                link: streamUrl,
                type: "mkv",
            });
        }
      }
    } catch (err) {
      console.log("Instant link 2 error", err);
    }

    // resume link
    try {
      const resumeDrive = driveLink.replace("/file", "/zfile");
      const resumeDriveRes = await axios.get(resumeDrive, { headers });
      const $resumeDrive = cheerio.load(resumeDriveRes.data);
      const resumeLink = $resumeDrive(".btn-success").attr("href");
      if (resumeLink) {
        ServerLinks.push({
          server: "ResumeCloud",
          link: resumeLink,
          type: "mkv",
        });
      }
    } catch (err) {
      console.log("Resume link not found");
    }

    // CF workers
    [1, 2].forEach(async (type) => {
        try {
            const cfWorkersLink = driveLink.replace("/file", "/wfile") + `?type=${type}`;
            const cfWorkersRes = await axios.get(cfWorkersLink, { headers });
            const $cfWorkers = cheerio.load(cfWorkersRes.data);
            $cfWorkers(".btn-success").each((i, el) => {
                const link = $cfWorkers(el).attr("href");
                if (link) {
                    ServerLinks.push({
                        server: `Cf Worker ${type}.${i}`,
                        link: link,
                        type: "mkv",
                    });
                }
            });
        } catch (e) {}
    });

    console.log("ServerLinks", ServerLinks);
    return ServerLinks;
  } catch (err) {
    console.log("getStream error", err);
    return [];
  }
};

const isDriveLink = async (ddl: string, axios: any) => {
  if (!ddl) return "";
  if (ddl.includes("drive")) {
    try {
        const driveLeach = await axios.get(ddl);
        const driveLeachData = driveLeach.data;
        const pathMatch = driveLeachData.match(/window\.location\.replace\("([^"]+)"\)/);
        const path = pathMatch?.[1];
        if (!path) return ddl;
        
        const urlObj = new URL(ddl);
        return `${urlObj.protocol}//${urlObj.hostname}${path}`;
    } catch (e) {
        return ddl;
    }
  } else {
    return ddl;
  }
};

async function modExtractor(url: string, providerContext: ProviderContext) {
  const { axios, cheerio } = providerContext;
  try {
    const wpHttp = url.split("sid=")[1];
    if (!wpHttp) return { data: "" };

    const params0 = new URLSearchParams();
    params0.append("_wp_http", wpHttp);

    const targetUrl = url.split("?")[0];
    const res = await axios.post(targetUrl, params0, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    
    const $ = cheerio.load(res.data);
    const wpHttp2 = $("input[name='_wp_http2']").val();
    if (!wpHttp2) return res;

    const params = new URLSearchParams();
    params.append("_wp_http2", wpHttp2 as string);
    
    const formUrl = $("form").attr("action") || targetUrl;

    const res2 = await axios.post(formUrl, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    
    const html2 = res2.data;
    const linkMatch = html2.match(/setAttribute\("href",\s*"(.*?)"/);
    if (!linkMatch) return res2;
    
    const link = linkMatch[1];
    const cookieName = link.split("=")[1];

    const downloadLink = await axios.get(link, {
      headers: {
        Referer: formUrl,
        Cookie: `${cookieName}=${wpHttp2}`,
      },
    });
    return downloadLink;
  } catch (err) {
    console.log("modGetStream error", err);
    return { data: "" };
  }
}

