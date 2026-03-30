"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
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

// providers/katmovies/stream.ts
var stream_exports = {};
__export(stream_exports, {
  getStream: () => getStream
});


// providers/extractors/hubcloud.ts
var hubcloudDecode = /* @__PURE__ */ __name(function(value) {
  if (value === void 0) {
    return "";
  }
  return atob(value.toString());
}, "hubcloudDecode");
function hubcloudExtractor(link, signal, axios, cheerio, headers) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d;
    try {
      const localHeaders = __spreadProps(__spreadValues({}, headers), {
        Cookie: "ext_name=ojplmecpdpgccookcobabopnaifgidhf; xla=s4t; cf_clearance=woQrFGXtLfmEMBEiGUsVHrUBMT8s3cmguIzmMjmvpkg-1770053679-1.2.1.1-xBrQdciOJsweUF6F2T_OtH6jmyanN_TduQ0yslc_XqjU6RcHSxI7.YOKv6ry7oYo64868HYoULnVyww536H2eVI3R2e4wKzsky6abjPdfQPxqpUaXjxfJ02o6jl3_Vkwr4uiaU7Wy596Vdst3y78HXvVmKdIohhtPvp.vZ9_L7wvWdce0GRixjh_6JiqWmWMws46hwEt3hboaS1e1e4EoWCvj5b0M_jVwvSxBOAW5emFzvT3QrnRh4nyYmKDERnY"
      });
      console.log("hubcloudExtractor", link);
      if (!link) return [];
      const baseUrl = link.split("/").slice(0, 3).join("/");
      const streamLinks = [];
      const vLinkRes = yield axios(`${link}`, { headers: localHeaders, signal });
      const vLinkText = vLinkRes.data;
      const $vLink = cheerio.load(vLinkText);
      const vLinkRedirect = vLinkText.match(/var\s+url\s*=\s*'([^']+)';/) || [];
      let vcloudLink = hubcloudDecode((_b = (_a = vLinkRedirect[1]) == null ? void 0 : _a.split("r=")) == null ? void 0 : _b[1]) || vLinkRedirect[1] || $vLink(".fa-file-download.fa-lg").parent().attr("href") || link;
      console.log("vcloudLink", vcloudLink);
      if (!vcloudLink) return [];
      if (vcloudLink.startsWith("/")) {
        vcloudLink = `${baseUrl}${vcloudLink}`;
        console.log("New vcloudLink", vcloudLink);
      }
      const vcloudRes = yield axios(vcloudLink, {
        headers: localHeaders,
        signal
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
          case (itemLink.includes(".dev") && !itemLink.includes("/?id=")):
            streamLinks.push({ server: "Cf Worker", link: itemLink, type: "mkv" });
            break;
          case (itemLink.includes("hubcloud") || itemLink.includes("/?id=")):
            try {
              const newLinkRes = yield axios(itemLink, {
                method: "HEAD",
                headers: localHeaders,
                signal,
                validateStatus: /* @__PURE__ */ __name((status) => status >= 200 && status < 400, "validateStatus"),
                maxRedirects: 0
              });
              let newLink = newLinkRes.headers.location || itemLink;
              if (newLink.includes("googleusercontent")) {
                newLink = newLink.split("?link=")[1] || newLink;
              } else {
                const newLinkRes2 = yield axios(newLink, {
                  method: "HEAD",
                  headers: localHeaders,
                  signal,
                  validateStatus: /* @__PURE__ */ __name((status) => status >= 200 && status < 400, "validateStatus"),
                  maxRedirects: 0
                });
                if (newLinkRes2.headers.location) {
                  newLink = newLinkRes2.headers.location.split("?link=")[1] || newLinkRes2.headers.location;
                }
              }
              streamLinks.push({
                server: "hubcloud",
                link: newLink,
                type: "mkv"
              });
            } catch (error) {
              console.log("hubcloudExtractor error in hubcloud link: ", error);
            }
            break;
          case itemLink.includes("cloudflarestorage"):
            streamLinks.push({ server: "CfStorage", link: itemLink, type: "mkv" });
            break;
          case (itemLink.includes("fastdl") || itemLink.includes("fsl.")):
            streamLinks.push({ server: "FastDl", link: itemLink, type: "mkv" });
            break;
          case (itemLink.includes("hubcdn") && !itemLink.includes("/?id=")):
            streamLinks.push({
              server: "HubCdn",
              link: itemLink,
              type: "mkv"
            });
            break;
          default:
            if (itemLink.includes(".mkv") || itemLink.includes(".mp4") || itemLink.includes("?token=")) {
              const serverName = ((_d = (_c = itemLink.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)) == null ? void 0 : _c[1]) == null ? void 0 : _d.replace(/\./g, " ")) || "Unknown";
              streamLinks.push({ server: serverName, link: itemLink, type: "mkv" });
            }
            break;
        }
      }
      console.log("streamLinks", streamLinks);
      return streamLinks;
    } catch (error) {
      console.log("hubcloudExtractor error: ", (error == null ? void 0 : error.message) || error);
      return [];
    }
  });
}
__name(hubcloudExtractor, "hubcloudExtractor");

