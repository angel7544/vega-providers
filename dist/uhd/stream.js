"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// providers/uhd/stream.ts
var stream_exports = {};
__export(stream_exports, {
  getStream: () => getStream
});

var headers = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Cache-Control": "no-store",
  "Accept-Language": "en-US,en;q=0.9",
  DNT: "1",
  "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
};
var getStream = /* @__PURE__ */ __name((_0) => __async(null, [_0], function* ({
  link: url,
  providerContext
}) {
  var _a, _b;
  try {
    const { axios, cheerio } = providerContext;
    if (!url) return [];
    let downloadLinkRes = yield modExtractor(url, providerContext);
    const ddl = ((_b = (_a = downloadLinkRes == null ? void 0 : downloadLinkRes.data) == null ? void 0 : _a.match(/content="0;url=(.*?)"/)) == null ? void 0 : _b[1]) || url;
    console.log("ddl", ddl);
    const driveLink = yield isDriveLink(ddl, axios);
    const ServerLinks = [];
    if (!driveLink) return [];
    const driveRes = yield axios.get(driveLink, { headers });
    const driveHtml = driveRes.data;
    const $drive = cheerio.load(driveHtml);
    try {
      const seed = $drive(".btn-danger").attr("href") || "";
      if (seed) {
        const instantToken = seed.split("=")[1];
        const videoSeedUrl = seed.split("/").slice(0, 3).join("/") + "/api";
        const params = new URLSearchParams();
        params.append("keys", instantToken);
        const instantLinkRes = yield axios.post(videoSeedUrl, params, {
          headers: {
            "x-token": videoSeedUrl,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        });
        const instantLinkData = instantLinkRes.data;
        if (instantLinkData && instantLinkData.error === false) {
          ServerLinks.push({
            server: "Gdrive-Instant",
            link: instantLinkData.url,
            type: "mkv"
          });
        }
      }
    } catch (err) {
      console.log("Instant link 1 error", err);
    }
    try {
      const seed = $drive(".btn-danger").attr("href") || "";
      if (seed) {
        const newLinkRes = yield axios.head(seed, {
          headers,
          maxRedirects: 0,
          validateStatus: /* @__PURE__ */ __name((status) => status >= 200 && status < 400, "validateStatus")
        });
        let newLink = newLinkRes.headers.location || seed;
        const streamUrl = newLink.split("?url=")[1] || newLink;
        if (streamUrl) {
          ServerLinks.push({
            server: "Gdrive-Instant-2",
            link: streamUrl,
            type: "mkv"
          });
        }
      }
    } catch (err) {
      console.log("Instant link 2 error", err);
    }
    try {
      const resumeDrive = driveLink.replace("/file", "/zfile");
      const resumeDriveRes = yield axios.get(resumeDrive, { headers });
      const $resumeDrive = cheerio.load(resumeDriveRes.data);
      const resumeLink = $resumeDrive(".btn-success").attr("href");
      if (resumeLink) {
        ServerLinks.push({
          server: "ResumeCloud",
          link: resumeLink,
          type: "mkv"
        });
      }
    } catch (err) {
      console.log("Resume link not found");
    }
    for (const type of [1, 2]) {
      try {
        const cfWorkersLink = driveLink.replace("/file", "/wfile") + `?type=${type}`;
        const cfWorkersRes = yield axios.get(cfWorkersLink, { headers });
        const $cfWorkers = cheerio.load(cfWorkersRes.data);
        $cfWorkers(".btn-success").each((i, el) => {
          const link = $cfWorkers(el).attr("href");
          if (link) {
            ServerLinks.push({
              server: `Cf Worker ${type}.${i}`,
              link,
              type: "mkv"
            });
          }
        });
      } catch (e) {
      }
    }
    console.log("ServerLinks", ServerLinks);
    return ServerLinks;
  } catch (err) {
    console.log("getStream error", err);
    return [];
  }
}), "getStream");
var isDriveLink = /* @__PURE__ */ __name((ddl, axios) => __async(null, null, function* () {
  if (!ddl) return "";
  if (ddl.includes("drive")) {
    try {
      const driveLeach = yield axios.get(ddl);
      const driveLeachData = driveLeach.data;
      const pathMatch = driveLeachData.match(/window\.location\.replace\("([^"]+)"\)/);
      const path = pathMatch == null ? void 0 : pathMatch[1];
      if (!path) return ddl;
      const urlObj = new URL(ddl);
      return `${urlObj.protocol}//${urlObj.hostname}${path}`;
    } catch (e) {
      return ddl;
    }
  } else {
    return ddl;
  }
}), "isDriveLink");
function modExtractor(url, providerContext) {
  return __async(this, null, function* () {
    const { axios, cheerio } = providerContext;
    try {
      const wpHttp = url.split("sid=")[1];
      if (!wpHttp) return { data: "" };
      const params0 = new URLSearchParams();
      params0.append("_wp_http", wpHttp);
      const targetUrl = url.split("?")[0];
      const res = yield axios.post(targetUrl, params0, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      const $ = cheerio.load(res.data);
      const wpHttp2 = $("input[name='_wp_http2']").val();
      if (!wpHttp2) return res;
      const params = new URLSearchParams();
      params.append("_wp_http2", wpHttp2);
      const formUrl = $("form").attr("action") || targetUrl;
      const res2 = yield axios.post(formUrl, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      const html2 = res2.data;
      const linkMatch = html2.match(/setAttribute\("href",\s*"(.*?)"/);
      if (!linkMatch) return res2;
      const link = linkMatch[1];
      const cookieName = link.split("=")[1];
      const downloadLink = yield axios.get(link, {
        headers: {
          Referer: formUrl,
          Cookie: `${cookieName}=${wpHttp2}`
        }
      });
      return downloadLink;
    } catch (err) {
      console.log("modGetStream error", err);
      return { data: "" };
    }
  });
}
__name(modExtractor, "modExtractor");
exports.getStream = getStream;
// Annotate the CommonJS export names for ESM import in node:

