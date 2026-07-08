import { createRealtimeSession, runTool } from "./api.js";

/**
 * Low-latency voice via WebRTC → OpenAI Realtime (GA).
 * Mic audio streams directly; tool calls hit our local store/operator API.
 */
export class VoiceAgent {
  constructor({ onStatus, onTranscript, onTool, onError, onRemoteStream } = {}) {
    this.onStatus = onStatus || (() => {});
    this.onTranscript = onTranscript || (() => {});
    this.onTool = onTool || (() => {});
    this.onError = onError || (() => {});
    this.onRemoteStream = onRemoteStream || (() => {});

    this.pc = null;
    this.dc = null;
    this.localStream = null;
    this.remoteAudio = null;
    this.started = false;
    this.greeted = false;
  }

  async start() {
    if (this.started) return;
    this.onStatus("connecting");

    try {
      const session = await createRealtimeSession();
      const ephemeralKey = session.value || session.client_secret?.value;
      if (!ephemeralKey) {
        throw new Error("Ephemeral token alınmadı. OPENAI_API_KEY yoxlayın.");
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.pc = new RTCPeerConnection();

      this.pc.ontrack = (event) => {
        const stream = event.streams[0];
        this.onRemoteStream(stream);
        if (!this.remoteAudio) {
          this.remoteAudio = new Audio();
          this.remoteAudio.autoplay = true;
        }
        this.remoteAudio.srcObject = stream;
        void this.remoteAudio.play().catch(() => {});
      };

      for (const track of this.localStream.getTracks()) {
        this.pc.addTrack(track, this.localStream);
      }

      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.onopen = () => {
        this.onStatus("live");
        this.#configureSession();
        this.#greet();
      };
      this.dc.onmessage = (event) => this.#handleServerEvent(event);

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        throw new Error(`WebRTC qoşulması uğursuz: ${errText || sdpResponse.status}`);
      }

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await this.pc.setRemoteDescription(answer);
      this.started = true;
    } catch (err) {
      this.onError(err);
      this.onStatus("error");
      await this.stop();
      throw err;
    }
  }

  #send(event) {
    if (this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify(event));
    }
  }

  #configureSession() {
    // Keep VAD snappy; tools/instructions already come from client_secret session
    this.#send({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 250,
              silence_duration_ms: 450,
              create_response: true,
              interrupt_response: true,
            },
            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "az",
            },
          },
        },
      },
    });
  }

  #greet() {
    if (this.greeted) return;
    this.greeted = true;
    this.#send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions:
          "Canlı telefon operatoru kimi qısa salamla. Adın Leyladır, CallAI Market-dənsən. Bot/AI olduğunu heç cür demə. Təbii danış, bir cümlə salam + bir qısa sual: necə kömək edə bilərsən? Skript kimi səslənmə.",
      },
    });
  }

  async #handleServerEvent(messageEvent) {
    let event;
    try {
      event = JSON.parse(messageEvent.data);
    } catch {
      return;
    }

    switch (event.type) {
      case "session.created":
      case "session.updated":
        break;
      case "input_audio_buffer.speech_started":
        this.onStatus("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        this.onStatus("thinking");
        break;
      case "response.created":
        this.onStatus("speaking");
        break;
      case "response.done":
        this.onStatus("live");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) {
          this.onTranscript({ role: "user", text: event.transcript.trim() });
        }
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        if (event.transcript) {
          this.onTranscript({ role: "assistant", text: event.transcript.trim() });
        }
        break;
      case "response.function_call_arguments.done":
        await this.#handleToolCall(event);
        break;
      case "error":
        this.onError(new Error(event.error?.message || "Realtime xətası"));
        break;
      default:
        break;
    }
  }

  async #handleToolCall(event) {
    const name = event.name;
    const callId = event.call_id;
    let args = {};
    try {
      args = event.arguments ? JSON.parse(event.arguments) : {};
    } catch {
      args = {};
    }

    this.onTool({ name, args, status: "running" });
    this.onStatus("tool");

    let result;
    try {
      result = await runTool(name, args);
      this.onTool({ name, args, status: "done", result });
    } catch (err) {
      result = { error: err.message };
      this.onTool({ name, args, status: "error", error: err.message });
    }

    this.#send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    this.#send({ type: "response.create" });
  }

  setMuted(muted) {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  async stop() {
    this.started = false;
    this.greeted = false;
    try {
      this.dc?.close();
    } catch {
      /* ignore */
    }
    try {
      this.pc?.getSenders().forEach((s) => s.track?.stop());
      this.pc?.close();
    } catch {
      /* ignore */
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }
    this.pc = null;
    this.dc = null;
    this.localStream = null;
    this.onStatus("idle");
  }
}
