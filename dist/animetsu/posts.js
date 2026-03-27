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

// providers/animetsu/posts.ts
var posts_exports = {};
__export(posts_exports, {
  getPosts: () => getPosts,
  getSearchPosts: () => getSearchPosts
});

var getPosts = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    filter,
    page,
    signal,
    providerContext
  }) {
    const { axios } = providerContext;
    const baseUrl = "https://backend.animetsu.to";
    const url = baseUrl + filter + "&page=" + page.toString();
    console.log("animetsuGetPosts url", url);
    return posts({ url: url.toString(), signal, axios });
  });
}, "getPosts");
var getSearchPosts = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    searchQuery,
    page,
    signal,
    providerContext
  }) {
    const { axios } = providerContext;
    const baseUrl = "https://backend.animetsu.to";
    const url = `${baseUrl}/api/anime/search?query=${encodeURIComponent(
      searchQuery
    )}&page=${page}&perPage=35&year=any&sort=favourites&season=any&format=any&status=any`;
    return posts({ url, signal, axios });
  });
}, "getSearchPosts");
function posts(_0) {
  return __async(this, arguments, function* ({
    url,
    signal,
    axios
  }) {
    var _a;
    try {
      const res = yield axios.get(url, {
        signal,
        headers: {
          Referer: "https://animetsu.to/"
        }
      });
      const data = (_a = res.data) == null ? void 0 : _a.results;
      const catalog = [];
      data == null ? void 0 : data.map((element) => {
        var _a2, _b, _c, _d, _e, _f, _g;
        const title = ((_a2 = element.title) == null ? void 0 : _a2.english) || ((_b = element.title) == null ? void 0 : _b.romaji) || ((_c = element.title) == null ? void 0 : _c.native);
        const link = (_d = element.id) == null ? void 0 : _d.toString();
        const image = ((_e = element.coverImage) == null ? void 0 : _e.large) || ((_f = element.coverImage) == null ? void 0 : _f.extraLarge) || ((_g = element.coverImage) == null ? void 0 : _g.medium);
        if (title && link && image) {
          catalog.push({
            title,
            link,
            image
          });
        }
      });
      return catalog;
    } catch (err) {
      console.error("animetsu error ", err);
      return [];
    }
  });
}
__name(posts, "posts");
exports.getPosts = getPosts;
exports.getSearchPosts = getSearchPosts;
// Annotate the CommonJS export names for ESM import in node:

