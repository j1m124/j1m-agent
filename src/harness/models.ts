// The selectable models. Deliberately a short, curated list of LIGHTWEIGHT, CHEAP
// options — all confirmed (against OpenRouter's live model list) to support tool
// calling, which the agentic loop requires (run_script + the web tools).
//
// This is shared by the client (the selector UI) and the server route (an ALLOWLIST:
// the repo is public, so we only let /api/chat run a model from this list — otherwise
// a request could point at an expensive model and run up the bill). Prices are rough
// $/1M output tokens at time of writing, for the label only.

export interface ModelOption {
  id: string;
  label: string;
  note: string; // short size/price hint shown in the dropdown
}

// No OpenAI / Anthropic / Gemini models. Providers: Meta, Qwen, Nvidia, Mistral,
// DeepSeek — plus Gemma (Google's open model, included by explicit request). All confirmed
// tool-capable, which the agentic loop requires.
export const MODELS: ModelOption[] = [
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", note: "Free" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", note: "Free" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free", label: "Qwen3 Next 80B", note: "Free" },
  { id: "nvidia/nemotron-nano-9b-v2:free", label: "Nemotron Nano 9B", note: "Free" },
  { id: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B", note: "~$0.03/M" },
  { id: "mistralai/mistral-nemo", label: "Mistral Nemo 12B", note: "~$0.03/M" },
  { id: "qwen/qwen3-235b-a22b-2507", label: "Qwen3 235B", note: "~$0.10/M" },
];

// Free + tool-capable, so it works even on a $0-credit account (paid models 402).
export const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

export function isAllowedModel(id: unknown): id is string {
  return typeof id === "string" && MODELS.some((m) => m.id === id);
}
