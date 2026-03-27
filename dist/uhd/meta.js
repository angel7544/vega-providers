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

// providers/uhd/meta.ts
var meta_exports = {};
__export(meta_exports, {
  getMeta: () => getMeta
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
var getMeta = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    link,
    providerContext
  }) {
    var _a;
    try {
      const { axios, cheerio } = providerContext;
      console.log("Fetching metadata from UHD...", link, providerContext);
      const url = link;
      const res = yield axios.get(url, { headers });
      const html = yield res.data;
      const $ = cheerio.load(html);
      const title = $("h2:first").text() || "";
      const image = $("h2").siblings().find("img").attr("src") || "";
      const episodes = [];
      $(".mks_separator,p:contains('mks_separator')").each((index, element) => {
        $(element).nextUntil(".mks_separator").each((index2, element2) => {
          const title2 = $(element2).text();
          const episodesList = [];
          $(element2).next("p").find("a").each((index3, element3) => {
            const title3 = $(element3).text();
            const link2 = $(element3).attr("href");
            if (title3 && link2 && !title3.toLocaleLowerCase().includes("zip")) {
              episodesList.push({ title: title3, link: link2 });
            }
          });
          if (title2 && episodesList.length > 0) {
            episodes.push({
              title: title2,
              directLinks: episodesList
            });
          }
        });
      });
      $("hr").each((index, element) => {
        $(element).nextUntil("hr").each((index2, element2) => {
          const title2 = $(element2).text();
          const episodesList = [];
          $(element2).next("p").find("a").each((index3, element3) => {
            const title3 = $(element3).text();
            const link2 = $(element3).attr("href");
            if (title3 && link2 && !title3.toLocaleLowerCase().includes("zip")) {
              episodesList.push({ title: title3, link: link2 });
            }
          });
          if (title2 && episodesList.length > 0) {
            episodes.push({
              title: title2,
              directLinks: episodesList
            });
          }
        });
      });
      return {
        title: title.match(/^Download\s+([^(\[]+)/i) ? ((_a = title == null ? void 0 : title.match(/^Download\s+([^(\[]+)/i)) == null ? void 0 : _a[1]) || "" : title.replace("Download", "") || "",
        image,
        imdbId: "",
        synopsis: title,
        type: "",
        linkList: episodes
      };
    } catch (error) {
      console.error(error);
      return {
        title: "",
        image: "",
        imdbId: "",
        synopsis: "",
        linkList: [],
        type: "uhd"
      };
    }
  });
}, "getMeta");
exports.getMeta = getMeta;
// Annotate the CommonJS export names for ESM import in node:

