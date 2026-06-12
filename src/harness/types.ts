// Core message + tool types. These mirror the OpenAI/OpenRouter chat-completions
// wire shapes exactly, so messages can be sent straight back to the API.

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  // `arguments` is a JSON-encoded *string*, per the OpenAI tool-call protocol.
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[]; // present on assistant turns that request tools
  tool_call_id?: string; // present on `role: "tool"` result turns
  annotations?: Annotation[]; // url_citation annotations from server tools
}

// Citation annotation returned by OpenRouter's server tools (web_search/web_fetch).
export interface UrlCitation {
  url: string;
  title?: string;
  content?: string;
  start_index?: number;
  end_index?: number;
}
export interface Annotation {
  type: "url_citation";
  url_citation: UrlCitation;
}

// One cited source. Built from the url_citation annotations the server tools emit.
export interface Source {
  n: number;
  title: string;
  url: string;
}
