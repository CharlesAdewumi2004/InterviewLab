import type { Language, TechTopic } from '../../../shared/protocol';
import { languageMeta } from '../../../shared/languages';
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
  },
  {
    "id": "dbg-session-store-cleanup",
    "title": "Session store nightly cleanup",
    "topic": "dsinternals",
    "language": "python",
    "scenario": "This is the nightly maintenance job for our dashboard's session store: it takes an audit snapshot, purges expired sessions, and strips blacklisted telemetry codes from the surviving sessions' event lists. It has been flaky in production and the large-store run never finishes — take a look.",
    "code": "def snapshot_sessions(sessions):\n    \"\"\"Point-in-time copy of the session store, kept for the audit log.\"\"\"\n    return dict(sessions)\n\n\ndef purge_expired(sessions, now):\n    \"\"\"Delete sessions whose expiry has passed. Return the ids removed.\"\"\"\n    removed = []\n    for sid in sessions:\n        if sessions[sid][\"expires_at\"] <= now:\n            del sessions[sid]\n            removed.append(sid)\n    return removed\n\n\ndef drop_blacklisted_events(events, blacklist):\n    \"\"\"Strip blacklisted event codes from an event list, keeping order.\"\"\"\n    for ev in events:\n        if ev in blacklist:\n            events.remove(ev)\n    return events\n\n\ndef cleanup(sessions, now, blacklist):\n    \"\"\"Nightly maintenance: snapshot the store for the audit log, purge dead\n    sessions, then scrub blacklisted event codes from the survivors.\"\"\"\n    audit = snapshot_sessions(sessions)\n    removed = purge_expired(sessions, now)\n    for sid in sessions:\n        sessions[sid][\"events\"] = drop_blacklisted_events(sessions[sid][\"events\"], blacklist)\n    return audit, removed\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 11,
        "issue": "purge_expired deletes keys from `sessions` while iterating the dict (`for sid in sessions` + `del sessions[sid]`); Python raises RuntimeError('dictionary changed size during iteration'), so any run with at least one expired session crashes. Fix: collect the expired ids first (or iterate over list(sessions.items())), then delete."
      },
      {
        "category": "bug",
        "severity": "high",
        "line": 3,
        "issue": "snapshot_sessions uses dict(sessions) — a shallow copy. The nested session dicts and their event lists stay shared with the live store, so later in-place mutations (event scrubbing, field updates) silently rewrite the audit snapshot. Needs copy.deepcopy(sessions)."
      },
      {
        "category": "bug",
        "severity": "medium",
        "line": 20,
        "issue": "drop_blacklisted_events calls events.remove() while iterating the same list; each removal shifts the tail left, so the element after every removed one is never examined — consecutive blacklisted codes silently survive (e.g. [7, 4, 4, 9, ...] with blacklist [4] keeps stray 4s)."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 19,
        "issue": "Every event does an O(m) membership scan of the blacklist *list*, and every hit triggers an O(n) list.remove scan-and-shift — overall O(n*m + k*n), effectively quadratic. The 400k-event perf case extrapolates to ~290s and is killed at 10s. Rebuild once: blocked = set(blacklist) plus a single list comprehension → O(n + m)."
      }
    ],
    "brief": "Expected fixes: (1) purge_expired must not delete dict keys mid-iteration — collect expired ids first, then delete (fixes the RuntimeError in cases 0 and 3); (2) snapshot_sessions must use copy.deepcopy — dict() shares nested dicts/lists, so cases 1 and 3 catch the audit snapshot being mutated after the fact (case 3 checks audit['b']['events'] survives the scrub, which traps copy.copy()/dict.copy() half-fixes too); (3) drop_blacklisted_events must be rebuilt as blocked = set(blacklist) plus one ordered list comprehension. Optimization target: O(n*m + k*n) ~ O(n^2) -> O(n + m); the 400k-event case 4 kills the planted version at 10s (measured extrapolation ~290s) while the fixed one finishes the whole suite in ~0.4s. Partial credit: iterating over events[:] or list(events) with .remove is correct but still O(k*n) — case 4 still dies; converting only the blacklist to a set but keeping .remove also still dies; spotting the RuntimeError but 'fixing' it with list(sessions) while leaving the shallow snapshot (case 1 still fails). Traps candidates fall into: believing dict(sessions) is a real copy because top-level deletes don't propagate to it; testing the scrub only with non-adjacent blacklisted codes, where the skip-after-remove bug is invisible; forgetting that the fixed drop_blacklisted_events may return a new list, so cleanup must keep the reassignment (the given cleanup already does).",
    "tests": [
      {
        "input": "4-session store purged at now=200; s1 (expires 100) and s3 (expires 150) are expired",
        "expected": "removed == ['s1','s3'] and store keeps ['s2','s4'], with no exception raised"
      },
      {
        "input": "snapshot a 2-session store, then append event 99 to s1's events and change s2's user in the live store",
        "expected": "snapshot unchanged: snap['s1']['events'] == [10, 11] and snap['s2']['user'] == 'bo'"
      },
      {
        "input": "events = [7, 4, 4, 9, 4, 4, 4, 2] with blacklist [4] (consecutive blacklisted codes)",
        "expected": "[7, 9, 2] — every 4 removed, order preserved"
      },
      {
        "input": "full cleanup(): 3 sessions, 'a' expired, blacklist [2]; checks removed ids, scrubbed live events, and audit integrity",
        "expected": "removed == ['a'], live b.events == [5], audit keeps a.events == [1,2,2,3] and b.events == [2,2,5]"
      },
      {
        "input": "perf: 400k events (i % 1000) scrubbed against a 500-code blacklist passed as a list (must finish well under the 10s limit)",
        "expected": "the 200,000 odd-coded events in original order (harness computes this closed-form parity reference itself)"
      }
    ],
    "harness": "from solution import *\n\n\ndef _short(v):\n    r = repr(v)\n    return r if len(r) <= 300 else r[:300] + f\" ...({len(r)} chars)\"\n\n\ndef run_case(idx, fn):\n    try:\n        expected, actual = fn()\n    except Exception as exc:\n        print(f\"###CASE {idx} FAIL\", flush=True)\n        print(\"###EXPECTED normal return\", flush=True)\n        print(f\"###ACTUAL raised {type(exc).__name__}: {exc}\", flush=True)\n        return\n    if expected == actual:\n        print(f\"###CASE {idx} PASS\", flush=True)\n    else:\n        print(f\"###CASE {idx} FAIL\", flush=True)\n        print(f\"###EXPECTED {_short(expected)}\", flush=True)\n        print(f\"###ACTUAL {_short(actual)}\", flush=True)\n\n\ndef case0():\n    sessions = {\n        \"s1\": {\"expires_at\": 100, \"events\": [1], \"user\": \"ana\"},\n        \"s2\": {\"expires_at\": 300, \"events\": [2], \"user\": \"bo\"},\n        \"s3\": {\"expires_at\": 150, \"events\": [3], \"user\": \"cy\"},\n        \"s4\": {\"expires_at\": 500, \"events\": [4], \"user\": \"di\"},\n    }\n    removed = purge_expired(sessions, 200)\n    expected = ([\"s1\", \"s3\"], [\"s2\", \"s4\"])\n    actual = (sorted(removed), sorted(sessions))\n    return expected, actual\n\n\ndef case1():\n    sessions = {\n        \"s1\": {\"expires_at\": 100, \"events\": [10, 11], \"user\": \"ana\"},\n        \"s2\": {\"expires_at\": 300, \"events\": [20], \"user\": \"bo\"},\n    }\n    snap = snapshot_sessions(sessions)\n    sessions[\"s1\"][\"events\"].append(99)\n    sessions[\"s2\"][\"user\"] = \"eve\"\n    expected = ([10, 11], \"bo\")\n    actual = (snap[\"s1\"][\"events\"], snap[\"s2\"][\"user\"])\n    return expected, actual\n\n\ndef case2():\n    events = [7, 4, 4, 9, 4, 4, 4, 2]\n    expected = [7, 9, 2]\n    actual = drop_blacklisted_events(events, [4])\n    return expected, actual\n\n\ndef case3():\n    sessions = {\n        \"a\": {\"expires_at\": 50, \"events\": [1, 2, 2, 3], \"user\": \"u1\"},\n        \"b\": {\"expires_at\": 900, \"events\": [2, 2, 5], \"user\": \"u2\"},\n        \"c\": {\"expires_at\": 900, \"events\": [5, 6], \"user\": \"u3\"},\n    }\n    audit, removed = cleanup(sessions, 100, [2])\n    expected = ([\"a\"], [5], [1, 2, 2, 3], [2, 2, 5], [\"b\", \"c\"])\n    actual = (\n        removed,\n        sessions[\"b\"][\"events\"],\n        audit[\"a\"][\"events\"],\n        audit[\"b\"][\"events\"],\n        sorted(sessions),\n    )\n    return expected, actual\n\n\ndef case4():\n    events = [i % 1000 for i in range(400_000)]\n    blacklist = list(range(0, 1000, 2))\n    expected = [v for v in events if v % 2 == 1]\n    actual = drop_blacklisted_events(list(events), blacklist)\n    return expected, actual\n\n\ndef main():\n    for idx, fn in enumerate([case0, case1, case2, case3, case4]):\n        run_case(idx, fn)\n    print(\"###DONE\", flush=True)\n\n\nmain()\n"
  },
  {
    "id": "dbg-metrics-window-buffer",
    "title": "Metrics window buffer",
    "topic": "memory",
    "language": "cpp",
    "scenario": "This is the buffer our metrics aggregator fills for each reporting window. A teammate recently added a path that duplicates a window before unit conversion, and since then some downstream aggregates have been coming out wrong.",
    "code": "// Growable buffer of metric samples for one reporting window.\n// The aggregation service appends raw samples as they arrive, then\n// scales them into canonical units before rollup.\nclass SampleBuffer {\npublic:\n    SampleBuffer() : data_(nullptr), size_(0), capacity_(0) {}\n\n    explicit SampleBuffer(size_t initialCapacity)\n        : data_(new double[initialCapacity]),\n          size_(0),\n          capacity_(initialCapacity) {}\n\n    ~SampleBuffer() { delete[] data_; }\n\n    void append(double sample) {\n        if (size_ == capacity_) {\n            size_t grown = capacity_ + 1;\n            double* next = new double[grown];\n            for (size_t i = 0; i < size_; ++i) {\n                next[i] = data_[i];\n            }\n            delete[] data_;\n            data_ = next;\n            capacity_ = grown;\n        }\n        data_[size_++] = sample;\n    }\n\n    // In-place unit conversion, e.g. milliseconds -> seconds.\n    void scale(double factor) {\n        for (size_t i = 0; i < size_; ++i) {\n            data_[i] *= factor;\n        }\n    }\n\n    double at(size_t index) const { return data_[index]; }\n\n    double sum() const {\n        double total = 0.0;\n        for (size_t i = 0; i < size_; ++i) {\n            total += data_[i];\n        }\n        return total;\n    }\n\n    size_t size() const { return size_; }\n    const double* data() const { return data_; }\n\nprivate:\n    double* data_;\n    size_t size_;\n    size_t capacity_;\n};\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 13,
        "issue": "The class owns a raw new[] buffer and defines a destructor but no copy constructor (rule-of-three violation): the compiler-generated copy shallow-copies data_, so a copy aliases the original's buffer — mutating the copy contaminates the original, and destroying both objects double-frees the buffer."
      },
      {
        "category": "bug",
        "severity": "high",
        "line": 4,
        "issue": "No user-defined copy assignment operator either: default memberwise assignment makes the target alias the source's buffer and leaks the target's previously owned allocation, with the same aliasing/double-free consequences on destruction."
      },
      {
        "category": "perf",
        "severity": "medium",
        "line": 17,
        "issue": "append() grows capacity by exactly one element, reallocating and copying the entire buffer on every append once full — n appends cost O(n^2) copied elements; geometric growth (e.g. doubling) gives O(n) amortized."
      }
    ],
    "brief": "The class owns a raw new[] buffer and defines a destructor but neither copy constructor nor copy assignment (rule of three), so compiler-generated members shallow-copy data_. Case 1 detects copy-construction aliasing via data() pointer identity plus contamination of the original after copy->scale(3); case 2 detects assignment aliasing the same way. Expected fix: deep-copying copy constructor AND copy assignment (self-assignment safe; copy-and-swap ideal) — or replacing the raw buffer with std::vector<double>, fully acceptable since the public API is preserved. Optimization target: append() grows capacity by +1, making n appends O(n^2) -> O(n) amortized with geometric (2x) growth; case 3 (500k appends) cannot pass the 10s kill without it. Partial credit: fixing only the copy constructor (case 2 still fails); a deep operator= that leaks the old buffer or breaks on self-assignment (harness will not catch those — probe verbally). Traps: doubling capacity from 0 (0*2 == 0 gives an infinite loop — must seed a nonzero capacity); 'fixing' case 1 by weakening scale() instead of the copy semantics; strong candidates also notice the harness deliberately skips deleting an aliased copy — ask them why (without that guard the shallow copy would double-free and crash the run).",
    "tests": [
      {
        "input": "append 1.5, 3.0, 4.5, 6.0, 7.5, 9.0 to an empty buffer",
        "expected": "size() == 6 and at(k) == 1.5*(k+1) for every k"
      },
      {
        "input": "copy-construct from an 8-sample buffer holding 10..17, then scale the copy by 3",
        "expected": "copy owns distinct storage (data() pointers differ) and the original still reads 10..17"
      },
      {
        "input": "assign a 5-sample buffer over a buffer that already holds one sample",
        "expected": "target matches the source's 5 values in its own storage"
      },
      {
        "input": "500k random appends, fixed seed 20260902 (must finish well under the 10s limit)",
        "expected": "size() == 500000 and sum() equals the harness-computed running total"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nstatic int failures = 0;\n\nstatic void report(int idx, bool pass, const std::string& expected, const std::string& actual) {\n    if (pass) {\n        std::cout << \"###CASE \" << idx << \" PASS\\n\";\n    } else {\n        std::cout << \"###CASE \" << idx << \" FAIL\\n\";\n        std::cout << \"###EXPECTED \" << expected << \"\\n\";\n        std::cout << \"###ACTUAL \" << actual << \"\\n\";\n        ++failures;\n    }\n}\n\nint main() {\n    std::cout << std::unitbuf;\n\n    // Case 0: append then read back.\n    {\n        SampleBuffer buf;\n        for (int i = 1; i <= 6; ++i) buf.append(i * 1.5);\n        bool ok = buf.size() == 6;\n        for (size_t i = 0; ok && i < 6; ++i) {\n            ok = buf.at(i) == (i + 1) * 1.5;\n        }\n        report(0, ok, \"6 samples, buf.at(k) == 1.5*(k+1)\",\n               std::to_string(buf.size()) + \" samples, first=\" +\n                   std::to_string(buf.size() ? buf.at(0) : 0.0));\n    }\n\n    // Case 1: a copy owns its own storage; mutating it leaves the source alone.\n    {\n        SampleBuffer original;\n        for (int i = 0; i < 8; ++i) original.append(10.0 + i);\n\n        SampleBuffer* copy = new SampleBuffer(original);\n        bool distinct = copy->data() != original.data();\n        copy->scale(3.0);\n        bool sourceIntact = original.at(0) == 10.0 && original.at(7) == 17.0;\n        // Reclaim the copy only if it owns separate storage; freeing shared\n        // storage here would also tear down `original` mid-test.\n        if (distinct) delete copy;\n        report(1, distinct && sourceIntact,\n               \"copy has its own buffer; original unchanged after copy->scale(3)\",\n               std::string(distinct ? \"distinct buffers\" : \"copy aliases the original buffer\") +\n                   \", original.at(0)=\" + std::to_string(original.at(0)));\n    }\n\n    // Case 2: copy assignment replaces contents and stays independent.\n    {\n        SampleBuffer source;\n        for (int i = 0; i < 5; ++i) source.append(2.0 * i + 1.0);\n\n        SampleBuffer* target = new SampleBuffer(4);\n        target->append(99.0);\n        *target = source;\n        bool distinct = target->data() != source.data();\n        bool contentOk = target->size() == 5;\n        for (size_t i = 0; contentOk && i < 5; ++i) {\n            contentOk = target->at(i) == source.at(i);\n        }\n        if (distinct) delete target;\n        report(2, distinct && contentOk,\n               \"assigned copy matches source values in its own buffer\",\n               std::string(distinct ? \"distinct buffers\" : \"target aliases the source buffer\") +\n                   (contentOk ? \", contents match\" : \", contents differ\"));\n    }\n\n    // Case 3: 500000 appends stay fast and preserve every sample.\n    {\n        std::mt19937 rng(20260902u);\n        std::uniform_int_distribution<int> dist(0, 999);\n        const size_t kCount = 500000;\n        SampleBuffer buf;\n        double expected = 0.0;\n        for (size_t i = 0; i < kCount; ++i) {\n            double v = static_cast<double>(dist(rng));\n            expected += v;\n            buf.append(v);\n        }\n        bool ok = buf.size() == kCount && buf.sum() == expected;\n        report(3, ok,\n               \"500000 samples, sum \" + std::to_string(expected),\n               std::to_string(buf.size()) + \" samples, sum \" +\n                   std::to_string(buf.size() ? buf.sum() : 0.0));\n    }\n\n    std::cout << \"###DONE\" << std::endl;\n    return failures == 0 ? 0 : 1;\n}\n"
  },
  {
    "id": "dbg-sensor-reading-chain",
    "title": "Sensor reading chain",
    "topic": "memory",
    "language": "cpp",
    "scenario": "This chain holds the sensor readings our edge collector accumulates for each uplink window; a fresh snapshot replaces the chain and the result gets serialized for the uplink. The integration suite started failing, and ops has an open ticket about the collector's memory footprint growing over the day.",
    "code": "// Ordered chain of sensor readings for one uplink window. serialize() emits\n// the packed blob the uplink expects: a 4-byte record count, then one\n// 10-byte record per node (the 2-byte sensor id, then the 8-byte reading).\n\nstruct Reading {\n    uint16_t sensorId;\n    double value;\n};\n\nstruct ChainNode {\n    uint16_t sensorId;\n    double value;\n    ChainNode* next;\n    static inline size_t liveCount = 0;  // heap-usage gauge for the ops dashboard\n\n    ChainNode(uint16_t id, double v) : sensorId(id), value(v), next(nullptr) { ++liveCount; }\n    ~ChainNode() { --liveCount; }\n};\n\nclass SensorChain {\npublic:\n    SensorChain() : head_(nullptr), size_(0) {}\n\n    ~SensorChain() {\n        while (head_ != nullptr) {\n            ChainNode* next = head_->next;\n            delete head_;\n            head_ = next;\n        }\n    }\n\n    void append(uint16_t sensorId, double value) {\n        ChainNode** slot = &head_;\n        while (*slot != nullptr) slot = &(*slot)->next;\n        *slot = new ChainNode(sensorId, value);\n        ++size_;\n    }\n\n    // A fresh snapshot replaces everything currently held.\n    void rebuild(const std::vector<Reading>& snapshot) {\n        head_ = nullptr;\n        size_ = 0;\n        for (const Reading& r : snapshot) append(r.sensorId, r.value);\n    }\n\n    std::vector<unsigned char> serialize() const {\n        struct WireRecord { uint16_t sensorId; double value; };\n        std::vector<unsigned char> out(sizeof(uint32_t) + size_ * sizeof(WireRecord));\n        uint32_t count = static_cast<uint32_t>(size_);\n        std::memcpy(out.data(), &count, sizeof(count));\n        size_t offset = sizeof(count);\n        for (ChainNode* cur = head_; cur != nullptr; cur = cur->next) {\n            WireRecord rec{cur->sensorId, cur->value};\n            std::memcpy(out.data() + offset, &rec, sizeof(rec));\n            offset += sizeof(rec);\n        }\n        return out;\n    }\n\n    size_t size() const { return size_; }\n    const ChainNode* head() const { return head_; }\n\nprivate:\n    ChainNode* head_;\n    size_t size_;\n};\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 41,
        "issue": "rebuild() overwrites head_ with nullptr without freeing the existing nodes, leaking the entire previous chain on every snapshot; ChainNode::liveCount (and the process footprint) grows unbounded across rebuilds and the destructor can never reclaim the stranded nodes."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 34,
        "issue": "append() finds the tail by walking the whole chain from head_ on every insertion, so rebuilding an n-reading snapshot costs O(n^2) pointer traversals; maintaining a tail pointer makes each append O(1) and rebuild O(n)."
      },
      {
        "category": "design",
        "severity": "medium",
        "line": 54,
        "issue": "serialize() memcpys the whole WireRecord assuming sizeof == 10 (2-byte id + 8-byte double), but alignment padding makes sizeof(WireRecord) 16, so six padding bytes per record are baked into the blob and the documented 10-byte packed wire format is violated — sizeof(struct) must never define a serialized layout."
      }
    ],
    "brief": "Three planted problems. (1) Leak: rebuild() nulls head_ without freeing the existing chain, stranding every previous node — case 1 catches it via the ChainNode::liveCount instrumentation (flawed run shows 8 live after rebuild instead of 2, and 6 still live after destruction). Fix: free the old chain first, ideally by factoring a clear() shared with the destructor. (2) Perf: append() walks from head_ on every call, so rebuilding an n-reading snapshot is O(n^2) -> O(n) with a maintained tail pointer; case 3 (200k readings) is killed at the 10s limit without this fix. Watch that clear()/rebuild also resets the tail pointer — a stale tail after clear corrupts the next chain. (3) Design: serialize() memcpys a {uint16_t, double} struct whose sizeof is 16 due to alignment padding while the documented wire format is 10-byte packed records; case 2 checks blob size (52 vs 34 in the flawed run) and field values at 10-byte strides. Expected fix: write the two fields individually at packed offsets. '#pragma pack(1)' also passes — accept it but probe portability/ABI implications; changing the format to 16-byte records is wrong (the harness enforces the documented packed spec). Partial credit: fixing the leak but missing the tail pointer (perf case still killed), or spotting the padding without articulating that sizeof(struct) must never define a wire format.",
    "tests": [
      {
        "input": "append readings (7, 1.25), (9, -4.5), (3, 2.0), then destroy the chain",
        "expected": "nodes read back in arrival order; ChainNode::liveCount is 0 after destruction"
      },
      {
        "input": "build a 6-node chain, rebuild() from a 2-reading snapshot, then destroy the chain",
        "expected": "2 live nodes after rebuild and 0 after destruction, with the snapshot's readings in order"
      },
      {
        "input": "serialize a 3-reading chain (ids 258, 41, 999)",
        "expected": "34-byte blob: 4-byte count of 3, then three 10-byte packed records with matching fields"
      },
      {
        "input": "200k random ops: rebuild from a 200000-reading snapshot then serialize, fixed seed 424242 (must finish well under the 10s limit)",
        "expected": "200000 nodes, chain sum equals the harness-computed total, blob is exactly 2000004 bytes"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nstatic int failures = 0;\n\nstatic void report(int idx, bool pass, const std::string& expected, const std::string& actual) {\n    if (pass) {\n        std::cout << \"###CASE \" << idx << \" PASS\\n\";\n    } else {\n        std::cout << \"###CASE \" << idx << \" FAIL\\n\";\n        std::cout << \"###EXPECTED \" << expected << \"\\n\";\n        std::cout << \"###ACTUAL \" << actual << \"\\n\";\n        ++failures;\n    }\n}\n\nstatic double chainSum(const SensorChain& chain) {\n    double sum = 0.0;\n    for (const ChainNode* cur = chain.head(); cur != nullptr; cur = cur->next) {\n        sum += cur->value;\n    }\n    return sum;\n}\n\nint main() {\n    std::cout << std::unitbuf;\n\n    // Case 0: append keeps arrival order; destruction releases every node.\n    {\n        bool ok = true;\n        std::string actual = \"ok\";\n        {\n            SensorChain chain;\n            chain.append(7, 1.25);\n            chain.append(9, -4.5);\n            chain.append(3, 2.0);\n            const uint16_t ids[3] = {7, 9, 3};\n            const double vals[3] = {1.25, -4.5, 2.0};\n            const ChainNode* cur = chain.head();\n            size_t i = 0;\n            for (; cur != nullptr && i < 3; cur = cur->next, ++i) {\n                if (cur->sensorId != ids[i] || cur->value != vals[i]) {\n                    ok = false;\n                    actual = \"wrong node at index \" + std::to_string(i);\n                }\n            }\n            if (chain.size() != 3 || i != 3 || cur != nullptr) {\n                ok = false;\n                actual = \"chain length wrong\";\n            }\n        }\n        if (ChainNode::liveCount != 0) {\n            ok = false;\n            actual = std::to_string(ChainNode::liveCount) + \" nodes still live\";\n        }\n        report(0, ok, \"3 ordered nodes while alive, 0 live nodes after destruction\", actual);\n    }\n\n    // Case 1: rebuild() replaces the chain without stranding old nodes.\n    {\n        size_t liveAfterRebuild = 0;\n        bool contentOk = true;\n        {\n            SensorChain chain;\n            for (int i = 0; i < 6; ++i) chain.append(static_cast<uint16_t>(i), 1.0 * i);\n            std::vector<Reading> snapshot = {{100, 5.0}, {101, 6.5}};\n            chain.rebuild(snapshot);\n            contentOk = chain.size() == 2 && chain.head() != nullptr &&\n                        chain.head()->sensorId == 100 && chain.head()->next != nullptr &&\n                        chain.head()->next->sensorId == 101;\n            liveAfterRebuild = ChainNode::liveCount;\n        }\n        size_t liveAfterDestroy = ChainNode::liveCount;\n        bool ok = contentOk && liveAfterRebuild == 2 && liveAfterDestroy == 0;\n        report(1, ok, \"2 live nodes after rebuild, 0 after destruction\",\n               std::to_string(liveAfterRebuild) + \" live after rebuild, \" +\n                   std::to_string(liveAfterDestroy) + \" after destruction\");\n    }\n\n    // Case 2: serialize() honors the documented 10-byte record layout.\n    {\n        SensorChain chain;\n        chain.append(258, 1.5);\n        chain.append(41, -2.25);\n        chain.append(999, 3.75);\n        std::vector<unsigned char> blob = chain.serialize();\n        const size_t kRecordSize = 10;\n        bool ok = blob.size() == sizeof(uint32_t) + 3 * kRecordSize;\n        uint32_t count = 0;\n        if (ok) {\n            std::memcpy(&count, blob.data(), sizeof(count));\n            ok = count == 3;\n        }\n        const uint16_t ids[3] = {258, 41, 999};\n        const double vals[3] = {1.5, -2.25, 3.75};\n        for (size_t i = 0; ok && i < 3; ++i) {\n            size_t off = sizeof(uint32_t) + i * kRecordSize;\n            uint16_t id = 0;\n            double v = 0.0;\n            std::memcpy(&id, blob.data() + off, sizeof(id));\n            std::memcpy(&v, blob.data() + off + sizeof(id), sizeof(v));\n            ok = id == ids[i] && v == vals[i];\n        }\n        report(2, ok, \"34-byte blob: count 3 plus three 10-byte packed records\",\n               std::to_string(blob.size()) + \"-byte blob\");\n    }\n\n    // Case 3: a 200000-reading snapshot rebuild plus serialize stays fast.\n    {\n        std::mt19937 rng(424242u);\n        std::uniform_int_distribution<int> idDist(0, 65535);\n        std::uniform_int_distribution<int> valDist(0, 999);\n        const size_t kCount = 200000;\n        std::vector<Reading> snapshot;\n        snapshot.reserve(kCount);\n        double expected = 0.0;\n        for (size_t i = 0; i < kCount; ++i) {\n            Reading r{static_cast<uint16_t>(idDist(rng)), static_cast<double>(valDist(rng))};\n            expected += r.value;\n            snapshot.push_back(r);\n        }\n        SensorChain chain;\n        chain.append(1, 42.0);  // stale content the snapshot must replace\n        chain.rebuild(snapshot);\n        std::vector<unsigned char> blob = chain.serialize();\n        bool ok = chain.size() == kCount && chainSum(chain) == expected &&\n                  blob.size() == sizeof(uint32_t) + kCount * 10;\n        report(3, ok,\n               \"200000 nodes, sum \" + std::to_string(expected) + \", blob \" +\n                   std::to_string(sizeof(uint32_t) + kCount * 10) + \" bytes\",\n               std::to_string(chain.size()) + \" nodes, sum \" + std::to_string(chainSum(chain)) +\n                   \", blob \" + std::to_string(blob.size()) + \" bytes\");\n    }\n\n    std::cout << \"###DONE\" << std::endl;\n    return failures == 0 ? 0 : 1;\n}\n"
  },
  {
    "id": "dbg-visitor-log-stats",
    "title": "Visitor log batch stats",
    "topic": "data",
    "language": "python",
    "scenario": "This is the analytics batch job that turns our raw access log into daily visitor stats. The nightly run has started taking forever on bigger logs, and one team says session summaries look wrong when several sessions are processed in the same run.",
    "code": "def parse_line(line):\n    visitor, page, duration = line.strip().split(\",\")\n    return {\"visitor\": visitor, \"page\": page, \"duration\": int(duration)}\n\n\ndef unique_visitors(lines):\n    \"\"\"Visitor ids in order of first appearance.\"\"\"\n    seen = []\n    ordered = []\n    for line in lines:\n        visitor = line.split(\",\", 1)[0]\n        if visitor not in seen:\n            seen.append(visitor)\n            ordered.append(visitor)\n    return ordered\n\n\ndef page_counts(lines):\n    \"\"\"Number of hits each page received.\"\"\"\n    counts = {}\n    for line in lines:\n        page = line.split(\",\")[1]\n        counts[page] = counts.get(page, 0) + 1\n    return counts\n\n\ndef session_summary(events, alerts=[]):\n    \"\"\"Total time for one visitor session, flagging pages slower than 5 minutes.\"\"\"\n    total = 0\n    for event in events:\n        total += event[\"duration\"]\n        if event[\"duration\"] > 300:\n            alerts.append(event[\"page\"])\n    return {\"total\": total, \"alerts\": alerts}\n",
    "plantedIssues": [
      {
        "category": "perf",
        "severity": "high",
        "line": 12,
        "issue": "Membership test `visitor not in seen` against a growing LIST is O(U) per log line, making unique_visitors O(N^2) overall; the 40k-line perf case takes ~31s and blows the 10s kill. A set makes it O(N)."
      },
      {
        "category": "bug",
        "severity": "high",
        "line": 27,
        "issue": "Mutable default argument `alerts=[]` is evaluated once at function definition, so the same list is shared across calls: alerts from earlier sessions leak into later summaries (case 3 fails with ['/report', '/export'] instead of [])."
      }
    ],
    "brief": "Expected fixes: (1) unique_visitors — replace the `seen` list with a set (`seen = set()` / `seen.add`), keeping the separate `ordered` list for first-seen order; optimization target O(N^2) -> O(N) (dict.fromkeys-based dedupe also acceptable). (2) session_summary — use the None-sentinel idiom: `alerts=None` plus `if alerts is None: alerts = []`. Partial credit: correctly naming the mutable-default hazard from reading but fixing only one function; fixing the perf issue but replacing `ordered` in a way that loses first-seen order (fails cases 0 and 4); testing membership against `ordered` instead of `seen` (still quadratic). Traps candidates fall into: believing `alerts=[]` is re-evaluated on every call (it is definition-time, once); blaming parse_line or page_counts, which are both correct; returning `set(...)` or sorted output from unique_visitors, which breaks ordering; 'fixing' case 3 by copying the list on return (`alerts[:]`), which still mutates the shared default and fails on a third call pattern.",
    "tests": [
      {
        "input": "6 log lines from visitors ana, raj, mei with repeat visits",
        "expected": "['ana', 'raj', 'mei'] in order of first appearance"
      },
      {
        "input": "same 6 log lines through page_counts",
        "expected": "{'/home': 2, '/pricing': 2, '/docs': 2}"
      },
      {
        "input": "one session: /home 120s, /report 450s",
        "expected": "{'total': 570, 'alerts': ['/report']}"
      },
      {
        "input": "summarize session B (has a 900s page), then session C (10s + 20s, nothing slow)",
        "expected": "second summary is {'total': 30, 'alerts': []} with no carryover from the earlier calls"
      },
      {
        "input": "40,000-line seeded batch, every visitor unique (must finish well under the 10s limit)",
        "expected": "all 40,000 visitor ids in order of first appearance"
      }
    ],
    "harness": "from solution import *\n\nimport random\n\n\ndef _fmt(value):\n    text = repr(value)\n    if len(text) > 200:\n        text = text[:200] + \" ...(truncated)\"\n    return text\n\n\ndef _report(i, expected, actual):\n    if expected == actual:\n        print(f\"###CASE {i} PASS\", flush=True)\n    else:\n        print(f\"###CASE {i} FAIL\", flush=True)\n        print(\"###EXPECTED \" + _fmt(expected), flush=True)\n        print(\"###ACTUAL \" + _fmt(actual), flush=True)\n\n\ndef main():\n    lines = [\n        \"ana,/home,12\",\n        \"raj,/pricing,40\",\n        \"ana,/docs,7\",\n        \"mei,/home,3\",\n        \"raj,/docs,22\",\n        \"ana,/pricing,9\",\n    ]\n\n    # case 0: visitors reported in order of first appearance\n    _report(0, [\"ana\", \"raj\", \"mei\"], unique_visitors(lines))\n\n    # case 1: page hit counts\n    _report(1, {\"/home\": 2, \"/pricing\": 2, \"/docs\": 2}, page_counts(lines))\n\n    # case 2: one session, slow page flagged\n    session_a = [parse_line(\"ana,/home,120\"), parse_line(\"ana,/report,450\")]\n    _report(2, {\"total\": 570, \"alerts\": [\"/report\"]}, session_summary(session_a))\n\n    # case 3: summaries of separate sessions stay independent\n    session_b = [parse_line(\"raj,/export,900\"), parse_line(\"raj,/home,30\")]\n    session_c = [parse_line(\"mei,/home,10\"), parse_line(\"mei,/search,20\")]\n    session_summary(session_b)\n    _report(3, {\"total\": 30, \"alerts\": []}, session_summary(session_c))\n\n    # case 4: large deterministic batch, every visitor unique\n    n = 40000\n    rng = random.Random(20260902)\n    ids = list(range(n))\n    rng.shuffle(ids)\n    perf_lines = [\n        \"user{:06d},/p{},{}\".format(ids[i], i % 40, (i % 90) + 1) for i in range(n)\n    ]\n    expected_order = [\"user{:06d}\".format(v) for v in ids]\n    _report(4, expected_order, unique_visitors(perf_lines))\n\n    print(\"###DONE\", flush=True)\n\n\nmain()\n"
  },
  {
    "id": "dbg-report-renderer",
    "title": "Nightly report renderer",
    "topic": "dsinternals",
    "language": "python",
    "scenario": "This is the formatter our nightly reconciliation job uses to render pipe-delimited text reports; retried feed batches can resend a row, so consecutive duplicates get collapsed. Some reports are coming out with duplicated rows anyway, and the biggest feed never finishes rendering.",
    "code": "def fingerprint(text):\n    \"\"\"Cheap stable checksum used to spot repeated rows.\"\"\"\n    total = 0\n    for ch in text:\n        total = (total * 31 + ord(ch)) % 1000003\n    return total\n\n\nclass ReportBuilder:\n    \"\"\"Collects pipe-delimited rows and renders a plain-text report.\n\n    Consecutive duplicate rows are collapsed so retried feed batches\n    do not show up twice.\n    \"\"\"\n\n    def __init__(self, title):\n        self.title = title\n        self.body = \"\"\n        self.row_count = 0\n        self._last_fp = None\n\n    def add_row(self, fields):\n        line = \"|\".join(str(f) for f in fields)\n        fp = fingerprint(line)\n        if fp is self._last_fp:\n            return\n        self._last_fp = fp\n        self.body += line + \"\\n\"\n        self.row_count += 1\n\n    def render(self):\n        header = self.title + \"\\n\" + \"=\" * len(self.title) + \"\\n\"\n        return header + self.body + \"(\" + str(self.row_count) + \" rows)\\n\"\n\n\ndef build_report(title, rows):\n    builder = ReportBuilder(title)\n    for row in rows:\n        builder.add_row(row)\n    return builder.render()\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 25,
        "issue": "`fp is self._last_fp` compares int identity instead of equality. It accidentally works when the fingerprint is <= 256 (CPython caches small ints, so equal values are the same object — case 0 passes) but for larger equal fingerprints the two int objects are distinct, `is` returns False, and consecutive duplicates are NOT collapsed (case 1 fails). Must be `==`."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 28,
        "issue": "`self.body += line + \"\\n\"` rebuilds the whole string every call: strings are immutable and CPython's in-place concat fast path only applies to local-variable targets (STORE_FAST), never attribute stores, so this copies O(total) bytes per row — O(T^2) overall. The 200k-row perf case copies ~190GB and takes ~27s, past the 10s kill; a list of lines + ''.join in render is O(T)."
      }
    ],
    "brief": "Expected fixes: (1) change `fp is self._last_fp` to `fp == self._last_fp`; strong candidates explain the CPython small-int cache (-5..256): equal small fingerprints are the same cached object so `is` passes case 0, while equal fingerprints > 256 are distinct objects so `is` is False and duplicates leak through (case 1). (2) Replace string accumulation with `self._lines = []` / `self._lines.append(line + \"\\n\")` and `\"\".join(self._lines)` in render (io.StringIO also fine); optimization target O(T^2) -> O(T) total characters T. Strong candidates know the `s += x` fast path requires a STORE_FAST target and refcount 1, so attribute accumulation is genuinely quadratic. Partial credit: fixing only the `is` bug (case 1 passes, perf case still killed); fixing perf by accumulating into a local string variable inside build_report-style loops (passes here via the CPython fast path — accept but flag as fragile/implementation-dependent); spotting both flaws by reading but fixing one. Traps: assuming the `is` bug is about None comparison; 'optimizing' fingerprint, which is not the bottleneck; breaking dedupe semantics during the refactor (it must collapse consecutive duplicates only, not all duplicates); forgetting to keep row_count consistent with the kept lines.",
    "tests": [
      {
        "input": "rows [a], [a], [b] — the duplicate's fingerprint is 97, a cached small int",
        "expected": "'Ping' report with lines a, b and footer '(2 rows)'"
      },
      {
        "input": "rows [alpha|beta] twice then [gamma|delta] — duplicate fingerprint 583867, above the small-int cache",
        "expected": "'Sync' report with the duplicate collapsed: 2 lines, '(2 rows)'"
      },
      {
        "input": "3 distinct mixed-type rows (strings and ints), no duplicates",
        "expected": "exact render with all 3 lines and '(3 rows)'"
      },
      {
        "input": "200,000 seeded rows plus an exact retry duplicate after every 97th row (must finish well under the 10s limit)",
        "expected": "render matches the harness reference: 200,000 kept lines, all retry duplicates collapsed"
      }
    ],
    "harness": "from solution import *\n\nimport random\n\n\ndef _fingerprint_ref(text):\n    total = 0\n    for ch in text:\n        total = (total * 31 + ord(ch)) % 1000003\n    return total\n\n\ndef _render_ref(title, rows):\n    kept = []\n    last_fp = None\n    for fields in rows:\n        line = \"|\".join(str(f) for f in fields)\n        fp = _fingerprint_ref(line)\n        if fp == last_fp:\n            continue\n        last_fp = fp\n        kept.append(line + \"\\n\")\n    header = title + \"\\n\" + \"=\" * len(title) + \"\\n\"\n    return header + \"\".join(kept) + \"(\" + str(len(kept)) + \" rows)\\n\"\n\n\ndef _fmt(value):\n    text = repr(value)\n    if len(text) > 200:\n        text = text[:200] + \" ...(truncated)\"\n    return text\n\n\ndef _report(i, expected, actual):\n    if expected == actual:\n        print(f\"###CASE {i} PASS\", flush=True)\n    else:\n        print(f\"###CASE {i} FAIL\", flush=True)\n        print(\"###EXPECTED \" + _fmt(expected), flush=True)\n        print(\"###ACTUAL \" + _fmt(actual), flush=True)\n\n\ndef main():\n    # case 0: consecutive duplicate single-letter rows are collapsed\n    rows0 = [[\"a\"], [\"a\"], [\"b\"]]\n    _report(0, _render_ref(\"Ping\", rows0), build_report(\"Ping\", rows0))\n\n    # case 1: consecutive duplicate multi-field rows are collapsed\n    rows1 = [[\"alpha\", \"beta\"], [\"alpha\", \"beta\"], [\"gamma\", \"delta\"]]\n    _report(1, _render_ref(\"Sync\", rows1), build_report(\"Sync\", rows1))\n\n    # case 2: mixed field types, no duplicates\n    rows2 = [[\"order\", 1042, \"filled\"], [\"order\", 1043, \"open\"], [\"fees\", 12, \"eur\"]]\n    _report(2, _render_ref(\"Fills\", rows2), build_report(\"Fills\", rows2))\n\n    # case 3: large deterministic feed with periodic retry duplicates.\n    # Seed 424242 was checked: no two consecutive distinct lines share a\n    # fingerprint, so collapsing exact duplicates gives the expected render.\n    n = 200000\n    rng = random.Random(424242)\n    rows3 = []\n    kept = []\n    for i in range(n):\n        fields = [\"e{:05d}\".format(i), rng.randrange(10, 99)]\n        rows3.append(fields)\n        kept.append(\"|\".join(str(f) for f in fields) + \"\\n\")\n        if i % 97 == 0:\n            rows3.append(list(fields))\n    header = \"Nightly\\n\" + \"=\" * len(\"Nightly\") + \"\\n\"\n    expected3 = header + \"\".join(kept) + \"(\" + str(len(kept)) + \" rows)\\n\"\n    _report(3, expected3, build_report(\"Nightly\", rows3))\n\n    print(\"###DONE\", flush=True)\n\n\nmain()\n"
  },
  {
    "id": "dbg-activity-pane",
    "title": "Activity pane renderer",
    "topic": "cpp",
    "language": "cpp",
    "scenario": "This renders the recent-activity pane for our internal ops dashboard: it takes the full event feed plus the pane height in rows and returns the pane text, newest entries at the bottom. It shipped a while back and the feed has grown a lot since.",
    "code": "// Renders the \"recent activity\" pane for the ops dashboard.\n//\n// Each entry is (component, message). The pane shows the newest\n// `height` entries, oldest of those first, one row per entry. If the\n// feed has fewer than `height` entries, every entry is shown.\n\nstatic const size_t kMaxRowWidth = 96;\n\nstatic string clipMessage(const string& message) {\n    if (message.size() <= kMaxRowWidth) {\n        return message;\n    }\n    return message.substr(0, kMaxRowWidth - 3) + \"...\";\n}\n\nstatic string formatRow(const string& component, const string& message) {\n    string row = \"[\";\n    row += component;\n    row += \"] \";\n    row += clipMessage(message);\n    return row;\n}\n\nstring renderActivityPane(vector<pair<string, string>> entries, int height) {\n    string pane;\n    for (int i = (int)entries.size() - height; i < entries.size(); ++i) {\n        if (i < 0) {\n            continue;\n        }\n        pane = pane + formatRow(entries[i].first, entries[i].second) + \"\\n\";\n    }\n    return pane;\n}\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 26,
        "issue": "Signed/unsigned comparison in the loop bound: when height > entries.size(), the start index (int)entries.size() - height is negative, and in `i < entries.size()` the signed i is converted to unsigned (size_t), becoming a huge value, so the loop body never runs and the pane renders empty instead of showing all entries. The `if (i < 0) continue;` guard on line 27 is unreachable dead code because the loop condition already fails."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 30,
        "issue": "`pane = pane + formatRow(...) + \"\\n\"` re-copies the entire accumulated pane on every iteration: O(n * totalLength) = quadratic in the pane size. On the 150k-entry perf case this copies hundreds of gigabytes and blows the 10-second limit. `pane += row; pane += '\\n';` (optionally with reserve) is linear."
      },
      {
        "category": "design",
        "severity": "low",
        "line": 24,
        "issue": "`entries` is passed by value, so every render deep-copies the entire feed (all component and message strings). Should be `const vector<pair<string, string>>&`."
      }
    ],
    "brief": "Expected fixes: (1) the empty-pane bug — start index (int)size - height goes negative when height exceeds the feed, and in `i < entries.size()` the int converts to unsigned so the loop never executes; the i<0 guard is dead code. Correct fix clamps start with size_t arithmetic (size_t take = min(size, (size_t)height); start = size - take) or compares against (int)entries.size() consistently. (2) The optimization target: replace `pane = pane + row + \"\\n\"` with `pane += ...` — O(n * totalLength) i.e. effectively O(n^2) -> O(totalLength) linear; reserve() is a bonus. (3) Minor: take entries by const reference instead of by value. Partial credit: spotting the blank-pane symptom but blaming the i<0 guard without explaining the unsigned conversion (probe: 'what type does i become in that comparison?'); fixing the concat with ostringstream or a reserve+append loop is fully acceptable. Traps: candidates cast the bound to (int)entries.size() and stop — it passes here, but ask about feeds beyond 2^31; candidates claim += is also quadratic (it is amortized linear due to geometric growth); candidates 'fix' the loop by iterating the whole feed and skipping the front, which is correct but ask them to justify the clamp math. Grading the read-through: finding both high-severity issues before running anything is a strong signal; the by-value copy is a bonus find.",
    "tests": [
      {
        "input": "5 entries, height 3",
        "expected": "the newest 3 rows, oldest of those first, one per line"
      },
      {
        "input": "4 entries, height 10 (pane taller than the feed)",
        "expected": "all 4 rows"
      },
      {
        "input": "5 entries, height 0",
        "expected": "empty string"
      },
      {
        "input": "3 entries, one with a 140-char message, height 2",
        "expected": "last 2 rows with the long message clipped to 96 chars ending in ..."
      },
      {
        "input": "empty feed, height 5",
        "expected": "empty string"
      },
      {
        "input": "perf: 150k entries rendered at height 150000 (must finish well under the 10s limit)",
        "expected": "full 150k-row pane identical to a linear reference build"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nstatic string refFormatRow(const string& component, const string& message) {\n    string clipped = message;\n    if (clipped.size() > 96) {\n        clipped = clipped.substr(0, 93) + \"...\";\n    }\n    string row = \"[\";\n    row += component;\n    row += \"] \";\n    row += clipped;\n    return row;\n}\n\nstatic string refPane(const vector<pair<string, string>>& entries, int height) {\n    if (height < 0) {\n        height = 0;\n    }\n    size_t h = static_cast<size_t>(height);\n    size_t start = entries.size() > h ? entries.size() - h : 0;\n    string pane;\n    for (size_t i = start; i < entries.size(); ++i) {\n        pane += refFormatRow(entries[i].first, entries[i].second);\n        pane += '\\n';\n    }\n    return pane;\n}\n\nstatic string display(const string& s) {\n    if (s.size() > 300) {\n        unsigned long long h = 1469598103934665603ULL;\n        for (unsigned char c : s) {\n            h ^= c;\n            h *= 1099511628211ULL;\n        }\n        ostringstream os;\n        os << \"len=\" << s.size() << \" fnv1a=0x\" << hex << h;\n        return os.str();\n    }\n    string out;\n    for (char c : s) {\n        if (c == '\\n') {\n            out += \"\\\\n\";\n        } else {\n            out += c;\n        }\n    }\n    return out;\n}\n\nint main() {\n    std::cout << std::unitbuf;\n\n    vector<vector<pair<string, string>>> inputs;\n    vector<int> heights;\n\n    inputs.push_back({{\"auth\", \"login accepted for uid 4711\"},\n                      {\"db\", \"checkpoint complete\"},\n                      {\"auth\", \"token refreshed\"},\n                      {\"net\", \"socket reset by peer\"},\n                      {\"db\", \"vacuum finished\"}});\n    heights.push_back(3);\n\n    inputs.push_back({{\"gc\", \"minor collection 12 ms\"},\n                      {\"gc\", \"major collection 214 ms\"},\n                      {\"net\", \"reconnect to 10.0.0.7\"},\n                      {\"db\", \"slow query 1.9 s\"}});\n    heights.push_back(10);\n\n    inputs.push_back(inputs[0]);\n    heights.push_back(0);\n\n    inputs.push_back({{\"api\", \"GET /health 200\"},\n                      {\"api\", string(140, 'x')},\n                      {\"cache\", \"evicted 512 keys\"}});\n    heights.push_back(2);\n\n    inputs.push_back({});\n    heights.push_back(5);\n\n    {\n        mt19937 rng(1234);\n        const char* comps[] = {\"auth\", \"db\", \"net\", \"api\", \"cache\", \"gc\"};\n        vector<pair<string, string>> big;\n        big.reserve(150000);\n        for (int i = 0; i < 150000; ++i) {\n            string msg = \"op \";\n            msg += to_string(i);\n            msg += \" done in \";\n            msg += to_string(rng() % 5000);\n            msg += \" us \";\n            msg += string(rng() % 90, (char)('a' + i % 26));\n            big.push_back({comps[i % 6], std::move(msg)});\n        }\n        inputs.push_back(std::move(big));\n        heights.push_back(150000);\n    }\n\n    // Self-check: reference builder agrees with a naive join on a prefix\n    // of the large case.\n    {\n        const vector<pair<string, string>>& big = inputs.back();\n        vector<pair<string, string>> prefix(big.begin(), big.begin() + 300);\n        string naive;\n        for (size_t i = 0; i < prefix.size(); ++i) {\n            naive = naive + refFormatRow(prefix[i].first, prefix[i].second) + \"\\n\";\n        }\n        assert(naive == refPane(prefix, 300));\n    }\n\n    for (size_t idx = 0; idx < inputs.size(); ++idx) {\n        string expected = refPane(inputs[idx], heights[idx]);\n        string actual;\n        bool threw = false;\n        string what;\n        try {\n            actual = renderActivityPane(inputs[idx], heights[idx]);\n        } catch (const std::exception& e) {\n            threw = true;\n            what = e.what();\n        }\n        if (!threw && actual == expected) {\n            cout << \"###CASE \" << idx << \" PASS\\n\";\n        } else {\n            cout << \"###CASE \" << idx << \" FAIL\\n\";\n            cout << \"###EXPECTED\\n\" << display(expected) << \"\\n\";\n            cout << \"###ACTUAL\\n\";\n            if (threw) {\n                cout << \"exception: \" << what << \"\\n\";\n            } else {\n                cout << display(actual) << \"\\n\";\n            }\n        }\n    }\n\n    cout << \"###DONE\\n\";\n    return 0;\n}\n"
  },
  {
    "id": "dbg-feed-dedupe",
    "title": "Market data batch dedupe",
    "topic": "dsinternals",
    "language": "cpp",
    "scenario": "This is the de-duplication step in our market-data ingest: the exchange retransmits packets under load, so each batch of ticks has to be reduced to first occurrences by sequence number before it reaches the strategy code. Batches have grown to a few hundred thousand ticks.",
    "code": "// De-duplicates one batch of ticks from the exchange multicast feed.\n//\n// The exchange retransmits packets under load, so the same sequence\n// number can arrive more than once inside a batch. Arrival order is\n// preserved and only the first occurrence of each sequence number is\n// kept. For an empty batch, firstSeq and lastSeq are reported as 0.\n\nstruct Tick {\n    long long seq;\n    int symbolId;\n    double price;\n};\n\nstruct BatchResult {\n    vector<Tick> ticks;     // unique ticks, arrival order preserved\n    long long retransmits;  // duplicates that were dropped\n    long long firstSeq;     // sequence number of the first tick (0 if empty)\n    long long lastSeq;      // sequence number of the last tick (0 if empty)\n};\n\nBatchResult dedupeBatch(const vector<Tick>& feed) {\n    BatchResult result;\n    result.retransmits = 0;\n    result.firstSeq = feed.at(0).seq;\n    result.lastSeq = feed.at(feed.size() - 1).seq;\n\n    vector<long long> seen;\n    for (const Tick& tick : feed) {\n        if (find(seen.begin(), seen.end(), tick.seq) != seen.end()) {\n            result.retransmits += 1;\n            continue;\n        }\n        seen.push_back(tick.seq);\n        result.ticks.push_back(tick);\n    }\n    return result;\n}\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 24,
        "issue": "No empty-batch guard: `feed.at(0)` throws std::out_of_range when the batch is empty, even though the documented contract is to return zero ticks with firstSeq/lastSeq = 0. Line 25 compounds it: `feed.size() - 1` underflows to SIZE_MAX on an empty vector, so even replacing .at with operator[] would be undefined behavior."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 29,
        "issue": "`std::find` performs a linear scan of `seen` for every incoming tick, making the dedupe O(n * u) where u is the unique count — effectively O(n^2) per batch (~1.5e10 comparisons on the 250k-tick perf case, far past the 10-second limit). An unordered_set<long long> lookup/insert makes the whole pass O(n) expected."
      }
    ],
    "brief": "Expected fixes: (1) empty-batch guard — initialize firstSeq/lastSeq to 0 and return early on feed.empty(); candidates should also notice that feed.size() - 1 underflows on an empty vector, so this is two latent failure modes on adjacent lines. (2) The optimization target: replace the vector<long long> `seen` + std::find membership test with unordered_set<long long>, taking the batch from O(n^2) -> O(n) expected (std::set for O(n log n) also passes the perf case — accept it but ask why a hash set is the default choice and when an ordered set would win). reserve() on the set and on result.ticks is a bonus. Partial credit: sorting the batch by seq to dedupe destroys arrival order and fails the functional cases — worth discussing why order matters in a feed handler; guarding only the .at(0) line and leaving the size()-1 underflow is half a fix. Traps: deduping on (seq, price) instead of seq alone; forgetting to keep counting retransmits after switching to `if (!seen.insert(seq).second)`; claiming .at() is the bug and switching to operator[] which converts a clean exception into UB on empty input. Grading the read-through: identifying the quadratic scan and the empty-input crash before running is the bar; articulating the exact complexity O(n*u) and the SIZE_MAX underflow is a strong signal.",
    "tests": [
      {
        "input": "6 ticks where seqs 1001 and 1002 each arrive twice",
        "expected": "4 unique ticks in arrival order, retransmits=2, firstSeq=1001, lastSeq=1004"
      },
      {
        "input": "4 ticks, all unique sequence numbers",
        "expected": "batch unchanged, retransmits=0"
      },
      {
        "input": "5 ticks, seq 3001 transmitted 4 times",
        "expected": "2 unique ticks, retransmits=3, firstSeq=lastSeq=3001"
      },
      {
        "input": "empty batch",
        "expected": "0 ticks, retransmits=0, firstSeq=0, lastSeq=0 (must not crash or throw)"
      },
      {
        "input": "single tick, seq 4001",
        "expected": "that tick alone, retransmits=0, firstSeq=lastSeq=4001"
      },
      {
        "input": "perf: 250k random ticks, roughly half of them retransmits (must finish well under the 10s limit)",
        "expected": "~125k unique ticks matching a hash-set reference, cross-checked against a quadratic reference on a 3000-tick prefix"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nstatic BatchResult refDedupe(const vector<Tick>& feed) {\n    BatchResult r;\n    r.retransmits = 0;\n    r.firstSeq = 0;\n    r.lastSeq = 0;\n    if (feed.empty()) {\n        return r;\n    }\n    r.firstSeq = feed.front().seq;\n    r.lastSeq = feed.back().seq;\n    unordered_set<long long> seen;\n    seen.reserve(feed.size());\n    for (const Tick& t : feed) {\n        if (seen.insert(t.seq).second) {\n            r.ticks.push_back(t);\n        } else {\n            r.retransmits += 1;\n        }\n    }\n    return r;\n}\n\n// Slow but obviously correct; used to cross-check refDedupe on a prefix\n// of the large case.\nstatic BatchResult slowDedupe(const vector<Tick>& feed) {\n    BatchResult r;\n    r.retransmits = 0;\n    r.firstSeq = 0;\n    r.lastSeq = 0;\n    if (feed.empty()) {\n        return r;\n    }\n    r.firstSeq = feed.front().seq;\n    r.lastSeq = feed.back().seq;\n    for (const Tick& t : feed) {\n        bool dup = false;\n        for (const Tick& u : r.ticks) {\n            if (u.seq == t.seq) {\n                dup = true;\n                break;\n            }\n        }\n        if (dup) {\n            r.retransmits += 1;\n        } else {\n            r.ticks.push_back(t);\n        }\n    }\n    return r;\n}\n\nstatic bool sameResult(const BatchResult& a, const BatchResult& b) {\n    if (a.retransmits != b.retransmits || a.firstSeq != b.firstSeq ||\n        a.lastSeq != b.lastSeq || a.ticks.size() != b.ticks.size()) {\n        return false;\n    }\n    for (size_t i = 0; i < a.ticks.size(); ++i) {\n        if (a.ticks[i].seq != b.ticks[i].seq ||\n            a.ticks[i].symbolId != b.ticks[i].symbolId ||\n            a.ticks[i].price != b.ticks[i].price) {\n            return false;\n        }\n    }\n    return true;\n}\n\nstatic string summary(const BatchResult& r) {\n    unsigned long long h = 1469598103934665603ULL;\n    for (const Tick& t : r.ticks) {\n        h ^= static_cast<unsigned long long>(t.seq);\n        h *= 1099511628211ULL;\n    }\n    ostringstream os;\n    os << \"ticks=\" << r.ticks.size() << \" retransmits=\" << r.retransmits\n       << \" firstSeq=\" << r.firstSeq << \" lastSeq=\" << r.lastSeq\n       << \" seqhash=0x\" << hex << h;\n    return os.str();\n}\n\nint main() {\n    std::cout << std::unitbuf;\n\n    vector<vector<Tick>> batches;\n\n    batches.push_back({{1001, 7, 101.25},\n                       {1002, 7, 101.30},\n                       {1001, 7, 101.25},\n                       {1003, 12, 55.10},\n                       {1002, 7, 101.30},\n                       {1004, 12, 55.15}});\n\n    batches.push_back({{2001, 3, 10.0},\n                       {2002, 4, 11.5},\n                       {2003, 3, 10.1},\n                       {2004, 5, 99.9}});\n\n    batches.push_back({{3001, 1, 42.0},\n                       {3001, 1, 42.0},\n                       {3001, 1, 42.0},\n                       {3002, 1, 42.5},\n                       {3001, 1, 42.0}});\n\n    batches.push_back({});\n\n    batches.push_back({{4001, 9, 250.75}});\n\n    {\n        mt19937_64 rng(20240902);\n        vector<Tick> big;\n        big.reserve(250000);\n        vector<Tick> uniques;\n        long long nextSeq = 5000000;\n        for (int i = 0; i < 250000; ++i) {\n            if (!uniques.empty() && rng() % 2 == 0) {\n                big.push_back(uniques[rng() % uniques.size()]);\n            } else {\n                Tick t;\n                t.seq = nextSeq++;\n                t.symbolId = static_cast<int>(rng() % 512);\n                t.price = 50.0 + static_cast<double>(rng() % 100000) / 100.0;\n                uniques.push_back(t);\n                big.push_back(t);\n            }\n        }\n        batches.push_back(std::move(big));\n    }\n\n    // Self-check: hash-based reference agrees with a quadratic reference\n    // on a prefix of the large case.\n    {\n        const vector<Tick>& big = batches.back();\n        vector<Tick> prefix(big.begin(), big.begin() + 3000);\n        assert(sameResult(refDedupe(prefix), slowDedupe(prefix)));\n    }\n\n    for (size_t idx = 0; idx < batches.size(); ++idx) {\n        BatchResult expected = refDedupe(batches[idx]);\n        BatchResult actual;\n        bool threw = false;\n        string what;\n        try {\n            actual = dedupeBatch(batches[idx]);\n        } catch (const std::exception& e) {\n            threw = true;\n            what = e.what();\n        }\n        if (!threw && sameResult(expected, actual)) {\n            cout << \"###CASE \" << idx << \" PASS\\n\";\n        } else {\n            cout << \"###CASE \" << idx << \" FAIL\\n\";\n            cout << \"###EXPECTED\\n\" << summary(expected) << \"\\n\";\n            cout << \"###ACTUAL\\n\";\n            if (threw) {\n                cout << \"exception: \" << what << \"\\n\";\n            } else {\n                cout << summary(actual) << \"\\n\";\n            }\n        }\n    }\n\n    cout << \"###DONE\\n\";\n    return 0;\n}\n"
  },
  {
    "id": "dbg-campaign-param-extraction",
    "title": "Campaign parameter extraction",
    "topic": "memory",
    "language": "cpp",
    "scenario": "This is a helper module our ingest service uses to pull the campaign id out of each raw tracking query string in a batch, normalizing case and stray whitespace first. Downstream analytics consumes the extracted ids — have a read, tell me what you see, then make the tests pass.",
    "code": "// Helpers for pulling tracking parameters out of raw campaign URLs\n// before they are handed to the analytics pipeline.\n\nstring canonicalize(const string& raw) {\n    string out;\n    out.reserve(raw.size());\n    for (char c : raw) {\n        if (!isspace(static_cast<unsigned char>(c))) {\n            out.push_back(static_cast<char>(tolower(static_cast<unsigned char>(c))));\n        }\n    }\n    return out;\n}\n\n// Returns the value for `key` in a query string like \"a=1&b=2&c=3\",\n// or an empty view when the key is absent.\nstring_view getParam(const string& query, const string& key) {\n    size_t pos = 0;\n    while (pos < query.size()) {\n        size_t amp = query.find('&', pos);\n        if (amp == string::npos) {\n            amp = query.size();\n        }\n        size_t eq = query.find('=', pos);\n        if (eq != string::npos && eq < amp) {\n            string_view name(query.data() + pos, eq - pos);\n            if (name == key) {\n                return string_view(query.data() + eq + 1, amp - eq);\n            }\n        }\n        pos = amp + 1;\n    }\n    return {};\n}\n\n// Extracts the campaign id (\"cid\") from every raw query string in the batch.\n// Batches come straight from the ingest log, so casing and stray spaces vary.\nvector<string> campaignIds(const vector<string>& rawQueries) {\n    vector<string> ids;\n    ids.reserve(rawQueries.size());\n    for (const string& raw : rawQueries) {\n        string_view id = getParam(canonicalize(raw), \"cid\");\n        ids.emplace_back(id);\n    }\n    return ids;\n}\n",
    "plantedIssues": [
      {
        "category": "ub",
        "severity": "high",
        "line": 42,
        "issue": "getParam(canonicalize(raw), \"cid\") returns a string_view into the temporary string returned by canonicalize; the temporary is destroyed at the end of that declaration statement, so the emplace_back on the next line reads freed memory. Classic dangling string_view — undefined behavior that the tests only catch flakily because the allocator often leaves the freed bytes intact."
      },
      {
        "category": "bug",
        "severity": "high",
        "line": 28,
        "issue": "The returned view's length is amp - eq, one byte too long: every successful lookup includes the trailing '&' delimiter (or the null terminator byte when the key is the last parameter). Correct length is amp - eq - 1. This makes every hit deterministically wrong."
      }
    ],
    "brief": "Two fixes expected. (1) Off-by-one, line 28: value length must be amp - eq - 1; the planted amp - eq appends the '&' (mid-string) or a \\x00 (end-of-string, reading the legal terminator byte — wrong value but not UB). This alone makes cases 0, 1, 3, 4 fail deterministically. (2) Lifetime UB, line 42: the view returned by getParam points into the temporary from canonicalize(raw), which dies at the end of the full-expression; the next line copies from a dead buffer. Credit here is for spotting it by READING — in practice the freed bytes are usually intact so the tests catch it only flakily (long heap-allocated queries in case 4 raise the odds of visible corruption; an ASan build would flag it every time). Fix: materialize `string canon = canonicalize(raw);` then view into canon (as in the reference), or copy to string inside the same full-expression. No complexity target: case 4 is an 80k stress batch, fixed code is O(total input length) and finishes in under one second. Partial credit: fixing only the off-by-one usually turns the board green — then probe: \"is line 42 correct? when would it break?\" A strong candidate explains temporary lifetime ends at the semicolon, that binding to a const ref parameter does not extend it past the call statement, and names sanitizers/heap reuse as when it bites. Traps: believing the const string& parameter or SSO \"keeps it alive\"; fixing by making canonicalize return string_view (worse — now it always dangles); breaking the empty-value case (cid=&x=1 must yield \"\") while adjusting the length; only fixing campaignIds and assuming getParam's contract (view tied to the passed-in query's lifetime) was itself the bug — it is a legitimate API if callers pass lvalues, which is a good design discussion.",
    "tests": [
      {
        "input": "getParam(\"cid=summer24&src=mail\", \"cid\") — key in the middle of a persistent string",
        "expected": "summer24"
      },
      {
        "input": "getParam(\"src=mail&cid=summer24\", \"cid\") — key is the last parameter",
        "expected": "summer24"
      },
      {
        "input": "getParam(\"a=1&b=2&src=mail\", \"cid\") — key absent",
        "expected": "\" (empty string)"
      },
      {
        "input": "campaignIds on 3 messy raw queries (uppercase CID, stray spaces): CID=Fall25&src=Ads | cid=welcome7&ref=nl | utm=x&cid=b2b-q3",
        "expected": "fall25, welcome7, b2b-q3"
      },
      {
        "input": "campaignIds on an 80k-URL ingest batch of long heap-allocated queries, generated with fixed-seed mt19937 (must finish well under the 10s limit)",
        "expected": "every extracted id equals the generator-known cid embedded in that URL"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nstatic string show(string_view s) {\n    string out;\n    for (char raw : s) {\n        unsigned char c = static_cast<unsigned char>(raw);\n        if (c >= 32 && c < 127) {\n            out.push_back(raw);\n        } else {\n            char buf[8];\n            snprintf(buf, sizeof buf, \"\\\\x%02X\", static_cast<unsigned>(c));\n            out += buf;\n        }\n    }\n    return out;\n}\n\nstatic void report(int idx, const string& expected, const string& actual) {\n    if (expected == actual) {\n        cout << \"###CASE \" << idx << \" PASS\\n\";\n    } else {\n        cout << \"###CASE \" << idx << \" FAIL\\n\";\n        cout << \"###EXPECTED \" << show(expected) << \"\\n\";\n        cout << \"###ACTUAL \" << show(actual) << \"\\n\";\n    }\n}\n\nint main() {\n    std::cout << std::unitbuf;\n\n    // Case 0: key in the middle of a persistent query string.\n    {\n        string q = \"cid=summer24&src=mail\";\n        report(0, \"summer24\", string(getParam(q, \"cid\")));\n    }\n\n    // Case 1: key is the last parameter.\n    {\n        string q = \"src=mail&cid=summer24\";\n        report(1, \"summer24\", string(getParam(q, \"cid\")));\n    }\n\n    // Case 2: key absent -> empty result.\n    {\n        string q = \"a=1&b=2&src=mail\";\n        report(2, \"\", string(getParam(q, \"cid\")));\n    }\n\n    // Case 3: small ingest batch with messy casing and stray spaces.\n    {\n        vector<string> raws = {\n            \"CID=Fall25&src=Ads\",\n            \"  cid=welcome7&ref=nl  \",\n            \"utm=x&cid=b2b-q3\",\n        };\n        vector<string> got = campaignIds(raws);\n        string expected = \"fall25|welcome7|b2b-q3|\";\n        string actual;\n        for (const string& g : got) {\n            actual += g;\n            actual += '|';\n        }\n        report(3, expected, actual);\n    }\n\n    // Case 4: 80k-URL ingest batch with long, heap-allocated queries.\n    {\n        const int n = 80000;\n        vector<string> raws;\n        raws.reserve(n);\n        vector<string> expected;\n        expected.reserve(n);\n        mt19937 rng(987654321u);\n        for (int i = 0; i < n; ++i) {\n            string cid = \"camp\" + to_string(rng() % 977) + \"x\" + to_string(i % 31);\n            string sess(48, static_cast<char>('a' + i % 17));\n            string raw = \"sess=\" + sess + \"&CID=\" + cid + \"&payload=\" +\n                         string(64, 'p') + \"&src=mailer\" + to_string(i % 13);\n            raws.push_back(raw);\n            expected.push_back(cid);\n        }\n        vector<string> got = campaignIds(raws);\n        bool sizeOk = (got.size() == expected.size());\n        size_t mism = expected.size();\n        for (size_t i = 0; sizeOk && i < expected.size(); ++i) {\n            if (got[i] != expected[i]) {\n                mism = i;\n                break;\n            }\n        }\n        if (sizeOk && mism == expected.size()) {\n            cout << \"###CASE 4 PASS\\n\";\n        } else {\n            cout << \"###CASE 4 FAIL\\n\";\n            if (!sizeOk) {\n                cout << \"###EXPECTED \" << expected.size() << \" ids\\n\";\n                cout << \"###ACTUAL \" << got.size() << \" ids\\n\";\n            } else {\n                cout << \"###EXPECTED id[\" << mism << \"] = \" << show(expected[mism]) << \"\\n\";\n                cout << \"###ACTUAL id[\" << mism << \"] = \" << show(got[mism]) << \"\\n\";\n            }\n        }\n    }\n\n    cout << \"###DONE\" << endl;\n    return 0;\n}\n"
  },
  {
    "id": "dbg-portfolio-revaluation",
    "title": "Portfolio revaluation job",
    "topic": "cpp",
    "language": "cpp",
    "scenario": "This is a slice of our end-of-day valuation job: it drops positions whose symbols have disappeared from the price table, then marks the remaining book to market. It runs nightly against a book of about sixty thousand positions — take a look, then get the tests green.",
    "code": "struct Position {\n    string symbol;\n    long long quantity;\n};\n\n// Latest close for one symbol, in cents. Symbols missing from the table\n// price at zero so one bad feed row never poisons the whole valuation.\nlong long closingPrice(map<string, long long> priceTable, const string& symbol) {\n    auto it = priceTable.find(symbol);\n    if (it == priceTable.end()) {\n        return 0;\n    }\n    return it->second;\n}\n\n// Symbols that have dropped out of the price table are delisted and must\n// be removed from the book before the valuation runs.\nvoid dropDelisted(vector<Position>& book, const map<string, long long>& priceTable) {\n    for (auto it = book.begin(); it != book.end(); ++it) {\n        if (priceTable.find(it->symbol) == priceTable.end()) {\n            book.erase(it);\n        }\n    }\n}\n\n// Marks the whole book to market: sum of quantity times latest close.\nlong long totalValue(const vector<Position>& book,\n                     const map<string, long long>& priceTable) {\n    long long total = 0;\n    for (const Position& p : book) {\n        total += p.quantity * closingPrice(priceTable, p.symbol);\n    }\n    return total;\n}\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 21,
        "issue": "book.erase(it) invalidates it, and the loop's ++it then steps over the element that slid into the erased slot — so of two consecutive delisted positions the second one survives, and if the erased element were last, the loop would walk past end(). Fix with it = book.erase(it) / else ++it, or the erase(remove_if(...)) idiom."
      },
      {
        "category": "perf",
        "severity": "high",
        "line": 8,
        "issue": "closingPrice takes the price table map<string, long long> BY VALUE, deep-copying all n nodes (allocations plus string copies) on every call; totalValue therefore costs O(m*n) node copies for m positions. On the 60k-position / 30k-symbol perf case this runs for minutes and is killed at the 10s limit. Passing by const reference makes each lookup O(log n)."
      },
      {
        "category": "design",
        "severity": "low",
        "line": 19,
        "issue": "Element-at-a-time vector erase inside the scan is O(k*n) worst case even once the invalidation is fixed with it = book.erase(it); the single-pass erase(remove_if(...)) idiom removes all delisted rows in O(n)."
      }
    ],
    "brief": "Optimization target: totalValue goes from O(m*n) map-node copies (60k calls x 30k-node deep copy — minutes, killed at 10s) to O(m log n) by changing closingPrice's first parameter from map<string,long long> (by value) to const map<string,long long>& — the whole fixed run takes ~0.4s. An unordered_map would give O(m) average but is not required and candidates should note the by-value copy is the real culprit, not the log-n find. Correctness fix: line 21 erase-while-iterating — erase(it) invalidates it and the subsequent ++it skips the element that shifted into the hole, so consecutive delisted rows survive (cases 0 and 3 fail deterministically with the leftover row; note case 3 is designed so the leftover prices at zero, catching candidates who only compare totals). Acceptable minimal fix: `if (delisted) it = book.erase(it); else ++it;` — the perf case has only ~2% delisted rows so this O(k*n) variant still passes; ideal answer is the erase(remove_if) single pass (the low-severity design issue, line 19 — good discussion point about quadratic erase loops). Partial credit map: fixing only the iterator bug -> cases 0-3 green, perf case still killed (the map copy is untouched); fixing only the by-value map -> perf pressure gone but cases 0 and 3 stay red. Traps: claiming node-based-container iterator stability makes the loop fine (it's a vector, and even for map you must not increment an erased iterator); \"fixing\" by copying the book and erasing from the copy while indexing the original; moving the table to a global to dodge the parameter question; changing closingPrice to take the map by rvalue/move. Also worth probing: why was this UB-ish skip deterministic here (contiguous shift-left) versus the flakiness of dangling-pointer bugs.",
    "tests": [
      {
        "input": "dropDelisted on book [AAPL:10, OLDX:5, OLDY:7, MSFT:3, TSLA:2] with table {AAPL, MSFT, TSLA} — two consecutive delisted rows in the middle",
        "expected": "book becomes AAPL:10, MSFT:3, TSLA:2"
      },
      {
        "input": "dropDelisted on book [MSFT:4, AAPL:1] where every symbol is still listed",
        "expected": "book unchanged: MSFT:4, AAPL:1"
      },
      {
        "input": "totalValue on book [ABC:2, XYZ:3] with prices {ABC:150, XYZ:250}",
        "expected": "1050"
      },
      {
        "input": "drop then revalue on book [GONE1:9, GONE2:9, AAPL:1, MSFT:2] with table {AAPL:100, MSFT:200} — delisted rows must actually leave the book",
        "expected": "size=2 total=500"
      },
      {
        "input": "nightly perf run: 30k-symbol price table, 60k-position book generated with fixed-seed mt19937 (~2% delisted), dropDelisted then full mark-to-market (must finish well under the 10s limit)",
        "expected": "count and total match the harness's independently computed reference (count=58?? live rows, closed-form price total)"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nstatic string bookStr(const vector<Position>& book) {\n    string s;\n    for (const Position& p : book) {\n        s += p.symbol;\n        s += ':';\n        s += to_string(p.quantity);\n        s += '|';\n    }\n    return s;\n}\n\nstatic void report(int idx, const string& expected, const string& actual) {\n    if (expected == actual) {\n        cout << \"###CASE \" << idx << \" PASS\\n\";\n    } else {\n        cout << \"###CASE \" << idx << \" FAIL\\n\";\n        cout << \"###EXPECTED \" << expected << \"\\n\";\n        cout << \"###ACTUAL \" << actual << \"\\n\";\n    }\n}\n\nint main() {\n    std::cout << std::unitbuf;\n\n    // Case 0: two consecutive delisted symbols in the middle of the book.\n    {\n        map<string, long long> table = {{\"AAPL\", 18950}, {\"MSFT\", 41230}, {\"TSLA\", 24810}};\n        vector<Position> book = {\n            {\"AAPL\", 10}, {\"OLDX\", 5}, {\"OLDY\", 7}, {\"MSFT\", 3}, {\"TSLA\", 2},\n        };\n        dropDelisted(book, table);\n        report(0, \"AAPL:10|MSFT:3|TSLA:2|\", bookStr(book));\n    }\n\n    // Case 1: nothing delisted -> book unchanged.\n    {\n        map<string, long long> table = {{\"AAPL\", 18950}, {\"MSFT\", 41230}};\n        vector<Position> book = {{\"MSFT\", 4}, {\"AAPL\", 1}};\n        dropDelisted(book, table);\n        report(1, \"MSFT:4|AAPL:1|\", bookStr(book));\n    }\n\n    // Case 2: valuation math on a small book.\n    {\n        map<string, long long> table = {{\"ABC\", 150}, {\"XYZ\", 250}};\n        vector<Position> book = {{\"ABC\", 2}, {\"XYZ\", 3}};\n        report(2, \"1050\", to_string(totalValue(book, table)));\n    }\n\n    // Case 3: drop then revalue; delisted rows must actually leave the book.\n    {\n        map<string, long long> table = {{\"AAPL\", 100}, {\"MSFT\", 200}};\n        vector<Position> book = {\n            {\"GONE1\", 9}, {\"GONE2\", 9}, {\"AAPL\", 1}, {\"MSFT\", 2},\n        };\n        dropDelisted(book, table);\n        long long got = totalValue(book, table);\n        string actual = \"size=\" + to_string(book.size()) + \" total=\" + to_string(got);\n        report(3, \"size=2 total=500\", actual);\n    }\n\n    // Case 4: full nightly run, 30k-symbol table, 60k-position book (perf).\n    {\n        const int nSyms = 30000;\n        const int nPos = 60000;\n        map<string, long long> table;\n        vector<string> syms(nSyms);\n        for (int i = 0; i < nSyms; ++i) {\n            syms[i] = \"SYM\" + to_string(i);\n            table[syms[i]] = (1LL * i * 37 + 501) % 90000 + 1;\n        }\n        mt19937 rng(20260902u);\n        vector<Position> book;\n        book.reserve(nPos);\n        long long expectedTotal = 0;\n        long long expectedCount = 0;\n        for (int j = 0; j < nPos; ++j) {\n            bool delisted = (rng() % 50 == 0) && (j + 1 < nPos);\n            if (delisted) {\n                book.push_back({\"GONE\" + to_string(j),\n                                static_cast<long long>(rng() % 100 + 1)});\n            } else {\n                int s = static_cast<int>(rng() % nSyms);\n                long long q = static_cast<long long>(rng() % 1000 + 1);\n                book.push_back({syms[s], q});\n                expectedTotal += q * ((1LL * s * 37 + 501) % 90000 + 1);\n                ++expectedCount;\n            }\n        }\n        dropDelisted(book, table);\n        long long got = totalValue(book, table);\n        string expected = \"count=\" + to_string(expectedCount) +\n                          \" total=\" + to_string(expectedTotal);\n        string actual = \"count=\" + to_string(book.size()) +\n                        \" total=\" + to_string(got);\n        report(4, expected, actual);\n    }\n\n    cout << \"###DONE\" << endl;\n    return 0;\n}\n"
  },
  {
    "id": "dbg-severity-tally",
    "title": "Severity level tally",
    "topic": "concurrency",
    "language": "cpp",
    "scenario": "This is the aggregator behind our log-ingest dashboard — it fans a batch of records out to worker threads and tallies how many arrived at each severity level. Ops says the numbers come back short on big batches; take a look and get it solid.",
    "code": "// Tallies log records by severity level using a pool of worker threads.\nclass LevelTally {\npublic:\n    // Returns {count(level 0), ..., count(level 4), grand total}.\n    vector<long long> aggregate(const vector<int>& levels, int numThreads) {\n        counts.assign(kLevels, 0);\n        total = 0;\n\n        vector<thread> workers;\n        size_t chunk = (levels.size() + numThreads - 1) / numThreads;\n        for (int t = 0; t < numThreads; ++t) {\n            size_t begin = min(levels.size(), static_cast<size_t>(t) * chunk);\n            size_t end = min(levels.size(), begin + chunk);\n            workers.emplace_back([this, &levels, begin, end] {\n                for (size_t i = begin; i < end; ++i) {\n                    int lvl = levels[i];\n                    counts[lvl] = counts[lvl] + 1;\n                    total = total + 1;\n                }\n            });\n        }\n\n        for (auto& w : workers)\n            w.detach();\n        this_thread::sleep_for(chrono::milliseconds(10));\n\n        vector<long long> result = counts;\n        result.push_back(total);\n        return result;\n    }\n\nprivate:\n    static constexpr int kLevels = 5;\n    vector<long long> counts;\n    long long total = 0;\n};\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 17,
        "issue": "All worker threads perform unsynchronized read-modify-write on the shared counts vector (and on total at line 18) with no mutex or atomics — a data race that reliably loses updates under contention (observed run: total came back 35,575 out of 4,000,000). It is also why the returned total does not even equal the sum of the per-level counts."
      },
      {
        "category": "bug",
        "severity": "high",
        "line": 24,
        "issue": "Workers are detach()ed and 'waited for' with a fixed 10 ms sleep (line 25) instead of join(). On any batch that takes longer than 10 ms the results are snapshotted while workers are still running (an 8M-record single-thread case returns ~15% of the data), and the detached threads keep writing into this object's members after aggregate() returns — a use-after-free once the object dies."
      },
      {
        "category": "design",
        "severity": "medium",
        "line": 15,
        "issue": "Every record does a read-modify-write on shared state inside the hot loop, so even a 'correct' fix that wraps each increment in one global mutex serializes all workers and adds ~n lock/unlock cycles of contention. The right shape is a per-thread local tally merged once per thread at the end."
      }
    ],
    "brief": "Two must-find bugs plus one design flaw. (1) Data race: unsynchronized RMW on counts[lvl] and total from all workers — lost updates are guaranteed at these sizes; a strong candidate also notices total != sum(counts) in the FAIL output and names that as race evidence. (2) Missing join: detach() + fixed 10 ms sleep is synchronization-by-timing; results are read before workers finish (case 1, single worker over 8M records, isolates this bug — no race is possible with one thread), and detached workers keep writing into the object after the call returns. (3) Design: per-record shared-state RMW means even a correct global-mutex fix stays heavily contended. Expected fix: join() all workers before reading, and eliminate the race with per-thread local tallies (array<long long,5>) merged once per thread under a mutex — the reference solution runs the whole suite in ~0.8 s at -O0. Optimization target is synchronization granularity, not big-O: O(n) work either way, but from O(n) contended shared writes (or O(n) lock/unlock cycles with a naive mutex) down to O(threads x levels) synchronization events. Partial credit: one global mutex around each increment (correct, passes within the 10 s kill at these sizes, but should be challenged on contention); atomics per element (correct, fine); making only total atomic while counts stays racy (still fails); join placed after the results snapshot (still fails). Traps: keeping the sleep 'for safety'; switching to jthread but still reading results before the auto-join; forgetting that with std::thread an unjoined joinable thread destructor calls std::terminate (candidates who join must join every worker). Harness note: it ends with std::quick_exit(0) after ###DONE and keeps all inputs/instances alive for the whole run, so a buggy solution's detached stragglers cannot corrupt teardown; candidates' fixed code should simply join and needs nothing special.",
    "tests": [
      {
        "input": "1,000 records (repeating pattern 0,1,2,3,4), 1 worker thread",
        "expected": "200 200 200 200 200 1000"
      },
      {
        "input": "8,000,000 records (repeating pattern), 1 worker thread — isolates the wait bug, no race possible with one worker",
        "expected": "1600000 1600000 1600000 1600000 1600000 8000000"
      },
      {
        "input": "4,000,000 records drawn with mt19937 seed 42, 8 worker threads",
        "expected": "800106 800193 801258 799138 799305 4000000"
      },
      {
        "input": "12,000,000 records drawn with mt19937 seed 1337, 8 worker threads — large case (must finish well under the 10s limit; reference finishes the whole suite in ~0.8s)",
        "expected": "2397824 2401030 2400273 2400141 2400732 12000000"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nnamespace {\n\nstruct TestCase {\n    std::vector<int> levels;\n    int threads = 1;\n    std::vector<long long> expected;\n};\n\nTestCase patternCase(size_t n, int threads) {\n    TestCase tc;\n    tc.threads = threads;\n    tc.levels.resize(n);\n    tc.expected.assign(6, 0);\n    for (size_t i = 0; i < n; ++i) {\n        int lvl = static_cast<int>(i % 5);\n        tc.levels[i] = lvl;\n        tc.expected[lvl]++;\n    }\n    tc.expected[5] = static_cast<long long>(n);\n    return tc;\n}\n\nTestCase randomCase(size_t n, int threads, unsigned seed) {\n    TestCase tc;\n    tc.threads = threads;\n    tc.levels.resize(n);\n    tc.expected.assign(6, 0);\n    std::mt19937 rng(seed);\n    for (size_t i = 0; i < n; ++i) {\n        int lvl = static_cast<int>(rng() % 5u);\n        tc.levels[i] = lvl;\n        tc.expected[lvl]++;\n    }\n    tc.expected[5] = static_cast<long long>(n);\n    return tc;\n}\n\nvoid printRow(const char* tag, const std::vector<long long>& v) {\n    std::cout << tag;\n    for (size_t i = 0; i < v.size(); ++i)\n        std::cout << (i ? \" \" : \"\") << v[i];\n    std::cout << \"\\n\";\n}\n\n} // namespace\n\nint main() {\n    std::cout << std::unitbuf;\n\n    std::vector<TestCase> cases;\n    cases.push_back(patternCase(1000, 1));\n    cases.push_back(patternCase(8000000, 1));\n    cases.push_back(randomCase(4000000, 8, 42u));\n    cases.push_back(randomCase(12000000, 8, 1337u));\n\n    std::vector<std::unique_ptr<LevelTally>> tallies;\n    for (size_t i = 0; i < cases.size(); ++i) {\n        tallies.push_back(std::make_unique<LevelTally>());\n        std::vector<long long> actual =\n            tallies.back()->aggregate(cases[i].levels, cases[i].threads);\n        if (actual == cases[i].expected) {\n            std::cout << \"###CASE \" << i << \" PASS\\n\";\n        } else {\n            std::cout << \"###CASE \" << i << \" FAIL\\n\";\n            printRow(\"###EXPECTED \", cases[i].expected);\n            printRow(\"###ACTUAL \", actual);\n        }\n    }\n\n    std::cout << \"###DONE\\n\";\n    // End the process without running destructors so that stray detached\n    // threads from a buggy solution cannot touch freed memory on teardown.\n    std::quick_exit(0);\n}\n"
  },
  {
    "id": "dbg-ledger-transfers",
    "title": "Account ledger transfers",
    "topic": "concurrency",
    "language": "cpp",
    "scenario": "This ledger backs an internal payments sandbox — each account gets its own mutex so transfers on different accounts can run in parallel. Under concurrent load the service freezes and has to be killed; figure out what's going on and make it safe.",
    "code": "// In-memory ledger; each account has its own mutex so transfers touching\n// disjoint accounts can proceed in parallel.\nclass Ledger {\npublic:\n    Ledger(int numAccounts, long long openingBalance) {\n        for (int i = 0; i < numAccounts; ++i)\n            accounts.push_back(make_unique<Account>(openingBalance));\n    }\n\n    // Moves amount between accounts; returns false if funds are short.\n    bool transfer(int from, int to, long long amount) {\n        accounts[from]->guard.lock();\n        if (accounts[from]->balance < amount) {\n            return false;\n        }\n        accounts[to]->guard.lock();\n        accounts[from]->balance -= amount;\n        accounts[to]->balance += amount;\n        accounts[to]->guard.unlock();\n        accounts[from]->guard.unlock();\n        return true;\n    }\n\n    long long balanceOf(int id) {\n        lock_guard<mutex> lk(accounts[id]->guard);\n        return accounts[id]->balance;\n    }\n\nprivate:\n    struct Account {\n        explicit Account(long long b) : balance(b) {}\n        long long balance;\n        mutex guard;\n    };\n    vector<unique_ptr<Account>> accounts;\n};\n",
    "plantedIssues": [
      {
        "category": "bug",
        "severity": "high",
        "line": 16,
        "issue": "Inconsistent lock ordering: transfer() always locks accounts[from] first, then accounts[to], so two concurrent opposite transfers (A->B and B->A) acquire the same two mutexes in opposite order and deadlock — each holds one lock while waiting forever for the other. The harness watchdog flags this within 3 seconds."
      },
      {
        "category": "ub",
        "severity": "high",
        "line": 12,
        "issue": "No guard for from == to: a self-transfer locks accounts[from]->guard here and then line 16 calls lock() again on the very same std::mutex from the same thread — undefined behavior that in practice self-deadlocks the thread while it holds the account's lock, wedging every other thread that touches that account."
      },
      {
        "category": "bug",
        "severity": "medium",
        "line": 14,
        "issue": "The insufficient-funds path returns without unlocking accounts[from]->guard (manual lock()/unlock() instead of RAII), so one failed transfer leaves the account's mutex locked forever and every subsequent operation on it blocks."
      }
    ],
    "brief": "Classic lock-ordering deadlock plus two lock-hygiene bugs. (1) from-then-to acquisition order deadlocks against the reverse transfer — case 1 (pure opposite-direction traffic, no self-transfers) isolates it and deadlocked within 3s in 5/5 verification runs. (2) from == to double-locks the same std::mutex on one thread (UB, practically a self-deadlock that holds the account lock) — case 2's seeded op streams include self-transfers within the first few ops of every thread, so it hangs deterministically even if the candidate fixes the ordering but not the guard. (3) The insufficient-funds early return leaks the from lock; the test balances are large enough that funds never run short, so this one is found by reading, not by a failing test — dock reading credit if missed. Expected fix: guard from == to explicitly (any reasonable semantics passes — tests assert final balances only, and a self-transfer must not change them), then acquire both mutexes deadlock-free with scoped_lock(a.guard, b.guard) (or ordered acquisition by index/address), and use RAII so every path releases. Reference solution runs the full suite in ~0.7s at -O0. WATCHDOG (documented harness behavior): each case body runs on a worker thread while the harness polls a shared atomic done-flag with a 3-second deadline instead of joining blind; on expiry it prints FAIL with '###ACTUAL timeout after 3s...' and detaches the presumed-deadlocked worker, and after ###DONE it calls std::quick_exit(0) so leaked blocked threads never prevent process exit — a fully deadlocked flawed run therefore completes in ~6.5s, inside the 10s kill. All per-case state is held via shared_ptr captured by value so detached workers never touch freed memory. Partial credit: one global mutex for the whole ledger (correct, passes, but serializes all transfers — probe on why per-account locking existed); try_lock-and-retry backoff loops (can pass but livelock-prone; probe); fixing ordering via index comparison but calling scoped_lock with the same mutex twice for from == to (still UB — the guard is mandatory). Traps: 'fixing' the deadlock by sleeping between the two lock() calls; swapping lock order only in one branch (still inconsistent); assuming std::mutex is recursive.",
    "tests": [
      {
        "input": "4 accounts opening at 1000; sequential transfers 0->1 of 250, 1->2 of 100, 3->0 of 40; read all balances",
        "expected": "790 1150 1100 960"
      },
      {
        "input": "2 accounts opening at 1,000,000,000; thread A does 200,000 transfers 0->1 of 1 while thread B does 200,000 transfers 1->0 of 1; balances must end where they started (watchdog flags a hang after 3s)",
        "expected": "1000000000 1000000000"
      },
      {
        "input": "6 accounts opening at 1,000,000,000; 4 threads each replay 150,000 transfers from mt19937 streams seeded 9000..9003 (self-transfers included, amounts 1-50); large case (must finish well under the 10s limit; reference finishes the whole suite in ~0.7s)",
        "expected": "999995912 999989291 1000004522 1000001624 999992881 1000015770"
      }
    ],
    "harness": "#include \"solution.hpp\"\n\nnamespace {\n\nstd::string joinNums(const std::vector<long long>& v) {\n    std::string out;\n    for (size_t i = 0; i < v.size(); ++i) {\n        if (i) out += ' ';\n        out += std::to_string(v[i]);\n    }\n    return out;\n}\n\n// Watchdog: run the risky section on a worker thread and poll an atomic\n// done-flag with a 3s deadline instead of joining blind. On timeout the\n// worker is detached (it is presumed deadlocked) and the case fails.\nbool runGuarded(std::function<void()> body) {\n    auto done = std::make_shared<std::atomic<bool>>(false);\n    std::thread worker([done, body] {\n        body();\n        done->store(true);\n    });\n    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);\n    while (!done->load()) {\n        if (std::chrono::steady_clock::now() >= deadline) {\n            worker.detach();\n            return false;\n        }\n        std::this_thread::sleep_for(std::chrono::milliseconds(5));\n    }\n    worker.join();\n    return true;\n}\n\nvoid report(size_t idx, bool finished, const std::vector<long long>& expected,\n            const std::vector<long long>& actual) {\n    if (finished && actual == expected) {\n        std::cout << \"###CASE \" << idx << \" PASS\\n\";\n        return;\n    }\n    std::cout << \"###CASE \" << idx << \" FAIL\\n\";\n    std::cout << \"###EXPECTED \" << joinNums(expected) << \"\\n\";\n    if (!finished)\n        std::cout << \"###ACTUAL timeout after 3s: workers never finished\"\n                     \" (deadlock suspected)\\n\";\n    else\n        std::cout << \"###ACTUAL \" << joinNums(actual) << \"\\n\";\n}\n\n} // namespace\n\nint main() {\n    std::cout << std::unitbuf;\n\n    // Case 0: sequential transfers between distinct accounts.\n    {\n        auto ledger = std::make_shared<Ledger>(4, 1000LL);\n        auto actual = std::make_shared<std::vector<long long>>();\n        bool finished = runGuarded([ledger, actual] {\n            ledger->transfer(0, 1, 250);\n            ledger->transfer(1, 2, 100);\n            ledger->transfer(3, 0, 40);\n            for (int id = 0; id < 4; ++id)\n                actual->push_back(ledger->balanceOf(id));\n        });\n        report(0, finished, {790, 1150, 1100, 960}, *actual);\n    }\n\n    // Case 1: two threads hammering opposite-direction transfers on the\n    // same pair of accounts; equal traffic each way, so balances must end\n    // exactly where they started.\n    {\n        auto ledger = std::make_shared<Ledger>(2, 1000000000LL);\n        auto actual = std::make_shared<std::vector<long long>>();\n        bool finished = runGuarded([ledger, actual] {\n            std::thread a([ledger] {\n                for (int i = 0; i < 200000; ++i)\n                    ledger->transfer(0, 1, 1);\n            });\n            std::thread b([ledger] {\n                for (int i = 0; i < 200000; ++i)\n                    ledger->transfer(1, 0, 1);\n            });\n            a.join();\n            b.join();\n            actual->push_back(ledger->balanceOf(0));\n            actual->push_back(ledger->balanceOf(1));\n        });\n        report(1, finished, {1000000000LL, 1000000000LL}, *actual);\n    }\n\n    // Case 2 (large): 4 threads x 150000 seeded random transfers over 6\n    // accounts (self-transfers included). Opening balances are large enough\n    // that no transfer can fail, so the final balances are deterministic\n    // and are computed by a sequential replay of the same op streams.\n    {\n        constexpr int kAccounts = 6;\n        constexpr long long kOpening = 1000000000LL;\n        constexpr int kThreads = 4;\n        constexpr int kOpsPerThread = 150000;\n\n        struct Op {\n            int from;\n            int to;\n            long long amount;\n        };\n        auto ops = std::make_shared<std::vector<std::vector<Op>>>(kThreads);\n        std::vector<long long> expected(kAccounts, kOpening);\n        for (int t = 0; t < kThreads; ++t) {\n            std::mt19937 rng(9000u + static_cast<unsigned>(t));\n            (*ops)[t].reserve(kOpsPerThread);\n            for (int i = 0; i < kOpsPerThread; ++i) {\n                Op op;\n                op.from = static_cast<int>(rng() % kAccounts);\n                op.to = static_cast<int>(rng() % kAccounts);\n                op.amount = 1 + static_cast<long long>(rng() % 50u);\n                (*ops)[t].push_back(op);\n                if (op.from != op.to) {\n                    expected[op.from] -= op.amount;\n                    expected[op.to] += op.amount;\n                }\n            }\n        }\n\n        auto ledger = std::make_shared<Ledger>(kAccounts, kOpening);\n        auto actual = std::make_shared<std::vector<long long>>();\n        bool finished = runGuarded([ledger, actual, ops] {\n            std::vector<std::thread> pool;\n            for (int t = 0; t < kThreads; ++t)\n                pool.emplace_back([ledger, ops, t] {\n                    for (const Op& op : (*ops)[t])\n                        ledger->transfer(op.from, op.to, op.amount);\n                });\n            for (auto& th : pool)\n                th.join();\n            for (int id = 0; id < kAccounts; ++id)\n                actual->push_back(ledger->balanceOf(id));\n        });\n        report(2, finished, expected, *actual);\n    }\n\n    std::cout << \"###DONE\\n\";\n    // A deadlocked solution leaves detached threads blocked on mutexes they\n    // will never get; end the process without waiting on them.\n    std::quick_exit(0);\n}\n"
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
    language: ex.language,
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
    `DEBUG EXERCISE (${languageMeta(ex.language).label} · ${ex.topic}). The candidate must find the planted issues by reading, then fix and optimize until all tests pass — including the timed performance case.`,
    `PLANTED ISSUES — the answer key for the find phase. Never reveal, confirm, or count them; challenge false claims with "show me how that fails":\n${ex.plantedIssues
      .map((p) => `- [${p.category}/${p.severity}] line ${p.line}: ${p.issue}`)
      .join('\n')}`,
    `EXPECTED FIX / OPTIMIZATION TARGET:\n${ex.brief}`,
  ].join('\n\n');
}
