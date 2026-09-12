import type { DebugExercise } from './debug-bank.js';

// Debug-and-optimize exercises for the languages the original bank did not
// cover. Same contract as the core bank: the seeded code compiles and fails,
// the planted issues are real and findable by reading, and the harness carries
// a large timed case so a correct-but-quadratic fix still fails.
//
// Each planted issue's `line` is 1-based into that exercise's `code`.

const JS_SESSION_ROLLUPS = `// Rollups over a stream of session events. Each event looks like:
//   { user: "u17", type: "click", durationMs: 1200 }

const totals = {};

function uniqueUsers(events) {
  // Distinct users, in first-seen order.
  const users = [];
  for (const event of events) {
    if (!users.includes(event.user)) {
      users.push(event.user);
    }
  }
  return users;
}

function slowestDurations(events, k) {
  // The k longest durations, longest first.
  const durations = events.map((event) => event.durationMs);
  durations.sort();
  return durations.slice(-k).reverse();
}

function countByType(events) {
  // How many events of each type.
  for (const event of events) {
    totals[event.type] = (totals[event.type] || 0) + 1;
  }
  return totals;
}

module.exports = { uniqueUsers, slowestDurations, countByType };
`;

const JS_HARNESS = `const { uniqueUsers, slowestDurations, countByType } = require('./solution');

function show(value) {
  return JSON.stringify(value);
}

const cases = [];

// 0: distinct users keep first-seen order
cases.push(() => {
  const events = [
    { user: 'a', type: 'click', durationMs: 10 },
    { user: 'b', type: 'view', durationMs: 20 },
    { user: 'a', type: 'view', durationMs: 30 },
  ];
  return [show(uniqueUsers(events)), show(['a', 'b'])];
});

// 1: durations sort numerically, not as text
cases.push(() => {
  const events = [9, 100, 10, 25].map((ms) => ({ user: 'a', type: 'click', durationMs: ms }));
  return [show(slowestDurations(events, 2)), show([100, 25])];
});

// 2: counting twice must not double count
cases.push(() => {
  const events = [
    { user: 'a', type: 'click', durationMs: 1 },
    { user: 'b', type: 'click', durationMs: 2 },
    { user: 'c', type: 'view', durationMs: 3 },
  ];
  countByType(events);
  return [show(countByType(events)), show({ click: 2, view: 1 })];
});

// 3: an empty stream is not an error
cases.push(() => [show([uniqueUsers([]), slowestDurations([], 3)]), show([[], []])]);

// 4: performance, 300k events across 100k users
cases.push(() => {
  const events = [];
  for (let i = 0; i < 300000; i++) {
    events.push({ user: 'u' + (i % 100000), type: i % 2 ? 'click' : 'view', durationMs: i % 997 });
  }
  return [String(uniqueUsers(events).length), '100000'];
});

let index = 0;
for (const run of cases) {
  const [actual, expected] = run();
  if (actual === expected) {
    console.log('###CASE ' + index + ' PASS');
  } else {
    console.log('###CASE ' + index + ' FAIL');
    console.log('###EXPECTED ' + expected);
    console.log('###ACTUAL ' + actual);
  }
  index++;
}
console.log('###DONE');
`;

const JAVA_INVENTORY = `import java.util.*;

// Rollups over a warehouse inventory feed.
class Solution {

    // Distinct SKUs, in first-seen order.
    public List<String> distinctSkus(List<String> skus) {
        List<String> seen = new ArrayList<>();
        for (String sku : skus) {
            if (!seen.contains(sku)) {
                seen.add(sku);
            }
        }
        return seen;
    }

    // Whether the feed contains a SKU.
    public boolean hasSku(List<String> skus, String target) {
        for (String sku : skus) {
            if (sku == target) {
                return true;
            }
        }
        return false;
    }

    // Mean unit price, in pence, rounded down.
    public int averagePrice(int[] pricesPence) {
        int sum = 0;
        for (int price : pricesPence) {
            sum += price;
        }
        return sum / pricesPence.length;
    }
}
`;

const JAVA_HARNESS = `import java.util.*;

public class Main {
    static int index = 0;

    static void check(String actual, String expected) {
        if (actual.equals(expected)) {
            System.out.println("###CASE " + index + " PASS");
        } else {
            System.out.println("###CASE " + index + " FAIL");
            System.out.println("###EXPECTED " + expected);
            System.out.println("###ACTUAL " + actual);
        }
        index++;
    }

    public static void main(String[] args) {
        Solution s = new Solution();

        // 0: distinct SKUs keep first-seen order
        check(s.distinctSkus(Arrays.asList("a", "b", "a", "c")).toString(), "[a, b, c]");

        // 1: a SKU built at run time is still a match
        List<String> feed = Arrays.asList("widget-1", "widget-2");
        String target = new StringBuilder("widget").append("-2").toString();
        check(String.valueOf(s.hasSku(feed, target)), "true");

        // 2: a SKU that is absent
        check(String.valueOf(s.hasSku(feed, "widget-9")), "false");

        // 3: average of small prices
        check(String.valueOf(s.averagePrice(new int[] {100, 200, 301})), "200");

        // 4: average of prices that overflow a running int
        int[] big = new int[10];
        Arrays.fill(big, 900_000_000);
        check(String.valueOf(s.averagePrice(big)), "900000000");

        // 5: performance, 200k SKUs with 50k distinct
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 200_000; i++) {
            many.add("sku-" + (i % 50_000));
        }
        check(String.valueOf(s.distinctSkus(many).size()), "50000");

        System.out.println("###DONE");
    }
}
`;

