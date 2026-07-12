/** Agent Platform Runtime デプロイ時に登録する class_methods 定義。 */
export const TABIPLA_AGENT_CLASS_METHODS = [
  {
    name: "personalizedPlan",
    api_mode: "",
    parameters: {
      type: "object",
      properties: {
        likes: { type: "array", items: { type: "string" } },
        nopes: { type: "array", items: { type: "string" } },
        likeWeights: { type: "object" },
        travelMemory: { type: "string" },
        catalog: { type: "array" },
        page: { type: "integer" },
        limit: { type: "integer" },
        planKey: { type: "string" },
      },
      required: ["catalog"],
    },
  },
  {
    name: "askSpot",
    api_mode: "",
    parameters: {
      type: "object",
      properties: {
        spotId: { type: "string" },
        text: { type: "string" },
        image: { type: "object" },
        audio: { type: "object" },
        userProfileSummary: { type: "string" },
        spot: { type: "object" },
        facts: { type: "array", items: { type: "string" } },
      },
      required: ["spotId"],
    },
  },
  {
    name: "collectSpots",
    api_mode: "",
    parameters: {
      type: "object",
      properties: {
        municipality: { type: "string" },
        prefecture: { type: "string" },
        targetCount: { type: "integer" },
        categories: { type: "array", items: { type: "string" } },
        excludeNames: { type: "array", items: { type: "string" } },
      },
      required: ["municipality", "prefecture", "categories"],
    },
  },
  {
    name: "describeSpot",
    api_mode: "",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        municipality: { type: "string" },
        prefecture: { type: "string" },
        address: { type: "string" },
        mode: { type: "string" },
      },
      required: ["name", "municipality", "prefecture"],
    },
  },
  {
    name: "generateSpotImage",
    api_mode: "",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        municipality: { type: "string" },
        prefecture: { type: "string" },
        address: { type: "string" },
        referenceImage: { type: "object" },
      },
      required: ["name", "municipality", "prefecture"],
    },
  },
] as const;
