// System-design question bank, modeled on HelloInterview's guided-practice
// breakdowns (verified via deep research 2026-08-17): Easy/Medium/Hard tiers,
// per-question interviewer ground truth in their breakdown shape (top-3
// functional requirements, quantified non-functional requirements, entities,
// API sketch, high-level design, canonical deep dives, per-level
// expectations), and their patterns taxonomy. The `prompt` is the one-to-two
// vague sentences the interviewer says out loud — everything in `brief` is
// PRIVATE and released one fact at a time.

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DesignQuestion {
  id: string;
  title: string;
  difficulty: Difficulty;
  asks: string[]; // companies known to ask it
  patterns: string[]; // HelloInterview patterns taxonomy
  prompt: string; // spoken by the interviewer, deliberately vague
  brief: {
    functional: string[]; // the top ~3 core requirements (long lists are penalized)
    nonFunctional: string[]; // contextualized + quantified
    entities: string[];
    apiSketch: string[]; // REST by default; graded leniently but time-boxed
    highLevel: string; // the simple end-to-end design that must exist before complexity
    capacityMoments: string[]; // where math actually influences a decision
    deepDives: { topic: string; expected: string }[];
    commonMistakes: string[];
    levels: { mid: string; senior: string; staffPlus: string };
  };
}

export const DESIGN_BANK: DesignQuestion[] = [
  // ── EASY ────────────────────────────────────────────────────────────────
  {
    id: 'bitly',
    title: 'URL Shortener (Bitly)',
    difficulty: 'easy',
    asks: ['Meta', 'Amazon', 'Microsoft'],
    patterns: ['Scaling Reads', 'Dealing with Contention'],
    prompt:
      "Let's design a URL shortener — something like Bitly. Users give us a long URL and get back a short one that redirects to it.",
    brief: {
      functional: [
        'Shorten a long URL to a unique short code (optionally custom alias)',
        'Redirect a short URL to the original with minimal delay',
        'Support expiration times on links',
      ],
      nonFunctional: [
        'Short codes must be unique (no collisions serving wrong URLs)',
        'Redirects in under 100ms',
        '99.99% availability; redirects must work even if creation is down',
        'Scale: 1B shortened URLs, 100M DAU; read-heavy ~1000:1 read-to-write',
      ],
      entities: ['ShortUrl (code, originalUrl, ownerId, createdAt, expiresAt)', 'User'],
      apiSketch: [
        'POST /urls {originalUrl, alias?, expiresAt?} -> {shortUrl}',
        'GET /{code} -> 302 redirect to originalUrl',
      ],
      highLevel:
        'Client → API service → database keyed by short code. Creation writes a row; redirect looks up the code and returns 302. A single service and a single database fully satisfies the functional requirements — everything else is layered on in deep dives.',
      capacityMoments: [
        '1B URLs × ~500B/row ≈ 500GB — fits a single well-tuned database; sharding is not required, say so explicitly',
        '100M DAU × ~1 redirect/day ≈ ~1200 QPS average, maybe 10x peak — one cache tier absorbs this easily',
      ],
      deepDives: [
        {
          topic: 'Short code generation',
          expected:
            'Compare hashing (collision handling needed) vs global counter + base62 (6 chars covers 56B codes). Counter is the recommended landing point; discuss counter as single point of contention → centralized Redis counter with batched range allocation per app server.',
        },
        {
          topic: 'Fast redirects at scale',
          expected:
            'Primary-key/index lookup, then read-through cache (Redis/Memcached — ~1ms hit vs 20-50ms DB), CDN/edge caching as the extension. Cache invalidation on expiry.',
        },
        {
          topic: 'Read/write split and availability',
          expected:
            'Separate read (redirect) service from write (creation) service; read replicas; redirects keep working when writes are degraded. Multi-region is the staff+ extension.',
        },
      ],
      commonMistakes: [
        'Hashing without a collision story',
        'Sharding a 500GB dataset reflexively',
        'Spending deep-dive time on the trivial creation path instead of the hot redirect path',
      ],
      levels: {
        mid: 'A working end-to-end design for shorten + redirect; recognizes a cache would help, possibly with prompting.',
        senior:
          'Drives the trade-offs unprompted: counter vs hash for code generation, read/write service separation, cache strategy with numbers.',
        staffPlus:
          'Proactively covers multi-region deployment, counter range allocation, and Redis failover behaviour without being asked.',
      },
    },
  },
  {
    id: 'dropbox',
    title: 'File Storage (Dropbox)',
    difficulty: 'easy',
    asks: ['Dropbox', 'Google', 'Amazon'],
    patterns: ['Handling Large Blobs', 'Scaling Reads'],
    prompt:
      "Let's design a cloud file-storage service like Dropbox: people upload files from one device and can get them on another.",
    brief: {
      functional: [
        'Upload a file',
        'Download a file from any device',
        'Share a file with another user',
      ],
      nonFunctional: [
        'Support large files (up to ~50GB) — resumable uploads',
        'Durability is paramount: an acknowledged upload is never lost (11 nines via object storage)',
        'Availability over consistency: eventual consistency on metadata is acceptable',
        'Scale: hundreds of millions of files, mixed sizes',
      ],
      entities: ['File (metadata: name, size, mimeType, ownerId, chunks)', 'FileChunk', 'SharedLink / Permission', 'User'],
      apiSketch: [
        'POST /files -> presigned upload URL(s)',
        'GET /files/{id} -> presigned download URL',
        'POST /files/{id}/share {userId | link}',
      ],
      highLevel:
        'Client → API service for metadata (DB) + object storage (S3-style) for bytes. The load-bearing decision: clients transfer bytes DIRECTLY to/from object storage via presigned URLs — file bytes never pass through the application servers.',
      capacityMoments: [
        'A 50GB file through an app server would pin its memory/network — this justifies presigned direct-to-storage transfer, the central math-driven decision',
        'Chunk size choice (~5-10MB) trades resumability granularity against request overhead',
      ],
      deepDives: [
        {
          topic: 'Large file upload',
          expected:
            'Chunking with per-chunk presigned URLs (multipart upload), resumable state tracked per chunk (fingerprint), progress from chunk completion events.',
        },
        {
          topic: 'Download speed',
          expected: 'CDN in front of object storage for hot files; ranged GETs for partial reads.',
        },
        {
          topic: 'Sync and deduplication',
          expected:
            'Content-addressed chunks (hash as key) dedupe identical chunks across users; client compares chunk fingerprints to sync deltas rather than whole files.',
        },
      ],
      commonMistakes: [
        'Streaming file bytes through the application server',
        'Storing files in the database',
        'No resumability story for large uploads',
      ],
      levels: {
        mid: 'Working upload/download/share with object storage and a metadata DB; presigned URLs possibly with prompting.',
        senior: 'Proactive on chunking, resumable uploads and dedup; owns the "bytes never touch the app server" argument with numbers.',
        staffPlus: 'Leads sync-protocol design (delta sync, fingerprinting), consistency of metadata vs blob state, and failure recovery mid-upload.',
      },
    },
  },
  {
    id: 'yelp',
    title: 'Business Review Site (Yelp)',
    difficulty: 'easy',
    asks: ['Yelp', 'Google', 'Meta'],
    patterns: ['Scaling Reads'],
    prompt:
      "Let's design something like Yelp: users search for nearby businesses and read and write reviews of them.",
    brief: {
      functional: [
        'Search businesses by location (and name/category)',
        'View a business with its rating and reviews',
        'Leave a review (one per user per business)',
      ],
      nonFunctional: [
        'Search latency under ~500ms at p99',
        'Read-heavy (~100:1) — availability over consistency for reads',
        'Scale: ~10M businesses, ~100M reviews, 10M DAU',
      ],
      entities: ['Business (location, category, avgRating)', 'Review (rating, text, userId, businessId)', 'User'],
      apiSketch: [
        'GET /businesses?lat&lng&radius&category&query -> paginated list',
        'GET /businesses/{id} -> details + reviews page',
        'POST /businesses/{id}/reviews {rating, text}',
      ],
      highLevel:
        'Client → API service → database with businesses + reviews; average rating denormalized onto the business row and updated on review write. Geo search served by an index (PostGIS or geohash) — a plain B-tree on lat/lng does not answer radius queries efficiently.',
      capacityMoments: [
        '10M businesses × ~1KB ≈ 10GB — comfortably one database; the interesting scaling is read QPS, not data size',
        'Rating update on write: read-modify-write vs incremental (count, sum) — constant-time update wins',
      ],
      deepDives: [
        {
          topic: 'Geo search',
          expected: 'Geohash/quadtree vs PostGIS; how a geohash prefix query maps to "nearby"; why the naive bounding-box + filter works at this scale.',
        },
        {
          topic: 'One review per user per business',
          expected: 'Unique constraint (userId, businessId) at the database — not an application-level check with a race.',
        },
        {
          topic: 'Complex search (name + category + geo)',
          expected: 'Elasticsearch/OpenSearch as a read-optimized secondary index, kept in sync via CDC; staleness trade-off acknowledged.',
        },
      ],
      commonMistakes: [
        'Application-level duplicate-review check (race condition)',
        'Recomputing average rating by scanning all reviews per page view',
        'Reaching for Elasticsearch before justifying why the primary DB is insufficient',
      ],
      levels: {
        mid: 'Working search/view/review design with a sane geo story; unique constraint possibly with prompting.',
        senior: 'Proactive on the geo index choice with mechanism, the denormalized rating, and the constraint-level uniqueness.',
        staffPlus: 'Leads the search-index synchronization design (CDC, staleness), hot-key businesses, and read-scaling strategy end to end.',
      },
    },
  },
  {
    id: 'local-delivery',
    title: 'Local Delivery Service (Gopuff)',
    difficulty: 'easy',
    asks: ['Gopuff', 'Amazon', 'DoorDash'],
    patterns: ['Dealing with Contention', 'Scaling Reads'],
    prompt:
      "Let's design the backend for a rapid local-delivery service like Gopuff: customers order items from nearby micro-warehouses for delivery inside an hour.",
    brief: {
      functional: [
        'Query availability of items deliverable to my location (from nearby warehouses)',
        'Place an order for available items',
        'Orders must not oversell inventory',
      ],
      nonFunctional: [
        'Availability queries fast (<100ms) — they happen on every browse',
        'Strong consistency on ordering: never sell stock that is not there',
        'Scale: ~10K warehouses, ~100K SKUs, order volume modest (10s of orders/sec) — browse volume high',
      ],
      entities: ['Item/SKU', 'Warehouse (location, serviceable area)', 'Inventory (warehouseId, itemId, quantity)', 'Order'],
      apiSketch: [
        'GET /availability?lat&lng&items=... -> {item: quantityAvailable}',
        'POST /orders {items, address} -> order or 409 if stock gone',
      ],
      highLevel:
        'Client → availability service (read path: nearby warehouses → inventory sums, cacheable) and order service (write path: transactional decrement). One inventory database serves both; the interesting tension is fast reads vs strongly consistent writes on the same data.',
      capacityMoments: [
        'Nearby-warehouse resolution: 10K warehouses is tiny — travel-time matters more than distance; precomputed drive-time polygons beat naive radius',
        'Inventory rows: 10K × 100K upper bound but sparse in practice — fits one DB; contention is per-row, not size',
      ],
      deepDives: [
        {
          topic: 'No overselling',
          expected:
            'Atomic conditional decrement (UPDATE ... SET qty = qty-1 WHERE qty >= 1) inside the order transaction — not check-then-write. Discuss what happens on payment failure (compensating increment or reservation with TTL).',
        },
        {
          topic: 'Fast availability',
          expected: 'Cache availability per (region, item) with short TTL; tolerate slight staleness on the read path because the write path re-verifies.',
        },
        {
          topic: 'Serviceable-area resolution',
          expected: 'Drive-time isochrones precomputed per warehouse vs radius; index point-in-polygon lookups.',
        },
      ],
      commonMistakes: [
        'Check-then-write inventory race',
        'Strong consistency on the browse path (unnecessary and slow)',
        'Distance instead of drive time for "nearby"',
      ],
      levels: {
        mid: 'End-to-end browse + order design; atomic decrement possibly with prompting.',
        senior: 'Proactively separates read/write consistency needs, owns the conditional-decrement contention story and reservation TTLs.',
        staffPlus: 'Leads regional partitioning, cache invalidation on order placement, and graceful degradation when a warehouse DB partition is down.',
      },
    },
  },

  // ── MEDIUM ──────────────────────────────────────────────────────────────
  {
    id: 'ticketmaster',
    title: 'Ticket Booking (Ticketmaster)',
    difficulty: 'medium',
    asks: ['Amazon', 'Meta', 'Ticketmaster'],
    patterns: ['Dealing with Contention', 'Scaling Reads'],
    prompt:
      "Let's design a ticket-booking site like Ticketmaster: users browse events and buy seats, including for events where everyone shows up at once.",
    brief: {
      functional: [
        'View events and available seats',
        'Reserve seats while checking out (bounded hold)',
        'Purchase reserved seats — a seat is never sold twice',
      ],
      nonFunctional: [
        'Strong consistency for booking: no double-sold seats, ever',
        'Read-heavy browsing must stay up under 10-100x spikes (popular on-sales)',
        'Reservation hold ~10 minutes, then seats return automatically',
        'Scale: ~100K events, but single-event spikes of millions of concurrent users',
      ],
      entities: ['Event', 'Venue/Seat', 'Ticket (seatId, eventId, status: available|reserved|sold)', 'Booking', 'User'],
      apiSketch: [
        'GET /events/{id}/seats -> seat map with statuses',
        'POST /reservations {eventId, seatIds} -> hold with expiry',
        'POST /bookings {reservationId, payment} -> confirmed tickets',
      ],
      highLevel:
        'Browse service (cacheable reads) + booking service (transactional writes) over a seats/tickets DB. Reserve marks seats with an expiring hold; purchase converts hold to sold inside a transaction. A simple end-to-end version with status transitions must exist before the spike machinery.',
      capacityMoments: [
        'Seat map for one event: thousands of rows — the contention problem is per-seat row locks under spike, not data volume',
        'On-sale spike: millions of users for ~10K seats justifies a queue in front of checkout — math shows >99% of requests must fail anyway',
      ],
      deepDives: [
        {
          topic: 'Reservation expiry',
          expected:
            'Expiry via timestamp comparison at read/purchase time (status=reserved AND expiresAt<now treated as available) or Redis TTL — NOT a cron sweeping rows; discuss why cron granularity creates windows.',
        },
        {
          topic: 'Double-sell prevention',
          expected: 'Optimistic concurrency or conditional update on seat status inside the purchase transaction; idempotent payment confirmation.',
        },
        {
          topic: 'Surviving the on-sale spike',
          expected:
            'Virtual waiting room / admission queue in front of checkout, aggressive caching of the seat map with client-side refresh, and honesty that most users must be rejected fairly.',
        },
      ],
      commonMistakes: [
        'Cron-based hold expiry',
        'Locking the whole event row instead of per-seat',
        'No idempotency on payment confirmation (double-charge on retry)',
      ],
      levels: {
        mid: 'Working browse/reserve/purchase with sound status transitions; timestamp-based expiry possibly with prompting.',
        senior: 'Proactive on contention mechanics (conditional updates, idempotency) and the timestamp-vs-cron expiry argument.',
        staffPlus: 'Leads the spike architecture: admission queue design, fairness, cache strategy under thundering herd, and payment-flow failure modes.',
      },
    },
  },
  {
    id: 'fb-news-feed',
    title: 'News Feed (Facebook)',
    difficulty: 'medium',
    asks: ['Meta', 'LinkedIn', 'X/Twitter'],
    patterns: ['Scaling Reads', 'Scaling Writes', 'Pushing Realtime Updates'],
    prompt:
      "Let's design a social news feed — think Facebook: people follow each other, post updates, and see a feed of posts from people they follow.",
    brief: {
      functional: [
        'Create a post',
        'Follow/unfollow users',
        'View a chronological(ish) feed of followed users\' posts',
      ],
      nonFunctional: [
        'Feed load under ~500ms',
        'Post visibility within ~1 minute (eventual consistency fine)',
        'Scale: 1B users, 100M posts/day; celebrity accounts with 100M followers',
        'Read-heavy: feed views outnumber posts ~100:1',
      ],
      entities: ['User', 'Follow (followerId, followeeId)', 'Post', 'FeedEntry (precomputed, per user)'],
      apiSketch: [
        'POST /posts {content}',
        'POST /follows {followeeId} / DELETE',
        'GET /feed?cursor= -> paginated posts',
      ],
      highLevel:
        'Naive pull first: feed = query posts of followees at read time — correct but slow at scale. Then the real design: fan-out on write to precomputed per-user feed lists (Redis), with the celebrity problem forcing a hybrid.',
      capacityMoments: [
        'Fan-out on write for a 100M-follower account = 100M writes per post — this single number forces the hybrid model; do this math out loud',
        'Feed cache: 1B users × 500 post-ids × 8B ≈ 4TB — shardable in Redis, feasible; show it',
      ],
      deepDives: [
        {
          topic: 'Fan-out on write vs read (hybrid)',
          expected:
            'Precompute feeds for normal accounts; celebrities are pulled at read time and merged. The threshold and the merge path must be concrete.',
        },
        {
          topic: 'Feed pagination',
          expected: 'Cursor-based (post id / timestamp), not offset — offsets break under insertion.',
        },
        {
          topic: 'Uneven load / hot users',
          expected: 'Shard feed store by userId; async fan-out workers via queue; backpressure when a celebrity posts.',
        },
      ],
      commonMistakes: [
        'Choosing pure push or pure pull without the celebrity math',
        'Offset pagination',
        'Ranking discussion before a working chronological feed exists',
      ],
      levels: {
        mid: 'Working pull-based feed plus recognition that precomputation helps; hybrid with prompting.',
        senior: 'Owns the hybrid fan-out decision with the 100M-write math, sharding and async workers unprompted.',
        staffPlus: 'Leads consistency/staleness envelope, backpressure design, and evolution to ranked feeds without rework.',
      },
    },
  },
  {
    id: 'whatsapp',
    title: 'Messenger (WhatsApp)',
    difficulty: 'medium',
    asks: ['Meta', 'Microsoft'],
    patterns: ['Pushing Realtime Updates', 'Scaling Writes'],
    prompt:
      "Let's design a messaging app like WhatsApp: one-to-one and group chats, with messages delivered in real time when people are online.",
    brief: {
      functional: [
        'Send/receive messages in 1:1 and group chats (groups to ~100)',
        'Deliver in real time to online users; queue for offline users',
        'Delivery/read receipts',
      ],
      nonFunctional: [
        'Delivery latency to online users <500ms',
        'No message loss once acknowledged (durable before ack)',
        'Messages deletable after delivery to all participants (transient storage)',
        'Scale: 1B users, ~10B messages/day',
      ],
      entities: ['User', 'Chat/Group', 'Message', 'Device/Connection', 'InboxEntry (undelivered per recipient)'],
      apiSketch: [
        'WebSocket: send {chatId, content} / receive {message}',
        'ack {messageId} — drives receipts and deletion',
        'GET /chats/{id}/messages?cursor= (history while retained)',
      ],
      highLevel:
        'Persistent WebSocket per online device → chat servers. A message is persisted (durable) then routed: look up recipient connections (registry mapping userId→server), push to online devices, park in per-recipient inbox for offline. Receipts are tiny messages on the same path.',
      capacityMoments: [
        '10B msgs/day ≈ 115K/s average, ~1M/s peak — write path must shard; single-broker designs die here, say it with the number',
        '1B users, ~10% concurrently online = 100M open sockets ÷ ~100K-1M per server → hundreds of chat servers and a routing registry',
      ],
      deepDives: [
        {
          topic: 'Connection registry and cross-server routing',
          expected: 'userId→(server, deviceId) mapping in Redis/coordination service; server-to-server forwarding or pub/sub per user channel.',
        },
        {
          topic: 'Offline delivery + at-least-once',
          expected: 'Durable inbox per recipient, delete-on-ack, client dedup by messageId (idempotent receive).',
        },
        {
          topic: 'Group fan-out',
          expected: 'Fan-out at the chat server per recipient; groups capped at ~100 keeps write amplification bounded — acknowledge the cap as a product decision that saves the design.',
        },
      ],
      commonMistakes: [
        'HTTP polling as the primary delivery path',
        'Ack before durable persistence',
        'Ignoring multi-device delivery',
      ],
      levels: {
        mid: 'Working WebSocket send/receive with durable storage and offline inbox; registry with prompting.',
        senior: 'Proactive on the connection registry, at-least-once + dedup semantics, and peak-write sharding with numbers.',
        staffPlus: 'Leads multi-device sync, ordering guarantees per chat, regional partitioning of chat servers and failure of a chat server mid-delivery.',
      },
    },
  },
  {
    id: 'leetcode',
    title: 'Online Judge (LeetCode)',
    difficulty: 'medium',
    asks: ['Meta', 'Amazon', 'OpenAI'],
    patterns: ['Managing Long-Running Tasks', 'Scaling Reads'],
    prompt:
      "Let's design an online coding-judge platform like LeetCode: users browse problems, submit code, and get verdicts against hidden tests — plus a live leaderboard for contests.",
    brief: {
      functional: [
        'Browse problems and view one',
        'Submit code; run against hidden tests; return verdict',
        'Contest leaderboard, near-real-time',
      ],
      nonFunctional: [
        'Untrusted code MUST run isolated (security is a stated requirement, not an extra)',
        'Verdict within ~5s under normal load',
        'Scale: contests spike to ~100K concurrent submitters',
        'Leaderboard freshness within seconds',
      ],
      entities: ['Problem (statement, tests)', 'Submission (code, verdict, runtime)', 'Contest', 'LeaderboardEntry', 'User'],
      apiSketch: [
        'GET /problems, GET /problems/{id}',
        'POST /problems/{id}/submissions {code, language} -> submissionId',
        'GET /submissions/{id} (poll) or push verdict over WebSocket/SSE',
        'GET /contests/{id}/leaderboard',
      ],
      highLevel:
        'API service + problems DB; submissions enqueued to a judge queue; isolated worker pool (containers) runs code against tests and writes verdicts; client gets result by poll or push. The immediate-ack + background-worker split is the load-bearing pattern.',
      capacityMoments: [
        'Contest spike: 100K submissions in minutes × ~2s CPU each — worker fleet sizing math justifies the queue and autoscaling; without the math "add workers" is hand-waving',
        'Leaderboard: naive per-view recompute over 100K users × N problems is the anti-pattern; incremental updates in Redis sorted sets cost O(log n) per verdict',
      ],
      deepDives: [
        {
          topic: 'Sandboxing untrusted code',
          expected:
            'Containers/microVMs with no network, CPU/memory/time limits, seccomp, read-only FS, non-root. Naming docker alone is not enough — the limits and the escape surface matter.',
        },
        {
          topic: 'Verdict delivery',
          expected: 'Polling vs SSE/WebSocket trade-off at this latency budget; idempotent verdict writes on worker retry.',
        },
        {
          topic: 'Live leaderboard',
          expected: 'Redis sorted set per contest updated per verdict; paginated reads; ties broken by time — no full recompute.',
        },
      ],
      commonMistakes: [
        'Running code in-process or "in a docker container" with no resource limits',
        'Synchronous judging inside the request',
        'Leaderboard recomputed per page view',
      ],
      levels: {
        mid: 'Working submit → queue → worker → verdict flow with basic isolation; sorted-set leaderboard with prompting.',
        senior: 'Proactive on sandbox mechanics, worker fleet math for spikes, and incremental leaderboard with idempotent retries.',
        staffPlus: 'Leads multi-tenant isolation strategy, queue backpressure and fairness under contest load, and judging-infra failure modes (poisoned workers, stuck jobs).',
      },
    },
  },
  {
    id: 'rate-limiter',
    title: 'Distributed Rate Limiter',
    difficulty: 'medium',
    asks: ['Stripe', 'Cloudflare', 'Amazon'],
    patterns: ['Dealing with Contention', 'Scaling Reads'],
    prompt:
      "Let's design a rate limiter as a service: other teams' APIs call it to decide whether a given request should be allowed or throttled.",
    brief: {
      functional: [
        'Check-and-count: allow or reject a request for (client, rule)',
        'Configurable rules per API/client (e.g. 100 req/min)',
        'Multiple algorithms (at least sliding window and token bucket)',
      ],
      nonFunctional: [
        'Decision latency <10ms — it sits on the hot path of every request',
        'Fail-open vs fail-closed must be an explicit, configurable decision',
        'Scale: 1M+ decisions/sec across many services',
        'Approximate correctness at boundaries is acceptable if bounded and stated',
      ],
      entities: ['Rule (key pattern, limit, window, algorithm)', 'Counter/Bucket state per (client, rule)'],
      apiSketch: [
        'POST /check {key, ruleId} -> {allowed, retryAfter?} (or a client library short-circuiting to Redis)',
        'CRUD /rules',
      ],
      highLevel:
        'Client library or sidecar → Redis-backed counter store with the algorithm implemented as an atomic operation (Lua) per check. Rules cached in-process. A single Redis with Lua scripts satisfies the functional requirements; scaling and accuracy trade-offs are the deep dives.',
      capacityMoments: [
        '1M decisions/sec vs one Redis instance (~100K ops/s) → shard by key; consistent hashing so a (client, rule) always lands on the same shard — the math forces the sharding decision',
        'Token bucket state: two numbers per key; 100M active keys ≈ a few GB — memory sizing shows feasibility',
      ],
      deepDives: [
        {
          topic: 'Algorithm choice',
          expected:
            'Fixed window (bursty at edges) vs sliding window log (memory-heavy) vs sliding counter approximation vs token bucket (bursts + refill). Token bucket as sane default, implemented atomically in Lua (read-compute-write race otherwise).',
        },
        {
          topic: 'Latency budget',
          expected: 'In-process local cache/short-circuit for hot keys, Redis pipelining, and co-location; what the added p99 does to caller SLOs.',
        },
        {
          topic: 'Failure behaviour',
          expected: 'Redis down: fail-open with local approximate limiting (per-instance quotas) vs fail-closed for expensive endpoints; make it per-rule.',
        },
      ],
      commonMistakes: [
        'Non-atomic check-then-set on the counter',
        'One global Redis with no sharding story at 1M/s',
        'No stated failure mode',
      ],
      levels: {
        mid: 'Working Redis-counter limiter with one sound algorithm; atomicity via Lua possibly with prompting.',
        senior: 'Compares algorithms with their failure shapes, owns sharding-by-key math and the fail-open/closed decision.',
        staffPlus: 'Leads the global (multi-region) limiting problem, hot-key mitigation, and bounded-staleness distributed counters.',
      },
    },
  },
  {
    id: 'job-scheduler',
    title: 'Distributed Job Scheduler',
    difficulty: 'medium',
    asks: ['Amazon', 'Google', 'Datadog'],
    patterns: ['Managing Long-Running Tasks', 'Multi-Step Processes'],
    prompt:
      "Let's design a distributed job scheduler: services register jobs to run at a time or on a schedule, and the system executes them reliably.",
    brief: {
      functional: [
        'Schedule a one-off job (run at T) or recurring (cron expression)',
        'Execute the job at its time — at-least-once',
        'Query job status and history',
      ],
      nonFunctional: [
        'Execution within ~seconds of the scheduled time',
        'No lost jobs (durable through scheduler crashes)',
        'At-least-once with idempotent handlers documented; no duplicate concurrent runs of the same job',
        'Scale: 10K jobs/sec at peak firing rate',
      ],
      entities: ['Job (schedule, payload, targetHandler)', 'JobRun (attempt, status, startedAt)', 'Worker'],
      apiSketch: [
        'POST /jobs {cron | runAt, payload}',
        'GET /jobs/{id} / GET /jobs/{id}/runs',
        'DELETE /jobs/{id}',
      ],
      highLevel:
        'Jobs table (durable) → scheduler poller moves due jobs onto an execution queue → worker pool executes and writes run status back. Recurring jobs re-materialize the next run on completion. Simple polling + queue is the complete core; the deep dives make it reliable at scale.',
      capacityMoments: [
        '10K fires/sec: the due-job query needs an index on (status, runAt) and batch claiming — the naive full-table scan dies; show the query shape',
        'Poll interval vs precision: 1s polling ≈ ±1s firing precision; justify against the stated SLO',
      ],
      deepDives: [
        {
          topic: 'Exactly-one-runner per job',
          expected:
            'Claiming via atomic conditional update (status pending→claimed with worker id + lease expiry) or FOR UPDATE SKIP LOCKED batches; lease renewal for long jobs; reclaim on lease expiry.',
        },
        {
          topic: 'Retries and failure',
          expected: 'Retry with backoff as new JobRun attempts, dead-letter after N, idempotency keys for the handler side.',
        },
        {
          topic: 'Recurring jobs',
          expected: 'Materialize next occurrence on completion (not all future occurrences); handle misfires (worker down over the scheduled time) with policy: run-once-now vs skip.',
        },
      ],
      commonMistakes: [
        'A cron loop on one box as the final design',
        'Claiming with check-then-update (double execution race)',
        'No lease/heartbeat, so a crashed worker strands its jobs',
      ],
      levels: {
        mid: 'Durable jobs table + queue + workers with a sane claiming story; leases with prompting.',
        senior: 'Proactive on SKIP LOCKED batch claiming, lease expiry semantics, and misfire policy; retry design with idempotency.',
        staffPlus: 'Leads scheduler HA (multiple pollers without double-fire), priority and fairness across tenants, and timer-wheel-style efficiency past the polling model.',
      },
    },
  },
  {
    id: 'distributed-cache',
    title: 'Distributed Cache (Redis)',
    difficulty: 'medium',
    asks: ['Amazon', 'Microsoft', 'Meta'],
    patterns: ['Scaling Reads', 'Scaling Writes'],
    prompt:
      "Let's design a distributed in-memory cache — the thing you'd reach for when someone says 'just put Redis in front of it'. Get/set/delete with TTLs, across many nodes.",
    brief: {
      functional: [
        'get/set/delete with per-key TTL',
        'Scale horizontally beyond one node\'s memory',
        'Client-transparent node addressing (a key finds its node)',
      ],
      nonFunctional: [
        'Sub-millisecond p50 within a datacenter',
        'Cache semantics: losing data is tolerable, serving it fast is not; availability over consistency',
        'Scale: 1TB total, 10M ops/sec across the fleet',
        'Eviction under memory pressure (LRU-ish)',
      ],
      entities: ['CacheNode', 'Partition/HashSlot', 'ClientLibrary (routing)'],
      apiSketch: ['GET/SET/DEL {key} (binary protocol; the API step is short here — say so and move on)'],
      highLevel:
        'Client library hashes key → node (consistent hashing); each node is a single-threaded-ish in-memory hash map with TTL wheel and LRU eviction. That IS the core design; the interview is won in the deep dives.',
      capacityMoments: [
        '1TB ÷ 64GB usable per node ≈ 16+ nodes minimum; 10M ops/s ÷ ~500K ops/s per node → ~20 nodes — two independent constraints landing on similar fleet size, do both',
        'Consistent hashing vs mod-N: quantify reshuffle on node add (1/N keys vs nearly all)',
      ],
      deepDives: [
        {
          topic: 'Partitioning',
          expected: 'Consistent hashing with virtual nodes for balance; what moves when a node joins/leaves; who owns the ring (client-side vs config service).',
        },
        {
          topic: 'Eviction + TTL',
          expected: 'Approximate LRU (sampling) vs true LRU cost; lazy TTL expiry on read + periodic active sweep — the Redis approach, with reasons.',
        },
        {
          topic: 'Hot keys and replication',
          expected: 'Read replicas per partition for hot keys, or client-side key splitting (key#1..N); replication async — a lost write is a cache miss, and that is fine; say why.',
        },
      ],
      commonMistakes: [
        'Strong consistency machinery (quorums) on a cache — over-engineering against the stated semantics',
        'mod-N hashing with a resharding catastrophe',
        'Ignoring hot keys ("uniform hashing handles it" — it does not)',
      ],
      levels: {
        mid: 'Consistent-hashing partitioned get/set/del with TTL and LRU stated correctly.',
        senior: 'Owns virtual nodes, eviction mechanics, and hot-key mitigation with the fleet-sizing math unprompted.',
        staffPlus: 'Leads failure semantics (node loss, ring changes mid-flight), cache stampede protection, and client library design (hedged reads, pipelining).',
      },
    },
  },

  // ── HARD ────────────────────────────────────────────────────────────────
  {
    id: 'uber',
    title: 'Ride Sharing (Uber)',
    difficulty: 'hard',
    asks: ['Uber', 'Lyft', 'Google'],
    patterns: ['Pushing Realtime Updates', 'Scaling Writes', 'Dealing with Contention'],
    prompt:
      "Let's design the core of a ride-sharing service like Uber: riders request a ride, nearby drivers get matched, and both sides watch the ride happen live.",
    brief: {
      functional: [
        'Rider requests a ride from A to B with a fare estimate',
        'Match request to a nearby available driver (driver can accept/decline)',
        'Live location tracking of the ride for both parties',
      ],
      nonFunctional: [
        'Matching latency < ~1 minute end-to-end',
        'A driver is matched to ONE ride at a time (consistency on assignment)',
        'Location updates ~every 5s from every active driver — the dominant write load',
        'Scale: 10M drivers, ~1M concurrent rides, peak cities are hot spots',
      ],
      entities: ['Rider', 'Driver (status, location)', 'RideRequest', 'Ride (riderId, driverId, state machine)', 'LocationUpdate'],
      apiSketch: [
        'POST /rides {pickup, destination} -> estimate + requestId',
        'WebSocket driver: location updates up, ride offers down; rider: ride status/location down',
        'POST /rides/{id}/accept (driver)',
      ],
      highLevel:
        'Location service ingesting driver pings into an in-memory geo index (Redis geo/geohash buckets — NOT the primary DB); matching service querying nearby available drivers and running the offer state machine; ride service owning the ride lifecycle. Ephemeral location data and durable ride data are deliberately separated.',
      capacityMoments: [
        '10M drivers ÷ 5s = 2M location writes/sec — this number kills any disk-first design and forces in-memory + TTL; do it early because it shapes everything',
        'Geo query: geohash cell + neighbors at ~1km precision; hot-city cells need sub-splitting — the hot-shard math',
      ],
      deepDives: [
        {
          topic: 'Location ingestion + geo index',
          expected: 'In-memory geohash buckets with TTL (stale drivers age out); write path sharded by region; why 2M writes/s of ephemeral data never touches Postgres.',
        },
        {
          topic: 'One-driver-one-ride consistency',
          expected:
            'Offer lock with TTL (driver reserved while deciding) via atomic set-if-absent; accept converts to assignment transactionally; decline/timeout releases. The contention pattern under simultaneous matches.',
        },
        {
          topic: 'Matching quality vs latency',
          expected: 'Nearest-N by ETA not distance; sequential offer vs broadcast trade-off (double-accept problem); surge/queueing when supply-starved.',
        },
      ],
      commonMistakes: [
        'Driver locations in the relational DB',
        'Broadcast offers with check-then-assign races',
        'One global geo index with no hot-city story',
      ],
      levels: {
        mid: 'Working request→match→track flow with a geo index and offer state machine; lock semantics with prompting.',
        senior: 'Owns the 2M writes/s math, TTL-based offer locking, and geo sharding unprompted — depth in at least two of these.',
        staffPlus: 'Leads regional isolation, matching-quality evolution (ETA models, batching), and degradation when the location service browns out.',
      },
    },
  },
  {
    id: 'web-crawler',
    title: 'Web Crawler',
    difficulty: 'hard',
    asks: ['Google', 'Microsoft', 'OpenAI'],
    patterns: ['Managing Long-Running Tasks', 'Scaling Writes', 'Multi-Step Processes'],
    prompt:
      "Let's design a web crawler: starting from seed URLs, fetch pages, extract links, and keep going — politely — until you've covered a large fraction of the web.",
    brief: {
      functional: [
        'Fetch pages starting from seeds; extract and enqueue new links',
        'Store page content for downstream processing (e.g. indexing/training)',
        'Re-crawl on a freshness policy',
      ],
      nonFunctional: [
        'Politeness: per-domain rate limits and robots.txt compliance — a correctness requirement, not a nicety',
        'Scale: 10B pages in ~weeks → sustained ~5-10K fetches/sec',
        'Fault tolerant: crawler restarts must not lose the frontier or re-crawl everything',
        'Dedup: never store the same URL twice; near-dup content detection is an extension',
      ],
      entities: ['UrlFrontier (queue state)', 'Page (content, fetchedAt)', 'DomainState (robots, lastFetch, crawlDelay)', 'SeenUrl set'],
      apiSketch: ['(Internal system — the API step collapses into component interfaces; say so and spend the time on the pipeline)'],
      highLevel:
        'Frontier queue → fetcher workers → parser → (content store, link extractor → dedup filter → frontier). A single-queue single-worker version is the complete core loop; scale and politeness restructure the frontier into per-domain queues.',
      capacityMoments: [
        '10B pages × ~100KB ≈ 1PB content → object storage, not a database; blob-store math up front',
        '10B URLs in the seen-set: 10B × ~50B = 500GB exact vs ~10GB Bloom filter with a stated false-positive trade-off',
        '5-10K fetches/s with per-domain politeness (1 req/s/domain) requires ≥10K concurrently crawlable domains — this shapes frontier design',
      ],
      deepDives: [
        {
          topic: 'Frontier with politeness',
          expected: 'Per-domain queues + a ready-queue keyed by nextAllowedFetch time; DNS caching; how one slow domain never blocks the fleet.',
        },
        {
          topic: 'URL dedup at scale',
          expected: 'Bloom filter (with FP consequences: a skipped page, acceptable) vs sharded exact store; canonicalization before hashing.',
        },
        {
          topic: 'Fault tolerance',
          expected: 'Frontier checkpointed in durable storage (e.g. Kafka/DB), fetch as at-least-once with idempotent content writes keyed by URL hash.',
        },
      ],
      commonMistakes: [
        'One global queue with no per-domain isolation (politeness violated, hot domains starve the rest)',
        'Seen-set in one process\'s memory',
        'Ignoring crawler traps (infinite calendars) — depth/URL-pattern budgets',
      ],
      levels: {
        mid: 'Complete crawl loop with dedup and basic politeness; frontier restructuring with prompting.',
        senior: 'Owns per-domain frontier design, Bloom-filter trade-off math, and checkpointed fault tolerance unprompted.',
        staffPlus: 'Leads freshness scheduling (re-crawl priority), near-dup content detection (simhash), and adversarial pages (traps, cloaking) end to end.',
      },
    },
  },
  {
    id: 'ad-click-aggregator',
    title: 'Ad Click Aggregator',
    difficulty: 'hard',
    asks: ['Meta', 'Google', 'Amazon'],
    patterns: ['Scaling Writes', 'Multi-Step Processes'],
    prompt:
      "Let's design an ad click aggregator: browsers send click events, and advertisers query near-real-time aggregates of clicks on their ads at various time granularities.",
    brief: {
      functional: [
        'Ingest click events (adId, userId, timestamp)',
        'Query aggregates: clicks per ad per minute/hour/day, filterable',
        'Redirect the user to the ad target on click (low latency)',
      ],
      nonFunctional: [
        'Scale: 10K clicks/sec sustained, 100K peak (10B/day)',
        'Query freshness: aggregates within ~1 minute of the click',
        'Correctness: advertisers are billed on this — no double counting from retries; fraud/dedup on (user, ad) within a window',
        'Aggregation queries fast (<1s) over long ranges',
      ],
      entities: ['ClickEvent', 'AdAggregate (adId, windowStart, granularity, count)', 'Ad'],
      apiSketch: [
        'GET /click?adId=... -> 302 redirect (+ event emitted)',
        'GET /ads/{id}/stats?granularity=minute&from&to',
      ],
      highLevel:
        'Click service (redirect fast, emit event to Kafka) → stream processor (Flink) computing windowed counts → OLAP/aggregate store queried by the advertiser dashboard. The raw event log is retained: aggregates are derived, recomputable state.',
      capacityMoments: [
        '10B events/day × ~100B ≈ 1TB/day raw — Kafka retention and OLAP storage math justify the log-then-aggregate architecture',
        'Pre-aggregation cardinality: ads × minutes is large but bounded; roll-up (minute→hour→day) shrinks query cost — show the roll-up math',
      ],
      deepDives: [
        {
          topic: 'Exactly-once-ish counting',
          expected:
            'Idempotent click ids generated at the edge, dedup in the stream processor (keyed state with TTL), Flink checkpointing semantics; why "exactly once" really means idempotent effects + replay.',
        },
        {
          topic: 'Late and out-of-order events',
          expected: 'Event-time windows with watermarks and allowed lateness; late data updates aggregates rather than being dropped silently — billing depends on it.',
        },
        {
          topic: 'Hot ads',
          expected: 'A viral ad concentrates key traffic: pre-shard hot keys (adId#salt) and merge at query time; detect via metrics.',
        },
      ],
      commonMistakes: [
        'Incrementing DB counters synchronously per click',
        'Processing-time windows (billing drift under lag)',
        'No dedup story despite retries being routine',
      ],
      levels: {
        mid: 'Event log → stream aggregation → queryable store, correctly separated; watermarks with prompting.',
        senior: 'Owns event-time semantics, dedup with keyed state, and hot-key mitigation with the daily-volume math.',
        staffPlus: 'Leads reconciliation (streaming vs batch recompute for billing truth), backfill/replay design, and multi-region ingestion.',
      },
    },
  },
  {
    id: 'robinhood',
    title: 'Stock Trading App (Robinhood)',
    difficulty: 'hard',
    asks: ['Robinhood', 'Bloomberg', 'Citadel'],
    patterns: ['Pushing Realtime Updates', 'Dealing with Contention', 'Scaling Reads'],
    prompt:
      "Let's design a retail stock-trading app like Robinhood: users watch live prices and place orders that route to an exchange.",
    brief: {
      functional: [
        'Live price watch on symbols (watchlist + detail views)',
        'Place/cancel market and limit orders, routed to an exchange',
        'Portfolio: positions, balance, order history',
      ],
      nonFunctional: [
        'Order placement correctness: no lost/duplicated orders; funds checked (no overspend) — strong consistency',
        'Price updates to clients within ~1s (display), order acks fast as exchange allows',
        'Scale: 10M concurrent users watching prices, ~10K symbols, market-open spikes',
        'Auditability: every order state transition recorded (regulatory)',
      ],
      entities: ['User/Account (buying power)', 'Order (state machine: pending→routed→filled/cancelled/rejected)', 'Position', 'SymbolPrice', 'Watchlist'],
      apiSketch: [
        'WebSocket/SSE: price stream per subscribed symbol',
        'POST /orders {symbol, side, qty, type, limitPrice?} -> orderId',
        'DELETE /orders/{id}; GET /portfolio',
      ],
      highLevel:
        'Two decoupled planes. Market-data plane: exchange feed → fan-out service → clients (one upstream feed, N subscribers — never per-user exchange connections). Order plane: order service (funds check + persist) → exchange gateway (route, track acks/fills) → position/ledger updates. Read-heavy price fan-out and correctness-heavy order flow have opposite designs; separating them IS the design.',
      capacityMoments: [
        '10M watchers × ~2 symbols × 1 update/s ≈ 20M pushes/s worst case → per-symbol pub/sub trees and update coalescing (conflate to ~1/s per symbol) — the coalescing decision needs this math',
        'Orders: even 100K orders/min is tiny vs price traffic — correctness, not throughput, is the constraint; saying this out loud is senior signal',
      ],
      deepDives: [
        {
          topic: 'Order lifecycle correctness',
          expected:
            'Idempotency keys on placement, atomic buying-power reservation (conditional update), reconciliation of exchange acks/fills (at-least-once callbacks, dedup by exchange order id), append-only audit log of transitions.',
        },
        {
          topic: 'Price fan-out',
          expected: 'Subscription registry, per-symbol channels, hot symbols (market open, meme stocks) → replicated fan-out nodes; conflation policy stated as product decision.',
        },
        {
          topic: 'Exchange gateway failure',
          expected: 'Order in-flight when gateway dies: state machine with unknown state + reconciliation via exchange drop-copy/status query; never silently retry a market order.',
        },
      ],
      commonMistakes: [
        'One WebSocket per user per symbol to the exchange',
        'Funds check-then-place race (overspend)',
        'Retrying order placement without idempotency (duplicate trades)',
      ],
      levels: {
        mid: 'Both planes present and separated; idempotent orders possibly with prompting; sane portfolio model.',
        senior: 'Owns fan-out math with conflation, buying-power reservation contention, and ack-reconciliation unprompted — depth in the order plane expected for a finance-flavoured candidate.',
        staffPlus: 'Leads the unknown-state problem (gateway death mid-order), regulatory audit design, and market-open surge engineering as a peer.',
      },
    },
  },
  {
    id: 'youtube-top-k',
    title: 'Top-K Viewed Videos (YouTube Trending)',
    difficulty: 'hard',
    asks: ['Google', 'Meta', 'Amazon'],
    patterns: ['Scaling Writes', 'Scaling Reads'],
    prompt:
      "Let's design the system behind a 'trending videos' feature: given the firehose of video views, answer 'what are the top K most-viewed videos' for time windows like the last hour or day.",
    brief: {
      functional: [
        'Ingest view events at firehose rate',
        'Query top-K (K≤1000) most-viewed videos for sliding windows (hour/day) — optionally filtered (e.g. by region)',
        'Reasonably fresh results (within ~1 minute)',
      ],
      nonFunctional: [
        'Scale: ~1M view events/sec (100B/day), hundreds of millions of distinct videos',
        'Query latency <100ms (it powers a product surface)',
        'Approximation acceptable IF bounded and stated (exactness for top of the list, tolerance in the tail)',
        'This is the canonical "do the capacity math" question — HelloInterview flags TopK as where math genuinely drives design',
      ],
      entities: ['ViewEvent', 'VideoCount (windowed)', 'TopKResult (materialized per window)'],
      apiSketch: ['GET /trending?window=1h&k=100&region=?'],
      highLevel:
        'View events → Kafka → stream aggregation sharded by videoId computing windowed counts → per-shard local top-K → merge layer materializes global top-K per window → serving store (cached). Exact global counting of 1M/s is the naive-impossible baseline you reason away from, out loud.',
      capacityMoments: [
        '1M events/s: exact per-video counters = feasible sharded (hash by videoId), but sliding windows × hundreds of millions of videos blow memory — bucketed windows (1-min buckets summed into 60 for the hour) is the fix; do the bucket math',
        'Count-min sketch as the approximate alternative: ~MBs of memory for bounded overcount + heap of candidates — quantify the error bound and where it is acceptable',
      ],
      deepDives: [
        {
          topic: 'Exact vs approximate',
          expected: 'Sharded exact counts + bucketed windows vs count-min sketch + candidate heap; hybrid (exact for head via heavy-hitters, sketch for tail) with stated error semantics.',
        },
        {
          topic: 'Sliding windows',
          expected: 'Minute buckets with rolling sum; window merge at query vs pre-materialized; late events tolerated within a bucket boundary.',
        },
        {
          topic: 'Merging shard-local top-Ks',
          expected: 'Why per-shard top-K can miss a globally-hot-but-shard-cold item is NOT a problem when sharded by videoId (each video lives on one shard) — candidates who spot this get credit; merge is a K-way heap.',
        },
      ],
      commonMistakes: [
        'A global sorted set updated 1M times/sec',
        'Whole-window recomputation per query',
        'Approximation invoked without stating its error and where it is safe',
      ],
      levels: {
        mid: 'Sharded counting + merge with bucketed windows; sketch mentioned when prompted.',
        senior: 'Drives the exact-vs-approximate trade-off with real memory math, bucket design, and error bounds unprompted.',
        staffPlus: 'Leads the hybrid design, skew handling, backfill/replay, and generalizes it (top-K as reusable heavy-hitters infrastructure).',
      },
    },
  },
];

export function getDesignQuestion(id: string): DesignQuestion | undefined {
  return DESIGN_BANK.find((q) => q.id === id);
}

export function randomDesignQuestion(): DesignQuestion {
  return DESIGN_BANK[Math.floor(Math.random() * DESIGN_BANK.length)];
}

/** Client-safe metadata: never leaks the brief. */
export function listDesignQuestions(): { id: string; title: string; difficulty: Difficulty; asks: string[]; patterns: string[] }[] {
  return DESIGN_BANK.map(({ id, title, difficulty, asks, patterns }) => ({ id, title, difficulty, asks, patterns }));
}

/** The interviewer's private ground truth for a picked question. */
export function designBriefBlock(q: DesignQuestion): string {
  const b = q.brief;
  return [
    `SELECTED DESIGN QUESTION: ${q.title} (${q.difficulty}; asked at ${q.asks.join(', ')}; patterns: ${q.patterns.join(', ')})`,
    `You have already stated the prompt: "${q.prompt}"`,
    '',
    'PRIVATE GROUND TRUTH — release one fact at a time on request, never volunteer, never enumerate:',
    `Core functional requirements (the top ${b.functional.length} — long candidate lists are a negative signal):\n${b.functional.map((f) => `- ${f}`).join('\n')}`,
    `Non-functional requirements (quantified — release numbers only when asked, prefer "what would you assume?" first):\n${b.nonFunctional.map((f) => `- ${f}`).join('\n')}`,
    `Core entities: ${b.entities.join('; ')}`,
    `Expected API shape (grade leniently; time overrun is the failure mode, not imperfect design):\n${b.apiSketch.map((a) => `- ${a}`).join('\n')}`,
    `The simple end-to-end design that must exist before complexity:\n${b.highLevel}`,
    `Where capacity math actually matters (only these moments warrant estimation — punish ritual math elsewhere, reward it here):\n${b.capacityMoments.map((c) => `- ${c}`).join('\n')}`,
    `Canonical deep dives (senior candidates should proactively raise ~2 of these; mid-level may need you to point at one):\n${b.deepDives.map((d) => `- ${d.topic}: ${d.expected}`).join('\n')}`,
    `Common mistakes to watch for (log silently, surface in debrief):\n${b.commonMistakes.map((m) => `- ${m}`).join('\n')}`,
    `Level calibration for the debrief:\n- Mid-level bar: ${b.levels.mid}\n- Senior bar: ${b.levels.senior}\n- Staff+ bar: ${b.levels.staffPlus}`,
  ].join('\n\n');
}
