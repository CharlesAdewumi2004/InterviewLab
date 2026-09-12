import type { Language, TechTopic } from '../../../shared/protocol';
import { LANGUAGE_BANK } from './bank-languages.js';
import { PLATFORM_BANK } from './bank-platform.js';

// Tech-knowledge question bank. Authored by a verified research+authoring
// pass (2026-09): topics chosen from what early-career interviews at systems/C++
// shops actually test; every question carries the interviewer's private
// answer key and a follow-up ladder — the drill-down chain is the interview.

export interface TechQuestion {
  id: string;
  topic: TechTopic;
  // Only for the 'langint' topic: the language this question belongs to, so a
  // Python session is never asked about the prototype chain.
  language?: Language;
  // The opening question, exactly as an interviewer says it out loud.
  question: string;
  // Depth follow-ups in escalation order, each contingent on a typical answer.
  followUps: string[];
  // The facts a strong answer contains — the grader checks recall against
  // these; never shown to the candidate.
  answerKey: string[];
  // 1 = warmup every grad must nail · 2 = solid-grad · 3 = distinguishing depth.
  depth: 1 | 2 | 3;
  // Optional natural coding escalation ("implement a basic shared_ptr"), or null.
  escalation: string | null;
}

export const TECH_TOPIC_LABELS: Record<TechTopic, string> = {
  os: 'Operating systems',
  networking: 'Networking',
  cpp: 'C++ internals',
  memory: 'Memory management',
  lowlevel: 'Low-level & architecture',
  concurrency: 'Concurrency',
  dsinternals: 'DS/STL internals',
  data: 'Databases & caching',
  web: 'Web, HTTP & APIs',
  security: 'Security',
  testing: 'Testing & quality',
  devops: 'Build, CI & deploys',
  langint: 'Language internals',
};

// Spliced in from the authoring workflow — see scripts note in repo history.
const CORE_BANK: TechQuestion[] = [
  {
    "id": "networking-tcp-vs-udp",
    "topic": "networking",
    "question": "What's the difference between TCP and UDP, and when would you actually pick UDP?",
    "followUps": [
      "You said TCP is reliable — what does it actually do under the hood to guarantee that?",
      "Market data feeds often go out over UDP multicast. Why would a financial firm accept dropped packets?",
      "Could you build reliability on top of UDP yourself? What would you need to add?",
      "Is UDP always lower latency? When would it not help you?"
    ],
    "answerKey": [
      "TCP: connection-oriented, reliable, ordered byte stream; UDP: connectionless, best-effort, datagram-oriented",
      "TCP reliability machinery: sequence numbers, acknowledgements, retransmission, flow control, congestion control",
      "UDP advantages: lower per-packet overhead, no connection setup, no head-of-line blocking, supports multicast/broadcast",
      "UDP fits latency-sensitive, loss-tolerant traffic: voice/video, gaming, DNS queries, market-data multicast where a stale tick is worthless anyway",
      "Reliability over UDP means re-adding sequence numbers, ACKs/NACKs, and retransmission — which is essentially what QUIC does"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "networking-get-vs-post",
    "topic": "networking",
    "question": "GET versus POST — what's the actual difference?",
    "followUps": [
      "You said GET is idempotent — what does that mean precisely, and is POST?",
      "Why shouldn't you put a password in a GET query string, even over HTTPS?",
      "Give me the status code classes — what do 4xx and 5xx each tell the client, and name a couple from each",
      "HTTP is stateless — so how does staying logged in work?"
    ],
    "answerKey": [
      "GET retrieves a resource, parameters in the URL, no body by convention; POST submits data in the request body and can change server state",
      "GET is safe and idempotent and therefore cacheable; POST is neither idempotent nor cached by default — repeating it can create duplicates",
      "Idempotent = repeating the request leaves the server in the same state; safe = the request shouldn't change state at all",
      "Query strings leak into browser history, server access logs, and Referer headers even though TLS encrypts them in transit",
      "Status classes: 2xx success, 3xx redirection, 4xx client error (400, 401, 403, 404), 5xx server error (500, 502, 503)",
      "Statelessness: every request is independent; state is layered on with cookies carrying a session ID or a token like a JWT sent per request"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "networking-three-way-handshake",
    "topic": "networking",
    "question": "Walk me through what happens on the wire when a TCP connection gets established.",
    "followUps": [
      "Why three messages? Why isn't two enough?",
      "What are the sequence numbers for, and why is the initial one randomised?",
      "What's a SYN flood, and how does a server defend against it?",
      "Now teardown — why does the side that closes first sit in TIME_WAIT, and for how long?"
    ],
    "answerKey": [
      "SYN, then SYN-ACK, then ACK — each side picks an initial sequence number (ISN) and acknowledges the other's ISN+1",
      "Three messages are needed so both sides confirm both directions work and both sequence numbers are synchronised; two-way leaves the client's receive path unconfirmed",
      "Sequence numbers order the byte stream and drive acknowledgement/retransmission; random ISNs defend against sequence prediction/spoofing and against confusion with stale segments from old connections",
      "SYN flood fills the half-open connection backlog with spoofed SYNs; mitigations include SYN cookies (encode state in the ISN instead of storing it) and backlog tuning",
      "Teardown is FIN/ACK in each direction; the active closer waits in TIME_WAIT for 2*MSL so the final ACK can be retransmitted and old duplicates die before the 4-tuple is reused"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "networking-type-a-url",
    "topic": "networking",
    "question": "You type example.com into your browser and hit enter. What happens?",
    "followUps": [
      "Go deeper on DNS — where can the answer come from before anything hits an authoritative server?",
      "What actually happens during the TLS handshake, and what does it cost in round trips?",
      "Which port does the browser connect to, and how did it know?",
      "The HTML arrives — what does the browser do to turn that into pixels?",
      "You visit again an hour later — what's different the second time?"
    ],
    "answerKey": [
      "Pipeline: parse URL, DNS resolution, TCP three-way handshake, TLS handshake, HTTP request, response, render",
      "DNS: browser cache, then OS cache/hosts file, then recursive resolver, then root -> TLD -> authoritative; answers cached according to TTL",
      "TLS: negotiate version and cipher suite, server presents a certificate validated against a CA chain, ephemeral key exchange (ECDHE) derives session keys; TLS 1.3 completes in one round trip",
      "Port implied by scheme: 443 for https, 80 for http; the browser also follows redirects (e.g. 301 to https/www)",
      "Rendering: HTML parsed to DOM, CSS to CSSOM, JS executed, layout then paint; sub-resources fetched, multiplexed over one connection with HTTP/2",
      "Repeat visit is faster via DNS caching, TLS session resumption or kept-alive connections, and HTTP caching (Cache-Control, ETag/If-None-Match giving 304)"
    ],
    "depth": 2,
    "escalation": "Write a function that parses a URL string into scheme, host, port, and path — apply the default port when none is given, and handle a missing path."
  },
  {
    "id": "networking-sockets-ports",
    "topic": "networking",
    "question": "What is a socket, actually — what does the OS hand you when you call socket()?",
    "followUps": [
      "A server listens on one port. How does it serve thousands of clients through that same port?",
      "So what uniquely identifies a single TCP connection?",
      "What's an ephemeral port, and what happens when a busy client machine runs out?",
      "Your server starts throwing 'too many open files' — what happened and what do you check?"
    ],
    "answerKey": [
      "A socket is the kernel's endpoint abstraction for a connection: a file descriptor wrapping protocol state plus send/receive buffers",
      "A connection is identified by the 4-tuple (source IP, source port, destination IP, destination port), so thousands of connections can share one listening port",
      "listen() queues incoming connections; each accept() returns a new connected socket while the listening socket keeps listening",
      "Ephemeral ports are the client-side ports the OS assigns from a bounded range; exhaustion comes from high outbound connection churn, often piles of TIME_WAIT sockets",
      "File descriptors are a finite per-process resource (ulimit -n); leaked or never-closed sockets exhaust them — check lsof/fd counts and connection lifecycle"
    ],
    "depth": 2,
    "escalation": "Write a minimal TCP echo server in C or C++ using the Berkeley sockets API — socket, bind, listen, accept, then a read/write loop for one client."
  },
  {
    "id": "networking-realtime-push",
    "topic": "networking",
    "question": "You're building a page showing live prices. What are your options for getting updates from server to browser, and how do you choose?",
    "followUps": [
      "How does long polling actually work on the wire, and what is it costing you per update?",
      "How does a WebSocket connection get established over the same port 443 the site already uses?",
      "Ten thousand clients on WebSockets — what's the server-side resource cost compared to polling?",
      "There's a proxy or load balancer in the middle — what breaks with persistent connections, and how do you deal with it?",
      "When would you still pick server-sent events or plain polling over WebSockets?"
    ],
    "answerKey": [
      "Options: short polling (repeated requests), long polling (server holds the request until data or timeout), SSE (one-way server stream), WebSockets (full-duplex persistent connection)",
      "Long polling costs a full request/response with headers per message plus a reconnect gap where updates can queue; connection churn under load",
      "WebSocket handshake is an HTTP GET with Upgrade: websocket, server replies 101 Switching Protocols, then both sides speak framed full-duplex over the same TCP connection — which is why it traverses port 443/TLS",
      "Each persistent connection holds a socket/fd plus kernel and application buffers; needs ping/pong heartbeats to detect dead peers; memory and fd limits become the scaling constraint",
      "Intermediaries kill idle connections and some don't speak Upgrade; mitigations: heartbeats, sensible timeouts, sticky sessions or a connection-aware load balancer, fallback transports",
      "SSE wins when traffic is strictly server-to-client: simpler, plain HTTP, auto-reconnect built in; short polling is fine when updates are infrequent and staleness is acceptable"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "networking-tcp-reliability",
    "topic": "networking",
    "question": "Everyone says TCP is reliable. Unpack that for me — what's the machinery underneath?",
    "followUps": [
      "Flow control versus congestion control — who is each one protecting?",
      "How does the sender decide a segment was lost?",
      "What's slow start, and why doesn't a fresh connection just send at line rate?",
      "What's head-of-line blocking in TCP, and what did QUIC do about it?"
    ],
    "answerKey": [
      "Sequence numbers over the byte stream plus cumulative ACKs; receiver buffers out-of-order segments; checksums detect corruption",
      "Loss detection: retransmission timeout (RTO), or fast retransmit on three duplicate ACKs before the timer fires",
      "Flow control protects the receiver via the advertised receive window; congestion control protects the network via the congestion window — effective send rate is bounded by the smaller",
      "Slow start grows cwnd exponentially each RTT from a small initial window until loss or ssthresh, then additive increase (congestion avoidance); blasting immediately would overrun unknown path capacity",
      "TCP head-of-line blocking: one lost segment stalls delivery of everything after it in the stream; QUIC runs independent streams over UDP so loss on one stream doesn't stall the others"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "networking-kafka-semantics",
    "topic": "networking",
    "question": "Producer publishes a message to Kafka. Walk me through what guarantees you actually get about whether it arrives, and how many times.",
    "followUps": [
      "acks=0, acks=1, acks=all — what does each actually wait for, and what can you lose with each?",
      "What do partitions buy you, and what do they cost you in ordering?",
      "At-most-once, at-least-once, exactly-once — how do you get each one, and which should consumers usually design for?",
      "Consumer processes a message, then crashes before committing its offset. What happens?",
      "When would you send synchronously versus fire-and-forget async on the producer side?"
    ],
    "answerKey": [
      "A topic is split into partitions; ordering is guaranteed only within a partition, and a message key maps consistently to one partition to preserve per-key order",
      "acks=0 waits for nothing (silent loss possible); acks=1 waits for the leader only (lost if the leader dies before replication); acks=all waits for the in-sync replicas (durable but slower)",
      "Producer retries without idempotence can duplicate messages; the idempotent producer (and transactions) gives exactly-once within Kafka itself",
      "Consumer offset timing sets the semantics: commit before processing = at-most-once (crash loses the message); process before commit = at-least-once (crash redelivers) — so consumers should be idempotent",
      "Crash after processing, before commit: the message is redelivered on rebalance — the standard at-least-once duplicate case",
      "Sync send (block on the future) when durability of each message matters more than throughput; async with a callback plus batching/linger.ms for throughput at the cost of latency and in-flight risk"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "data-inner-vs-left-join",
    "topic": "data",
    "question": "Two tables — customers and orders. What's the difference between joining them with an INNER JOIN versus a LEFT JOIN?",
    "followUps": [
      "A customer has no orders. What do the order columns look like for that customer in the LEFT JOIN result?",
      "You add WHERE orders.status = 'shipped' to that LEFT JOIN. What happens to the customers with no orders?",
      "Same filter, but you move it into the ON clause instead. Different result?",
      "How would you count orders per customer so a customer with zero orders shows 0 — not 1?"
    ],
    "answerKey": [
      "INNER JOIN returns only rows with a match in both tables",
      "LEFT JOIN returns every row from the left table; where there's no match, the right table's columns are NULL",
      "A WHERE filter on a right-table column silently turns a LEFT JOIN into an INNER JOIN — NULL never satisfies the comparison, so unmatched left rows are dropped",
      "Putting the same predicate in the ON clause keeps all left rows and only restricts which right rows are allowed to match",
      "COUNT(orders.order_id) ignores NULLs so orderless customers get 0; COUNT(*) counts the row itself and gives 1"
    ],
    "depth": 1,
    "escalation": "Write the SQL: return every customer who has never placed an order, using a LEFT JOIN."
  },
  {
    "id": "data-acid-guarantees",
    "topic": "data",
    "question": "Walk me through ACID — what does each property actually guarantee?",
    "followUps": [
      "The machine dies right after a transaction commits. Which property covers you, and how does the database actually pull that off on disk?",
      "Two transactions run concurrently and one reads the other's uncommitted write. What's that called, and which isolation level permits it?",
      "What's the difference between a dirty read and a non-repeatable read?",
      "Why not just run everything at SERIALIZABLE and never think about this again?"
    ],
    "answerKey": [
      "Atomicity: all of a transaction's writes apply or none do — no partial transactions after a failure",
      "Consistency: a transaction takes the database from one valid state to another — constraints and invariants hold",
      "Isolation: concurrent transactions don't observe each other's intermediate state; degree is tunable via isolation levels",
      "Durability: once committed, data survives a crash — implemented with a write-ahead/redo log flushed to disk before commit is acknowledged",
      "Dirty read = reading uncommitted data (allowed at READ UNCOMMITTED); non-repeatable read = re-reading the same row within one transaction and getting a different value",
      "SERIALIZABLE costs throughput: more locking or version-check aborts, so most systems default to READ COMMITTED or similar"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "data-index-under-the-hood",
    "topic": "data",
    "question": "A query is slow, you add an index, and it's fast. What did the database actually build, and why does it help?",
    "followUps": [
      "Why a B-tree rather than a hash table?",
      "Indexes sound free then — why not index every column?",
      "You have an index on (last_name, first_name). Does it help a query that filters only on first_name?",
      "There's an index on a status column with three distinct values and the optimizer ignores it. Why might that be the right call?"
    ],
    "answerKey": [
      "An index is a separate structure — typically a B-tree/B+tree — keeping the indexed values sorted with pointers to the rows",
      "Lookup drops from a full scan O(n) to O(log n) tree descent; B+tree leaf pages are linked, so range scans and ORDER BY are cheap",
      "A hash index only answers equality; a B-tree also serves range predicates and sorted traversal, which is why it's the default",
      "Every index has a write cost: each INSERT/UPDATE/DELETE must maintain every index on the table, plus extra storage",
      "Composite indexes work on a leftmost-prefix basis — (last_name, first_name) can't serve a filter on first_name alone",
      "Low-selectivity columns: matching a third of the table via index means huge numbers of random row fetches, often slower than one sequential scan"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "data-normalize-denormalize",
    "topic": "data",
    "question": "What does normalizing a schema actually buy you — and when would you deliberately break it?",
    "followUps": [
      "Give me a concrete anomaly that normalization prevents.",
      "Third normal form in plain English?",
      "You denormalize for read speed. What's the new cost you've taken on?",
      "Where do you see denormalization done on purpose in real systems?"
    ],
    "answerKey": [
      "Normalization eliminates redundancy: each fact is stored exactly once, with tables split along functional dependencies",
      "Prevents update anomalies — e.g. a customer's address stored on every order row can be updated in one place and missed in another, leaving contradictory data",
      "3NF in plain terms: every non-key column depends on the key, the whole key, and nothing but the key",
      "Denormalize when join cost dominates a read-heavy path — precomputed/duplicated columns avoid joins at query time",
      "The cost: duplicated data must be kept in sync, so writes get more complex and inconsistency becomes possible",
      "Deliberate examples: reporting tables, data warehouses/star schemas, materialized views, cached aggregate columns"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "data-lru-cache-design",
    "topic": "data",
    "question": "Design a fixed-capacity cache that evicts the least recently used entry. What data structures give you O(1) get and put?",
    "followUps": [
      "Why isn't a hash map alone enough?",
      "Walk me through exactly what happens on a get that hits.",
      "And a put when the cache is already full?",
      "Why does the list have to be doubly linked?",
      "When is LRU the wrong eviction policy?"
    ],
    "answerKey": [
      "Hash map from key to list node, plus a doubly-linked list ordered by recency of use",
      "The map gives O(1) lookup; the list gives O(1) move-to-front on access and O(1) eviction from the tail",
      "get hit: find the node via the map, splice it to the head (most recently used), return the value",
      "put at capacity: unlink the tail node, erase its key from the map, insert the new entry at the head and into the map",
      "Doubly linked because unlinking a node in O(1) requires a prev pointer; singly linked would need a traversal",
      "LRU fails under scans: a one-pass sequential read evicts the hot working set; alternatives include LFU, LRU-K, segmented/2Q, or random eviction"
    ],
    "depth": 2,
    "escalation": "Implement it: an LRU cache class in C++ with O(1) get and put — std::unordered_map plus std::list is fine."
  },
  {
    "id": "data-tickdata-sql-vs-nosql",
    "topic": "data",
    "question": "You're storing tick data — every price update for thousands of instruments, millions of writes a second. Is a standard relational database the right tool?",
    "followUps": [
      "What specifically about this workload fights the relational model?",
      "What would you reach for instead, and what does it do differently on disk?",
      "What do you give up by moving off a relational database?",
      "Typical query is 'all ticks for Vodafone between 9:00 and 9:05.' How should the storage layout serve that?"
    ],
    "answerKey": [
      "Workload shape: append-only, time-ordered, extremely write-heavy, and queried almost exclusively by instrument plus time range",
      "Row-oriented storage with per-insert B-tree index maintenance and full ACID overhead caps write throughput far below the required rate",
      "Time-series/columnar stores append to time-partitioned segments: sequential I/O on write, column-wise compression since adjacent values are similar",
      "Partitioning by instrument and time makes the canonical query a contiguous sequential scan of one partition slice",
      "What you give up: ad-hoc joins, cross-entity transactions, and general-purpose secondary indexes — acceptable because the query pattern is narrow and known",
      "Finance uses purpose-built stores for exactly this — kdb+ and in-house columnar tick stores are the classic examples"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "data-shard-hot-partition",
    "topic": "data",
    "question": "Your data won't fit on one machine, so you shard it across servers by ticker symbol. Trading opens — what goes wrong?",
    "followUps": [
      "How would you detect that you have this problem?",
      "What are your options to fix it?",
      "Would hashing the ticker instead of range-partitioning solve it?",
      "You add a shard to the cluster. What happens to existing data placement, and how does consistent hashing change that?"
    ],
    "answerKey": [
      "Sharding = horizontal partitioning of data across nodes keyed by a shard key",
      "Hot partition: traffic is heavily skewed — a handful of tickers like AAPL get orders of magnitude more load, so one shard saturates while the rest sit idle",
      "Detection: per-shard metrics — QPS, latency, CPU/queue depth skew across shards",
      "Hashing balances the number of keys per shard, but a single hot key still maps to exactly one shard — it doesn't fix key-level skew",
      "Mitigations: split or isolate the hot keys onto dedicated shards, salt/sub-partition the hot key, add read replicas for the hot shard, put a cache in front",
      "Naive mod-N placement reshuffles nearly all keys when N changes; consistent hashing moves only ~1/N of keys when a node is added"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "data-stale-cache-path",
    "topic": "data",
    "question": "Your service reads prices from a database and it's too slow, so you put a cache in front. Walk me through the request path now — then tell me why users might start seeing stale prices.",
    "followUps": [
      "On a miss, who fills the cache — and what goes wrong when a thousand requests miss the same hot key at once?",
      "How do you keep it from going stale? Compare a TTL against invalidating on write.",
      "You write to the database and then invalidate the cache. What race can still leave stale data cached?",
      "Now you have ten app servers. In-process cache on each, or one shared Redis? Trade-offs."
    ],
    "answerKey": [
      "Cache-aside path: check cache first; on hit return immediately; on miss read the database, populate the cache, then return",
      "Staleness cause: the database row changed but the cached copy wasn't invalidated or hasn't expired, so the cache keeps serving the old value",
      "TTL only bounds staleness — you can be wrong for up to the TTL; shorter TTL means fresher data but a lower hit rate and more DB load",
      "Invalidate-on-write is fresher but every write path must cooperate, and it doesn't eliminate races",
      "Classic race: reader misses and reads the old DB value, writer updates the DB and invalidates, then the slow reader populates the cache with the stale value it read earlier",
      "Cache stampede: a hot key expires and concurrent misses all hit the DB at once — mitigate with per-key locking/single-flight, request coalescing, or jittered TTLs",
      "Per-node in-process caches are fastest but mutually inconsistent across servers; a shared distributed cache (Redis/memcached) gives one authoritative copy at the cost of a network hop"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "dsinternals-bigo-quickfire",
    "topic": "dsinternals",
    "question": "Quick-fire round, just give me the complexity: find in an unordered_map, find in a map, push_back on a vector, insert at the front of a vector, push_front on a deque, and std::sort.",
    "followUps": [
      "You said O(1) for unordered_map find — is that guaranteed? What's the worst case, and when does it happen?",
      "Why is deque push_front O(1) but inserting at the front of a vector O(n)? What's different about the memory layout?",
      "std::sort — which algorithm is it actually under the hood, and why not plain quicksort?",
      "std::list — what's the complexity of size() and splice(), and which of those changed in C++11?"
    ],
    "answerKey": [
      "unordered_map find: average O(1), worst case O(n) when keys collide into one bucket",
      "map find: O(log n) — balanced red-black tree",
      "vector push_back: amortized O(1); front insert O(n) because every element shifts",
      "deque push_front: amortized O(1) — chunked blocks plus an index map, nothing shifts",
      "std::sort: O(n log n) — introsort (quicksort, heapsort fallback on deep recursion, insertion sort for small ranges)",
      "C++11 made list::size() O(1); whole-list splice is O(1), but splicing a range from a different list is linear in the range length because size must stay O(1)"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "dsinternals-map-vs-unordered",
    "topic": "dsinternals",
    "question": "You need a key-to-value lookup in C++. map or unordered_map — how do you pick?",
    "followUps": [
      "What does each one require from the key type?",
      "When would map actually be faster in practice, not just on paper?",
      "You need every key in a range — say all order IDs between two timestamps. Which one, and what members do you call?",
      "Which has the bigger memory footprint per element, and where does the overhead come from?"
    ],
    "answerKey": [
      "unordered_map: average O(1) lookup via hash table; map: O(log n) via red-black tree",
      "map keeps keys sorted — ordered iteration and lower_bound/upper_bound range queries; unordered_map cannot do range queries at all",
      "map requires operator< (strict weak ordering) on the key; unordered_map requires a std::hash specialization plus operator==",
      "map can win for small n, expensive-to-hash keys (long strings), or when worst-case latency matters — no rehash spikes, no O(n) collision degradation",
      "both are node-based with per-element heap allocation; unordered_map adds a bucket array plus a next pointer (and often a cached hash) per node; map nodes carry parent/left/right pointers plus color",
      "unordered_map is vulnerable to adversarial keys / hash flooding degrading it to O(n)"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "dsinternals-unordered-map-internals",
    "topic": "dsinternals",
    "question": "Walk me through what actually happens inside an unordered_map when I insert a key.",
    "followUps": [
      "Two keys land in the same bucket — what happens? How does the standard library resolve that collision?",
      "What's the load factor, what's the default maximum, and what happens the moment an insert crosses it?",
      "That rehash — what's its cost, and what happens to my iterators and my references when it fires?",
      "You know you're about to insert a million elements. What do you call first, and what exactly does it do?"
    ],
    "answerKey": [
      "hash the key, reduce (mod or mask) into an index in the bucket array",
      "collisions handled by separate chaining — each bucket heads a linked list of nodes; find walks the chain comparing keys with operator==",
      "load factor = size / bucket_count; default max_load_factor is 1.0",
      "insert that pushes load factor past max triggers a rehash: allocate a bigger bucket array (roughly doubling; libstdc++ walks a prime table) and re-link every existing node — O(n)",
      "rehash invalidates all iterators but NOT pointers/references to elements — nodes are stable, only re-linked into new buckets",
      "reserve(n) / rehash(n) presizes the bucket array so bulk inserts never rehash mid-stream"
    ],
    "depth": 2,
    "escalation": "Implement a fixed-capacity hash map with separate chaining — insert, find, erase — without using std::unordered_map."
  },
  {
    "id": "dsinternals-pushback-amortized",
    "topic": "dsinternals",
    "question": "push_back is amortized O(1). Prove it — why does doubling the capacity make it constant on average?",
    "followUps": [
      "Why does growth have to be geometric? What breaks if the vector grows by a fixed 100 slots every time instead?",
      "During the reallocation, are my elements copied or moved? What decides which?",
      "If you know n up front, what one call eliminates the reallocations — and what's the difference between reserve and resize?",
      "MSVC grows by 1.5x instead of 2x. What's the argument for 1.5?"
    ],
    "answerKey": [
      "on full capacity: allocate double, transfer all n elements; total transfer cost to reach size n is n/2 + n/4 + ... < n, so n push_backs cost O(n) total — O(1) amortized (each element charged a constant)",
      "an individual push_back is still O(n) worst case — the one that reallocates",
      "arithmetic growth by fixed k means ~n/k reallocations each moving O(n) elements — O(n^2/k) total, amortized O(n) per push_back",
      "elements are moved only if the move constructor is noexcept, otherwise copied — std::move_if_noexcept, preserving the strong exception guarantee",
      "reserve(n) raises capacity without constructing elements; resize(n) changes size and value-constructs new elements",
      "1.5x argument: with growth factor below the golden ratio, previously freed blocks can sum to enough space for a later allocation to reuse; at 2x the new block always exceeds the sum of everything freed before it"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "dsinternals-iterator-invalidation",
    "topic": "dsinternals",
    "question": "I'm holding an iterator into a vector and I call push_back. Is it still valid? Give me the invalidation rules — vector, deque, list, map, unordered_map.",
    "followUps": [
      "For vector push_back, when exactly does invalidation happen — always, or only sometimes?",
      "deque push_back — iterators versus references behave differently. Why?",
      "unordered_map insert triggers a rehash — which survive, iterators or references?",
      "Classic bug: erasing from a vector while iterating it. Say the correct loop out loud."
    ],
    "answerKey": [
      "vector push_back invalidates everything only if size exceeds capacity (reallocation moves the buffer); otherwise only end() — so the answer is 'it depends on capacity'",
      "vector erase/insert invalidates iterators at and after the modification point",
      "deque push_back/push_front invalidates all iterators, but pointers/references to existing elements stay valid — element blocks don't move, only the block index map reallocates; insert in the middle invalidates everything",
      "list: iterators and references stable except to the erased element",
      "map/set: iterators and references stable except to the erased element — node-based tree",
      "unordered_map: rehash invalidates iterators but pointers/references survive; erase invalidates only the erased element's",
      "erase-while-iterating pattern: it = v.erase(it) on match, else ++it — erase returns the next valid iterator; or use the erase-remove idiom / std::erase_if"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "dsinternals-memory-math",
    "topic": "dsinternals",
    "question": "n is 2 billion ints and you need to dedupe them. Someone reaches for unordered_set<int>. How much RAM is that, roughly — and does it fit in 8 gigs?",
    "followUps": [
      "Break the per-element cost down for me — what's in a node besides the 4-byte int?",
      "So it doesn't fit. The values are 32-bit ints — what structure dedupes them in well under a gig?",
      "Now they're 64-bit IDs — the bitmap's off the table. What's your move?",
      "The data lives on disk and you genuinely only have 8 GB. How do you dedupe without loading it all?"
    ],
    "answerKey": [
      "raw payload alone is 2e9 x 4 bytes = 8 GB — the budget is gone before any overhead",
      "per node: 4-byte int + next pointer (8B) + typically a cached hash (8B) + padding + malloc header — realistically 30-50+ bytes each, plus the bucket array (~2e9 x 8B = 16 GB at load factor 1); total lands around 60-100+ GB — not remotely close",
      "32-bit domain: a bitmap over all 2^32 values is 2^32 bits = 512 MB, independent of n — set the bit per value seen",
      "64-bit keys: external/in-place sort then adjacent-unique, hash-partition into shards that each fit in RAM, or a Bloom filter if approximate is acceptable",
      "disk-resident: external merge sort in memory-sized chunks, or partition to disk files by hash(key) then dedupe each file independently in memory",
      "the habit being tested: multiply n by real per-element bytes including overhead — big-O says nothing about the constant"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "dsinternals-lru-cache",
    "topic": "dsinternals",
    "question": "Design an LRU cache — get and put both O(1). Which two structures, and why does it take both?",
    "followUps": [
      "Why a doubly linked list — what exactly breaks with a singly linked one?",
      "What does the hash map store as its mapped value?",
      "Walk me through get on a key that exists — every operation, in order.",
      "put when the cache is full — what happens, step by step, and why does the list node have to store the key?",
      "You're holding list iterators inside the map. Why is that safe — what property of std::list makes it work?"
    ],
    "answerKey": [
      "unordered_map from key to list iterator, plus a doubly linked list of entries ordered by recency (front = most recent)",
      "map alone can't track recency order in O(1); list alone can't find a key in O(1) — each covers the other's gap",
      "doubly linked is required for O(1) unlinking of an arbitrary node (you need prev); singly linked forces an O(n) predecessor scan",
      "map's value is an iterator/pointer into the list; the list node holds both key and value — the key is needed at eviction to erase the map entry",
      "get: hash lookup -> splice the node to the front (list::splice, O(1), no allocation) -> return the value",
      "put on full: take the tail node, erase its key from the map, remove it from the list, insert the new node at the front and the new map entry",
      "list iterators stay valid across splice and other elements' erases — node-based container, nodes never move in memory"
    ],
    "depth": 2,
    "escalation": "Implement the LRU cache with std::list and std::unordered_map — get and put in O(1) — then show where the complexity breaks if the list were singly linked."
  },
  {
    "id": "dsinternals-chaining-vs-open-addressing",
    "topic": "dsinternals",
    "question": "std::unordered_map is famously slower than Google's or Meta's hash maps. What does the standard force on implementers, and what do the fast ones do differently?",
    "followUps": [
      "Count the cache misses in one successful find on a chained table.",
      "Open addressing — how does a lookup actually proceed, and what goes wrong as load factor climbs?",
      "How do you erase from an open-addressed table without breaking other keys' probe chains?",
      "Swiss tables — what are the metadata bytes and the SIMD trick buying you?",
      "So why doesn't the committee just fix unordered_map?"
    ],
    "answerKey": [
      "the standard effectively mandates separate chaining: pointers/references must survive rehash, erase can't disturb other elements, and the bucket API (bucket_count, local iterators) assumes real buckets",
      "chained find: read the bucket array, then chase at least one pointer to a heap-allocated node — two-plus dependent cache misses, scattered nodes, one allocation per element",
      "open addressing keeps elements in the array itself and probes on collision (linear/quadratic/robin hood) — probing is sequential and cache-friendly, zero per-element allocation",
      "open addressing degrades sharply at high load factor from clustering — practical max ~0.7-0.9 versus chaining's 1.0+",
      "deletion needs tombstone markers, or backward-shift/robin-hood deletion, so probe sequences to later keys aren't severed",
      "Swiss tables (absl::flat_hash_map): one metadata byte per slot holding 7 hash bits plus empty/deleted/full state; SIMD compares 16 metadata bytes at once, so most probes resolve without touching the element array",
      "flat maps sacrifice pointer/reference stability — elements move on rehash — so retrofitting std::unordered_map would break its documented guarantees; the fix is a different container, not a patch"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "lowlevel-vector-vs-list",
    "topic": "lowlevel",
    "question": "You've got a million ints in a std::vector and the same million in a std::list, and you sum each one. Which loop is faster, and roughly by how much?",
    "followUps": [
      "What actually happens in hardware when you dereference the next list node?",
      "How many ints come in on one cache line, and what does that buy the vector loop?",
      "What's the hardware prefetcher doing during the vector loop, and why can't it do the same for the list?",
      "So when would you still reach for a std::list?"
    ],
    "answerKey": [
      "vector is much faster — typically 5-50x for a linear sum of ints",
      "vector storage is contiguous: a 64-byte cache line holds 16 ints, so roughly one cache miss per 16 elements",
      "list nodes are separately heap-allocated and scattered, so following each next pointer is a potential cache miss (pointer chasing); the address of the next node isn't known until the current one loads, serialising the misses",
      "the hardware prefetcher recognises sequential/strided access and fetches lines ahead for the vector; it cannot predict arbitrary node addresses",
      "each list node also carries two pointers of per-element overhead, wasting bandwidth and cache capacity",
      "list only wins for splicing or when you need iterator/reference stability under middle insert/erase — and even then vector often measures faster in practice"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "lowlevel-bit-idioms",
    "topic": "lowlevel",
    "question": "Quick-fire round: given an int x, how do you check whether bit n is set? Set it? Clear it? Toggle it?",
    "followUps": [
      "What does x & (x - 1) do, and why does it work?",
      "So give me a one-liner to test whether x is a power of two.",
      "How would you count the set bits, and what's the complexity if you use that trick?",
      "How do you isolate just the lowest set bit, and why does that expression work?",
      "Any pitfalls with 1 << n on a signed int?"
    ],
    "answerKey": [
      "check: x & (1 << n); set: x |= (1 << n); clear: x &= ~(1 << n); toggle: x ^= (1 << n)",
      "x & (x - 1) clears the lowest set bit: subtracting 1 turns the lowest set bit to 0 and all bits below it to 1, so the AND zeroes exactly that bit",
      "power of two test: x != 0 && (x & (x - 1)) == 0 — must exclude zero",
      "popcount by looping x &= x - 1 runs in O(number of set bits); std::popcount / __builtin_popcount maps to a single instruction",
      "x & -x isolates the lowest set bit, because -x = ~x + 1 in two's complement",
      "1 << 31 on a 32-bit signed int is undefined behaviour — shift on unsigned (1u << n) and keep n < width"
    ],
    "depth": 1,
    "escalation": "Implement popcount for a uint64_t without compiler builtins, then make it O(number of set bits) using the x & (x - 1) trick."
  },
  {
    "id": "lowlevel-twos-complement",
    "topic": "lowlevel",
    "question": "How does the machine actually represent -5 in a 32-bit int, and why that scheme instead of just flipping a sign bit?",
    "followUps": [
      "How do you negate a number in two's complement?",
      "What's the range of a 32-bit signed int, and why is it asymmetric?",
      "So what happens if you negate INT_MIN?",
      "In C++, what's the difference between signed and unsigned overflow?"
    ],
    "answerKey": [
      "-5 is the bit pattern of ~5 + 1, i.e. 0xFFFFFFFB",
      "two's complement gives a single representation of zero and lets the same adder circuit handle signed and unsigned add/subtract — no special-case hardware",
      "sign-magnitude and ones' complement both have +0 and -0 and need different arithmetic logic",
      "negate: invert all bits and add one (x -> ~x + 1)",
      "range is -2^31 to 2^31 - 1; asymmetric because zero uses up one of the non-negative bit patterns (equivalently, the MSB carries weight -2^31)",
      "-INT_MIN is unrepresentable, so negating it is signed overflow — undefined behaviour in C++",
      "signed overflow is UB; unsigned arithmetic is defined to wrap modulo 2^N"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "lowlevel-cache-miss-walkthrough",
    "topic": "lowlevel",
    "question": "Your code reads a variable that isn't in any cache. Walk me through what happens, with rough numbers.",
    "followUps": [
      "What granularity does the cache actually fetch at, and what does that imply for how you lay out your data?",
      "Rough latencies — L1, L2, L3, main memory?",
      "Spatial versus temporal locality — give me a code example of each.",
      "Why does traversing a 2D array row-by-row versus column-by-column matter so much?"
    ],
    "answerKey": [
      "the load checks L1, then L2, then L3, then goes to DRAM; the whole containing cache line is brought in, not just the variable",
      "cache line is 64 bytes on mainstream x86/ARM — the unit of transfer and coherence",
      "rough latencies: L1 ~4 cycles (~1ns), L2 ~12-14 cycles, L3 ~30-40 cycles, DRAM ~100-300 cycles (~60-100ns)",
      "rough sizes: L1 32-64KB per core, L2 256KB-1MB per core, L3 tens of MB shared",
      "spatial locality: nearby addresses accessed soon (array iteration); temporal locality: same address reused soon (accumulator, hot lookup table)",
      "row-major traversal touches consecutive addresses, ~1 miss per 64-byte line; column-major strides by the row length, so every access can miss",
      "layout implication: pack hot data together so each fetched line carries useful bytes"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "lowlevel-branch-prediction-sorted",
    "topic": "lowlevel",
    "question": "You loop over a big array of random bytes summing only the elements greater than 128. Someone sorts the array first — nothing else changes — and the loop gets several times faster. Why?",
    "followUps": [
      "Why does a wrong guess cost anything at all? What's the CPU doing under the hood?",
      "Roughly how many cycles does a misprediction cost, and where does that number come from?",
      "How would you make the loop fast without sorting?",
      "Do [[likely]] and [[unlikely]] talk to the branch predictor?"
    ],
    "answerKey": [
      "the CPU pipeline overlaps fetch/decode/execute of many instructions, so it must predict each branch and speculatively execute past it to keep the pipeline full",
      "random data makes the >128 branch unpredictable (~50% wrong); sorted data gives an all-false-then-all-true pattern the predictor nails",
      "a misprediction throws away the speculative work and refills the pipeline — roughly 10-20 cycles, tied to pipeline depth",
      "predictors track per-branch history in pattern/branch history tables, so they learn loops and regular patterns but not randomness",
      "branchless fix: replace the branch with arithmetic or a conditional move, e.g. sum += (a[i] > 128) * a[i] — data dependency instead of control dependency, no flush possible",
      "[[likely]]/[[unlikely]] guide the compiler's code layout and block ordering, not the hardware predictor directly"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "lowlevel-endianness-network",
    "topic": "lowlevel",
    "question": "Your x86 server receives a 4-byte integer off the network. Can you just memcpy it into a uint32_t and use it? Why or why not?",
    "followUps": [
      "Define little- versus big-endian precisely — which byte sits at the lowest address?",
      "How do you detect endianness at runtime in C++?",
      "Does endianness affect the bit order inside a byte, or the value you see in a register?",
      "Where else does this bite you besides sockets?"
    ],
    "answerKey": [
      "no — network byte order is big-endian and x86 is little-endian, so you must byte-swap (ntohl, or std::byteswap in C++23)",
      "little-endian: least-significant byte at the lowest address; big-endian: most-significant byte first",
      "runtime check: store uint32_t x = 1 and inspect the first byte through a char*/unsigned char* (1 means little-endian); compile-time: std::endian::native (C++20)",
      "endianness is purely about byte order in memory — register values, bit operations, and shifts are unaffected",
      "shifting and masking (e.g. building the value from bytes with x >> 24 etc.) is endian-independent, which is the portable way to serialise",
      "also bites in binary file formats, memcpy-based serialisation, and casting a byte buffer to a struct"
    ],
    "depth": 2,
    "escalation": "Write htonl yourself: a function converting a uint32_t to big-endian byte order that is correct on any host, no library calls — then argue why it needs no endianness check at all if written with shifts."
  },
  {
    "id": "lowlevel-false-sharing",
    "topic": "lowlevel",
    "question": "Two threads on different cores each increment their own separate counter — no locks, no shared variables anywhere. It runs slower than the single-threaded version. What's going on?",
    "followUps": [
      "What does the coherence protocol actually do when core A writes a line that core B has cached?",
      "How do you fix it in C++ — exactly?",
      "What's std::hardware_destructive_interference_size and why does it exist?",
      "How would you confirm false sharing is really the culprit on a live Linux box?"
    ],
    "answerKey": [
      "the two counters sit on the same 64-byte cache line: false sharing — logically independent data, physically shared coherence unit",
      "MESI-style coherence: to write, a core needs the line in Modified/Exclusive state, which invalidates the other core's copy; the line ping-pongs between cores on every increment",
      "each increment becomes a cross-core coherence miss (tens of ns) instead of an L1 hit — worse than one core doing all the work",
      "fix: give each counter its own line via alignas(64) (or alignas(std::hardware_destructive_interference_size)) or explicit padding in the per-thread slot",
      "alternative fix: accumulate into a local/thread-local variable and combine once at the end",
      "hardware_destructive_interference_size is the portable constant for the false-sharing granularity (usually 64)",
      "diagnose with perf c2c or HITM (hit-modified) hardware counters showing cross-core line contention"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "lowlevel-aos-vs-soa",
    "topic": "lowlevel",
    "question": "You have a std::vector of 64-byte Order structs — ten million of them — and the hot loop reads just the 4-byte price from each. Profiling says you're memory-bound. What's wrong with the layout, and what do you do about it?",
    "followUps": [
      "In the current version, what fraction of the bytes you pull from DRAM is actually useful?",
      "What does the struct-of-arrays version do for vectorization?",
      "Other loops need the whole Order — what's the middle ground?",
      "What does SoA cost you?"
    ],
    "answerKey": [
      "array-of-structs wastes bandwidth: each 64-byte cache line delivers exactly one useful 4-byte price — 1/16 of fetched bytes used",
      "fix: structure-of-arrays — a separate contiguous array of prices makes every byte of every fetched line useful (16 prices per line), roughly a 16x cut in lines touched",
      "SoA also enables SIMD: contiguous same-type values load directly into vector registers, so the compiler can auto-vectorise the loop",
      "middle ground: hot/cold splitting (keep frequently-read fields together, push cold fields to a parallel array) or AoSoA blocking",
      "trade-offs: SoA is worse for whole-record access, complicates insert/erase and keeping arrays in sync",
      "the prefetcher and TLB also do better on one dense stream than on a sparse 64-byte-stride walk"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "lowlevel-tlb-random-access",
    "topic": "lowlevel",
    "question": "You're doing random lookups into a 10GB array that's fully resident in RAM — zero disk activity — yet each access costs noticeably more than one DRAM cache miss should. What else is going on?",
    "followUps": [
      "Walk me through address translation — what exactly happens on a TLB miss?",
      "TLB miss versus page fault — who handles each, and what's the cost difference?",
      "Minor versus major page fault?",
      "How do huge pages help here?"
    ],
    "answerKey": [
      "every access needs virtual-to-physical translation; the TLB caches translations but only holds ~1500-2000 entries, so with 4KB pages it covers just a few MB — random access over 10GB misses the TLB almost every time",
      "a TLB miss triggers a hardware page-table walk: 4-level radix walk on x86-64, up to four dependent memory reads on top of the data access itself",
      "TLB miss is handled by hardware (tens to ~100 cycles); a page fault is a CPU exception into the OS kernel (microseconds or more)",
      "minor fault: page is in RAM but not mapped for this process yet (first touch, copy-on-write) — no I/O; major fault: page must come from disk — milliseconds",
      "2MB huge pages multiply TLB reach ~512x and shorten the walk by one level, drastically cutting misses for big-memory workloads",
      "page-walk results are themselves cached (paging-structure caches), which is why sequential access doesn't show this cost"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "concurrency-process-vs-thread",
    "topic": "concurrency",
    "question": "What's the difference between a process and a thread?",
    "followUps": [
      "What exactly do two threads in the same process share, and what's private to each?",
      "Why is switching between two threads cheaper than switching between two processes?",
      "One thread dereferences a null pointer. What happens to the other threads?",
      "So when would you deliberately pick multiple processes over multiple threads?"
    ],
    "answerKey": [
      "A process has its own virtual address space and OS resources; a thread is a unit of execution living inside a process",
      "Threads in a process share the address space: heap, globals, code, open file descriptors",
      "Each thread has its own stack, register state, and program counter",
      "Thread context switch is cheaper: no page-table/address-space switch, TLB and caches stay warm",
      "A segfault in one thread kills the entire process; separate processes are isolated from each other's crashes",
      "Pick processes for fault/security isolation (browser-tab model); pick threads for cheap shared-memory communication"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "concurrency-race-condition",
    "topic": "concurrency",
    "question": "What's a race condition? Give me a concrete example of one.",
    "followUps": [
      "Why isn't count++ a single operation — what does it actually compile to?",
      "You run it ten times and get the right answer every time. Does that mean the code's correct?",
      "How do you fix it, and what does the C++ standard say about a program that contains a data race?",
      "Could this still happen on a single-core machine?"
    ],
    "answerKey": [
      "Race condition: the result depends on the unsynchronized timing/interleaving of threads",
      "Data race: two threads access the same memory concurrently, at least one is a write, with no synchronization — undefined behavior in C++",
      "count++ is a read-modify-write: load, increment, store — interleaved threads overwrite each other and lose updates",
      "Passing runs prove nothing — races are nondeterministic; ThreadSanitizer (TSan) detects them",
      "Fix with a mutex or std::atomic",
      "Happens on one core too: the thread can be preempted between the load and the store"
    ],
    "depth": 1,
    "escalation": "Write a program where two threads each increment a shared counter a million times and print the (wrong) final count — then fix it twice: once with a mutex, once with std::atomic."
  },
  {
    "id": "concurrency-mutex-vs-atomic",
    "topic": "concurrency",
    "question": "Eight threads all bump one shared counter. Do you protect it with a mutex or make it std::atomic — and what's actually different about the cost?",
    "followUps": [
      "What does an atomic fetch_add compile to on x86?",
      "Walk me through what happens when a thread hits a mutex that's already locked.",
      "So atomics are always faster — why would you ever use a mutex?",
      "What memory ordering does std::atomic give you by default, and what could you relax it to for a plain counter?"
    ],
    "answerKey": [
      "atomic fetch_add compiles to a single lock-prefixed instruction (lock add / lock xadd) — no OS involvement",
      "Contended mutex: thread blocks — futex syscall on Linux, context switch out, scheduler wakeup on unlock",
      "Uncontended mutex is cheap: essentially one atomic CAS in userspace, no syscall",
      "Atomics protect a single object only; a mutex protects a multi-variable invariant or an arbitrary critical section",
      "Under heavy contention atomics degrade too: the counter's cache line ping-pongs between cores",
      "Default is memory_order_seq_cst; a pure statistics counter can use memory_order_relaxed"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "concurrency-deadlock",
    "topic": "concurrency",
    "question": "Your service is frozen: two threads, each holding a lock the other one wants. What conditions let that happen, and how do you write code so it can't?",
    "followUps": [
      "You said lock ordering. The two mutexes live inside two objects passed as arguments — transfer(from, to). How do you enforce an order there?",
      "What does std::scoped_lock on two mutexes do differently from locking them one after the other?",
      "Which of the four conditions does lock ordering actually break?",
      "Production box, threads frozen right now — how do you confirm it's a deadlock and find the cycle?"
    ],
    "answerKey": [
      "Four Coffman conditions, all required: mutual exclusion, hold-and-wait, no preemption, circular wait",
      "Primary prevention: acquire locks in a consistent global order — breaks circular wait",
      "For arbitrary paired objects, order by address (lock the lower address first) or by a stable id",
      "std::lock / std::scoped_lock(m1, m2) acquires multiple mutexes with a deadlock-avoiding try-and-back-off algorithm",
      "Also: try_lock with backoff/timeout, don't hold a lock while calling unknown/user code, lock hierarchies",
      "Diagnose live: attach gdb / take thread dumps (pstack), map who-holds-what into a wait-for graph and find the cycle"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "concurrency-condition-variables",
    "topic": "concurrency",
    "question": "A worker thread has to sit idle until another thread hands it work. How do you do that without burning CPU?",
    "followUps": [
      "Why does wait take the lock — what goes wrong if releasing the mutex and going to sleep aren't atomic?",
      "Your thread wakes up. Is there definitely work in the queue?",
      "Why a while loop around the wait instead of an if?",
      "When do you notify_one versus notify_all?",
      "Do you notify while still holding the mutex, or after releasing it?"
    ],
    "answerKey": [
      "std::condition_variable: worker does cv.wait(lock, predicate); producer pushes work then notifies",
      "wait atomically releases the mutex and blocks, re-acquiring before it returns — closes the lost-wakeup window between checking the queue and sleeping",
      "Spurious wakeups exist: wait can return with no notify, so the predicate must be re-checked in a loop (the predicate overload does this)",
      "wait needs std::unique_lock, not lock_guard, because the CV must unlock and relock the mutex",
      "notify_one when one unit of work releases one waiter; notify_all when the state change could satisfy many waiters or waiters have different predicates",
      "Notifying after unlocking avoids waking a thread that immediately blocks on the still-held mutex (hurry-up-and-wait)"
    ],
    "depth": 2,
    "escalation": "Implement a bounded blocking queue — push blocks when full, pop blocks when empty — using one mutex and two condition variables, then explain why two CVs and not one."
  },
  {
    "id": "concurrency-raii-locks",
    "topic": "concurrency",
    "question": "Why wrap a mutex in std::lock_guard instead of calling lock() and unlock() yourself? And when is lock_guard not enough?",
    "followUps": [
      "An exception gets thrown between your lock() and unlock(). What state is the program in now?",
      "What extra abilities does unique_lock buy over lock_guard, and what do they cost?",
      "Why does condition_variable::wait insist on a unique_lock?",
      "You're holding the lock for the whole function but only two lines touch shared state. What do you change?"
    ],
    "answerKey": [
      "RAII: lock in the constructor, unlock in the destructor — the unlock runs on every exit path: returns, breaks, exceptions",
      "With manual lock/unlock, an exception skips the unlock, the mutex stays held forever, and the next acquire deadlocks",
      "lock_guard: zero-overhead, locked for its whole scope, cannot unlock early, move, or transfer",
      "unique_lock: deferred/try locking, unlock and relock mid-scope, movable — at the cost of a flag tracking ownership",
      "condition_variable::wait must release and re-acquire the mutex while blocked, which lock_guard cannot do",
      "Shrink the critical section: open a tight { } block around just the shared-state access; std::scoped_lock (C++17) handles multiple mutexes deadlock-free"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "concurrency-container-thread-safety",
    "topic": "concurrency",
    "question": "Is std::vector thread-safe? Say two threads call push_back on the same vector at once — what actually happens?",
    "followUps": [
      "And two threads only reading the same unordered_map — safe or not?",
      "Now one thread reads while another inserts. What specifically breaks inside an unordered_map?",
      "Two threads write to different elements — v[0] and v[1]. Race or fine?",
      "How would you actually make a map safe for lots of readers and occasional writers?"
    ],
    "answerKey": [
      "No standard container is thread-safe for concurrent modification: concurrent push_back is a data race, undefined behavior",
      "push_back races on size/capacity and can reallocate, so the other thread writes into freed memory and iterators/pointers dangle",
      "Concurrent reads (const operations only) on the same container are guaranteed safe by the standard",
      "Insert during read can rehash the unordered_map, moving buckets and invalidating iterators under the reader",
      "Writes to distinct elements of a vector are fine — distinct objects; the exception is vector<bool>, where packed bits share bytes",
      "Options: one mutex around it, std::shared_mutex (readers-writer) for read-heavy traffic, or shard/stripe into N buckets each with its own lock"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "concurrency-false-sharing",
    "topic": "concurrency",
    "question": "You shard a hot counter — one slot per thread in an array, no locks, nothing shared. It scales worse than the single atomic did. What's going on?",
    "followUps": [
      "What granularity does the cache coherence protocol actually work in?",
      "Walk me through what MESI does when core A writes slot 0 and core B writes slot 1.",
      "Fix it in C++.",
      "How do you prove false sharing is the culprit on a live binary instead of guessing?"
    ],
    "answerKey": [
      "False sharing: the per-thread counters sit on the same 64-byte cache line",
      "Coherence works at cache-line granularity: a write needs the line in Exclusive/Modified, invalidating every other core's copy",
      "The line ping-pongs between cores on every write even though no datum is logically shared — each write is a coherence miss",
      "Fix: pad or align each slot to its own line — alignas(std::hardware_destructive_interference_size) (typically 64)",
      "Better still: accumulate in genuinely thread-local variables and combine once at the end",
      "Diagnose with perf c2c / HITM (hit-modified) events or cache-miss counters"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "concurrency-threads-vs-async-vs-processes",
    "topic": "concurrency",
    "question": "Your service needs to handle ten thousand simultaneous client connections. Thread per connection, async I/O on a few threads, or a pool of processes — how do you choose?",
    "followUps": [
      "What concretely breaks with ten thousand threads?",
      "Turns out the workload is CPU-bound — heavy parsing and compute per message. Does the event loop still save you?",
      "How many threads do you give the CPU-bound pool, and why that number?",
      "Where do separate processes earn their keep?",
      "What does std::async actually do — is it even asynchronous?"
    ],
    "answerKey": [
      "Thread-per-connection dies at scale: each thread costs stack memory (megabyte-order default), scheduling/context-switch overhead grows, and most threads just sit blocked on I/O",
      "I/O-bound: event-driven async (epoll/io_uring, event loop per core) — a few threads multiplex thousands of mostly-idle connections",
      "CPU-bound: an event loop doesn't help; use a thread pool of about std::thread::hardware_concurrency() — more threads add context switching, not throughput",
      "Processes buy crash and security isolation (one dies, the rest live — browser-tab model) at the cost of IPC and heavier startup",
      "Real designs mix: event loop(s) for I/O plus a worker thread pool for compute",
      "std::async default policy may run deferred (lazily on .get()), and its returned future's destructor can block — pass std::launch::async explicitly"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "memory-segments",
    "topic": "memory",
    "question": "A local variable, a global, and something you allocate with new — where does each of those actually live in memory?",
    "followUps": [
      "The global — does it matter whether you initialised it? Where does an uninitialised one go?",
      "Where do string literals live, and what happens if you try to write to one?",
      "Why is allocating on the stack so much cheaper than the heap?",
      "The function returns — what actually happens to its locals? Does anything wipe that memory?"
    ],
    "answerKey": [
      "locals live on the stack, inside the function's stack frame",
      "new'd objects live on the heap (free store)",
      "globals and statics live in the static/data segment, which exists for the whole program lifetime",
      "initialised globals go in .data; uninitialised/zero-initialised ones go in .bss (zeroed by the loader, takes no space in the binary)",
      "string literals live in read-only data (.rodata); modifying one is undefined behaviour and typically segfaults",
      "stack allocation is just moving the stack pointer; heap allocation requires the allocator to search for and book-keep a block",
      "on return the stack pointer moves back — the memory isn't cleared, it's just no longer valid, which is why pointers to dead locals sometimes appear to work"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "memory-stack-overflow",
    "topic": "memory",
    "question": "What's actually happening when a program stack-overflows?",
    "followUps": [
      "How does the OS know you've run off the end of the stack?",
      "Roughly how big is the stack — and is a spawned thread's stack the same as the main thread's?",
      "Give me two ways to overflow the stack without infinite recursion.",
      "If a single stack frame is bigger than the guard region, what could go wrong?"
    ],
    "answerKey": [
      "the stack grows past its reserved limit into memory it doesn't own",
      "the OS places an unmapped guard page just beyond the stack; touching it triggers a page fault the kernel turns into SIGSEGV",
      "common causes: deep or unbounded recursion, very large local variables (big arrays by value on the stack), alloca/VLAs",
      "main-thread stack defaults to about 8 MB on Linux; thread stacks are fixed at creation and often smaller",
      "a frame larger than the guard page can jump clean over it and silently corrupt adjacent memory (stack clash) — compilers mitigate with stack probing",
      "you can't handle it with a normal signal handler because the handler itself needs stack space — sigaltstack exists for that"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "memory-raii-exceptions",
    "topic": "memory",
    "question": "RAII gets called C++'s answer to garbage collection. What is it, and why does it still clean up when an exception is thrown halfway through a function?",
    "followUps": [
      "An exception escapes a constructor — does that object's destructor run? What about its members?",
      "Why was passing two raw news into one function call a leak risk before C++17?",
      "unique_ptr versus shared_ptr — what's the actual cost difference, and what lives in the control block?",
      "Where can shared_ptr still leak?"
    ],
    "answerKey": [
      "RAII ties a resource's lifetime to an object's lifetime: the constructor acquires, the destructor releases",
      "destructors of automatic (stack) objects run deterministically at scope exit — every exit path, including early returns",
      "during stack unwinding after a throw, destructors of all fully-constructed locals still run, so resources are released on the exception path too",
      "if a constructor throws, that object's destructor never runs, but its fully-constructed members and base classes are destroyed",
      "unique_ptr is move-only sole ownership with essentially zero overhead; shared_ptr adds a control block with atomic strong and weak counts (plus the deleter)",
      "shared_ptr reference cycles leak — break them with weak_ptr",
      "make_unique/make_shared fix the pre-C++17 unsequenced-evaluation leak, and make_shared fuses object and control block into one allocation"
    ],
    "depth": 2,
    "escalation": "Implement a minimal unique_ptr: constructor, destructor, move constructor and move assignment, deleted copy operations, operator* and operator->, and get()."
  },
  {
    "id": "memory-dangling-no-delete",
    "topic": "memory",
    "question": "Give me a way to end up with a dangling pointer without ever calling delete.",
    "followUps": [
      "You dereference it and it prints the right value. Is the code fine then?",
      "Same idea on the heap — what's use-after-free, and why does it so often appear to work?",
      "How does AddressSanitizer catch a use-after-free when normal runs don't even crash?",
      "You use smart pointers everywhere — can you still dangle?"
    ],
    "answerKey": [
      "returning the address or reference of a local — the frame is popped and the pointer dangles",
      "other no-delete routes: iterator/pointer invalidation when a vector reallocates, a string_view or reference bound to a temporary, a lambda capturing a local by reference and outliving it",
      "dereferencing a dangling pointer is undefined behaviour — it may appear to work only because the memory hasn't been reused yet",
      "use-after-free reads a freed heap block that often still contains the old bytes until the allocator hands it out again",
      "ASan poisons freed memory in shadow memory, quarantines freed blocks so they aren't immediately reused, and adds redzones — turning silent UAF into a deterministic trap",
      "smart pointers don't prevent dangling through .get(), captured references, or invalidated iterators — they manage ownership, not aliasing"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "memory-struct-padding",
    "topic": "memory",
    "question": "I've got a struct with a char, an int, then another char — sizeof says 12. I reorder the members and it drops to 8. What's going on?",
    "followUps": [
      "Why does the hardware care about alignment in the first place?",
      "What determines the alignment of the struct as a whole, and why does the compiler pad the end of it?",
      "What does #pragma pack or a packed attribute do, and what does it cost you?",
      "Beyond sizeof — when does member ordering actually matter for performance?"
    ],
    "answerKey": [
      "the compiler inserts padding so every member sits at an offset that's a multiple of its own alignment",
      "char(1) + 3 pad + int(4) + char(1) + 3 tail pad = 12; ordering int, char, char packs to 8",
      "the struct's alignment equals its strictest member's alignment, and total size is rounded up to a multiple of that so arrays of the struct stay aligned",
      "misaligned access is slower on some hardware and faults on others (older ARM, many SIMD instructions); atomics generally require natural alignment",
      "packed structs drop the padding but member access may compile to slower byte-wise loads, and taking pointers to misaligned members is dangerous",
      "ordering members largest-alignment-first minimises padding; tighter structs mean more elements per cache line in arrays, and hot/cold splitting or avoiding false sharing are the real-world wins"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "memory-leak-hunt",
    "topic": "memory",
    "question": "Your service's memory footprint climbs steadily over a week in production. Walk me through how you'd track down the leak.",
    "followUps": [
      "How does Valgrind or LeakSanitizer actually decide something leaked?",
      "What's the difference between 'definitely lost' and 'still reachable' in that report?",
      "It only reproduces under production traffic, where those tools are too slow. Now what?",
      "The checker comes back clean but memory still grows. What are your suspects?",
      "How do you write the code so this class of bug mostly can't happen?"
    ],
    "answerKey": [
      "a leak is a heap allocation with no remaining pointer to it, so it can never be freed",
      "Valgrind memcheck and LeakSanitizer detect leaks by scanning roots (stacks, globals, registers) at exit and checking which heap blocks are still reachable",
      "'definitely lost' means unreachable; 'still reachable' means a pointer still exists but the block was never freed",
      "for production: heap profilers built into jemalloc/tcmalloc, massif, allocation sampling, or diffing RSS and allocator stats over time",
      "growth with a clean leak check suggests unbounded caches/queues (still reachable), fragmentation, or the allocator retaining freed pages",
      "prevention: RAII and smart pointers for ownership, standard containers, no naked new/delete"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "memory-malloc-internals",
    "topic": "memory",
    "question": "You call malloc asking for 32 bytes. What actually happens between that call and you getting a pointer back?",
    "followUps": [
      "Free list's empty — where does the allocator get more memory from?",
      "free only takes the pointer — how does it know how many bytes to release?",
      "After you free, has the OS actually got its memory back?",
      "You free two adjacent blocks — what should a decent allocator do with them?",
      "What's different when you write new instead of malloc?"
    ],
    "answerKey": [
      "malloc is a userspace library allocator managing a heap region — it searches its free lists / size-class bins for a suitable free block, splitting a larger one if needed",
      "the returned block carries hidden metadata (a header with size and flags) just before the user pointer",
      "when it runs out, it grows the heap with brk/sbrk or maps fresh pages with mmap",
      "large requests (above glibc's mmap threshold, ~128 KB) go straight to mmap and are munmapped on free",
      "free normally pushes the block back onto a free list — the memory stays with the process rather than returning to the OS",
      "free reads the size from the block's header",
      "allocators coalesce adjacent free blocks and use size-class bins to limit fragmentation",
      "new = operator new (which allocates and throws std::bad_alloc on failure) followed by the constructor; delete runs the destructor then operator delete",
      "malloc's pointers are aligned for any type — typically to max_align_t, 16 bytes"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "memory-fragmentation",
    "topic": "memory",
    "question": "What's memory fragmentation? And how can an allocation fail when there's plenty of free memory?",
    "followUps": [
      "Internal versus external — what's the difference?",
      "What allocation pattern produces the worst external fragmentation?",
      "Why can't the allocator just compact the heap the way a garbage collector does?",
      "How do modern allocators like jemalloc or tcmalloc fight it?",
      "You own the application code — what would you change to reduce fragmentation?"
    ],
    "answerKey": [
      "external fragmentation: free memory is split into many non-contiguous small blocks, so total free space is sufficient but no single block is big enough for the request",
      "internal fragmentation: waste inside allocated blocks from rounding up to size classes and alignment",
      "worst pattern: long-lived allocations interleaved with short-lived ones of mixed sizes — the survivors pin regions and prevent coalescing",
      "a C++ allocator can't compact because programs hold raw pointers; moving objects would invalidate them — GCs can move objects because they can rewrite every reference",
      "mitigations in allocators: size-class bins, coalescing adjacent free blocks, per-thread arenas, serving large allocations from mmap so they return to the OS on free",
      "application fixes: object pools, per-request arenas, reserving containers up front, reducing the variety of allocation sizes",
      "symptom in practice: RSS keeps growing while leak checkers come back clean"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "memory-pool-arena",
    "topic": "memory",
    "question": "You've got a hot path allocating and freeing thousands of small, same-sized objects a second, and malloc keeps showing up in the profile. What do you do?",
    "followUps": [
      "Pool versus arena — what's the difference in how freeing works?",
      "How does the pool's free list work without any extra memory for bookkeeping?",
      "What do you give up compared to malloc?",
      "What kind of workload fits the arena's free-everything-at-once model?",
      "C++17 shipped this in the standard library — what's PMR?"
    ],
    "answerKey": [
      "reach for a pool or arena: many same-size objects, latency-critical path, predictable lifetimes, avoiding fragmentation and allocator lock contention",
      "fixed-size pool: a pre-allocated slab divided into equal blocks, with free blocks chained in an intrusive free list — the next pointer is stored inside the free block itself, so bookkeeping costs nothing",
      "allocate and deallocate are O(1) pointer push/pop — no searching, no syscalls, and no locks if the pool is per-thread",
      "arena (bump allocator): allocation is a pointer increment; there is no per-object free — you reset and release everything at once",
      "arena fits per-request, per-message, or per-frame lifetimes; a pool fits uniform-size objects needing individual free",
      "trade-offs: memory reserved up front and held while idle, pool serves one size only, arena reset dangles anything still pointing in",
      "C++17 PMR: std::pmr::monotonic_buffer_resource is the arena, (un)synchronized_pool_resource the pool, used through polymorphic_allocator"
    ],
    "depth": 3,
    "escalation": "Implement a fixed-block memory pool: constructor takes block size and block count, allocate() and deallocate(void*) both O(1) using an intrusive free list threaded through the free blocks themselves."
  },
  {
    "id": "os-process-vs-thread",
    "topic": "os",
    "question": "What's the difference between a process and a thread?",
    "followUps": [
      "You said threads share memory — what exactly is shared, and what does each thread still get its own copy of?",
      "If one thread segfaults, what happens to the rest of the process?",
      "Why is switching between two threads of the same process cheaper than switching between two processes?",
      "When would you deliberately pick multiple processes over multiple threads?"
    ],
    "answerKey": [
      "a process has its own virtual address space; threads within a process share one address space",
      "shared between threads: heap, globals/statics, code, open file descriptors; per-thread: stack, registers/program counter, errno, thread-local storage",
      "SIGSEGV in one thread kills the entire process — threads have no fault isolation",
      "same-process thread switch keeps the same page tables, so no page-table base (CR3) reload and no TLB flush",
      "processes win for fault isolation, privilege/security separation, and independent lifecycle (e.g. browser per-tab processes)",
      "on Linux both are tasks created via clone(); the flags passed decide what gets shared"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "os-syscall-vs-library",
    "topic": "os",
    "question": "Is printf a system call?",
    "followUps": [
      "So where does the actual system call happen, and which one is it?",
      "How does the CPU get from user mode into the kernel — what's the actual mechanism?",
      "Why is a syscall so much more expensive than an ordinary function call?",
      "You've got a binary with no source. How do you see every syscall it makes?"
    ],
    "answerKey": [
      "no — printf is a C library function that formats and buffers entirely in user space",
      "it eventually invokes the write() syscall when the buffer flushes (line-buffered on a terminal, block-buffered to a file or pipe)",
      "user-to-kernel transition is a trap instruction (syscall on x86-64, historically int 0x80); syscall number goes in a register (rax) and the kernel dispatches via its syscall table",
      "cost comes from the privilege-mode switch, register save/restore, cache and TLB effects, and mitigations like KPTI — hundreds of nanoseconds versus nanoseconds for a plain call",
      "strace shows system calls; ltrace shows library calls"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "os-context-switch",
    "topic": "os",
    "question": "Walk me through what actually happens during a context switch.",
    "followUps": [
      "What causes one to happen in the first place?",
      "How does the kernel decide which thread runs next?",
      "What's different when the two threads belong to different processes?",
      "Saving registers is fast — so what's the real cost of a context switch?"
    ],
    "answerKey": [
      "kernel saves the current task's register state — program counter, stack pointer, general registers — into its task struct / kernel stack",
      "scheduler picks the next runnable task, its registers and kernel stack are restored, execution resumes where it left off",
      "triggers: timer interrupt / time-slice expiry, the task blocking on I/O or a lock, a higher-priority task waking, or a voluntary yield",
      "Linux's fair scheduler (CFS, now EEVDF) runs the task with the least virtual runtime, weighted by nice value; separate real-time policies exist (SCHED_FIFO/RR)",
      "a cross-process switch also swaps the address space: the page-table base register (CR3 on x86) is reloaded",
      "that invalidates TLB entries unless they're tagged (PCID/ASID); the dominant cost is indirect — cold caches and TLB afterwards — not the ~1µs register swap"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "os-virtual-address-translation",
    "topic": "os",
    "question": "Your process dereferences a pointer. Take me from that virtual address all the way to physical RAM.",
    "followUps": [
      "What happens on a TLB miss?",
      "The page table entry says not-present. Now what?",
      "What's the difference between a minor and a major page fault?",
      "Why does a 10 gig malloc succeed on a box with 8 gig of RAM?",
      "Where in all of this does a segfault actually come from?"
    ],
    "answerKey": [
      "the MMU first checks the TLB for a cached virtual-to-physical translation; a hit gives the physical address immediately",
      "on a TLB miss, hardware walks the multi-level page table (4-5 levels on x86-64) starting from the base register (CR3)",
      "a not-present PTE raises a page fault, trapping into the kernel's fault handler",
      "minor fault: resolved without disk I/O — page already in the page cache, first touch of anonymous memory, or copy-on-write; major fault: requires a disk read (swap or file-backed page)",
      "malloc/mmap only reserves virtual address space; physical pages are allocated lazily on first touch — overcommit",
      "SIGSEGV is delivered when the faulting address has no valid mapping or violates permissions (e.g. write to a read-only page)",
      "huge pages (2MB/1GB) extend TLB reach and cut walk depth"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "os-fork-exec-shell",
    "topic": "os",
    "question": "You type ls in a shell and hit enter. What does the shell do, at the syscall level?",
    "followUps": [
      "fork copies the whole process — isn't that hugely expensive? How does Linux make it cheap?",
      "fork returns twice. What does each caller see?",
      "How does ls > out.txt work — where does the shell set up that redirection?",
      "What happens to open file descriptors across fork, and then across exec?",
      "Why is calling fork from a multithreaded program dangerous?"
    ],
    "answerKey": [
      "shell forks a child; the child calls execve to run ls; the parent calls waitpid to collect the exit status",
      "fork returns the child's PID in the parent and 0 in the child",
      "copy-on-write: page tables are duplicated but pages are shared read-only; a write by either side faults and copies just that page",
      "exec replaces the address space with the new program — PID stays the same",
      "redirection happens in the child between fork and exec: open the file, dup2 it onto fd 1, then exec",
      "fork copies the fd table, but both copies point at the same open file description, so parent and child share the file offset",
      "fds stay open across exec unless marked close-on-exec (O_CLOEXEC)",
      "after fork only the calling thread exists in the child; a mutex held by another thread stays locked forever, so only async-signal-safe work is safe between fork and exec"
    ],
    "depth": 2,
    "escalation": "Implement a minimal shell in C++: loop reading a command, fork, execvp it, waitpid, print the exit status — then add output redirection with dup2 for `cmd > file`."
  },
  {
    "id": "os-port-8080-in-use",
    "topic": "os",
    "question": "You deploy your service and it dies with 'address already in use' on port 8080. What do you do?",
    "followUps": [
      "What does ss or lsof actually show you, and how do you get from that to a PID?",
      "You kill that process, restart, and the bind still fails. Why?",
      "What does SO_REUSEADDR actually change?",
      "How does lsof even know which process owns a socket?"
    ],
    "answerKey": [
      "find the listener: ss -ltnp or lsof -i :8080 (netstat -tlnp / fuser 8080/tcp also work) — gives process name and PID",
      "then either kill/reconfigure that process or move your service to a different port",
      "bind can fail with no live listener because a recently closed socket is in TIME_WAIT (about 60 seconds)",
      "SO_REUSEADDR allows binding while old connections sit in TIME_WAIT; SO_REUSEPORT lets multiple sockets share the same port",
      "sockets are file descriptors: lsof matches socket inodes in /proc/<pid>/fd against /proc/net/tcp"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "os-deadlock-conditions",
    "topic": "os",
    "question": "Two of your threads are stuck forever, each waiting on the other. What conditions had to hold for that deadlock to happen?",
    "followUps": [
      "Which of those four do you actually attack in practice, and how?",
      "How does a global lock ordering kill circular wait?",
      "std::scoped_lock over two mutexes — how does it avoid deadlocking?",
      "This is live in production. How do you confirm it's a deadlock and find the two locks?"
    ],
    "answerKey": [
      "all four Coffman conditions must hold: mutual exclusion, hold-and-wait, no preemption, circular wait",
      "the practical target is circular wait: impose a global lock acquisition order (by lock rank or address) so no cycle can form",
      "hold-and-wait can be broken by acquiring all locks up front or using try_lock with back-off or timeout",
      "std::lock / std::scoped_lock acquire multiple mutexes using a deadlock-avoidance try-and-back-off algorithm",
      "diagnose live with gdb -p PID and thread apply all bt: both threads blocked in futex/lock wait, each holding the lock the other wants; ThreadSanitizer catches lock-order inversions in testing"
    ],
    "depth": 2,
    "escalation": "Write a small C++ program with two threads and two mutexes that reliably deadlocks, then fix it two ways: consistent lock ordering, and std::scoped_lock."
  },
  {
    "id": "os-signal-delivery",
    "topic": "os",
    "question": "You hit Ctrl-C on your program. Walk me through everything that happens, from the key press to your handler running.",
    "followUps": [
      "Why is calling printf or malloc inside that handler a bug?",
      "So how do real servers handle signals safely?",
      "Which signals can't you catch, and why do those exist?",
      "Your handler sets a flag the main loop reads. What type does that flag have to be, and why?"
    ],
    "answerKey": [
      "the terminal driver turns Ctrl-C into SIGINT sent to the foreground process group",
      "the kernel marks the signal pending; it's delivered when the process next returns to user mode (syscall or interrupt return)",
      "default disposition for SIGINT is terminate; sigaction installs a handler, which runs on the user stack (or sigaltstack), interrupting whatever the thread was doing",
      "handlers may only call async-signal-safe functions: write() is safe, printf/malloc are not — they take locks and touch non-reentrant state, risking deadlock or corruption",
      "safe patterns: set a volatile sig_atomic_t flag, or route signals into the event loop via the self-pipe trick / signalfd",
      "SIGKILL and SIGSTOP cannot be caught, blocked, or ignored — guaranteeing the OS can always kill or stop a process",
      "signals can be blocked with sigprocmask; interrupted slow syscalls fail with EINTR unless SA_RESTART is set"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "os-memory-leak-hunt",
    "topic": "os",
    "question": "Your C++ service's memory climbs steadily until the OOM killer takes it out. How do you find the leak?",
    "followUps": [
      "Valgrind reports a pile of 'still reachable' blocks. Is that your leak?",
      "ASan reports nothing at exit, but the process still grows in prod. What kinds of growth aren't leaks?",
      "Why is valgrind fifty times slower while ASan is only about two?",
      "You can't recompile or restart the prod binary. What are your options?"
    ],
    "answerKey": [
      "first confirm real growth: watch RSS via top or /proc/PID/status, and /proc/PID/smaps to see which mappings grow",
      "valgrind memcheck --leak-check=full: no recompile needed, 10-50x slowdown, gives allocation stacks; 'definitely lost' is the true leak signal",
      "'still reachable' means a pointer to the block still existed at exit — usually caches or globals, often not a bug",
      "ASan/LeakSanitizer (-fsanitize=address) needs a recompile but runs at roughly 2x, reporting leaks with stacks at exit — practical for CI and staging",
      "growth that isn't a leak: unbounded containers or caches (still reachable), heap fragmentation, the allocator not returning freed pages to the OS",
      "the cost gap: valgrind does dynamic binary instrumentation of every instruction; ASan is compile-time instrumentation over shadow memory",
      "on a live prod binary: heaptrack, jemalloc/tcmalloc heap profiling, gcore plus offline inspection, or diffing /proc/PID/smaps over time"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "cpp-virtual-dispatch",
    "topic": "cpp",
    "question": "I call a virtual function through a Base pointer that's really pointing at a Derived. How does the machine find the right function at runtime?",
    "followUps": [
      "Where does the vptr actually live in the object, and what does it do to sizeof?",
      "Who sets the vptr, and when?",
      "So what happens if the Base constructor calls a virtual function?",
      "What does a virtual call cost versus a normal call?",
      "How would you get the same polymorphism with zero runtime overhead?"
    ],
    "answerKey": [
      "Each polymorphic class has one static vtable — an array of function pointers — shared by all objects of that class",
      "Each object carries a hidden vptr pointing at its class's vtable, typically stored in the first word of the object",
      "A virtual call loads the vptr, indexes the vtable at a slot known at compile time, and calls through that function pointer",
      "The vptr adds one pointer (8 bytes on 64-bit) to every object; the vtable itself is per class, not per object",
      "Constructors set the vptr: while Base's constructor runs the vptr points at Base's vtable, so virtual calls in constructors/destructors never reach the derived override (pure virtual there is UB)",
      "Dispatch follows the dynamic type only through pointers or references — calling through a value slices and binds statically",
      "Cost: one extra indirection and the call can't be inlined; the zero-overhead alternative is compile-time polymorphism via templates/CRTP"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "cpp-virtual-destructor",
    "topic": "cpp",
    "question": "When does a destructor need to be virtual, and what actually goes wrong if it isn't?",
    "followUps": [
      "Is that just a leak, or is it worse than a leak?",
      "Would holding it in a unique_ptr<Base> save you?",
      "And a shared_ptr<Base>? Why is that one different?",
      "So why doesn't the compiler just make every destructor virtual?",
      "You want a base class that's never deleted polymorphically — what's the idiom?"
    ],
    "answerKey": [
      "A destructor must be virtual when a derived object gets deleted through a base-class pointer",
      "Deleting a derived object through a base pointer with a non-virtual destructor is undefined behavior — not merely a leak",
      "Typical symptom is the derived destructor never running so derived-owned resources leak, but the standard makes it full UB",
      "Guideline: any class meant to be used polymorphically (has virtual functions) should have a virtual destructor",
      "unique_ptr<Base> does not save you — its default deleter just does delete on Base*, same UB",
      "shared_ptr<Base> constructed from a Derived* does save you — the control block captures a deleter for the actual constructed type",
      "Making every destructor virtual would add a vptr to non-polymorphic types and destroy trivial destructibility/POD layout",
      "For a base not meant for polymorphic delete: protected non-virtual destructor"
    ],
    "depth": 1,
    "escalation": null
  },
  {
    "id": "cpp-raii-rule-of-five",
    "topic": "cpp",
    "question": "What's RAII, and why is it such a big deal in C++ specifically?",
    "followUps": [
      "An exception is thrown halfway through a function — what guarantees the cleanup still runs?",
      "Rule of three — what are the three, and why do they come as a package?",
      "What did C++11 turn that into, and what changed?",
      "What's the rule of zero, and why is it the one you actually want?",
      "Why must destructors not throw?"
    ],
    "answerKey": [
      "RAII ties a resource to an object's lifetime: acquire in the constructor, release in the destructor",
      "It works because destructors run deterministically at scope exit — including during stack unwinding when an exception propagates",
      "C++ has no garbage collector; RAII is the exception-safety mechanism for memory, locks, files, and sockets",
      "Rule of three: writing any of destructor, copy constructor, or copy assignment means you almost certainly need all three — the class is managing a resource the default memberwise copy gets wrong",
      "Rule of five: C++11 adds move constructor and move assignment; declaring a destructor or copy operations suppresses the implicit move operations",
      "Rule of zero: push resource management into dedicated wrappers (smart pointers, containers) so ordinary classes declare none of the five",
      "Destructors are implicitly noexcept; a destructor that throws during stack unwinding triggers std::terminate"
    ],
    "depth": 1,
    "escalation": "Implement std::lock_guard: constructor takes a mutex reference and locks it, destructor unlocks it, copying is deleted. Then extend it into a RAII file-descriptor wrapper with correct move semantics."
  },
  {
    "id": "cpp-std-move",
    "topic": "cpp",
    "question": "What does std::move actually do?",
    "followUps": [
      "If std::move doesn't move anything, what actually causes the move to happen?",
      "What state is the moved-from object in — am I allowed to touch it?",
      "Inside your move constructor the parameter is an rvalue reference — why do you still need std::move on each member?",
      "What happens if you std::move a const object?",
      "Why is return std::move(local) usually worse than plain return local?"
    ],
    "answerKey": [
      "std::move moves nothing — it is just a cast to an rvalue reference (static_cast<T&&>)",
      "The actual move happens because the cast lets overload resolution pick the move constructor/assignment taking T&&",
      "Moved-from standard-library objects are in a valid but unspecified state: safe to destroy or assign to, but you can't assume their contents",
      "A named rvalue reference is itself an lvalue, so inside a move constructor each member must be std::move'd again or it gets copied",
      "std::move on a const object silently degrades to a copy — T&& can't bind to const, so the const T& copy constructor wins",
      "return std::move(local) inhibits NRVO/copy elision; returning the local by name allows the compiler to construct it in place",
      "Rvalue references bind to temporaries and expiring values; the whole point is stealing resources from objects about to die instead of deep-copying"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "cpp-smart-pointers",
    "topic": "cpp",
    "question": "unique_ptr versus shared_ptr — what's different under the hood, and when do you pick each?",
    "followUps": [
      "What exactly is in shared_ptr's control block?",
      "Why make_shared instead of shared_ptr<T>(new T)? Any downside to make_shared?",
      "Two objects hold shared_ptrs to each other — what happens, and how do you break it?",
      "The reference count is thread-safe — so is the object thread-safe?",
      "Quick one: const unique_ptr<T> versus unique_ptr<const T>?"
    ],
    "answerKey": [
      "unique_ptr: sole ownership, move-only (copies deleted), zero overhead over a raw pointer with the default deleter",
      "shared_ptr: shared ownership through a heap-allocated control block holding the strong count, weak count, and the deleter; the pointer itself is two words (object pointer + control block pointer)",
      "Copying a shared_ptr atomically increments the strong count; the object is destroyed when strong hits zero, the control block freed when weak also hits zero",
      "make_shared does a single allocation for object plus control block and is exception-safe; downside: outstanding weak_ptrs keep the whole block alive, so the object's memory isn't reclaimed until the weak count drains",
      "shared_ptr cycles never reach zero and leak; break the cycle with weak_ptr, which observes without owning and must be lock()ed to get a usable shared_ptr",
      "Ref-count updates are atomic, but access to the pointee is completely unsynchronized — you still need your own locking",
      "const unique_ptr<T>: the pointer is frozen (no reset/reassign) but the pointee is mutable; unique_ptr<const T>: the pointee is read-only",
      "Default to unique_ptr; reach for shared_ptr only when ownership is genuinely shared"
    ],
    "depth": 2,
    "escalation": "Implement a minimal unique_ptr<T>: constructor from raw pointer, destructor, move constructor and move assignment, deleted copies, operator* and operator->, plus get/release/reset."
  },
  {
    "id": "cpp-build-pipeline",
    "topic": "cpp",
    "question": "Walk me from a .cpp file to a running executable — what are the stages, and what does each one actually produce?",
    "followUps": [
      "What does #include literally do, and why do headers need include guards?",
      "'undefined reference to foo' versus 'foo was not declared in this scope' — which stage produces each, and what is each telling you?",
      "Same non-inline function defined in two .cpp files — what happens? What's the one-definition rule?",
      "Static versus dynamic linking — give me the trade-offs.",
      "Why does calling into a C library from C++ need extern \"C\"?"
    ],
    "answerKey": [
      "Preprocessor: textually pastes #includes and expands macros, producing one self-contained translation unit per .cpp",
      "Compiler: compiles each TU independently into an object file — machine code plus a symbol table of defined and undefined symbols",
      "Linker: resolves undefined symbols across object files and libraries, performs relocation, and emits the executable",
      "'not declared in this scope' is a compile-time error (missing declaration/header); 'undefined reference' is a link-time error (missing definition or library)",
      "ODR: exactly one definition of each non-inline function/variable across the program; two definitions gives a duplicate-symbol link error, and differing definitions of an inline/template entity across TUs is ill-formed with no diagnostic required — silent UB",
      "Static linking copies library code into the binary: self-contained but bigger and needs relink to update; dynamic linking resolves against .so/.dll at load time: shared and independently upgradable but adds a runtime dependency and versioning risk",
      "extern \"C\" turns off C++ name mangling and gives C linkage so the symbol names match; mangling exists because overloading requires unique symbol names per signature"
    ],
    "depth": 2,
    "escalation": null
  },
  {
    "id": "cpp-template-instantiation",
    "topic": "cpp",
    "question": "Where does the compiler actually generate the code for a template, and why do template definitions have to live in headers?",
    "followUps": [
      "vector<int> gets instantiated in ten different TUs — why doesn't the linker blow up with duplicate symbols?",
      "What's the downside of all those copies — what's code bloat, and how do you fight it?",
      "What does extern template actually do?",
      "You put the template's definition in a .cpp and use it from another TU — what error do you get, and at which stage?",
      "Templates versus virtual functions for polymorphism — when do you pick which?"
    ],
    "answerKey": [
      "Templates are implicitly instantiated at the point of use, separately in every translation unit that uses that specialization",
      "The compiler needs the full definition visible when it instantiates, which is why template definitions go in headers (the inclusion model)",
      "Duplicate instantiations across TUs are exempt from the ODR as long as the definitions are token-identical; the compiler emits them as weak/COMDAT symbols and the linker deduplicates",
      "Implicit instantiation is lazy — only the member functions actually used get instantiated",
      "Code bloat: every distinct set of template arguments generates its own copy of the code, inflating binary size and compile times",
      "Mitigations: explicit instantiation in one TU plus extern template in the header to suppress per-TU instantiation; hoist type-independent logic out of the template",
      "Definition hidden in a .cpp gives 'undefined reference' at link time from other TUs, unless that .cpp explicitly instantiates the needed specializations",
      "Templates are compile-time polymorphism (no indirection, inlinable, but bloat and header exposure); virtual functions are runtime polymorphism (one copy of code, dynamic types, but per-call indirection)"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "cpp-undefined-behavior",
    "topic": "cpp",
    "question": "Give me three examples of undefined behavior. Then tell me why the standard allows UB at all — why not just define everything?",
    "followUps": [
      "Unsigned overflow wraps but signed overflow is UB — why the difference?",
      "The optimizer proves a code path contains UB — what's it allowed to do with that?",
      "You dereference a pointer, then null-check it on the next line. What might the compiler do to your check?",
      "UB, unspecified, and implementation-defined — separate those three for me.",
      "How do you actually hunt UB down in a real codebase?"
    ],
    "answerKey": [
      "Examples: signed integer overflow, out-of-bounds access, null/dangling pointer dereference, use-after-free, data races, returning a reference to a local",
      "Unsigned overflow is defined (wraps modulo 2^N); signed overflow is UB",
      "UB exists so the compiler can assume it never happens: no mandatory runtime checks, aggressive optimization, and tolerance for hardware differences",
      "On a proven-UB path the compiler may assume the path is unreachable — it can delete checks, fold branches, and reorder, so effects can appear to precede the UB ('time travel')",
      "Dereference-then-null-check: the dereference lets the optimizer assume the pointer is non-null, so it may delete the subsequent null check entirely",
      "Implementation-defined: a documented, consistent choice (e.g. sizeof(int)); unspecified: one of several valid outcomes, not required to be documented (e.g. order of function-argument evaluation); undefined: no constraints whatsoever",
      "Detection: UBSan/ASan/TSan sanitizers, high warning levels, fuzzing, and constexpr evaluation — UB in a constant expression is a compile error"
    ],
    "depth": 3,
    "escalation": null
  },
  {
    "id": "cpp-float-money",
    "topic": "cpp",
    "question": "In C++, 0.1 + 0.2 == 0.3 comes out false. Why? And what does that tell you about storing prices in a double?",
    "followUps": [
      "Which decimal fractions can be stored exactly in binary — what's special about them?",
      "So how do you compare two doubles correctly?",
      "You're storing prices at a finance shop — what do you actually use?",
      "Which integers can a double represent exactly, and up to where?",
      "Break down the 64 bits of a double for me."
    ],
    "answerKey": [
      "Doubles are binary IEEE 754; 0.1, 0.2, and 0.3 are non-terminating fractions in base 2, so each is stored as the nearest representable approximation",
      "A decimal fraction is exact in binary only if its denominator is a power of two — 0.5 and 0.25 yes, 0.1 = 1/10 no because of the factor of 5",
      "The rounding errors in 0.1 and 0.2 sum to a value whose last bits differ from the rounded 0.3, so operator== fails",
      "Compare floats with a tolerance — relative epsilon at large magnitudes, absolute near zero — never raw ==",
      "Money must not be binary floating point: errors accumulate over arithmetic and rounding must follow exact decimal rules; use integers in minor units (pence/cents, e.g. scaled int64) or a fixed-point/decimal type",
      "Double layout: 1 sign bit, 11 exponent bits, 52 stored significand bits (53 with the implicit leading 1); it represents every integer exactly up to 2^53"
    ],
    "depth": 1,
    "escalation": null
  }
];

// Every question the round can draw on: core systems topics, platform topics,
// and the per-language internals.
export const TECH_BANK: TechQuestion[] = [...CORE_BANK, ...PLATFORM_BANK, ...LANGUAGE_BANK];

export function getTechQuestion(id: string): TechQuestion | undefined {
  return TECH_BANK.find((q) => q.id === id);
}

// Sample a round's question set across the chosen topics: warmups first, then
// depth, round-robin across topics so no chip dominates. ~8 questions is a
// 30-40 minute round with follow-ups.
// Which language banks a session draws on. TypeScript inherits JavaScript's
// internals because they are the same runtime, and C++ keeps its dedicated
// topic, so a C++ session's "your language" chip resolves to that bank.
function languagePool(language: Language): { languages: Language[]; extraTopics: TechTopic[] } {
  if (language === 'typescript') return { languages: ['typescript', 'javascript'], extraTopics: [] };
  if (language === 'cpp') return { languages: ['cpp'], extraTopics: ['cpp'] };
  return { languages: [language], extraTopics: [] };
}

export function sampleTechRound(topics: TechTopic[], language: Language, count = 8): TechQuestion[] {
  const pool = languagePool(language);
  const matches = (q: TechQuestion, t: TechTopic): boolean => {
    if (t === 'langint') {
      if (q.topic === 'langint') return q.language !== undefined && pool.languages.includes(q.language);
      return pool.extraTopics.includes(q.topic);
    }
    return q.topic === t && (q.language === undefined || pool.languages.includes(q.language));
  };
  const byTopic = topics
    .map((t) =>
      TECH_BANK.filter((q) => matches(q, t))
        // Shuffle within topic, then order warmup → depth so the round ramps.
        .map((q) => ({ q, r: Math.random() }))
        .sort((a, b) => a.q.depth - b.q.depth || a.r - b.r)
        .map((x) => x.q),
    )
    .filter((list) => list.length > 0);
  const picked: TechQuestion[] = [];
  for (let i = 0; picked.length < count; i++) {
    const list = byTopic[i % byTopic.length];
    if (!byTopic.length || byTopic.every((l) => l.length === 0)) break;
    const next = list?.shift();
    if (next) picked.push(next);
  }
  return picked;
}

// System-prompt block: the sampled question set as private ground truth.
export function techRoundBlock(questions: TechQuestion[]): string {
  const lines = questions.map((q, i) => {
    const parts = [
      `${i + 1}. [${TECH_TOPIC_LABELS[q.topic]} · depth ${q.depth}] ${q.question}`,
      `   Answer key (facts a strong answer contains — grade against these, never reveal):\n${q.answerKey.map((f) => `   - ${f}`).join('\n')}`,
      `   Follow-up ladder:\n${q.followUps.map((f) => `   → ${f}`).join('\n')}`,
    ];
    if (q.escalation) parts.push(`   Coding escalation (optional, when their verbal answer lands): ${q.escalation}`);
    return parts.join('\n');
  });
  return `QUESTION SET — your private ground truth for this round. Work through it roughly in order, conversationally. Never reveal keys or ladders.\n\n${lines.join('\n\n')}`;
}
