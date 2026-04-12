# Boardupscale — Upsy AI Project Manager
## Provider Selection & Cost Estimation Report

**Date:** April 10, 2026
**Scope:** MVP AI Project Manager Agent
**Scale:** 50 Customers × 100 Projects = 5,000 Active Projects

---

## 1. Executive Summary

This report evaluates AI LLM providers to power Boardupscale's "Upsy AI Project Manager" — a super agent capable of codebase/doc research, sprint creation, ticket generation, backlog grooming, standup summaries, and intelligent chat across all customer projects.

**Recommendation:** A **tiered multi-model strategy** using **Google Gemini 2.5 Flash** (complex reasoning) + **OpenAI GPT-4.1-nano** (structured output) + **OpenAI text-embedding-3-small** (embeddings).

**Estimated monthly cost: ~$1,053 USD** (before optimizations) / **~$500-650 USD** (with caching & batching)

---

## 2. Scale & Usage Profile

### Infrastructure

| Metric | Value |
|--------|-------|
| Total customers (orgs) | 50 |
| Projects per customer | 100 |
| Total active projects | 5,000 |
| Avg team members per project | 5-8 |
| Total potential users | ~2,500-4,000 |

### AI Operations Per Project Per Month

| Operation | Frequency/Project | Input Tokens | Output Tokens | Description |
|-----------|-------------------|-------------|--------------|-------------|
| Sprint planning & creation | 4 | 6,000 | 3,000 | AI analyzes backlog, suggests sprint scope, creates sprint with tickets |
| Ticket generation (epic→task) | 40 | 3,000 | 2,000 | Break epics into stories/tasks with estimates, acceptance criteria |
| Ticket refinement/editing | 30 | 2,000 | 1,000 | Improve descriptions, add details, suggest labels/priority |
| Code/doc analysis (RAG) | 20 | 10,000 | 3,000 | Parse attached repos/docs, answer questions, extract requirements |
| Sprint insights & retros | 4 | 5,000 | 2,000 | Velocity trends, blocker analysis, retrospective summaries |
| Daily standup summaries | 22 | 3,000 | 1,000 | Summarize progress, flag blockers, predict delays |
| Backlog grooming suggestions | 8 | 4,000 | 2,000 | Prioritize backlog, suggest story points, identify duplicates |
| General AI chat queries | 60 | 2,000 | 800 | Team Q&A, how-to, context lookup, status queries |
| Document/code embedding | 200 | 500 | — | Initial RAG indexing of docs, wiki pages, code files |
| Re-embedding (updates) | 100 | 500 | — | Re-index changed content for fresh search results |

### Total Monthly Token Consumption (All 5,000 Projects)

| Category | Total Requests | Input Tokens | Output Tokens |
|----------|---------------|-------------|--------------|
| Sprint planning | 20,000 | 120,000,000 | 60,000,000 |
| Ticket generation | 200,000 | 600,000,000 | 400,000,000 |
| Ticket refinement | 150,000 | 300,000,000 | 150,000,000 |
| Code/doc analysis | 100,000 | 1,000,000,000 | 300,000,000 |
| Sprint insights | 20,000 | 100,000,000 | 40,000,000 |
| Daily standups | 110,000 | 330,000,000 | 110,000,000 |
| Backlog grooming | 40,000 | 160,000,000 | 80,000,000 |
| General chat | 300,000 | 600,000,000 | 240,000,000 |
| **LLM Subtotal** | **940,000** | **3,210,000,000** | **1,380,000,000** |
| Embeddings (initial) | 1,000,000 | 500,000,000 | — |
| Embeddings (updates) | 500,000 | 250,000,000 | — |
| **Embedding Subtotal** | **1,500,000** | **750,000,000** | **—** |
| | | | |
| **GRAND TOTAL** | **2,440,000** | **3,960,000,000** | **1,380,000,000** |

> **Total tokens processed per month: ~5.34 Billion**

---

## 3. Provider Pricing Comparison (Per 1M Tokens)

### LLM Chat Models

| Provider | Model | Input $/1M | Output $/1M | Context Window | Structured Output | Speed |
|----------|-------|-----------|------------|----------------|-------------------|-------|
| Google | Gemini 2.0 Flash | $0.10 | $0.40 | 1,000,000 | Good | Fast |
| Google | **Gemini 2.5 Flash** | **$0.15** | **$0.60** | **1,000,000** | **Excellent** | **Fast** |
| Google | Gemini 2.5 Pro | $1.25 | $10.00 | 1,000,000 | Excellent | Medium |
| OpenAI | **GPT-4.1-nano** | **$0.10** | **$0.40** | **1,000,000** | **Excellent** | **Very Fast** |
| OpenAI | GPT-4o-mini | $0.15 | $0.60 | 128,000 | Excellent | Fast |
| OpenAI | GPT-4.1-mini | $0.40 | $1.60 | 1,000,000 | Excellent | Fast |
| OpenAI | GPT-4.1 | $2.00 | $8.00 | 1,000,000 | Excellent | Medium |
| OpenAI | GPT-4o | $2.50 | $10.00 | 128,000 | Excellent | Medium |
| Mistral | Small | $0.10 | $0.30 | 32,000 | Good | Fast |
| Mistral | Large | $2.00 | $6.00 | 128,000 | Good | Medium |
| DeepSeek | V3 | $0.27 | $1.10 | 64,000 | Moderate | Medium |
| DeepSeek | R1 (reasoning) | $0.55 | $2.19 | 64,000 | Moderate | Slow |
| Groq | Llama 3.3 70B | $0.59 | $0.79 | 128,000 | Moderate | Ultra Fast |
| Groq | Llama 3.1 8B | $0.05 | $0.08 | 128,000 | Low | Ultra Fast |
| Anthropic | Claude Haiku 3.5 | $0.80 | $4.00 | 200,000 | Good | Fast |
| Anthropic | Claude Sonnet 4 | $3.00 | $15.00 | 200,000 | Excellent | Medium |
| Anthropic | Claude Opus 4 | $15.00 | $75.00 | 200,000 | Excellent | Slow |
| Cohere | Command R | $0.15 | $0.60 | 128,000 | Moderate | Medium |
| Cohere | Command R+ | $2.50 | $10.00 | 128,000 | Good | Medium |

### Embedding Models

| Provider | Model | $/1M Tokens | Dimensions | Max Tokens |
|----------|-------|------------|------------|-----------|
| **OpenAI** | **text-embedding-3-small** | **$0.02** | **1,536** | **8,191** |
| OpenAI | text-embedding-3-large | $0.13 | 3,072 | 8,191 |
| Google | text-embedding-004 | ~$0.00625 | 768 | 2,048 |
| Mistral | Mistral Embed | $0.10 | 1,024 | 8,000 |
| Cohere | Embed v3 | $0.10 | 1,024 | 512 |
| Together AI | M2-BERT | $0.008 | 768 | 8,192 |

---

## 4. Monthly Cost — Single Provider (Full Comparison)

Using 3.21B input tokens + 1.38B output tokens + 750M embedding tokens:

| # | Provider + Model | LLM Input | LLM Output | Embed | **Total USD/mo** | **Per Customer** |
|---|-----------------|-----------|-----------|-------|-----------------|-----------------|
| 1 | Mistral Small | $321 | $414 | $75 | **$810** | **$16.20** |
| 2 | Gemini 2.0 Flash | $321 | $552 | $5 | **$878** | **$17.56** |
| 3 | OpenAI GPT-4.1-nano | $321 | $552 | $15 | **$888** | **$17.76** |
| 4 | Gemini 2.5 Flash | $482 | $828 | $5 | **$1,315** | **$26.30** |
| 5 | OpenAI GPT-4o-mini | $482 | $828 | $15 | **$1,325** | **$26.50** |
| 6 | Cohere Command R | $482 | $828 | $75 | **$1,385** | **$27.70** |
| 7 | DeepSeek V3 | $867 | $1,518 | $15 | **$2,400** | **$48.00** |
| 8 | Groq Llama 3.3 70B | $1,894 | $1,090 | $15 | **$2,999** | **$59.98** |
| 9 | OpenAI GPT-4.1-mini | $1,284 | $2,208 | $15 | **$3,507** | **$70.14** |
| 10 | Anthropic Haiku 3.5 | $2,568 | $5,520 | $15 | **$8,103** | **$162.06** |
| 11 | OpenAI GPT-4.1 | $6,420 | $11,040 | $15 | **$17,475** | **$349.50** |
| 12 | OpenAI GPT-4o | $8,025 | $13,800 | $15 | **$21,840** | **$436.80** |
| 13 | Anthropic Sonnet 4 | $9,630 | $20,700 | $15 | **$30,345** | **$606.90** |
| 14 | Anthropic Opus 4 | $48,150 | $103,500 | $15 | **$151,665** | **$3,033.30** |

---

## 5. RECOMMENDED STRATEGY — Tiered Multi-Model

### Why Tiered?

Not all operations need the same intelligence level. Ticket refinement doesn't need GPT-4.1 reasoning. Sprint planning does. Route by complexity, pay only for what you need.

### Provider Selection

| Role | Provider | Model | Why This Model |
|------|----------|-------|---------------|
| **Complex reasoning** | Google | **Gemini 2.5 Flash** | Best reasoning at $0.15/$0.60, 1M context for large codebases |
| **Structured output** | OpenAI | **GPT-4.1-nano** | Cheapest model with 1M context + excellent JSON mode |
| **Embeddings** | OpenAI | **text-embedding-3-small** | Industry standard, $0.02/M, 1536 dimensions, battle-tested |
| **Fallback (heavy)** | OpenAI | **GPT-4.1-mini** | When nano quality insufficient, still affordable at $0.40/$1.60 |

### Task-to-Model Routing

| Task | Model | Requests/mo | Input Tokens | Output Tokens | Input Cost | Output Cost |
|------|-------|------------|-------------|--------------|-----------|------------|
| Sprint planning | Gemini 2.5 Flash | 20,000 | 120M | 60M | $18.00 | $36.00 |
| Ticket generation | GPT-4.1-nano | 200,000 | 600M | 400M | $60.00 | $160.00 |
| Ticket refinement | GPT-4.1-nano | 150,000 | 300M | 150M | $30.00 | $60.00 |
| Code/doc analysis | Gemini 2.5 Flash | 100,000 | 1,000M | 300M | $150.00 | $180.00 |
| Sprint insights | Gemini 2.5 Flash | 20,000 | 100M | 40M | $15.00 | $24.00 |
| Daily standups | GPT-4.1-nano | 110,000 | 330M | 110M | $33.00 | $44.00 |
| Backlog grooming | Gemini 2.5 Flash | 40,000 | 160M | 80M | $24.00 | $48.00 |
| General chat | GPT-4.1-nano | 300,000 | 600M | 240M | $60.00 | $96.00 |
| Embeddings | embed-3-small | 1,500,000 | 750M | — | $15.00 | — |

### Tiered Strategy Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Gemini 2.5 Flash (reasoning tasks) | $495.00 |
| GPT-4.1-nano (structured tasks) | $543.00 |
| OpenAI text-embedding-3-small | $15.00 |
| **TOTAL** | **$1,053.00** |
| **Per Customer (50 orgs)** | **$21.06** |
| **Per Project (5,000)** | **$0.21** |

---

## 6. Cost Optimization — Achievable Savings

| Optimization | How It Works | Est. Savings | Reduced Cost |
|-------------|-------------|-------------|-------------|
| **Prompt caching** | Gemini & OpenAI cache repeated context prefixes (project info, system prompts). OpenAI: 50% off cached input. | 20-25% | -$210 |
| **Redis response caching** | Already built in Upsy. Same sprint insight request = skip LLM call entirely. | 10-15% | -$105 |
| **OpenAI Batch API** | Async processing at 50% discount for non-urgent jobs (nightly standups, embedding updates). | 10-15% | -$80 |
| **Smart routing** | Template-based tickets skip LLM. Simple queries use regex/heuristics first. | 5-8% | -$55 |
| **Embedding dedup** | Hash content before embedding — only re-embed if content actually changed. | 3-5% | -$8 |
| **TOTAL SAVINGS** | | **~40-55%** | **-$458** |

### Optimized Monthly Cost

| Metric | Before | After Optimization |
|--------|--------|-------------------|
| Monthly total | $1,053 | **~$595** |
| Per customer | $21.06 | **~$11.90** |
| Per project | $0.21 | **~$0.12** |

---

## 7. Provider Comparison — Why NOT Others

