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

// providers/animetsu/meta.ts
var meta_exports = {};
__export(meta_exports, {
  getMeta: () => getMeta
});

var getMeta = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    link,
    providerContext
  }) {
    var _a, _b, _c, _d, _e, _f;
    try {
      const { axios } = providerContext;
      const baseUrl = "https://backend.animetsu.to";
      const url = `${baseUrl}/api/anime/info/${link}`;
      const res = yield axios.get(url, {
        headers: {
          Referer: "https://animetsu.to/"
        }
      });
      const data = res.data;
      const meta = {
        title: ((_a = data.title) == null ? void 0 : _a.english) || ((_b = data.title) == null ? void 0 : _b.romaji) || ((_c = data.title) == null ? void 0 : _c.native) || "",
        synopsis: data.description || "",
        image: ((_d = data.coverImage) == null ? void 0 : _d.extraLarge) || ((_e = data.coverImage) == null ? void 0 : _e.large) || ((_f = data.coverImage) == null ? void 0 : _f.medium) || "",
        tags: [data == null ? void 0 : data.format, data == null ? void 0 : data.status, ...(data == null ? void 0 : data.genres) || []].filter(
          Boolean
        ),
        imdbId: "",
        type: data.format === "MOVIE" ? "movie" : "series"
      };
      const linkList = [];
      try {
        const episodesRes = yield axios.get(`${baseUrl}/api/anime/eps/${link}`, {
          headers: {
            Referer: "https://animetsu.to/"
          }
        });
        const episodes = episodesRes.data;
        if (episodes && episodes.length > 0) {
          const directLinks = [];
          episodes.forEach((episode) => {
            const title = `Episode ${episode.number}`;
            const episodeLink = `${link}:${episode.number}`;
            if (episodeLink && title) {
              directLinks.push({
                title,
                link: episodeLink
              });
            }
          });
          linkList.push({
            title: meta.title,
            directLinks
          });
        } else {
          linkList.push({
            title: meta.title,
            directLinks: [
              {
                title: "Movie",
                link: `${link}:1`
              }
            ]
          });
        }
      } catch (episodeErr) {
        console.error("Error fetching episodes:", episodeErr);
        linkList.push({
          title: meta.title,
          directLinks: [
            {
              title: meta.title,
              link: `${link}:1`
            }
          ]
        });
      }
      return __spreadProps(__spreadValues({}, meta), {
        linkList
      });
    } catch (err) {
      console.error("animetsu meta error:", err);
      return {
        title: "",
        synopsis: "",
        image: "",
        imdbId: "",
        type: "movie",
        linkList: []
      };
    }
  });
}, "getMeta");
exports.getMeta = getMeta;
// Annotate the CommonJS export names for ESM import in node:

