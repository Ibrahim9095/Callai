import { createRealtimeSession } from "./api.js";
import { VoiceAgent } from "./voiceAgent.js";
import { ElevenLabsVoiceAgent } from "./elevenLabsAgent.js";

/**
 * Ask the server which provider to use, then construct the matching agent.
 */
export async function createVoiceAgent(callbacks) {
  const session = await createRealtimeSession();
  const provider = session.provider || (session.token ? "elevenlabs" : "openai");

  if (provider === "elevenlabs") {
    return {
      provider,
      session,
      agent: new ElevenLabsVoiceAgent({ ...callbacks, session }),
    };
  }

  return {
    provider,
    session,
    agent: new VoiceAgent({ ...callbacks, session }),
  };
}
