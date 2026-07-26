# Winga Global Localization and International Intelligence

## Architecture decision

Global context is a versioned platform capability, not a collection of UI translations. Language and location are resolved independently and combined into one privacy-bounded market context. Marketplace paths remain operational when context resolution, translation, or intelligence processing is unavailable.

## Service boundaries

1. **Global Context Engine** resolves language, country, currency, timezone, writing direction, units, confidence, provenance, and commerce capabilities.
2. **Localization Runtime** formats numbers, money, dates, and document direction, supports live language changes, and uses a fail-soft local cache.
3. **Preference Service** stores explicit user choices. Explicit language wins; device-follow mode remains opt-in and survives device changes.
4. **Location Intelligence** consumes country/region/city only. It never changes language directly and stores no precise coordinates.
5. **Translation Service** translates system catalogs and opt-in marketplace content while preserving the seller's original text.
6. **International Intelligence** partitions aggregates by country, region, language, time bucket, category, and schema version.

## Event and data flow

`Client -> canonical context -> canonical intelligence event -> durable outbox -> queue processor -> country/time aggregates -> ranking and seller insights`

Context collection is non-blocking. Feed, search, checkout, chat, and images use their existing behavior when context is absent. Planned durable tables are `user_locale_preferences`, `market_context_events`, `market_daily_aggregates`, `translation_catalogs`, and `content_translations`. Raw events retain the existing bounded retention policy and seller content remains immutable from the translation path.

## Localization and location strategy

Resolution priority is explicit user preference, device language, browser language, region default, then English. Formatting uses platform `Intl` APIs. RTL is driven by language at the document root. Edge country headers are preferred over client location. City and region are optional and confidence-labelled; coordinates and IP addresses are not stored in localization context.

## Recommendation and AI integration

Country and culture are bounded ranking signals. They never replace pagination or freshness. Local relevance has a budget while international discovery and seller diversity remain active. AI models consume versioned aggregate features and write expiring predictions with model and feature versions; deterministic ranking remains the fallback.

## Performance, security, and readiness

Anonymous context can be edge cached by language and country. User-specific preferences are private and no-store. Formatting is local; translation and aggregation are queued. The implemented foundation is ready for incremental context rollout. Global launch still requires translated catalogs, cross-device preference persistence, cohort privacy thresholds, timezone-aware notification scheduling, translation-provider contracts, regional legal/tax configuration, and multi-region load and disaster-recovery tests.
