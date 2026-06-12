import { useState, type ReactNode } from "react";
import { sendMessage } from "../store";

// Empty-state starter prompts, grouped into categories shown as tabs. Clicking a prompt
// sends it straight away (one click to start), which also hoists it to the top.
interface Category {
  name: string;
  icon: ReactNode;
  prompts: string[];
}

const CATEGORIES: Category[] = [
  {
    name: "Explore",
    icon: <CompassIcon />,
    prompts: [
      "What are the biggest tech stories this week?",
      "Compare the latest iPhone, Pixel, and Galaxy flagships",
      "What's the latest on AI regulation around the world?",
      "Give me an overview of recent breakthroughs in fusion energy",
    ],
  },
  {
    name: "Learn",
    icon: <CapIcon />,
    prompts: [
      "Explain how large language models actually work",
      "What's the difference between TCP and UDP?",
      "Teach me the fundamentals of quantum computing",
      "How does compound interest work? Show an example.",
    ],
  },
  {
    name: "Code",
    icon: <CodeIcon />,
    prompts: [
      "Write a debounce function in TypeScript",
      "Explain SQL JOINs with simple examples",
      "Show me three ways to center a div in CSS",
      "When should I use useMemo vs useCallback in React?",
    ],
  },
];

export function QuickPrompts() {
  const [active, setActive] = useState(0);
  const category = CATEGORIES[active] ?? CATEGORIES[0]!;

  return (
    <div className="pt-12 sm:pt-20">
      <h2 className="mb-6 text-center text-2xl font-semibold text-neutral-800 dark:text-neutral-100">
        How can I help you?
      </h2>

      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
              i === active
                ? "border-transparent bg-blue-600 text-white dark:bg-blue-500"
                : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            {c.icon}
            {c.name}
          </button>
        ))}
      </div>

      <div className="mx-auto flex max-w-xl flex-col">
        {category.prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => void sendMessage(p)}
            className="border-b border-neutral-100 px-2 py-3 text-left text-sm text-neutral-700 transition-colors last:border-b-0 hover:text-blue-600 dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-blue-400"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompassIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function CapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M22 10 12 5 2 10l10 5 10-5z" />
      <path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
