import { Zap, Brain, Sparkles, Crown } from "lucide-react";
import { ModelConfig, ThinkingModeConfig } from "./types";

/**
 * Available models
 */
export const MODELS: ModelConfig[] = [
  {
    id: "sonnet",
    name: "Claude Sonnet 4.6",
    description: "Fast and efficient for most coding tasks",
    icon: <Zap className="h-4 w-4" />
  },
  {
    id: "sonnet1m",
    name: "Claude Sonnet 4.6 1M",
    description: "Sonnet with 1 million token context",
    icon: <Brain className="h-4 w-4" />
  },
  {
    id: "opus",
    name: "Claude Opus 4.6",
    description: "Most capable model with advanced reasoning & coding",
    icon: <Sparkles className="h-4 w-4" />
  },
  {
    id: "opus1m",
    name: "Claude Opus 4.6 1M",
    description: "Opus with 1 million token context",
    icon: <Crown className="h-4 w-4" />
  }
];

/**
 * Thinking modes configuration
 * Simplified to on/off toggle (conforming to official Claude Code standard)
 * Default tokens when enabled: 31999 (balanced for most use cases)
 * 
 * Note: Names and descriptions are translation keys that will be resolved at runtime
 */
export const THINKING_MODES: ThinkingModeConfig[] = [
  {
    id: "off",
    name: "promptInput.thinkingModeOff",
    description: "promptInput.normalSpeed",
    level: 0,
    tokens: undefined // No extended thinking
  },
  {
    id: "on",
    name: "promptInput.thinkingModeOn",
    description: "promptInput.deepThinking",
    level: 1,
    tokens: 31999 // Default thinking tokens
  }
];

/**
 * Default thinking tokens when enabled
 * Can be adjusted via environment variable MAX_THINKING_TOKENS
 */
export const DEFAULT_THINKING_TOKENS = 31999;
