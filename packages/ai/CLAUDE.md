# ai

- Models are set per task in `src/config.ts` (design §6.4): Opus 5.5 for the universe and the final story, Sonnet 5.5 for dilemmas, consequences and analysis, Haiku 5.5 for extraction, validation and moderation. Change routing there only.
- Claude 5.5 models reject sampling parameters (`temperature`, `top_p`), forced tool use and assistant prefill. Control depth with `effort`. Use native structured outputs. When the API refuses a format as too large, `generate.ts` describes it in the prompt instead and validates the answer with the same schema.
- Bump `PROMPT_VERSION` when a prompt changes, and run `pnpm evals` if real keys are configured.
- Prompt injection (§6.5): user text only goes inside `untrusted()` blocks.
- Copyright (§14.2): prompts ask for abstract themes only. Output is scanned with `leakedTerms` against the deny-list of the selected titles.
- Order prompts from most to least stable so the Bible prefix stays cached.