| Provider | Verdict | Reason |
|----------|---------|--------|
| **Anthropic (Claude)** | Too expensive for MVP | Haiku $8,103/mo, Sonnet $30,345/mo. No embeddings API. Great quality but 5-30x the cost. Revisit when revenue supports premium tier. |
| **DeepSeek** | Data residency risk | Hosted in China. API availability inconsistent. Good pricing but enterprise customers may object to data locality. |
| **Groq** | No embeddings, limited models | Ultra-fast inference but limited to open-source models. No native embeddings. Good as speed-tier addon, not primary. |
| **Mistral Small** | Context window too small | Only 32K context — unusable for codebase analysis. Cheapest but functionally limited for our use case. |
| **Cohere** | Embedding specialist only | Command R quality below GPT-4.1-nano. Embed v3 is good but OpenAI embed-3-small is cheaper and higher dimension. |
| **Together AI** | Hosting markup | Open-source models at higher cost than Groq. No compelling advantage. |
| **OpenAI GPT-4.1** | Overkill for MVP | $17,475/mo. Amazing quality but 16x the tiered strategy cost. Reserve for "Premium AI" tier. |

---

## 8. Scaling Projections

| Scale | Customers | Projects | Monthly Cost (Tiered) | Optimized | Per Customer |
|-------|-----------|----------|----------------------|-----------|-------------|
| **Pilot** | 10 | 1,000 | $211 | ~$120 | ~$12.00 |
| **MVP** | 50 | 5,000 | $1,053 | ~$595 | ~$11.90 |
| **Growth** | 200 | 20,000 | $4,212 | ~$2,380 | ~$11.90 |
| **Scale** | 500 | 50,000 | $10,530 | ~$5,950 | ~$11.90 |
| **Enterprise** | 1,000 | 100,000 | $21,060 | ~$11,900 | ~$11.90 |

> Cost scales linearly. Volume discounts from OpenAI/Google kick in at higher tiers, potentially reducing per-customer cost further.

---

## 9. Revenue vs. Cost Analysis

| Pricing Model | Monthly Revenue (50 customers) | AI Cost (optimized) | **Gross Margin** |
|--------------|-------------------------------|--------------------|-----------------| 
| $19/org AI addon | $950 | $595 | **37.4%** |
| $29/org AI addon | $1,450 | $595 | **59.0%** |
| $39/org AI addon | $1,950 | $595 | **69.5%** |
| $49/org AI addon | $2,450 | $595 | **75.7%** |
| Included in $99+/org plan | $4,950+ | $595 | **88.0%+** |

**Recommendation:** Price AI PM at **$29-39/org/month** as an add-on for healthy 60-70% margin, or include it in plans priced $99+/org.

---

## 10. Final Recommendation

### Chosen Stack

```
PRIMARY LLM (reasoning):    Google Gemini 2.5 Flash     — $0.15/$0.60 per 1M tokens
PRIMARY LLM (structured):   OpenAI GPT-4.1-nano         — $0.10/$0.40 per 1M tokens
EMBEDDINGS:                  OpenAI text-embedding-3-small — $0.02 per 1M tokens
FALLBACK LLM:               OpenAI GPT-4.1-mini         — $0.40/$1.60 per 1M tokens
```

### Why This Combination Wins

1. **Cost:** ~$595/mo optimized vs $8,000-30,000 for premium providers
2. **Context:** Both Gemini 2.5 Flash and GPT-4.1-nano support 1M token context — essential for codebase/doc analysis
3. **Quality:** Gemini 2.5 Flash matches GPT-4o quality on reasoning benchmarks at 1/10th the cost
4. **Structured output:** GPT-4.1-nano has native JSON mode — perfect for generating sprint/ticket schemas
5. **Already built:** Boardupscale already has OpenAI + Gemini providers implemented in the codebase
6. **Free dev tier:** Google offers generous free tier for development and testing
7. **Scalable:** Linear cost scaling with volume discounts at higher tiers
8. **No vendor lock-in:** Provider abstraction layer already exists — can swap models without code changes

### Implementation Priority

1. Enhance existing provider routing to support per-task model selection
2. Build document/codebase ingestion pipeline (chunking + embedding)
3. Implement sprint auto-generation from goals/epics
4. Add ticket breakdown agent (epic → stories → tasks)
5. Build backlog grooming and standup summary features
6. Add prompt caching and batch API integration for cost optimization

---

*Report prepared for Boardupscale engineering team. Prices based on published API rates as of April 2026. Actual costs may vary based on usage patterns, caching effectiveness, and provider pricing changes.*
