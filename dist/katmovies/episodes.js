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

// providers/katmovies/episodes.ts
var episodes_exports = {};
__export(episodes_exports, {
  extractKmhdLink: () => extractKmhdLink,
  getEpisodes: () => getEpisodes
});

var getEpisodes = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    url,
    providerContext
  }) {
    var _a;
    const { axios, cheerio } = providerContext;
    const episodesLink = [];
    try {
      if (url.includes("gdflix")) {
        const baseUrl = (_a = url.split("/pack")) == null ? void 0 : _a[0];
        const res2 = yield axios.get(url);
        const data = res2.data;
        const $2 = cheerio.load(data);
        const links2 = $2(".list-group-item");
        links2 == null ? void 0 : links2.map((i, link) => {
          episodesLink.push({
            title: $2(link).text() || "",
            link: baseUrl + $2(link).find("a").attr("href") || ""
          });
        });
        if (episodesLink.length > 0) {
          return episodesLink;
        }
      }
      if (url.includes("/pack")) {
        const epIds = yield extractKmhdEpisodes(url, providerContext);
        epIds == null ? void 0 : epIds.forEach((id, index) => {
          episodesLink.push({
            title: `Episode ${index + 1}`,
            link: url.split("/pack")[0] + "/file/" + id
          });
        });
      }
      const res = yield axios.get(url, {
        headers: {
          Cookie: "_ga_GNR438JY8N=GS1.1.1722240350.5.0.1722240350.0.0.0; _ga=GA1.1.372196696.1722150754; unlocked=true"
        }
      });
      const episodeData = res.data;
      const $ = cheerio.load(episodeData);
      const links = $(".autohyperlink");
      links == null ? void 0 : links.map((i, link) => {
        episodesLink.push({
          title: $(link).parent().children().remove().end().text() || "",
          link: $(link).attr("href") || ""
        });
      });
      return episodesLink;
    } catch (err) {
      console.error(err);
      return [];
    }
  });
}, "getEpisodes");
function extractKmhdLink(katlink, providerContext) {
  return __async(this, null, function* () {
    const { axios } = providerContext;
    const res = yield axios.get(katlink);
    const data = res.data;
    const hubDriveRes = data.match(/hubdrive_res:\s*"([^"]+)"/)[1];
    const hubDriveLink = data.match(
      /hubdrive_res\s*:\s*{[^}]*?link\s*:\s*"([^"]+)"/
    )[1];
    return hubDriveLink + hubDriveRes;
  });
}
__name(extractKmhdLink, "extractKmhdLink");
function extractKmhdEpisodes(katlink, providerContext) {
  return __async(this, null, function* () {
    const { axios } = providerContext;
    const res = yield axios.get(katlink);
    const data = res.data;
    const ids = data.match(/[\w]+_[a-f0-9]{8}/g);
    return ids;
  });
}
__name(extractKmhdEpisodes, "extractKmhdEpisodes");
exports.extractKmhdLink = extractKmhdLink;
exports.getEpisodes = getEpisodes;
// Annotate the CommonJS export names for ESM import in node:

