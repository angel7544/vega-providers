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

// providers/animetsu/stream.ts
var stream_exports = {};
__export(stream_exports, {
  getStream: () => getStream
});

var getStream = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    link: id,
    providerContext
  }) {
    try {
      const { axios } = providerContext;
      const baseUrl = "https://backend.animetsu.to";
      const [animeId, episodeNumber] = id.split(":");
      if (!animeId || !episodeNumber) {
        throw new Error("Invalid link format");
      }
      const servers = ["pahe", "zoro"];
      const streamLinks = [];
      yield Promise.all(
        servers.map((server) => __async(null, null, function* () {
          try {
            const url = `${baseUrl}/api/anime/tiddies?server=${server}&id=${animeId}&num=${episodeNumber}&subType=sub`;
            const res = yield axios.get(url, {
              headers: {
                Referer: "https://animetsu.to/"
              }
            });
            if (res.data && res.data.sources) {
              const subtitles = [];
              res.data.sources.forEach((source) => {
                streamLinks.push({
                  server: server + `: ${source.quality}`,
                  link: `https://m3u8.8man.workers.dev?url=${source.url}`,
                  type: "m3u8",
                  quality: source.quality,
                  headers: {
                    referer: "https://animetsu.to/"
                  },
                  subtitles: subtitles.length > 0 ? subtitles : []
                });
              });
            }
          } catch (e) {
            console.log(`Error with server ${server}:`, e);
          }
        }))
      );
      yield Promise.all(
        servers.map((server) => __async(null, null, function* () {
          try {
            const url = `${baseUrl}/api/anime/tiddies?server=${server}&id=${animeId}&num=${episodeNumber}&subType=dub`;
            const res = yield axios.get(url, {
              headers: {
                referer: "https://animetsu.to/"
              }
            });
            if (res.data && res.data.sources) {
              const subtitles = [];
              res.data.sources.forEach((source) => {
                streamLinks.push({
                  server: `${server} (Dub) : ${source.quality}`,
                  link: `https://m3u8.8man.workers.dev?url=${source.url}`,
                  type: "m3u8",
                  quality: source.quality,
                  headers: {
                    referer: "https://animetsu.to/"
                  },
                  subtitles: subtitles.length > 0 ? subtitles : []
                });
              });
            }
          } catch (e) {
            console.log(`Error with server ${server} (dub):`, e);
          }
        }))
      );
      console.log("Stream links:", streamLinks);
      return streamLinks;
    } catch (err) {
      console.error("animetsu stream error:", err);
      return [];
    }
  });
}, "getStream");
exports.getStream = getStream;
// Annotate the CommonJS export names for ESM import in node:

