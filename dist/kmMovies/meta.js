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

// providers/kmMovies/meta.ts
var meta_exports = {};
__export(meta_exports, {
  getMeta: () => getMeta
});

var kmmHeaders = {
  Referer: "https://google.com",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
};
var getMeta = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    link,
    providerContext
  }) {
    var _a, _b;
    try {
      const { axios, cheerio } = providerContext;
      if (!link.startsWith("http")) {
        const baseUrl = yield providerContext.getBaseUrl("kmmovies");
        link = `${baseUrl}${link.startsWith("/") ? "" : "/"}${link}`;
      }
      const res = yield axios.get(link, { headers: kmmHeaders });
      const $ = cheerio.load(res.data);
      const title = $("h1, h2, .animated-text").first().text().trim() || ((_a = $("meta[property='og:title']").attr("content")) == null ? void 0 : _a.trim()) || $("title").text().trim() || "Unknown";
      let image = $("div.wp-slider-container img").first().attr("src") || $("meta[property='og:image']").attr("content") || $("meta[name='twitter:image']").attr("content") || "";
      if (!image || !image.startsWith("http")) {
        image = new URL(image || "/placeholder.png", link).href;
      }
      let synopsis = "";
      $("p").each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 40 && !text.toLowerCase().includes("download") && !text.toLowerCase().includes("quality")) {
          synopsis = text;
          return false;
        }
      });
      if (!synopsis) {
        synopsis = $("meta[property='og:description']").attr("content") || $("meta[name='description']").attr("content") || "";
      }
      const tags = [];
      if (res.data.toLowerCase().includes("action")) tags.push("Action");
      if (res.data.toLowerCase().includes("drama")) tags.push("Drama");
      if (res.data.toLowerCase().includes("romance")) tags.push("Romance");
      if (res.data.toLowerCase().includes("thriller")) tags.push("Thriller");
      const cast = [];
      $("p").each((_, el) => {
        const text = $(el).text().trim();
        if (/starring|cast/i.test(text)) {
          text.split(",").forEach((name) => cast.push(name.trim()));
        }
      });
      let rating = ((_b = $("p").text().match(/IMDb Rating[:\s]*([0-9.]+)/i)) == null ? void 0 : _b[1]) || "";
      if (rating && !rating.includes("/")) rating = rating + "/10";
      const imdbLink = $("p a[href*='imdb.com']").attr("href") || "";
      const imdbId = imdbLink && imdbLink.includes("/tt") ? "tt" + imdbLink.split("/tt")[1].split("/")[0] : "";
      const linkList = [];
      const isSeries = $(".download-options-grid").length > 0;
      if (isSeries) {
        $(".download-card").each((_, card) => {
          const card$ = $(card);
          const quality = card$.find(".download-quality-text").text().trim();
          const size = card$.find(".download-size-info").text().trim() || "";
          const href = card$.find("a.tabs-download-button").attr("href") || "";
          if (href) {
            const titleText = `Download ${quality} ${size}`.trim();
            linkList.push({
              title: titleText,
              quality: quality || "AUTO",
              directLinks: [
                {
                  link: href,
                  title: titleText,
                  type: "series"
                }
              ]
            });
          }
        });
      } else {
        $("a.modern-download-button").each((_, a) => {
          const parent = $(a).closest(".modern-option-card");
          const quality = parent.find(".modern-badge").text().trim() || "AUTO";
          const href = $(a).attr("href") || "";
          const titleText = `Download ${quality}`;
          if (href) {
            linkList.push({
              title: titleText,
              quality,
              directLinks: [
                {
                  link: href,
                  title: titleText,
                  type: "movie"
                }
              ]
            });
          }
        });
      }
      return {
        title,
        synopsis,
        image,
        imdbId,
        type: isSeries ? "series" : "movie",
        tags,
        cast,
        rating,
        linkList
      };
    } catch (err) {
      console.error("KMMOVIES getMeta error:", err);
      return {
        title: "",
        synopsis: "",
        image: "https://via.placeholder.com/300x450",
        imdbId: "",
        type: "movie",
        tags: [],
        cast: [],
        rating: "",
        linkList: []
      };
    }
  });
}, "getMeta");
exports.getMeta = getMeta;
// Annotate the CommonJS export names for ESM import in node:

