import { searchEs, travelTimesReal } from "./live.js";
import { searchMock, travelTimesMock } from "./mock.js";

// mock ↔ 本物 の唯一の切替点。
// 既定はモック。本接続時に環境変数 USE_MOCK=0 を渡す。
const M = process.env.USE_MOCK !== "0";

export const search = M ? searchMock : searchEs;
export const travelTimes = M ? travelTimesMock : travelTimesReal;