// providers/extractors/gdflix.ts
function gdflixExtractor(link, signal, axios, cheerio, headers) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
      const streamLinks = [];
      const res = yield axios(`${link}`, { headers, signal });
      console.log("gdflixExtractor", link);
      const data = res.data;
      let $drive = cheerio.load(data);
      if ((_a = $drive("body").attr("onload")) == null ? void 0 : _a.includes("location.replace")) {
        const newLink = (_d = (_c = (_b = $drive("body").attr("onload")) == null ? void 0 : _b.split("location.replace('")) == null ? void 0 : _c[1].split("'")) == null ? void 0 : _d[0];
        console.log("newLink", newLink);
        if (newLink) {
          const newRes = yield axios.get(newLink, { headers, signal });
          $drive = cheerio.load(newRes.data);
        }
      }
      try {
        const baseUrl = link.split("/").slice(0, 3).join("/");
        const resumeDrive = $drive(".btn-secondary").attr("href") || "";
        console.log("resumeDrive", resumeDrive);
        if (resumeDrive.includes("indexbot")) {
          const resumeBotRes = yield axios.get(resumeDrive, { headers });
          const resumeBotToken = resumeBotRes.data.match(
            /formData\.append\('token', '([a-f0-9]+)'\)/
          )[1];
          const resumeBotBody = new FormData();
          resumeBotBody.append("token", resumeBotToken);
          const resumeBotPath = resumeBotRes.data.match(
            /fetch\('\/download\?id=([a-zA-Z0-9\/+]+)'/
          )[1];
          const resumeBotBaseUrl = resumeDrive.split("/download")[0];
          const resumeBotDownload = yield fetch(
            resumeBotBaseUrl + "/download?id=" + resumeBotPath,
            {
              method: "POST",
              body: resumeBotBody,
              headers: {
                Referer: resumeDrive,
                Cookie: "PHPSESSID=7e9658ce7c805dab5bbcea9046f7f308"
              }
            }
          );
          const resumeBotDownloadData = yield resumeBotDownload.json();
          console.log("resumeBotDownloadData", resumeBotDownloadData.url);
          streamLinks.push({
            server: "ResumeBot",
            link: resumeBotDownloadData.url,
            type: "mkv"
          });
        } else {
          const url = baseUrl + resumeDrive;
          const resumeDriveRes = yield axios.get(url, { headers });
          const resumeDriveHtml = resumeDriveRes.data;
          const $resumeDrive = cheerio.load(resumeDriveHtml);
          const resumeLink = $resumeDrive(".btn-success").attr("href");
          if (resumeLink) {
            streamLinks.push({
              server: "ResumeCloud",
              link: resumeLink,
              type: "mkv"
            });
          }
        }
      } catch (err) {
        console.log("Resume link not found");
      }
      try {
        const seed = $drive(".btn-danger").attr("href") || "";
        console.log("seed", seed);
        if (!seed.includes("?url=")) {
          const newLinkRes = yield axios.head(seed, { headers, signal });
          console.log("newLinkRes", (_e = newLinkRes.request) == null ? void 0 : _e.responseURL);
          const newLink = ((_h = (_g = (_f = newLinkRes.request) == null ? void 0 : _f.responseURL) == null ? void 0 : _g.split("?url=")) == null ? void 0 : _h[1]) || seed;
          streamLinks.push({ server: "G-Drive", link: newLink, type: "mkv" });
        } else {
          const instantToken = seed.split("=")[1];
          const InstantFromData = new FormData();
          InstantFromData.append("keys", instantToken);
          const videoSeedUrl = seed.split("/").slice(0, 3).join("/") + "/api";
          const instantLinkRes = yield fetch(videoSeedUrl, {
            method: "POST",
            body: InstantFromData,
            headers: {
              "x-token": videoSeedUrl
            }
          });
          const instantLinkData = yield instantLinkRes.json();
          if (instantLinkData.error === false) {
            const instantLink = instantLinkData.url;
            streamLinks.push({
              server: "Gdrive-Instant",
              link: instantLink,
              type: "mkv"
            });
          } else {
            console.log("Instant link not found", instantLinkData);
          }
        }
      } catch (err) {
        console.log("Instant link not found", err);
      }
      return streamLinks;
    } catch (error) {
      console.log("gdflix error: ", error);
      return [];
    }
  });
}
__name(gdflixExtractor, "gdflixExtractor");

