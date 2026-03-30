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

// providers/filmyfly/stream.ts
var stream_exports = {};
__export(stream_exports, {
  getStream: () => getStream
});


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

// providers/filmyfly/stream.ts
var getStream = /* @__PURE__ */ __name(function(_0) {
  return __async(this, arguments, function* ({
    link,
    signal,
    providerContext
  }) {
    const { axios, cheerio, commonHeaders: headers } = providerContext;
    try {
      const res = yield axios.get(link, { signal });
      const data = res.data;
      const $ = cheerio.load(data);
      const streams = [];
      const elements = $(".button2,.button1,.button3,.button4,.button").toArray();
      const promises = elements.map((element) => __async(null, null, function* () {
        const title = $(element).text();
        let link2 = $(element).attr("href");
        if (title.includes("GDFLIX") && link2) {
          const gdLinks = yield gdflixExtractor(
            link2,
            signal,
            axios,
            cheerio,
            headers
          );
          streams.push(...gdLinks);
        }
        const alreadyAdded = streams.find((s) => s.link === link2);
        if (title && link2 && !title.includes("Watch") && !title.includes("Login") && !title.includes("GoFile") && !alreadyAdded) {
          streams.push({
            server: title,
            link: link2,
            type: "mkv"
          });
        }
      }));
      yield Promise.all(promises);
      return streams;
    } catch (err) {
      console.error(err);
      return [];
    }
  });
}, "getStream");
exports.getStream = getStream;
// Annotate the CommonJS export names for ESM import in node:

