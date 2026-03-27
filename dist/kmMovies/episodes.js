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

// providers/kmMovies/episodes.ts
var episodes_exports = {};
__export(episodes_exports, {
  getEpisodeLinks: () => getEpisodeLinks,
  getEpisodes: () => getEpisodes
});

function getEpisodeLinks(_0) {
  return __async(this, arguments, function* ({
    url,
    providerContext
  }) {
    try {
      const res = yield providerContext.axios.get(url);
      const $ = providerContext.cheerio.load(res.data || "");
      const episodes = [];
      $("h4.fittexted_for_content_h4").each((_, h4El) => {
        const epTitle = $(h4El).text().trim();
        if (!epTitle) return;
        $(h4El).nextUntil("h4, hr").find("a[href]").each((_2, linkEl) => {
          let href = ($(linkEl).attr("href") || "").trim();
          if (!href) return;
          if (!href.startsWith("http")) href = new URL(href, url).href;
          const btnText = $(linkEl).text().trim() || "Watch Episode";
          const lowerHref = href.toLowerCase();
          if (lowerHref.includes("skydro") || lowerHref.includes("flexplayer.buzz")) {
            episodes.push({
              title: `${epTitle} - ${btnText}`,
              link: href
            });
          }
        });
      });
      episodes.sort((a, b) => {
        var _a, _b;
        const numA = parseInt(((_a = a.title.match(/\d+/)) == null ? void 0 : _a[0]) || "0");
        const numB = parseInt(((_b = b.title.match(/\d+/)) == null ? void 0 : _b[0]) || "0");
        return numA - numB;
      });
      return episodes;
    } catch (err) {
      console.error("getEpisodeLinks error:", err);
      return [];
    }
  });
}
__name(getEpisodeLinks, "getEpisodeLinks");
function getEpisodes(_0) {
  return __async(this, arguments, function* ({
    url,
    providerContext
  }) {
    return yield getEpisodeLinks({ url, providerContext });
  });
}
__name(getEpisodes, "getEpisodes");
exports.getEpisodeLinks = getEpisodeLinks;
exports.getEpisodes = getEpisodes;
// Annotate the CommonJS export names for ESM import in node:

