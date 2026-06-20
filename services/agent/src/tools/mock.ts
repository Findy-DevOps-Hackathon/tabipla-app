import type { GetUnchikuSourceFn, SearchFn, TravelTimesFn } from "../contracts.js";
import { KOMORO_SPOTS } from "../fixtures/spots.js";

// 本物(A3)と同じ型シグネチャ。fixtureを絞って返すだけ。
export const searchMock: SearchFn = async (i) => {
  let r = KOMORO_SPOTS;
  const cats = i.category;
  if (cats?.length) r = r.filter((s) => cats.includes(s.category));
  const priceMax = i.priceLevelMax;
  if (priceMax != null) r = r.filter((s) => s.priceLevel <= priceMax);
  return r.slice(0, i.k ?? 5);
};

// 本物(A4)まではダミー。緯度経度から距離ベースで概算（一律固定より旅程が自然になる）。
const haversineMeters = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
export const travelTimesMock: TravelTimesFn = async (i) => {
  const metersPerMin = { walk: 80, drive: 400, transit: 250 }[i.mode] ?? 80;
  return i.destinations.map((d) => {
    const meters = haversineMeters(i.origin, d.at);
    return { destId: d.id, durationSec: Math.max(60, Math.round((meters / metersPerMin) * 60)) };
  });
};

// 本物(B2)まではダミーの確かなfacts。
export const getUnchikuSourceMock: GetUnchikuSourceFn = async ({ spotId }) => {
  const facts: Record<string, string[]> = {
    s1: [
      "小諸城は城下町より低い位置にある「穴城」として知られる。",
      "島崎藤村が小諸義塾で教鞭をとった。",
    ],
    s2: ["高峰高原は標高約2000mに位置する。"],
    s4: [
      "小諸を含む東信州は日照時間が長く降水量が少なく、ワイン用ぶどうの栽培に向いた気候とされる。",
    ],
    s5: ["信州そばは長野県を代表する郷土料理として知られる。"],
    s6: ["中棚荘は文豪・島崎藤村ゆかりの宿として知られる。"],
  };
  return { spotId, facts: facts[spotId] ?? [] };
};
