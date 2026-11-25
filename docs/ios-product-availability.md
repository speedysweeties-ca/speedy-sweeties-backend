# Customer iOS product availability

Prepared 2026-11-25. Companion customer-app branch: `fix/customer-ios-product-availability-2026-11-25` in `speedysweeties-ca/speedy-sweeties-customer-ios`.

Orders identified as `IOS_APP` or with `X-Speedy-Client: ios-customer` reject recognized tobacco, nicotine and vaping items and notes. The same checks apply to protected test orders. The authenticated dispatcher manual route remains outside this channel policy. The header is a channel marker, not an authorization credential.

Voice requests from the updated iOS app validate input and conversation history, exclude restricted catalogue entries from model context and validate output and web-verified product metadata before returning a draft or persisting a verified item. Final order creation checks text and known restricted catalogue names, including names with package-size suffixes, and rechecks matching catalogue metadata within the order transaction.

There is no reviewer-only switch. Android, web and manual-dispatch product rules are unchanged. No schema, dependency, environment variable or paid-service change is needed. Existing voice requests without the client marker retain existing behavior; release the companion iOS build for complete voice coverage.

## Validation and rollout

- Local `npm run check`: 652 passed, 15 database-dependent tests skipped. Run PostgreSQL CI, including the added protected-order catalogue case, before merge.
- Dispatcher `npm run check`: 83 passed. Prisma formatting, dispatcher-help check and root/dispatcher audits passed (zero vulnerabilities).
- iOS requires Mac compilation, XCTest and iPhone/iPad smoke testing; see its `ReleaseNotes/2026-11-25-product-availability-handoff.md`.
- Review real catalogue category and pickup-type data before release. The policy recognizes known terms, brands and classified catalogue records; unknown aliases, misspellings or incorrectly classified records need additional coverage. Keep the Swift and TypeScript term matchers synchronized.
- Deploy these API changes after review, before releasing the companion app. Validate using isolated test data or protected test ordering only. Do not create real deliveries for validation.
- App Store copy, screenshots and app artwork must be checked separately. This branch changes no App Store metadata.

Dispatcher help's manual-order guidance was reviewed: it still describes manual orders accurately; a source comment records that this customer-iOS rule does not change that workflow.
