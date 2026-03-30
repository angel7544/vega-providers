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

// providers/vega/stream.ts
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
function hubcloudExtractor(link, signal, axios, cheerio, headers2) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d;
    try {
      const localHeaders = __spreadProps(__spreadValues({}, headers2), {
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

// providers/vega/stream.ts
var headers = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
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
  Cookie: "ext_name=ojplmecpdpgccookcobabopnaifgidhf; cf_clearance=6yZYfXQxBgjaD1eacR5zZCz7njssbxjtSZZCElTOGk0-1764836255-1.2.1.1-bzHvDcDRLp6AAYo7qvGVzJ6Gk6zaqAepuGiGhAWCGYL.ZDpw5yI4TkUIXDgAnEhGCZ9J5X2_OagzgeMHZrd8rzeyAFQXj0dmYMErcfII7_Rhq5kZ4kAtS0tl9PtaNKKd2m4taIufySXCCstl3iNLMODTjbsW_KZi8U8DauOdGSAhBd1DCGxvLlAOM.snfkhb0yQiVJcLW8Bv9IeKQac0ar_TKkV6QexqNZYiyRXnE7E; xla=s4t",
  "Upgrade-Insecure-Requests": "1",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0"
};
function getStream(_0) {
  return __async(this, arguments, function* ({
    link,
    type,
    signal,
    providerContext
  }) {
    var _a, _b, _c, _d;
    const { axios, cheerio, commonHeaders } = providerContext;
    try {
      const streamLinks = [];
      console.log("dotlink", link);
      if (type === "movie") {
        const dotlinkRes = yield axios(`${link}`, { headers });
        const dotlinkText = dotlinkRes.data;
        const vlink = dotlinkText.match(/<a\s+href="([^"]*cloud\.[^"]*)"/i) || [];
        link = vlink[1];
        try {
          const $ = cheerio.load(dotlinkText);
          const filepressLink = $(
            '.btn.btn-sm.btn-outline[style="background:linear-gradient(135deg,rgb(252,185,0) 0%,rgb(0,0,0)); color: #fdf8f2;"]'
          ).parent().attr("href");
          const filepressID = filepressLink == null ? void 0 : filepressLink.split("/").pop();
          const filepressBaseUrl = filepressLink == null ? void 0 : filepressLink.split("/").slice(0, -2).join("/");
          const filepressTokenRes = yield axios.post(
            filepressBaseUrl + "/api/file/downlaod/",
            {
              id: filepressID,
              method: "indexDownlaod",
              captchaValue: null
            },
            {
              headers: {
                "Content-Type": "application/json",
                Referer: filepressBaseUrl
              }
            }
          );
          if ((_a = filepressTokenRes.data) == null ? void 0 : _a.status) {
            const filepressToken = (_b = filepressTokenRes.data) == null ? void 0 : _b.data;
            const filepressStreamLink = yield axios.post(
              filepressBaseUrl + "/api/file/downlaod2/",
              {
                id: filepressToken,
                method: "indexDownlaod",
                captchaValue: null
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  Referer: filepressBaseUrl
                }
              }
            );
            streamLinks.push({
              server: "filepress",
              link: (_d = (_c = filepressStreamLink.data) == null ? void 0 : _c.data) == null ? void 0 : _d[0],
              type: "mkv"
            });
          }
        } catch (error) {
          console.log("filepress error: ");
        }
      }
      return yield hubcloudExtractor(link, signal, axios, cheerio, commonHeaders);
    } catch (error) {
      console.log("getStream error: ", error);
      if (error.message.includes("Aborted")) {
      } else {
      }
      return [];
    }
  });
}
__name(getStream, "getStream");
exports.getStream = getStream;
// Annotate the CommonJS export names for ESM import in node:

