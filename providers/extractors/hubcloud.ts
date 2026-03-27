const hubcloudDecode = function (value: string) {
  if (value === undefined) {
    return "";
  }
  return atob(value.toString());
};

export async function hubcloudExtractor(
  link: string,
  signal: AbortSignal,
  axios: any,
  cheerio: any,
  headers: Record<string, string>,
) {
  try {
    const localHeaders = {
      ...headers,
      Cookie: "ext_name=ojplmecpdpgccookcobabopnaifgidhf; xla=s4t; cf_clearance=woQrFGXtLfmEMBEiGUsVHrUBMT8s3cmguIzmMjmvpkg-1770053679-1.2.1.1-xBrQdciOJsweUF6F2T_OtH6jmyanN_TduQ0yslc_XqjU6RcHSxI7.YOKv6ry7oYo64868HYoULnVyww536H2eVI3R2e4wKzsky6abjPdfQPxqpUaXjxfJ02o6jl3_Vkwr4uiaU7Wy596Vdst3y78HXvVmKdIohhtPvp.vZ9_L7wvWdce0GRixjh_6JiqWmWMws46hwEt3hboaS1e1e4EoWCvj5b0M_jVwvSxBOAW5emFzvT3QrnRh4nyYmKDERnY"
    };
    
    console.log("hubcloudExtractor", link);
    if (!link) return [];

    const baseUrl = link.split("/").slice(0, 3).join("/");
    const streamLinks: any[] = [];
    
    const vLinkRes = await axios(`${link}`, { headers: localHeaders, signal });
    const vLinkText = vLinkRes.data;
    const $vLink = cheerio.load(vLinkText);
    const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];
    
    let vcloudLink =
      hubcloudDecode(vLinkRedirect[1]?.split("r=")?.[1]) ||
      vLinkRedirect[1] ||
      $vLink(".fa-file-download.fa-lg").parent().attr("href") ||
      link;
    
    console.log("vcloudLink", vcloudLink);
    if (!vcloudLink) return [];

    if (vcloudLink.startsWith("/")) {
      vcloudLink = `${baseUrl}${vcloudLink}`;
      console.log("New vcloudLink", vcloudLink);
    }
    
    const vcloudRes = await axios(vcloudLink, {
      headers: localHeaders,
      signal,
    });
    const $ = cheerio.load(vcloudRes.data);

    const linkClass = $(".btn-success.btn-lg.h6,.btn-danger,.btn-secondary");
    for (const element of linkClass) {
      const itm = $(element);
      let itemLink = itm.attr("href") || "";
      if (!itemLink) continue;

      switch (true) {
        case itemLink.includes("pixeld"):
          if (!itemLink.includes("api")) {
            const token = itemLink.split("/").pop();
            const pixeldBaseUrl = itemLink.split("/").slice(0, -2).join("/");
            itemLink = `${pixeldBaseUrl}/api/file/${token}?download`;
          }
          streamLinks.push({ server: "Pixeldrain", link: itemLink, type: "mkv" });
          break;

        case itemLink.includes(".dev") && !itemLink.includes("/?id="):
          streamLinks.push({ server: "Cf Worker", link: itemLink, type: "mkv" });
          break;

        case itemLink.includes("hubcloud") || itemLink.includes("/?id="):
          try {
            const newLinkRes = await axios(itemLink, {
              method: "HEAD",
              headers: localHeaders,
              signal,
              validateStatus: (status: number) => status >= 200 && status < 400,
              maxRedirects: 0,
            });

            let newLink = newLinkRes.headers.location || itemLink;
            if (newLink.includes("googleusercontent")) {
              newLink = newLink.split("?link=")[1] || newLink;
            } else {
              const newLinkRes2 = await axios(newLink, {
                method: "HEAD",
                headers: localHeaders,
                signal,
                validateStatus: (status: number) => status >= 200 && status < 400,
                maxRedirects: 0,
              });
              
              if (newLinkRes2.headers.location) {
                newLink = newLinkRes2.headers.location.split("?link=")[1] || newLinkRes2.headers.location;
              }
            }

            streamLinks.push({
              server: "hubcloud",
              link: newLink,
              type: "mkv",
            });
          } catch (error) {
            console.log("hubcloudExtractor error in hubcloud link: ", error);
          }
          break;

        case itemLink.includes("cloudflarestorage"):
          streamLinks.push({ server: "CfStorage", link: itemLink, type: "mkv" });
          break;

        case itemLink.includes("fastdl") || itemLink.includes("fsl."):
          streamLinks.push({ server: "FastDl", link: itemLink, type: "mkv" });
          break;

        case itemLink.includes("hubcdn") && !itemLink.includes("/?id="):
          streamLinks.push({
            server: "HubCdn",
            link: itemLink,
            type: "mkv",
          });
          break;

        default:
          if (itemLink.includes(".mkv") || itemLink.includes(".mp4") || itemLink.includes("?token=")) {
            const serverName =
              itemLink
                .match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)?.[1]
                ?.replace(/\./g, " ") || "Unknown";
            streamLinks.push({ server: serverName, link: itemLink, type: "mkv" });
          }
          break;
      }
    }

    console.log("streamLinks", streamLinks);
    return streamLinks;
  } catch (error: any) {
    console.log("hubcloudExtractor error: ", error?.message || error);
    return [];
  }
}

