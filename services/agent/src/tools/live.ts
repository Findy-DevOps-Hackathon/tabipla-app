import type { SearchFn, TravelTimesFn } from "../contracts.js";

// 本物のデータ層。A3/A4 が完成するまでは未実装(呼ばれない)。
// USE_MOCK=1 の間は dataSources.ts がモック側を選ぶので、ここは触らなくてよい。

export const searchEs: SearchFn = async () => {
  throw new Error("searchEs not ready — A3(searchCandidateSpots)完成後に実装");
};

export const travelTimesReal: TravelTimesFn = async () => {
  throw new Error("travelTimesReal not ready — A4(getTravelTimes)完成後に実装");
};