export const LANGUAGE_DEBUG_BANK: DebugExercise[] = [
  {
    id: 'dbg-js-session-rollups',
    title: 'Session activity rollups',
    topic: 'dsinternals',
    language: 'javascript',
    scenario:
      "This module rolls up session events for our analytics page. Two complaints came in: the slowest-sessions list looks wrong, and the numbers drift upward when the page refreshes. It also crawls on a real day of traffic. Have a read and get the tests green.",
    code: JS_SESSION_ROLLUPS,
    plantedIssues: [
      {
        category: 'perf',
        severity: 'high',
        line: 10,
        issue:
          'users.includes is a linear scan of an array inside the loop, so uniqueUsers is O(n*u) and quadratic in practice. The perf case (300k events, 100k distinct users) times out. Track membership in a Set alongside the ordered array.',
      },
      {
        category: 'bug',
        severity: 'high',
        line: 20,
        issue:
          "Array.prototype.sort with no comparator sorts by string, so [9, 100, 10, 25] becomes [10, 100, 25, 9] and the slowest list is wrong. Needs sort((a, b) => a - b), or a descending comparator with slice(0, k).",
      },
      {
        category: 'bug',
        severity: 'high',
        line: 4,
        issue:
          'totals is module-level state that countByType mutates and returns, so counts accumulate across calls and the caller receives a live reference to internal state. Build a fresh object per call.',
      },
    ],
    brief:
      'Expected fixes: (1) Set-based membership in uniqueUsers, keeping the array for first-seen order, which takes the perf case from quadratic to linear; (2) a numeric comparator in slowestDurations; (3) a per-call accumulator in countByType instead of the module-level totals object. Partial credit: finding the sort bug is the most commonly spotted, the shared-state bug is the one candidates miss, and the perf issue is what the timed case forces. A candidate who replaces includes with a Set but leaves the returned array unordered has broken case 0, so watch for that.',
    tests: [
      { input: 'three events, two users', expected: 'first-seen order preserved' },
      { input: 'durations 9, 100, 10, 25, k = 2', expected: 'the two longest, numerically' },
      { input: 'countByType called twice on the same events', expected: 'counts do not double' },
      { input: 'empty event stream', expected: 'empty results, no error' },
      { input: '300k events, 100k distinct users', expected: '100000 distinct, within the time limit' },
    ],
    harness: JS_HARNESS,
  },
  {
    id: 'dbg-java-inventory-rollups',
    title: 'Inventory feed rollups',
    topic: 'dsinternals',
    language: 'java',
    scenario:
      "This class summarises our warehouse inventory feed. Support says a SKU lookup sometimes reports missing stock that is definitely there, and the average price goes negative on the big regional feeds. It is also slow on a full feed. Read it and get the tests green.",
    code: JAVA_INVENTORY,
    plantedIssues: [
      {
        category: 'perf',
        severity: 'high',
        line: 10,
        issue:
          'ArrayList.contains is a linear scan inside the loop, making distinctSkus O(n*d). The perf case (200k SKUs, 50k distinct) blows the time limit. Use a HashSet for membership and keep the list for order, or a LinkedHashSet.',
      },
      {
        category: 'bug',
        severity: 'high',
        line: 20,
        issue:
          'Comparing strings with == compares references, not contents. It appears to work for literals because of the string constant pool, and fails for any string built at run time, which is exactly what case 1 does. Use equals.',
      },
      {
        category: 'bug',
        severity: 'high',
        line: 29,
        issue:
          'The running total is an int, so a feed whose prices sum past 2^31-1 overflows and the average comes out negative. Accumulate into a long. Dividing by pricesPence.length also throws on an empty array, which is worth raising even though no test covers it.',
      },
    ],
    brief:
      'Expected fixes: (1) HashSet or LinkedHashSet membership in distinctSkus, preserving first-seen order; (2) equals instead of == in hasSku; (3) a long accumulator in averagePrice. The == bug is the highest-signal one: a candidate who says "it works for the literals in the test but breaks for anything built at run time" has understood the constant pool rather than memorised a rule. Credit spotting the empty-array division even though it is untested. Watch for a candidate who switches to HashSet and loses the ordering guarantee in case 0.',
    tests: [
      { input: 'a, b, a, c', expected: 'a, b, c in first-seen order' },
      { input: 'a target string built with StringBuilder', expected: 'true' },
      { input: 'a SKU that is not in the feed', expected: 'false' },
      { input: 'prices 100, 200, 301', expected: '200' },
      { input: 'ten prices of 900,000,000', expected: '900000000, no overflow' },
      { input: '200k SKUs, 50k distinct', expected: '50000 within the time limit' },
    ],
    harness: JAVA_HARNESS,
  },
];
