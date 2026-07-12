import {
  type AskSpotInput,
  type CollectSpotsInput,
  type DescribeSpotInput,
  type GenerateSpotImageInput,
  handleAskSpot,
  handleCollectSpots,
  handleDescribeSpot,
  handleGenerateSpotImage,
  handlePersonalizedPlan,
  type PersonalizedPlanInput,
} from "../handlers.js";

/** Gemini Enterprise Agent Platform Runtime 向けの tabipla エージェント API。 */
export class TabiplaAgentPlatformApp {
  personalizedPlan(input: PersonalizedPlanInput) {
    return handlePersonalizedPlan(input);
  }

  askSpot(input: AskSpotInput) {
    return handleAskSpot(input);
  }

  collectSpots(input: CollectSpotsInput) {
    return handleCollectSpots(input);
  }

  describeSpot(input: DescribeSpotInput) {
    return handleDescribeSpot(input);
  }

  generateSpotImage(input: GenerateSpotImageInput) {
    return handleGenerateSpotImage(input);
  }
}

export const tabiplaAgentPlatformApp = new TabiplaAgentPlatformApp();
