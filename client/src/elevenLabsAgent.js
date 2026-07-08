import { Conversation } from "@elevenlabs/client";
import { createRealtimeSession, runTool } from "./api.js";

const TOOL_NAMES = [
  "get_store_info",
  "search_products",
  "get_product",
  "check_availability",
  "calculate_delivery",
  "create_order",
  "get_order_status",
  "create_support_ticket",
  "transfer_to_human",
];

/**
 * ElevenLabs Conversational AI — cheaper + more realistic Azerbaijani voice.
 */
export class ElevenLabsVoiceAgent {
  constructor({ onStatus, onTranscript, onTool, onError, onRemoteStream, session } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onTool = onTool || (() => {});
    this.onError = onError || (() => {});
    this.onRemoteStream = onRemoteStream || (() => {});
    this.session = session || null;
    this.conversation = null;
    this.started = false;
    this.localStream = null;
  }

  #buildClientTools() {
    const tools = {};
    for (const name of TOOL_NAMES) {
      tools[name] = async (params = {}) => {
        this.onTool({ name, args: params, status: "running" });
        this.onStatus("tool");
        try {
          const result = await runTool(name, params);
          this.onTool({ name, args: params, status: "done", result });
          this.onStatus("live");
          return result;
        } catch (err) {
          this.onTool({ name, args: params, status: "error", error: err.message });
          this.onStatus("live");
          return { error: err.message };
        }
      };
    }
    return tools;
  }

  async start() {
    if (this.started) return;
    this.onStatus("connecting");

    try {
      let token = this.session?.token;
      if (!token) {
        const { createRealtimeSession } = await import("./api.js");
        this.session = await createRealtimeSession();
        token = this.session.token;
      }
      if (!token) throw new Error("ElevenLabs conversation token alınmadı");

      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        this.onRemoteStream(this.localStream);
      } catch {
        /* SDK requests mic */
      }

      this.conversation = await Conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        clientTools: this.#buildClientTools(),
        onConnect: () => this.onStatus("live"),
        onDisconnect: () => {
          this.onStatus("idle");
          this.started = false;
        },
        onError: (err) => {
          const message = typeof err === "string" ? err : err?.message || "ElevenLabs xətası";
          this.onError(new Error(message));
          this.onStatus("error");
        },
        onModeChange: ({ mode }) => {
          if (mode === "speaking") this.onStatus("speaking");
          else if (mode === "listening") this.onStatus("listening");
          else this.onStatus("live");
        },
        onMessage: (message) => {
          const role = message?.source === "user" ? "user" : "assistant";
          const text = (message?.message || message?.text || "").trim();
          if (text) this.onTranscript({ role, text });
        },
      });

      this.started = true;
      this.onStatus("live");
    } catch (err) {
      this.onError(err);
      this.onStatus("error");
      await this.stop();
      throw err;
    }
  }

  setMuted(muted) {
    try {
      this.conversation?.setMicMuted?.(muted);
    } catch {
      this.localStream?.getAudioTracks().forEach((t) => {
        t.enabled = !muted;
      });
    }
  }

  async stop() {
    this.started = false;
    try {
      await this.conversation?.endSession?.();
    } catch {
      /* ignore */
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.conversation = null;
    this.onStatus("idle");
  }
}
