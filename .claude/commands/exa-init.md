> **Canonical reference:** https://docs.exa.ai/reference/exa-mcp
>
> If anything below looks outdated or contradicts real MCP behavior, fetch that URL — it is the source of truth for MCP setup, auth, and tools. Report staleness back to the user.

---

# Exa MCP Setup Guide

## Your Configuration

| Setting | Value |
|---------|-------|
| Coding Tool | Claude |
| Integration | MCP |
| Use Case | Senior KYB Analysts at banks spend 4–8 hours manually verifying each complex multi-layered B2B onboarding application, working from hundreds of pages of unstructured narrative documents — trust deeds, legal statutes, ownership-structure charts, corporate filings. Legacy KYC platforms (Actimize, Lexis Bridger) excel at structured lookups against sanctions and PEP lists but provide zero comprehension of narrative content, forcing analysts to abandon those tools mid-review and fall back on PDF readers and Excel/SharePoint scratchpads. The result is a severe throughput bottleneck and inconsistent risk reasoning across analysts driven by mental fatigue.

The insight is not that large language models can read documents — that is obvious. The insight is why incumbents have not shipped this: their compliance reputation is built on deterministic structured lookups and they will not stake it on hallucination-prone generative output. The open lane is an analyst-in-the-loop product where the model extracts and stages risk factors with full source provenance, and a human analyst remains the decision-maker. That is a different product shape from the incumbents' core, and the bet is that the high-density real-time UI that surfaces extracted facts with provenance — not the model call itself — is the durable advantage. |

**Project Description:** Senior KYB Analysts at banks spend 4–8 hours manually verifying each complex multi-layered B2B onboarding application, working from hundreds of pages of unstructured narrative documents — trust deeds, legal statutes, ownership-structure charts, corporate filings. Legacy KYC platforms (Actimize, Lexis Bridger) excel at structured lookups against sanctions and PEP lists but provide zero comprehension of narrative content, forcing analysts to abandon those tools mid-review and fall back on PDF readers and Excel/SharePoint scratchpads. The result is a severe throughput bottleneck and inconsistent risk reasoning across analysts driven by mental fatigue.

The insight is not that large language models can read documents — that is obvious. The insight is why incumbents have not shipped this: their compliance reputation is built on deterministic structured lookups and they will not stake it on hallucination-prone generative output. The open lane is an analyst-in-the-loop product where the model extracts and stages risk factors with full source provenance, and a human analyst remains the decision-maker. That is a different product shape from the incumbents' core, and the bet is that the high-density real-time UI that surfaces extracted facts with provenance — not the model call itself — is the durable advantage.

---

## 🔌 Exa MCP Server for Claude Code

Give Claude Code real-time web search, page fetches, and optional advanced search with Exa MCP.

**Run in terminal:**

```bash
claude mcp add --transport http exa https://mcp.exa.ai/mcp
```

**Tool enablement (optional):**
Add a `tools=` query param to the MCP URL.

Enable advanced search:
```
https://mcp.exa.ai/mcp?tools=web_search_advanced_exa
```

Enable all non-deprecated tools:
```
https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,web_search_advanced_exa
```

**Authentication:** Exa MCP uses OAuth — no API key needed. Your client opens a browser to sign in to your Exa account on first connection. Manage your account at [dashboard.exa.ai](https://dashboard.exa.ai).

**Troubleshooting:** if tools don't appear, restart your MCP client after updating the config.

📖 Full docs: [docs.exa.ai/reference/exa-mcp](https://docs.exa.ai/reference/exa-mcp)

---

## Resources

- Docs: https://exa.ai/docs
- Dashboard: https://dashboard.exa.ai
- API Status: https://status.exa.ai