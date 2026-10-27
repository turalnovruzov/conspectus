# 0005. News reader: OpenRouter via the openai client; feed and article parsing

- **Status**: Accepted
- **Date**: 2026-10-27

## Context

Issue #7, step 2, builds the reader that fetches the 33 listed outlets, reads each item with a language model, groups items into events and situations, and saves everything in Postgres. Tural chose the service and approved the libraries in refinement:

- Decided #7: "I suggest using open router api so we can even be cheaper than cloud"; "I definitely don't want to use Claude Code I want to use an API so instead of cloud API we can use open router API and then we can choose whatever model we want to use".
- Decided #8: a mid-range model, "good, cheap", at most $1 per million input tokens, picked by the build in a trial ("may the build pick the model itself by trial? Sure, yes it can"); embeddings through OpenRouter too.
- Decided #9: $10 a week on the key ("I said $10 a week").
- Decided #11: clustering is LLM-centric: "I think clustering will be best done with large language models with good context engineering".
- Decided #17: approved "an RSS/XML parser (e.g. fast-xml-parser); Mozilla Readability for article text; the `openai` client for OpenRouter", and "Small helper libraries the plan needs (e.g. jsdom/linkedom, zod)".

## Decision

- **OpenRouter** (third-party service, `https://openrouter.ai/api/v1`) is the only model provider. It is reached through the **`openai`** client with OpenRouter's base URL, key `OPENROUTER_API_KEY` from `~/.config/conspectus/.env`, never printed, logged or stored. Every chat and embedding call reserves its estimated cost in a spend ledger first and records the cost OpenRouter reports in `llm_calls`; each run has a hard ceiling (at most $3, and $0.50 short of the key's remaining weekly limit).
- **`fast-xml-parser`** parses the RSS 2.0, RSS 0.91, RDF and Atom feeds.
- **`@mozilla/readability`** extracts article text when the read step says a blurb is not enough, on a DOM from **`linkedom`** (also used for the Kyodo and Global Times index pages and Wikipedia's Current events HTML). `jsdom` was the approved fallback and was not needed.
- **`zod`** (v4) validates every model answer and produces the JSON schema sent as the structured-output format.
- Models, chosen by the trial (`scripts/model-trial.ts`, 120 items fetched on 2026-10-27, total cap $1.50): chat **`mistralai/mistral-small-3.2-24b-instruct`**, embeddings **`qwen/qwen3-embedding-8b`**. They are set in `src/reader/config.ts`; `CONSPECTUS_CHAT_MODEL` / `CONSPECTUS_EMBEDDING_MODEL` override them.

The trial's scores are agreement with labels the build wrote itself before any candidate ran (sha256 `460637e8…c930`); they describe one reading of 120 items and are not a measure of accuracy.

Embedding models, no chat: for each pair of items the labels put in one story, whether the partner is among the item's 10 or 15 nearest in the sample.

| model | dim | pairs | partner in top 10 | partner in top 15 | $ / 1000 items |
|---|---|---|---|---|---|
| `qwen/qwen3-embedding-8b` | 4096 | 256 | 92.2 % | 96.5 % | 0.0008 |
| `openai/text-embedding-3-small` | 1536 | 256 | 92.6 % | 96.1 % | 0.0016 |
| `baai/bge-m3` | 1024 | 256 | 89.5 % | 94.5 % | 0.0009 |

Chat models, each over the same 120 items in two runs (date order, so attaching is exercised), each capped at $0.25. Rule from the plan: JSON valid ≥ 95 %, then the highest mean of pair F1 and country Jaccard, the cheaper within 0.03.

| model | relevance agreement | same-story pairs P / R / F1 | country Jaccard | cross-story attach | JSON valid | $ / 100 items | p50 latency |
|---|---|---|---|---|---|---|---|
| `google/gemini-2.5-flash-lite` | 81.7 % | 0.26 / 0.77 / 0.39 | 0.92 | 44 of 61 | 85.2 % | 0.021 | 3.6 s |
| `anthropic/claude-haiku-5.5` | 86.7 % | 0 / 0 / 0 | 0.97 | 0 of 0 | 26.7 % | 0.060 | 20.8 s |
| `openai/gpt-6-luna` | 90.0 % | 1.00 / 0.46 / 0.63 | 0.95 | 7 of 26 | 64.9 % | 0.037 | 24.1 s |
| `deepseek/deepseek-v4.1-flash` | 91.7 % | 0 / 0 / 0 | 0.95 | 0 of 0 | 16.7 % | 0.060 | 14.7 s |
| `mistralai/mistral-small-3.2-24b-instruct` | 87.5 % | 0.61 / 0.91 / 0.73 | 0.95 | 30 of 55 | 100 % | 0.012 | 24.6 s |

Notes on the measures:

- In practice JSON validity ≥ 95 % was the discriminator: only Mistral passed it, and the pair scores did not separate models run to run (a re-run of Mistral on the same 120 items moved pair F1 from 0.73 to 0.47, cross-story attach from 30 of 55 to 39 of 56).
- "Cross-story attach" counts items placed into a situation another item opened whose opening item the labels put in a different story or call not relevant: it describes over-attachment. For the chosen model it is 30 of 55.
- The four candidates under 95 % JSON valid all list reasoning among their OpenRouter parameters; Mistral, the one that does not, is the one at 100 %. The reader sizes `max_tokens` for the answer alone. The error texts were not kept, so the cause is unverified; the pair scores of 0 come from failed judge batches.
- The embedding comparison embedded headline + blurb; the pipeline also adds the read step's one-line event.
- Trial spend: $0.2295 (ledger), key usage 0.0203 → 0.2497.

## Consequences

- One account and one key pay for every model; switching models is a config change, not a code change. Embedding rows carry their model name, so a switch needs no migration.
- The reader depends on OpenRouter being reachable; a run that cannot read the key's usage refuses to start.
- Model output is untrusted: zod drops or retries what does not fit, fetched text is passed inside data delimiters with every angle bracket removed, and only http(s) item URLs are stored.

## Alternatives considered

- Claude API directly, or Claude Code as the reader: rejected by Tural (Decided #7).
- Parsing libraries: approved by name in refinement (Decided #17); no one-screen comparison table for them was recorded in the issue.
- Models: the candidates and their measures are in the tables above.