// providers/katmovies/stream.ts
function extractKmhdLink(katlink, providerContext) {
  return __async(this, null, function* () {
    const { axios } = providerContext;
    const res = yield axios.get(katlink, {
      headers: {
        Cookie: "unlocked=true"
      }
    });
    const data = res.data;
    const hubDriveRes = data.match(/hubdrive_res:\s*"([^"]+)"/)[1];
    const hubDriveLink = data.match(
      /hubdrive_res\s*:\s*{[^}]*?link\s*:\s*"([^"]+)"/
    )[1];
    return hubDriveLink + hubDriveRes;
  });
}
__name(extractKmhdLink, "extractKmhdLink");
var getStream = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    link,
    signal,
    providerContext
  }) {
    const { axios, cheerio, commonHeaders } = providerContext;
    const streamLinks = [];
    console.log("katGetStream", link);
    try {
      if (link.includes("gdflix")) {
        return yield gdflixExtractor(link, signal, axios, cheerio, commonHeaders);
      }
      if (link.includes("kmhd")) {
        const hubcloudLink = yield extractKmhdLink(link, providerContext);
        return yield hubcloudExtractor(
          hubcloudLink,
          signal,
          axios,
          cheerio,
          commonHeaders
        );
      }
      if (link.includes("gdflix")) {
        try {
          const resumeDrive = link.replace("/file", "/zfile");
          const resumeDriveRes = yield axios.get(resumeDrive);
          const resumeDriveHtml = resumeDriveRes.data;
          const $resumeDrive = cheerio.load(resumeDriveHtml);
          const resumeLink = $resumeDrive(".btn-success").attr("href");
          console.log("resumeLink", resumeLink);
          if (resumeLink) {
            streamLinks.push({
              server: "ResumeCloud",
              link: resumeLink,
              type: "mkv"
            });
          }
        } catch (err) {
          console.log("Resume link not found");
        }
        try {
          const driveres = yield axios.get(link, { timeout: 1e4 });
          const $drive = cheerio.load(driveres.data);
          const seed = $drive(".btn-danger").attr("href") || "";
          const instantToken = seed.split("=")[1];
          const InstantFromData = new FormData();
          InstantFromData.append("keys", instantToken);
          const videoSeedUrl = seed.split("/").slice(0, 3).join("/") + "/api";
          const instantLinkRes = yield fetch(videoSeedUrl, {
            method: "POST",
            body: InstantFromData,
            headers: {
              "x-token": videoSeedUrl
            }
          });
          const instantLinkData = yield instantLinkRes.json();
          console.log("instantLinkData", instantLinkData);
          if (instantLinkData.error === false) {
            const instantLink = instantLinkData.url;
            streamLinks.push({
              server: "Gdrive-Instant",
              link: instantLink,
              type: "mkv"
            });
          } else {
            console.log("Instant link not found", instantLinkData);
          }
        } catch (err) {
          console.log("Instant link not found", err);
        }
        return streamLinks;
      }
      const stereams = yield hubcloudExtractor(
        link,
        signal,
        axios,
        cheerio,
        commonHeaders
      );
      return stereams;
    } catch (error) {
      console.log("katgetStream error: ", error);
      return [];
    }
  });
}, "getStream");
exports.getStream = getStream;
// Annotate the CommonJS export names for ESM import in node:

