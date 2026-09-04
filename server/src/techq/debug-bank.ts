import type { Language, TechTopic } from '../../../shared/protocol';
import type { ServerProblem } from '../types.js';

// Debug-&-optimize exercises: deliberately flawed programs the candidate must
// read (find phase — graded against the planted-issue key), then fix and
// optimize (fix phase — the harness includes a large timed case so an O(n^2)
// "fix" still fails). Every entry was compile/run-verified at authoring time:
// flawed code compiles and fails, the reference fix passes in <2s.

export interface PlantedIssue {
  category: 'bug' | 'ub' | 'perf' | 'design';
  severity: 'high' | 'medium' | 'low';
  line: number; // 1-based into `code`
  issue: string;
}

export interface DebugExercise {
  id: string;
  title: string; // neutral — never hints at the flaw
  topic: TechTopic;
  language: Language;
  scenario: string; // what the interviewer says when handing it over
  code: string; // the flawed program, seeded into the editor
  plantedIssues: PlantedIssue[];
  brief: string; // expected fixes, optimization target, partial-credit notes
  tests: { input: string; expected: string }[];
  harness: string;
}

// Spliced in from the authoring workflow (each entry compile-verified).
export const DEBUG_BANK: DebugExercise[] = [
  {
    "id": "dbg-access-log-rollups",
    "title": "Access log rollups",
    "topic": "dsinternals",
    "language": "python",
    "scenario": "Here's a small module our on-call tooling uses to crunch access-log lines of the form 'IP STATUS PATH'. The nightly failure report sometimes lists paths from a previous run, and the distinct-visitor pass crawls on large logs — take a look and get the tests green.",
    "code": "\"\"\"Utilities for crunching access-log lines of the form \"IP STATUS PATH\".\"\"\"\n\n\ndef parse_line(line):\n    ip, status, path = line.split()\n    return {\"ip\": ip, \"status\": int(status), \"path\": path}\n\n\ndef unique_ips(lines):\n    \"\"\"Return distinct client IPs in first-seen order.\"\"\"\n    ips = []\n    for line in lines:\n        ip = parse_line(line)[\"ip\"]\n        if ip not in ips:\n            ips.append(ip)\n    return ips\n\n\ndef failed_paths(lines, seen=[]):\n    \"\"\"Collect paths that returned a 5xx status, skipping already-seen ones.\"\"\"\n    for line in lines:\n        rec = parse_line(line)\n        if rec[\"status\"] >= 500 and rec[\"path\"] not in seen:\n            seen.append(rec[\"path\"])\n    return list(seen)\n\n\ndef status_counts(lines):\n    \"\"\"Map status code -> number of requests with that status.\"\"\"\n    counts = {}\n    for line in lines:\n        status = parse_line(line)[\"status\"]\n        counts[status] = counts.get(status, 0) + 1\n    return counts\n",
    "plantedIssues": [
      {
        "category": "perf",
        "severity": "high",
        "line": 14,
        "issue": "`ip not in ips` is a linear scan over a list, so unique_ips is O(N*U) — effectively quadratic. On the perf case (150k lines, 25k distinct IPs) it takes over a minute and is killed at the 10s limit. Membership tracking must use a set (kept alongside the list to preserve first-seen order)."
      },
      {
        "category": "bug",
        "severity": "high",
        "line": 19,
        "issue": "Mutable default argument `seen=[]` is created once at function definition time and mutated by every default-argument call, so paths leak across calls: a fresh call reports 5xx paths from earlier runs (test case 2 fails). Fix with `seen=None` and a fresh list inside, preserving the caller-supplied-seen behavior."
      },
      {
        "category": "perf",
        "severity": "low",
        "line": 23,
        "issue": "`rec[\"path\"] not in seen` is the same linear list-membership anti-pattern, O(N*P) overall. Small in these tests, but should use a set for membership alongside the ordered list."
      }
    ],
    "brief": "Expected fixes: (1) unique_ips — keep the ordered result list but do membership against a parallel set: O(N*U) -> O(N); this is the fix the 150k-line/25k-IP perf case (case 5) requires (flawed ~70s+, fixed <0.5s). (2) failed_paths — replace `seen=[]` with `seen=None` + `if seen is None: seen = []`; case 2 (fresh call after case 1) exposes the leak, and case 3 guards that an explicitly passed seen list must still be honored and appended to. (3) Same set treatment for the path membership check. Partial credit: fixing only the unique_ips quadratic scan still passes the perf case; naming the mutable-default mechanism ('evaluated once at def time') is worth more than just noticing 'weird state'. Traps: returning set(...) or sorted(...) from unique_ips loses first-seen order (case 0 fails); 'fixing' the default with seen.clear() at entry empties the caller's list and breaks case 3; `seen = seen or []` happens to pass here but silently discards a caller's empty list — probe if offered. Candidates often blame parse_line for the slowness; it is linear and fine.",
    "tests": [
      {
        "input": "5 log lines from 3 distinct IPs with repeats",
        "expected": "['10.0.0.1', '10.0.0.2', '10.0.0.3'] in first-seen order"
      },
      {
        "input": "4 lines including 500/503 statuses and one duplicate 5xx path",
        "expected": "['/api/orders', '/api/cart']"
      },
      {
        "input": "a fresh default-argument call: one 502 /checkout line plus a 200 line",
        "expected": "['/checkout'] only — nothing remembered from the previous call"
      },
      {
        "input": "explicit seen=['/api/orders'] with 500s on /api/orders and /api/pay",
        "expected": "['/api/orders', '/api/pay']"
      },
      {
        "input": "3 lines: two 200s and one 500",
        "expected": "{200: 2, 500: 1}"
      },
      {
        "input": "150k random log lines with 25k distinct IPs, seed 20260902 (must finish well under the 10s limit)",
        "expected": "all 25,000 IPs in first-seen order (harness computes expected via dict.fromkeys)"
      }
    ],
    "harness": "from solution import *\n\nimport random\n\n\ndef show(value):\n    text = repr(value)\n    if len(text) > 200:\n        text = text[:200] + \"...\"\n    return text\n\n\ndef check(i, expected, actual):\n    if expected == actual:\n        print(f\"###CASE {i} PASS\", flush=True)\n    else:\n        print(f\"###CASE {i} FAIL\", flush=True)\n        print(f\"###EXPECTED {show(expected)}\", flush=True)\n        print(f\"###ACTUAL {show(actual)}\", flush=True)\n\n\ndef main():\n    # Case 0: unique_ips keeps first-seen order and drops duplicates.\n    lines0 = [\n        \"10.0.0.1 200 /home\",\n        \"10.0.0.2 200 /home\",\n        \"10.0.0.1 404 /missing\",\n        \"10.0.0.3 200 /about\",\n        \"10.0.0.2 500 /api\",\n    ]\n    check(0, [\"10.0.0.1\", \"10.0.0.2\", \"10.0.0.3\"], unique_ips(lines0))\n\n    # Case 1: failed_paths keeps only 5xx paths, without duplicates.\n    lines1 = [\n        \"10.0.0.1 500 /api/orders\",\n        \"10.0.0.2 200 /home\",\n        \"10.0.0.3 503 /api/cart\",\n        \"10.0.0.4 500 /api/orders\",\n    ]\n    check(1, [\"/api/orders\", \"/api/cart\"], failed_paths(lines1))\n\n    # Case 2: a fresh call must not remember paths from an earlier call.\n    lines2 = [\n        \"10.0.0.9 502 /checkout\",\n        \"10.0.0.9 200 /home\",\n    ]\n    check(2, [\"/checkout\"], failed_paths(lines2))\n\n    # Case 3: a caller-provided seen list is honored.\n    lines3 = [\n        \"10.0.0.5 500 /api/orders\",\n        \"10.0.0.6 500 /api/pay\",\n    ]\n    check(3, [\"/api/orders\", \"/api/pay\"], failed_paths(lines3, [\"/api/orders\"]))\n\n    # Case 4: status_counts tallies per status code.\n    lines4 = [\"1.1.1.1 200 /a\", \"1.1.1.2 200 /b\", \"1.1.1.3 500 /c\"]\n    check(4, {200: 2, 500: 1}, status_counts(lines4))\n\n    # Case 5: perf — 150k lines with 25k distinct IPs.\n    random.seed(20260902)\n    big = []\n    for _ in range(150_000):\n        k = random.randrange(25_000)\n        ip = f\"10.0.{k // 256}.{k % 256}\"\n        big.append(f\"{ip} 200 /page/{k % 97}\")\n    expected = list(dict.fromkeys(line.split()[0] for line in big))\n    check(5, expected, unique_ips(big))\n\n    print(\"###DONE\", flush=True)\n\n\nmain()\n"
  },
  {
    "id": "dbg-order-export-feed",
    "title": "Order export feed",
    "topic": "data",
    "language": "python",
    "scenario": "This module renders the CSV order export that billing ingests, plus a status summary for the fetch pipeline. QA reports that 404s stopped being counted in the summary, and the full-size export job never finishes — see what you can find.",
    "code": "\"\"\"Order export: turns order records into the CSV feed that billing ingests.\"\"\"\n\nOK = 200\nNOT_FOUND = 404\n\n\nclass ReportBuilder:\n    def __init__(self, header):\n        self.text = header + \"\\n\"\n        self.rows = 0\n\n    def add_row(self, values):\n        line = \",\".join(str(v) for v in values)\n        self.text += line + \"\\n\"\n        self.rows += 1\n\n    def render(self):\n        return self.text\n\n\ndef export_orders(orders):\n    \"\"\"Render orders as CSV with an order_id,status,total header row.\"\"\"\n    report = ReportBuilder(\"order_id,status,total\")\n    for order in orders:\n        report.add_row([order[\"id\"], order[\"status\"], order[\"total\"]])\n    return report.render()\n\n\ndef summarize_statuses(codes):\n    \"\"\"Count how many fetches succeeded, 404'd, or failed some other way.\"\"\"\n    ok = 0\n    missing = 0\n    other = 0\n    for code in codes:\n        if code is OK:\n            ok += 1\n        elif code is NOT_FOUND:\n            missing += 1\n        else:\n            other += 1\n    return {\"ok\": ok, \"missing\": missing, \"other\": other}\n",
    "plantedIssues": [
      {
        "category": "perf",
        "severity": "high",
        "line": 14,
        "issue": "`self.text += line + \"\\n\"` re-copies the entire accumulated buffer on every row. Because the target is an instance attribute (the instance dict holds a second reference), CPython's in-place str-concat fast path can never apply, so the export is O(L^2) in total output length — the 200k-row perf case takes minutes and is killed at the 10s limit. Fix: accumulate parts in a list and ''.join in render()."
      },
      {
        "category": "bug",
        "severity": "high",
        "line": 37,
        "issue": "`code is NOT_FOUND` compares object identity, not equality. 404 is outside CPython's small-int cache (-5..256), so a 404 parsed from input is a different int object than the module constant and the branch never matches — 404s are counted as 'other' (test case 2 fails). Must be `==`."
      },
      {
        "category": "bug",
        "severity": "medium",
        "line": 35,
        "issue": "`code is OK` has the same identity-vs-equality flaw but happens to work because CPython interns ints in -5..256, so every 200 is the same object. It is a latent, implementation-dependent bug (test case 1 deceptively passes) and must also become `==`."
      }
    ],
    "brief": "Expected fixes: (1) ReportBuilder must stop rebuilding the string per row — collect pieces in a list and ''.join in render(): O(L^2) -> O(L) bytes copied, where L is total output length. This is what the 200k-order perf case (case 3) requires: flawed ~2 minutes, fixed <1s. (2) Both `is` comparisons in summarize_statuses become `==`. Case 2 (codes parsed via int() from a text feed, including 404s) exposes the NOT_FOUND identity bug; case 1 (all 200s) passes even when flawed — the strongest candidates explain WHY: the CPython small-int cache (-5..256) makes every 200 the same object while each runtime 404 is a fresh object distinct from the module constant. Partial credit: spotting `is NOT_FOUND` but missing `is OK` (tests cannot catch the latter — grade it from the read-phase); fixing perf by concatenating into a local variable in export_orders instead of list+join (may pass via CPython's refcount==1 in-place resize fast path, but is fragile and version/implementation-dependent — probe and award less). Traps: claiming 'str += is optimized in CPython so it's fine' — the fast path requires the string to have exactly one reference and never fires for attribute targets like self.text; hand-waving the is/== failure as '404 is special' without naming the int cache; converting render() to join while add_row still does +=.",
    "tests": [
      {
        "input": "2 small orders (A-1 shipped 19.5, A-2 pending 3)",
        "expected": "exact CSV: 'order_id,status,total\\nA-1,shipped,19.5\\nA-2,pending,3\\n'"
      },
      {
        "input": "status codes [200, 200, 200] parsed from a text feed via int()",
        "expected": "{'ok': 3, 'missing': 0, 'other': 0} (passes even when flawed — small-int cache)"
      },
      {
        "input": "status codes [200, 404, 500, 404, 200, 302] parsed from a text feed via int()",
        "expected": "{'ok': 2, 'missing': 2, 'other': 2}"
      },
      {
        "input": "200k-order export, seed 99 (must finish well under the 10s limit)",
        "expected": "exact ~6.8 MB CSV; harness builds the expected text with a single join"
      }
    ],
    "harness": "from solution import *\n\nimport random\n\n\ndef show(value):\n    text = repr(value)\n    if len(text) > 200:\n        text = text[:200] + \"...\"\n    return text\n\n\ndef check(i, expected, actual):\n    if expected == actual:\n        print(f\"###CASE {i} PASS\", flush=True)\n    else:\n        print(f\"###CASE {i} FAIL\", flush=True)\n        print(f\"###EXPECTED {show(expected)}\", flush=True)\n        print(f\"###ACTUAL {show(actual)}\", flush=True)\n\n\ndef main():\n    # Case 0: small export produces the exact CSV text.\n    orders0 = [\n        {\"id\": \"A-1\", \"status\": \"shipped\", \"total\": 19.5},\n        {\"id\": \"A-2\", \"status\": \"pending\", \"total\": 3},\n    ]\n    expected0 = \"order_id,status,total\\nA-1,shipped,19.5\\nA-2,pending,3\\n\"\n    check(0, expected0, export_orders(orders0))\n\n    # Case 1: an all-success feed.\n    codes1 = [int(c) for c in \"200 200 200\".split()]\n    check(1, {\"ok\": 3, \"missing\": 0, \"other\": 0}, summarize_statuses(codes1))\n\n    # Case 2: mixed status codes parsed from a feed.\n    codes2 = [int(c) for c in \"200 404 500 404 200 302\".split()]\n    check(2, {\"ok\": 2, \"missing\": 2, \"other\": 2}, summarize_statuses(codes2))\n\n    # Case 3: perf — export 200k orders.\n    random.seed(99)\n    orders = []\n    for i in range(200_000):\n        orders.append({\n            \"id\": f\"ORD-2026-{i:07d}\",\n            \"status\": random.choice([\"shipped\", \"pending\", \"cancelled\"]),\n            \"total\": random.randrange(10_000, 999_999),\n        })\n    expected = \"order_id,status,total\\n\" + \"\".join(\n        f\"{o['id']},{o['status']},{o['total']}\\n\" for o in orders\n    )\n    check(3, expected, export_orders(orders))\n\n    print(\"###DONE\", flush=True)\n\n\nmain()\n"
  },
  {
    "id": "dbg-recent-activity-panel",
    "title": "Recent activity panel",
    "topic": "cpp",
    "language": "cpp",
    "scenario": "This function renders the 'recent activity' panel for our admin dashboard: the last `window` events from the tenant's in-memory event log, numbered from 1, one per line. Read it, flag anything you'd push back on in code review, then fix it so the full test suite passes.",
    "code": "// Renders the \"recent activity\" panel for the admin dashboard.\n// The panel shows the last `window` events from the tenant's in-memory\n// event log, oldest of the shown events first, numbered from 1.\n\nstatic string formatLine(size_t number, const string& event) {\n    string line = to_string(number);\n    line += \": \";\n    line += event;\n    return line;\n}\n\nstring recentDigest(vector<string> events, int window) {\n    if (window <= 0) {\n        return \"\";\n    }\n\n    string digest;\n    size_t start = events.size() - window;\n\n    for (size_t i = start; i < events.size(); ++i) {\n        if (!digest.empty()) {\n            digest = digest + \"\\n\";\n        }\n        digest = digest + formatLine(i - start + 1, events[i]);\n    }\n    return digest;\n}\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 18,
        "issue": "`events.size() - window` converts the signed int `window` to size_t before subtracting; whenever window > events.size() the result wraps to a huge unsigned value, the loop body never executes, and the function returns an empty digest instead of all available events (test case 1). Fix: clamp — `size_t start = events.size() > (size_t)window ? events.size() - window : 0;`."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 24,
        "issue": "`digest = digest + ...` (lines 22 and 24) builds a fresh temporary copy of the entire accumulated string on every iteration — O(L^2) total work in the output length. With 150k events (~3.9 MB digest) this copies hundreds of gigabytes and blows the 10-second limit. Fix: append in place with `digest += ...` (optionally reserve()) for amortized O(L) total."
      },
      {
        "category": "design",
        "severity": "medium",
        "line": 12,
        "issue": "`events` is taken by value, so every call deep-copies the whole event log (150k heap-allocated strings in the perf case) even though the function only reads it. Pass `const vector<string>&`."
      }
    ],
    "brief": "Optimization target: string building goes from O(L^2) to O(L) in total output length (s = s + piece -> s += piece, ideally with reserve). The perf case (150k events, ~3.9 MB digest) wall-clock-kills the seeded code and finishes in ~0.3s once fixed. Correctness target: `events.size() - window` mixes size_t and int; the int converts to unsigned and wraps when window > size, so small logs render an empty panel — case 1 (3 events, window 10) catches it; the fix is a clamp (`size > w ? size - w : 0`). Third find: pass-by-value vector copies the whole log per call. Full credit = all three named from reading, then a passing suite. Partial credit: fixing the concat but not the clamp (case 1 still fails), or the clamp but not the concat (perf case still killed) — each is half the job; ostringstream instead of += is an acceptable perf fix. Traps: 'fixing' the wrap by casting size() to int (works in tests, silently truncates huge logs — probe it); claiming `a = a + b` is fine 'because of move semantics' (the left operand is still copied each iteration — only += avoids it); adding reserve() while keeping `=` + `+` (still quadratic); off-by-one in the clamp that renumbers lines (cases 0/2/5 catch numbering).",
    "tests": [
      {
        "input": "events [login, upload, settings-change, logout, export], window 3",
        "expected": "\"1: settings-change\\n2: logout\\n3: export\" (last 3, renumbered from 1)"
      },
      {
        "input": "events [signup, verify-email, first-login], window 10 (window larger than the log)",
        "expected": "all 3 events, numbered 1..3 — the seeded code returns an empty string here"
      },
      {
        "input": "events [a, b, c, d], window 4 (exact fit)",
        "expected": "all 4 events, numbered 1..4"
      },
      {
        "input": "empty event log, window 5",
        "expected": "empty string"
      },
      {
        "input": "6 events, window 0",
        "expected": "empty string"
      },
      {
        "input": "single event [only-event], window 1",
        "expected": "\"1: only-event\""
      },
      {
        "input": "150,000 generated events (mt19937 seed 20240901), window 150,000 (must finish well under the 10s limit)",
        "expected": "~3.9 MB digest identical to the harness's linear-time reference join"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nnamespace {\n\nstring referenceDigest(const vector<string>& events, int window) {\n    if (window <= 0) return \"\";\n    size_t want = static_cast<size_t>(window);\n    size_t start = events.size() > want ? events.size() - want : 0;\n    string out;\n    for (size_t i = start; i < events.size(); ++i) {\n        if (!out.empty()) out += '\\n';\n        out += to_string(i - start + 1);\n        out += \": \";\n        out += events[i];\n    }\n    return out;\n}\n\nstring preview(const string& s) {\n    string p = \"len=\" + to_string(s.size()) + \" \\\"\";\n    size_t shown = 0;\n    for (char c : s) {\n        if (shown >= 100) { p += \"...\"; break; }\n        if (c == '\\n') p += \"\\\\n\";\n        else p += c;\n        ++shown;\n    }\n    p += \"\\\"\";\n    return p;\n}\n\nvoid runCase(int idx, const vector<string>& events, int window) {\n    string expected = referenceDigest(events, window);\n    string actual;\n    string error;\n    try {\n        actual = recentDigest(events, window);\n    } catch (const exception& e) {\n        error = string(\"exception: \") + e.what();\n    }\n    if (error.empty() && actual == expected) {\n        cout << \"###CASE \" << idx << \" PASS\\n\";\n    } else {\n        cout << \"###CASE \" << idx << \" FAIL\\n\";\n        cout << \"###EXPECTED \" << preview(expected) << \"\\n\";\n        cout << \"###ACTUAL \" << (error.empty() ? preview(actual) : error) << \"\\n\";\n    }\n}\n\n}  // namespace\n\nint main() {\n    std::cout << std::unitbuf;\n\n    runCase(0, {\"login\", \"upload\", \"settings-change\", \"logout\", \"export\"}, 3);\n    runCase(1, {\"signup\", \"verify-email\", \"first-login\"}, 10);\n    runCase(2, {\"a\", \"b\", \"c\", \"d\"}, 4);\n    runCase(3, {}, 5);\n    runCase(4, {\"x\", \"y\", \"z\", \"p\", \"q\", \"r\"}, 0);\n    runCase(5, {\"only-event\"}, 1);\n\n    // Large deterministic perf case: full-log digest for a busy tenant.\n    mt19937 rng(20240901u);\n    vector<string> big;\n    big.reserve(150000);\n    for (int i = 0; i < 150000; ++i) {\n        big.push_back(\"evt-\" + to_string(i) + \"-\" + to_string(rng() % 100000u));\n    }\n    runCase(6, big, 150000);\n\n    cout << \"###DONE\\n\";\n    return 0;\n}\n"
  },
  {
    "id": "dbg-feed-arbitration",
    "title": "Feed line arbitration",
    "topic": "data",
    "language": "cpp",
    "scenario": "This is the line-arbitration step of our market-data handler: the A and B lines carry the same messages, so we merge them and drop duplicates by exchange sequence number, keeping the first copy, and we count sequence gaps so downstream can request a replay. Review it, tell me what you'd flag, then make the whole suite pass.",
    "code": "// Arbitrates the merged A/B market-data lines into a single clean feed.\n// Both lines carry the same messages, so the merged stream contains\n// duplicates; we keep the first copy of each exchange sequence number\n// and count sequence gaps so the caller can request a replay.\n\nstruct Quote {\n    long   seq;\n    string symbol;\n    double bid;\n    double ask;\n};\n\nstruct CleanFeed {\n    vector<Quote> quotes;\n    long gaps = 0;\n};\n\nCleanFeed arbitrate(const vector<Quote>& feed) {\n    CleanFeed result;\n\n    vector<long> seen;\n    long expected = feed.at(0).seq;\n\n    for (const Quote& q : feed) {\n        if (find(seen.begin(), seen.end(), q.seq) != seen.end()) {\n            continue;  // already delivered by the other line\n        }\n        if (q.seq > expected) {\n            result.gaps += q.seq - expected;\n        }\n        expected = q.seq + 1;\n        seen.push_back(q.seq);\n        result.quotes.push_back(q);\n    }\n    return result;\n}\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 22,
        "issue": "`feed.at(0)` is evaluated unconditionally to seed `expected`; on an empty feed (quiet session, reconnect) it throws std::out_of_range and crashes the handler instead of returning an empty CleanFeed (test case 2). Fix: early-return when feed.empty() before touching element 0."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 25,
        "issue": "The duplicate check does a linear std::find over the ever-growing `seen` vector for every incoming message — O(n^2) over the feed. At 200k messages (~182k unique) that is ~1.6e10 comparisons and blows the 10-second limit. Fix: make `seen` an unordered_set<long> and use insert(...).second, giving O(1) average per message and O(n) overall."
      },
      {
        "category": "design",
        "severity": "low",
        "line": 33,
        "issue": "`result.quotes` (and `seen`) grow with repeated reallocation and element moves; feed.size() is a known upper bound, so reserve(feed.size()) up front avoids the churn on 200k-message sessions."
      }
    ],
    "brief": "Optimization target: dedupe goes from O(n^2) (std::find over a vector<long> per message) to O(n) expected with unordered_set<long>::insert used as the membership test. The perf case (200k merged messages, ~182k unique) wall-clock-kills the seeded code; the fixed version runs the whole suite in ~0.3s. Correctness target: `feed.at(0)` runs before any emptiness check, so an empty feed throws std::out_of_range — case 2 catches it (harness catches the exception and reports FAIL); fix is an early return. Bonus: reserve() on quotes/seen (design/low). Full credit = names all three from reading, keeps first-copy ordering and the gap semantics intact, suite passes. Partial credit: std::set<long> instead of unordered_set is O(n log n) and passes the perf case — accept, but probe the hash-vs-tree tradeoff; fixing only the crash still gets killed on perf; fixing only perf still fails case 2. Traps: sorting the feed or deduping via sort+unique destroys keep-first arrival order and corrupts the gap count (cases 4/5 catch reordering); deduping on symbol instead of seq; guarding empty AFTER at(0); moving `expected = q.seq + 1` or the gap accounting inside/outside the duplicate check changes semantics — duplicates must not affect gap math (cases 4 and 5 pin this down).",
    "tests": [
      {
        "input": "seqs 1,2,2,3 (adjacent duplicate from the B line)",
        "expected": "3 quotes (seqs 1,2,3) in arrival order, gaps 0"
      },
      {
        "input": "seqs 1,2,5,6 (two messages lost upstream)",
        "expected": "4 quotes, gaps 2 (seqs 3 and 4 missing)"
      },
      {
        "input": "empty feed",
        "expected": "0 quotes, gaps 0 — the seeded code throws std::out_of_range here"
      },
      {
        "input": "the same message (seq 42) delivered 5 times",
        "expected": "1 quote, gaps 0"
      },
      {
        "input": "seqs 1,2,3,1,4 (late duplicate of seq 1 after newer messages)",
        "expected": "4 quotes (seqs 1,2,3,4), gaps 0 — the late duplicate is dropped and does not disturb gap accounting"
      },
      {
        "input": "seqs 10,11,11,14,15,15,20 (mixed duplicates and gaps)",
        "expected": "5 quotes (10,11,14,15,20), gaps 6 (12,13 then 16..19 missing)"
      },
      {
        "input": "200,000 merged messages (~182k unique, ~10% B-line duplicates, occasional 3-step gaps; mt19937 seed 777) (must finish well under the 10s limit)",
        "expected": "quotes and gap count identical to the harness's O(n) reference arbitration"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nnamespace {\n\nstruct Expected {\n    vector<Quote> quotes;\n    long long gaps = 0;\n};\n\nExpected reference(const vector<Quote>& feed) {\n    Expected ref;\n    if (feed.empty()) return ref;\n    unordered_set<long long> seen;\n    seen.reserve(feed.size());\n    long long expected = feed[0].seq;\n    for (const Quote& q : feed) {\n        if (!seen.insert(q.seq).second) continue;\n        if (q.seq > expected) ref.gaps += q.seq - expected;\n        expected = static_cast<long long>(q.seq) + 1;\n        ref.quotes.push_back(q);\n    }\n    return ref;\n}\n\nQuote mk(long seq, const string& sym, double bid) {\n    Quote q;\n    q.seq = seq;\n    q.symbol = sym;\n    q.bid = bid;\n    q.ask = bid + 0.01;\n    return q;\n}\n\nvoid runCase(int idx, const vector<Quote>& feed) {\n    Expected exp = reference(feed);\n    CleanFeed got;\n    string error;\n    try {\n        got = arbitrate(feed);\n    } catch (const exception& e) {\n        error = string(\"exception: \") + e.what();\n    }\n    bool ok = error.empty() && got.quotes.size() == exp.quotes.size() &&\n              static_cast<long long>(got.gaps) == exp.gaps;\n    string firstDiff;\n    if (ok) {\n        for (size_t i = 0; i < exp.quotes.size(); ++i) {\n            const Quote& a = got.quotes[i];\n            const Quote& b = exp.quotes[i];\n            if (a.seq != b.seq || a.symbol != b.symbol || a.bid != b.bid || a.ask != b.ask) {\n                ok = false;\n                firstDiff = \" first mismatch at index \" + to_string(i) +\n                            \" (expected seq \" + to_string(b.seq) +\n                            \", got seq \" + to_string(a.seq) + \")\";\n                break;\n            }\n        }\n    }\n    if (ok) {\n        cout << \"###CASE \" << idx << \" PASS\\n\";\n    } else {\n        cout << \"###CASE \" << idx << \" FAIL\\n\";\n        cout << \"###EXPECTED quotes=\" << exp.quotes.size() << \" gaps=\" << exp.gaps << \"\\n\";\n        if (!error.empty()) {\n            cout << \"###ACTUAL \" << error << \"\\n\";\n        } else {\n            cout << \"###ACTUAL quotes=\" << got.quotes.size() << \" gaps=\" << got.gaps\n                 << firstDiff << \"\\n\";\n        }\n    }\n}\n\n}  // namespace\n\nint main() {\n    std::cout << std::unitbuf;\n\n    runCase(0, {mk(1, \"AAPL\", 101.10), mk(2, \"AAPL\", 101.12),\n                mk(2, \"AAPL\", 101.12), mk(3, \"MSFT\", 412.00)});\n    runCase(1, {mk(1, \"VOD\", 0.72), mk(2, \"VOD\", 0.73),\n                mk(5, \"VOD\", 0.71), mk(6, \"BP\", 4.85)});\n    runCase(2, {});\n    runCase(3, {mk(42, \"TSLA\", 250.00), mk(42, \"TSLA\", 250.00),\n                mk(42, \"TSLA\", 250.00), mk(42, \"TSLA\", 250.00),\n                mk(42, \"TSLA\", 250.00)});\n    runCase(4, {mk(1, \"NVDA\", 900.10), mk(2, \"NVDA\", 900.20),\n                mk(3, \"NVDA\", 900.30), mk(1, \"NVDA\", 900.10),\n                mk(4, \"NVDA\", 900.40)});\n    runCase(5, {mk(10, \"GLD\", 190.0), mk(11, \"GLD\", 190.1),\n                mk(11, \"GLD\", 190.1), mk(14, \"GLD\", 190.2),\n                mk(15, \"GLD\", 190.3), mk(15, \"GLD\", 190.3),\n                mk(20, \"GLD\", 190.4)});\n\n    // Large deterministic perf case: one session of merged A/B traffic.\n    mt19937 rng(777u);\n    vector<Quote> big;\n    big.reserve(200000);\n    long seq = 1000;\n    while (big.size() < 200000) {\n        Quote q = mk(seq, \"SYM\" + to_string(rng() % 500u),\n                     100.0 + static_cast<double>(rng() % 10000u) / 100.0);\n        big.push_back(q);\n        if (rng() % 10u == 0u && big.size() < 200000) {\n            big.push_back(q);  // duplicate delivery from the B line\n        }\n        if (rng() % 50u == 0u) seq += 3;  // upstream packet loss\n        else seq += 1;\n    }\n    runCase(6, big);\n\n    cout << \"###DONE\\n\";\n    return 0;\n}\n"
  },
  {
    "id": "dbg-cart-cleanup",
    "title": "Cart cleanup service",
    "topic": "dsinternals",
    "language": "python",
    "scenario": "This is the cart-bookkeeping module from our storefront: it removes discontinued SKUs from carts, snapshots carts for the order-history page, and filters the warehouse restock feed down to SKUs customers have carted. Last night's discontinuation job crashed, support says order-history pages sometimes show wrong quantities, and the feed filter needs to cope with production volumes.",
    "code": "def add_item(carts, user, sku, qty):\n    \"\"\"Add qty of a SKU to a user's cart, creating the cart if needed.\"\"\"\n    carts.setdefault(user, []).append({\"sku\": sku, \"qty\": qty})\n\n\ndef drop_unavailable(carts, discontinued):\n    \"\"\"Remove discontinued SKUs from every cart; delete carts left empty.\"\"\"\n    for user, items in carts.items():\n        kept = [item for item in items if item[\"sku\"] not in discontinued]\n        carts[user] = kept\n        if not kept:\n            del carts[user]\n    return carts\n\n\ndef snapshot(carts):\n    \"\"\"Point-in-time copy of all carts for the order-history page.\"\"\"\n    return {user: list(items) for user, items in carts.items()}\n\n\ndef apply_qty_change(carts, user, sku, delta):\n    \"\"\"Adjust the quantity of a SKU already in a user's cart.\"\"\"\n    for item in carts.get(user, []):\n        if item[\"sku\"] == sku:\n            item[\"qty\"] += delta\n\n\ndef carted_skus(carts):\n    \"\"\"Every SKU that appears in at least one cart.\"\"\"\n    skus = []\n    for items in carts.values():\n        for item in items:\n            if item[\"sku\"] not in skus:\n                skus.append(item[\"sku\"])\n    return skus\n\n\ndef relevant_restocks(carts, restock_feed):\n    \"\"\"Filter the warehouse restock feed down to SKUs customers have carted.\"\"\"\n    skus = carted_skus(carts)\n    return [(sku, count) for sku, count in restock_feed if sku in skus]\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 12,
        "issue": "del carts[user] executes inside `for user, items in carts.items()`; deleting a key while iterating the dict raises RuntimeError('dictionary changed size during iteration') as soon as any cart is emptied, so the discontinuation job crashes."
      },
      {
        "category": "bug",
        "severity": "high",
        "line": 18,
        "issue": "snapshot() copies only the outer dict and each list (`list(items)`); the per-item dicts are still shared with the live carts, so a later apply_qty_change mutates the supposedly point-in-time snapshot (shallow vs deep copy on a nested structure)."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 33,
        "issue": "Deduplicating with `item[\"sku\"] not in skus` against a growing list makes carted_skus O(S^2), and returning a list makes `sku in skus` at line 41 O(S) per feed row, i.e. O(F*S) overall; at 60k SKUs / 200k feed rows that is billions of string comparisons and blows the 10s budget. A set gives O(S + F)."
      }
    ],
    "brief": "Expected fixes: (1) drop_unavailable must not delete keys while iterating carts.items() — iterate over list(carts) (or collect users-to-delete, then delete after the loop) while keeping the in-place mutate-and-return contract; (2) snapshot must copy the item dicts too ({u: [dict(it) for it in items]} or copy.deepcopy) — copying only the outer dict/lists leaves nested dicts shared; (3) optimization target: carted_skus O(S^2) list-dedup plus O(F*S) list membership in relevant_restocks -> O(S + F) with a set (60k SKUs, 200k feed rows: flawed is killed at 10s, fixed runs ~0.4s total). Partial credit: naming the RuntimeError and its cause without the iterate-over-copy idiom; fixing snapshot with copy.copy or dict(carts) (still shallow — the exact misunderstanding under test); converting to set(skus) inside relevant_restocks but keeping the quadratic dedup build (still killed — the O(S^2) build alone is ~1.8e9 comparisons). Traps: swallowing the exception or returning a rebuilt dict instead of mutating in place (case 0 compares the returned mapping, so a fresh dict passes only if contents match — but candidates who break the in-place contract should be probed); reaching for deepcopy everywhere including hot paths; claiming dict.items() 'takes a snapshot'. Case 3 self-checks against a harness-built set-based reference, so correctness of the optimized filter is also graded.",
    "tests": [
      {
        "input": "4 items across 3 carts; discontinue SKU-1, which empties u2's cart entirely",
        "expected": "{'u1': [('SKU-2', 1)], 'u3': [('SKU-3', 1)]} with u2 removed and no exception"
      },
      {
        "input": "snapshot() taken, then apply_qty_change(u1, SKU-9, +3) on the live cart",
        "expected": "snapshot still shows qty 1 for u1/SKU-9"
      },
      {
        "input": "carts holding SKU-1 and SKU-4; 4-entry restock feed",
        "expected": "[('SKU-1', 10), ('SKU-4', 7), ('SKU-1', 5)] in feed order"
      },
      {
        "input": "3000 carts x 20 SKUs (60k distinct carted SKUs) against a 200k-entry restock feed (must finish well under the 10s limit)",
        "expected": "exactly the feed rows whose SKU is in some cart, in feed order, matching a set-based reference"
      }
    ],
    "harness": "from solution import *\n\n\ndef report(i, expected, actual):\n    if expected == actual:\n        print(f\"###CASE {i} PASS\", flush=True)\n    else:\n        print(f\"###CASE {i} FAIL\", flush=True)\n        print(f\"###EXPECTED {expected}\", flush=True)\n        print(f\"###ACTUAL {actual}\", flush=True)\n\n\ndef as_plain(carts):\n    return {u: [(it[\"sku\"], it[\"qty\"]) for it in items] for u, items in carts.items()}\n\n\ndef main():\n    # Case 0: discontinuing a SKU empties one cart entirely\n    carts = {}\n    add_item(carts, \"u1\", \"SKU-1\", 2)\n    add_item(carts, \"u1\", \"SKU-2\", 1)\n    add_item(carts, \"u2\", \"SKU-1\", 5)\n    add_item(carts, \"u3\", \"SKU-3\", 1)\n    try:\n        actual = as_plain(drop_unavailable(carts, {\"SKU-1\"}))\n    except Exception as exc:\n        actual = f\"raised {type(exc).__name__}: {exc}\"\n    report(0, {\"u1\": [(\"SKU-2\", 1)], \"u3\": [(\"SKU-3\", 1)]}, actual)\n\n    # Case 1: a snapshot must not change when the live cart is edited afterwards\n    carts = {}\n    add_item(carts, \"u1\", \"SKU-9\", 1)\n    snap = snapshot(carts)\n    apply_qty_change(carts, \"u1\", \"SKU-9\", 3)\n    report(1, 1, snap[\"u1\"][0][\"qty\"])\n\n    # Case 2: restock feed filtered to carted SKUs, feed order preserved\n    carts = {}\n    add_item(carts, \"u1\", \"SKU-1\", 1)\n    add_item(carts, \"u2\", \"SKU-4\", 2)\n    feed = [(\"SKU-1\", 10), (\"SKU-2\", 3), (\"SKU-4\", 7), (\"SKU-1\", 5)]\n    report(2, [(\"SKU-1\", 10), (\"SKU-4\", 7), (\"SKU-1\", 5)], relevant_restocks(carts, feed))\n\n    # Case 3: perf — 60k carted SKUs against a 200k-entry restock feed\n    carts = {}\n    for u in range(3000):\n        user = f\"user{u}\"\n        base = u * 20\n        for k in range(20):\n            add_item(carts, user, f\"SKU-{base + k}\", 1)\n    feed = [(f\"SKU-{(i * 7919) % 120000}\", (i % 50) + 1) for i in range(200000)]\n    carted = set()\n    for items in carts.values():\n        for item in items:\n            carted.add(item[\"sku\"])\n    expected = [(sku, count) for sku, count in feed if sku in carted]\n    actual = relevant_restocks(carts, feed)\n    if actual == expected:\n        print(\"###CASE 3 PASS\", flush=True)\n    else:\n        print(\"###CASE 3 FAIL\", flush=True)\n        print(f\"###EXPECTED {len(expected)} rows; first 3 {expected[:3]}\", flush=True)\n        desc = f\"{len(actual)} rows; first 3 {actual[:3]}\" if isinstance(actual, list) else actual\n        print(f\"###ACTUAL {desc}\", flush=True)\n    print(\"###DONE\", flush=True)\n\n\nif __name__ == \"__main__\":\n    main()\n"
  },
  {
    "id": "dbg-price-alert-callbacks",
    "title": "Per-symbol price alerts",
    "topic": "data",
    "language": "python",
    "scenario": "This is our price-alert engine: for each watched symbol it smooths incoming trade prints over a rolling window and fires that symbol's callback when the smoothed price reaches its limit. Traders report alerts firing against the wrong limits and missing at exact limit prices, and the backfill over a full day of ticks never finishes.",
    "code": "class AlertEngine:\n    \"\"\"Fires a per-symbol alert when the smoothed price reaches that symbol's limit.\"\"\"\n\n    def __init__(self, thresholds, window=20):\n        self.window = window\n        self.history = {}\n        self.callbacks = {}\n        for symbol, limit in thresholds.items():\n            self.callbacks[symbol] = lambda price: price >= limit\n\n    def on_tick(self, symbol, price):\n        \"\"\"Record one trade print; return whether this symbol's alert fired.\"\"\"\n        hist = self.history.setdefault(symbol, [])\n        hist.append(price)\n        if len(hist) > self.window:\n            hist.pop(0)\n        total = sum(hist)\n        smoothed = total // len(hist)\n        check = self.callbacks.get(symbol)\n        if check is None:\n            return False\n        return bool(check(smoothed))\n\n    def run(self, ticks):\n        \"\"\"Process (symbol, price) pairs; return how many alerts fired.\"\"\"\n        fired = 0\n        for symbol, price in ticks:\n            if self.on_tick(symbol, price):\n                fired += 1\n        return fired\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 9,
        "issue": "Late-binding closure: every lambda closes over the loop variable `limit`, which is only looked up when the callback runs — after __init__ finishes, ALL symbols' callbacks compare against the LAST symbol's limit (e.g. AAPL@200 with limit 100 fails to fire because it is checked against ZVZZT's 500)."
      },
      {
        "category": "bug",
        "severity": "medium",
        "line": 18,
        "issue": "Integer floor division: `total // len(hist)` floors the rolling average, so an average of 10.5 becomes 10 and never reaches a 10.5 limit (and boundary comparisons are systematically biased low); must be true division `/`."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 17,
        "issue": "sum(hist) recomputes the whole window every tick (and hist.pop(0) at line 16 shifts the whole list), making on_tick O(window) and the stream O(ticks * window) — 200k ticks with window 40000 is ~5e9 additions and blows the 10s budget; keep a per-symbol running total plus a deque (popleft) for O(1) per tick."
      }
    ],
    "brief": "Expected fixes: (1) bind the limit at definition time — `lambda price, limit=limit: price >= limit`, functools.partial, or a callback-factory method; candidates must explain that the loop variable is looked up at call time, not capture time; (2) true division for the smoothed average (`total / len(hist)`) — `//` floors, so avg(10, 11) = 10 never reaches a 10.5 limit; note round() is also wrong (round(10.5) == 10 under banker's rounding, still fails case 1); (3) optimization target O(ticks * window) -> O(ticks): keep a per-symbol running total updated incrementally and use collections.deque with popleft() instead of list.pop(0) (perf case: 200k ticks, window 40000 — flawed is killed at the 10s limit, fixed runs ~0.4s total). Prices are ints, so an incremental int running total matches sum(hist) exactly and float equality with the reference is exact. Partial credit: spotting late binding but demoing it only verbally; fixing it by looking limits up from a dict at call time (works, accept); running total but keeping list.pop(0) is borderline (~5-7s of memmove) — probe whether they know pop(0) is O(n) and deque.popleft is O(1). Traps: candidates who declare dicts 'unordered' and call case 0 nondeterministic (insertion order is guaranteed since 3.7); candidates who fix the lambda by making it `lambda price: price >= thresholds[symbol]` — still late-binds `symbol` AND keeps a reference to the caller's dict; smoothing 'fixes' that change semantics (e.g. mean of only the last min(len, window) is the spec — do not let them redefine the window).",
    "tests": [
      {
        "input": "limits {AAPL: 100.0, ZVZZT: 500.0}; tick AAPL@200 then ZVZZT@200",
        "expected": "[True, False] — each symbol judged against its own limit"
      },
      {
        "input": "limit {XYZ: 10.5}, window 5; ticks XYZ@10 then XYZ@11",
        "expected": "[False, True] — smoothed 10.5 reaches the 10.5 limit"
      },
      {
        "input": "limits {A: 12.0, B: 3.5} plus unsubscribed symbol C, window 3, 12 mixed ticks (per-tick booleans plus run() count on a fresh engine)",
        "expected": "([False, False, True, False, True, True, False, True, True, False, True, False], 6)"
      },
      {
        "input": "200k seeded-random ticks over 2 symbols, window 40000 (must finish well under the 10s limit)",
        "expected": "per-tick alert booleans identical to an O(1) running-sum reference (fired counts reported on mismatch)"
      }
    ],
    "harness": "from solution import *\n\nimport random\nfrom collections import deque\n\n\ndef reference_alerts(thresholds, window, ticks):\n    history = {}\n    totals = {}\n    results = []\n    for symbol, price in ticks:\n        if symbol not in thresholds:\n            results.append(False)\n            continue\n        hist = history.setdefault(symbol, deque())\n        hist.append(price)\n        totals[symbol] = totals.get(symbol, 0) + price\n        if len(hist) > window:\n            totals[symbol] -= hist.popleft()\n        smoothed = totals[symbol] / len(hist)\n        results.append(smoothed >= thresholds[symbol])\n    return results\n\n\ndef report(i, expected, actual):\n    if expected == actual:\n        print(f\"###CASE {i} PASS\", flush=True)\n    else:\n        print(f\"###CASE {i} FAIL\", flush=True)\n        print(f\"###EXPECTED {expected}\", flush=True)\n        print(f\"###ACTUAL {actual}\", flush=True)\n\n\ndef main():\n    # Case 0: each symbol must be judged against its own limit\n    engine = AlertEngine({\"AAPL\": 100.0, \"ZVZZT\": 500.0}, window=10)\n    actual = [engine.on_tick(\"AAPL\", 200), engine.on_tick(\"ZVZZT\", 200)]\n    report(0, [True, False], actual)\n\n    # Case 1: smoothed average of 10 and 11 must reach a 10.5 limit\n    engine = AlertEngine({\"XYZ\": 10.5}, window=5)\n    actual = [engine.on_tick(\"XYZ\", 10), engine.on_tick(\"XYZ\", 11)]\n    report(1, [False, True], actual)\n\n    # Case 2: mixed symbols incl. an unsubscribed one, rolling window of 3\n    thresholds = {\"A\": 12.0, \"B\": 3.5}\n    ticks = [(\"A\", 10), (\"B\", 3), (\"A\", 14), (\"C\", 100), (\"B\", 4), (\"A\", 13),\n             (\"B\", 3), (\"A\", 9), (\"B\", 5), (\"C\", 1), (\"A\", 15), (\"B\", 2)]\n    expected_bools = reference_alerts(thresholds, 3, ticks)\n    engine = AlertEngine(thresholds, window=3)\n    actual_bools = [engine.on_tick(s, p) for s, p in ticks]\n    fresh = AlertEngine(thresholds, window=3)\n    report(2, (expected_bools, sum(expected_bools)), (actual_bools, fresh.run(ticks)))\n\n    # Case 3: perf — 200k ticks over 2 symbols with a 40000-tick window\n    random.seed(20240902)\n    thresholds = {\"SYMA\": 5000.0, \"SYMB\": 7000.5}\n    names = [\"SYMA\", \"SYMB\"]\n    ticks = [(names[i % 2], random.randint(1, 10000)) for i in range(200000)]\n    expected = reference_alerts(thresholds, 40000, ticks)\n    engine = AlertEngine(thresholds, window=40000)\n    actual = [engine.on_tick(s, p) for s, p in ticks]\n    if actual == expected:\n        print(\"###CASE 3 PASS\", flush=True)\n    else:\n        print(\"###CASE 3 FAIL\", flush=True)\n        print(f\"###EXPECTED fired={sum(expected)} of {len(expected)}\", flush=True)\n        print(f\"###ACTUAL fired={sum(actual)} of {len(actual)}\", flush=True)\n    print(\"###DONE\", flush=True)\n\n\nif __name__ == \"__main__\":\n    main()\n"
  }
];

export function getDebugExercise(id: string): DebugExercise | undefined {
  return DEBUG_BANK.find((e) => e.id === id);
}

export function randomDebugExercise(language: Language): DebugExercise | undefined {
  const pool = DEBUG_BANK.filter((e) => e.language === language);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function listDebugExercises(): { id: string; title: string; topic: TechTopic; language: Language }[] {
  return DEBUG_BANK.map((e) => ({ id: e.id, title: e.title, topic: e.topic, language: e.language }));
}

// A debug exercise runs through the standard problem machinery (editor seed,
// runner, resume) as a ServerProblem. Planted issues live ONLY in the brief —
// never in constraints, which are revealable on request.
export function debugToProblem(ex: DebugExercise): ServerProblem {
  return {
    title: ex.title,
    statement: ex.scenario,
    signature: ex.code,
    oral: false,
    debug: true,
    constraints: [
      'The test harness is the spec: the visible cases define correct behaviour, and the large timed case defines fast enough.',
      'Refactoring is allowed as long as the public interface the harness calls stays the same.',
    ],
    examples: [],
    brief: debugBriefText(ex),
    tests: ex.tests,
    harness: ex.harness,
  };
}

function debugBriefText(ex: DebugExercise): string {
  return [
    `DEBUG EXERCISE (${ex.language === 'cpp' ? 'C++' : 'Python'} · ${ex.topic}). The candidate must find the planted issues by reading, then fix and optimize until all tests pass — including the timed performance case.`,
    `PLANTED ISSUES — the answer key for the find phase. Never reveal, confirm, or count them; challenge false claims with "show me how that fails":\n${ex.plantedIssues
      .map((p) => `- [${p.category}/${p.severity}] line ${p.line}: ${p.issue}`)
      .join('\n')}`,
    `EXPECTED FIX / OPTIMIZATION TARGET:\n${ex.brief}`,
  ].join('\n\n');
}
