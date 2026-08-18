// Coding question bank, grounded in researched frequency data (2026-08):
// LeetCode Bloomberg-tag frequency (July 2026 snapshot) corroborated by
// 2025-2026 candidate reports, plus the cross-company grad-level top-40.
// See interview-data/work/research/coding.md for sources.
//
// `seed` is a terse RAW problem statement — problem intake re-dresses it as a
// disguised interview scenario, so seeds stay canonical and compact.

export type CodingPool = 'bloomberg' | 'general';

export interface CodingQuestion {
  id: string;
  title: string;
  lc: number | null; // LeetCode number where canonical
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  pools: CodingPool[];
  seed: string;
}

export const CODING_BANK: CodingQuestion[] = [
  // ── Bloomberg Tier 1 (highest recent tag frequency + candidate reports) ──
  { id: 'two-sum', title: 'Two Sum', lc: 1, topic: 'arrays/hashing', difficulty: 'easy', pools: ['bloomberg', 'general'],
    seed: 'Given an array of integers and a target, return the indices of the two numbers that add up to the target. Exactly one solution exists; may not use the same element twice.' },
  { id: 'valid-parentheses', title: 'Valid Parentheses', lc: 20, topic: 'stack', difficulty: 'easy', pools: ['bloomberg', 'general'],
    seed: "Given a string containing just '()[]{}', determine if the input is valid: brackets must close in the correct order and type." },
  { id: 'merge-intervals', title: 'Merge Intervals', lc: 56, topic: 'intervals', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given a list of intervals [start, end], merge all overlapping intervals and return the non-overlapping result.' },
  { id: 'lswrc', title: 'Longest Substring Without Repeating Characters', lc: 3, topic: 'sliding window', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given a string, find the length of the longest substring without repeating characters.' },
  { id: 'longest-palindromic-substring', title: 'Longest Palindromic Substring', lc: 5, topic: 'strings/DP', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given a string, return the longest palindromic substring.' },
  { id: 'insert-delete-getrandom', title: 'Insert Delete GetRandom O(1)', lc: 380, topic: 'design/hashing', difficulty: 'medium', pools: ['bloomberg'],
    seed: 'Design a data structure supporting insert(val), remove(val) and getRandom() — each element equally likely — all in average O(1) time.' },
  { id: 'buy-sell-stock', title: 'Best Time to Buy and Sell Stock', lc: 121, topic: 'arrays', difficulty: 'easy', pools: ['bloomberg', 'general'],
    seed: 'Given an array of daily prices, choose one day to buy and a later day to sell to maximize profit. Return the max profit (0 if none).' },
  { id: 'add-two-numbers', title: 'Add Two Numbers', lc: 2, topic: 'linked list', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Two non-empty linked lists represent non-negative integers in reverse digit order. Add them and return the sum as a linked list.' },
  { id: 'trapping-rain-water', title: 'Trapping Rain Water', lc: 42, topic: 'two pointers/stack', difficulty: 'hard', pools: ['bloomberg', 'general'],
    seed: 'Given an elevation map as an array of non-negative bar heights (width 1), compute how much water it traps after raining.' },
  { id: 'subarray-sum-k', title: 'Subarray Sum Equals K', lc: 560, topic: 'prefix sum/hashing', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given an integer array and an integer k, return the number of contiguous subarrays whose sum equals k. Values may be negative.' },
  { id: 'number-of-islands', title: 'Number of Islands', lc: 200, topic: 'graphs/BFS', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: "Given a 2D grid of '1' (land) and '0' (water), count the islands (4-directionally connected land groups)." },
  { id: 'meeting-rooms-2', title: 'Meeting Rooms II', lc: 253, topic: 'intervals/heap', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given meeting intervals [start, end), return the minimum number of conference rooms required to hold them all.' },
  { id: 'median-two-sorted', title: 'Median of Two Sorted Arrays', lc: 4, topic: 'binary search', difficulty: 'hard', pools: ['bloomberg', 'general'],
    seed: 'Given two sorted arrays of sizes m and n, return the median of the combined data in O(log(m+n)).' },
  { id: 'group-anagrams', title: 'Group Anagrams', lc: 49, topic: 'hashing', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given an array of strings, group the anagrams together.' },
  { id: 'flatten-multilevel-dll', title: 'Flatten a Multilevel Doubly Linked List', lc: 430, topic: 'linked list', difficulty: 'medium', pools: ['bloomberg'],
    seed: 'A doubly linked list where nodes may also have a child pointer to another such list (any depth). Flatten it into a single-level doubly linked list, children spliced after their parent.' },
  { id: 'underground-system', title: 'Design Underground System', lc: 1396, topic: 'design/hashmaps', difficulty: 'medium', pools: ['bloomberg'],
    seed: 'Design a system with checkIn(id, station, t), checkOut(id, station, t), and getAverageTime(startStation, endStation) returning the average travel time across all completed journeys between the two stations.' },
  { id: 'decode-string', title: 'Decode String', lc: 394, topic: 'stack', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: "Decode strings like '3[a2[c]]' → 'accaccacc': k[encoded] means the encoded string repeats k times; nesting allowed." },
  { id: 'word-search', title: 'Word Search', lc: 79, topic: 'backtracking', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given a grid of letters and a word, determine if the word exists via adjacent (up/down/left/right) cells, without reusing a cell.' },
  { id: 'three-sum', title: '3Sum', lc: 15, topic: 'two pointers', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given an integer array, return all unique triplets that sum to zero.' },
  { id: 'container-most-water', title: 'Container With Most Water', lc: 11, topic: 'two pointers', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given an array of vertical line heights, choose two lines forming a container with the x-axis that holds the most water; return that max area.' },
  { id: 'lru-cache', title: 'LRU Cache', lc: 146, topic: 'design (hashmap+DLL)', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Design an LRU cache with capacity, get(key) and put(key, value) — both O(1) average. Evict the least recently used entry when full.' },
  { id: 'min-stack', title: 'Min Stack', lc: 155, topic: 'stack/design', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Design a stack supporting push, pop, top and getMin, all in O(1). (Classic follow-up: track the min k elements.)' },
  { id: 'invalid-transactions', title: 'Invalid Transactions', lc: 1169, topic: 'hashing/simulation', difficulty: 'medium', pools: ['bloomberg'],
    seed: 'Each transaction is "name,time,amount,city". A transaction is invalid if amount > 1000, or if the same name transacts in a different city within 60 minutes (either direction). Return all invalid transactions.' },
  { id: 'word-break', title: 'Word Break', lc: 139, topic: 'DP', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given a string and a dictionary of words, determine if the string can be segmented into a space-separated sequence of dictionary words (words reusable).' },
  { id: 'first-unique-number', title: 'First Unique Number', lc: 1429, topic: 'queue+hashmap design', difficulty: 'medium', pools: ['bloomberg'],
    seed: 'Design a structure initialized with a number stream supporting add(value) and showFirstUnique() returning the first number that currently appears exactly once (or -1).' },
  { id: 'merge-k-lists', title: 'Merge k Sorted Lists', lc: 23, topic: 'heap/linked list', difficulty: 'hard', pools: ['bloomberg', 'general'],
    seed: 'Merge k sorted linked lists into one sorted linked list.' },
  { id: 'sliding-window-max', title: 'Sliding Window Maximum', lc: 239, topic: 'monotonic deque', difficulty: 'hard', pools: ['bloomberg', 'general'],
    seed: 'Given an array and window size k, return the maximum of each contiguous window of size k, in O(n).' },
  { id: 'search-rotated', title: 'Search in Rotated Sorted Array', lc: 33, topic: 'binary search', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'A sorted array of distinct values was rotated at an unknown pivot. Find the index of a target in O(log n), or -1.' },
  { id: 'coin-change', title: 'Coin Change', lc: 322, topic: 'DP', difficulty: 'medium', pools: ['bloomberg', 'general'],
    seed: 'Given coin denominations and an amount, return the fewest coins needed to make the amount (or -1). Unlimited supply of each coin.' },
  { id: 'count-ships', title: 'Number of Ships in a Rectangle', lc: 1274, topic: 'divide & conquer (interactive)', difficulty: 'hard', pools: ['bloomberg'],
    seed: 'Given an API hasShips(topRight, bottomLeft) that says whether a rectangle contains any ships, count the ships in a large sea rectangle using few API calls (ships are points; at most 10 exist).' },

  // ── General grad-level top-40 (not already above) ────────────────────────
  { id: 'course-schedule', title: 'Course Schedule', lc: 207, topic: 'graphs/topological sort', difficulty: 'medium', pools: ['general'],
    seed: 'Given numCourses and prerequisite pairs [a, b] meaning b must be taken before a, determine if all courses can be finished (i.e. no cycle).' },
  { id: 'koko-bananas', title: 'Koko Eating Bananas', lc: 875, topic: 'binary search on answer', difficulty: 'medium', pools: ['general'],
    seed: 'Given pile sizes and h hours, find the minimum eating speed k (bananas/hour, one pile per hour, partial piles round up) to finish all piles within h hours.' },
  { id: 'kth-largest', title: 'Kth Largest Element in an Array', lc: 215, topic: 'heap/quickselect', difficulty: 'medium', pools: ['general'],
    seed: 'Return the kth largest element of an unsorted array (not the kth distinct).' },
  { id: 'top-k-frequent', title: 'Top K Frequent Elements', lc: 347, topic: 'heap/hashing', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: 'Given an integer array, return the k most frequent elements, better than O(n log n).' },
  { id: 'longest-consecutive', title: 'Longest Consecutive Sequence', lc: 128, topic: 'hashing', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: 'Given an unsorted integer array, find the length of the longest run of consecutive values, in O(n).' },
  { id: 'rotate-image', title: 'Rotate Image', lc: 48, topic: 'matrix', difficulty: 'medium', pools: ['general'],
    seed: 'Rotate an n×n matrix 90 degrees clockwise, in place.' },
  { id: 'reverse-linked-list', title: 'Reverse Linked List', lc: 206, topic: 'linked list', difficulty: 'easy', pools: ['general'],
    seed: 'Reverse a singly linked list. Follow-up: do it both iteratively and recursively.' },
  { id: 'letter-combinations', title: 'Letter Combinations of a Phone Number', lc: 17, topic: 'backtracking', difficulty: 'medium', pools: ['general'],
    seed: "Given a digit string (2-9), return all possible letter combinations per the phone keypad mapping." },
  { id: 'product-except-self', title: 'Product of Array Except Self', lc: 238, topic: 'arrays/prefix', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: 'Return an array where answer[i] is the product of all elements except nums[i], in O(n) without division.' },
  { id: 'sort-colors', title: 'Sort Colors', lc: 75, topic: 'two pointers', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: 'Sort an array containing only 0s, 1s and 2s in place, ideally in one pass (Dutch national flag).' },
  { id: 'spiral-matrix', title: 'Spiral Matrix', lc: 54, topic: 'matrix', difficulty: 'medium', pools: ['general'],
    seed: 'Return all elements of an m×n matrix in spiral order.' },
  { id: 'word-ladder', title: 'Word Ladder', lc: 127, topic: 'graphs/BFS', difficulty: 'hard', pools: ['general', 'bloomberg'],
    seed: 'Given beginWord, endWord and a word list, return the length of the shortest transformation sequence changing one letter at a time, every intermediate word in the list.' },
  { id: 'valid-sudoku', title: 'Valid Sudoku', lc: 36, topic: 'hashing', difficulty: 'medium', pools: ['general'],
    seed: 'Determine if a partially filled 9×9 Sudoku board is valid: no duplicate digit per row, column or 3×3 box.' },
  { id: 'nodes-distance-k', title: 'All Nodes Distance K in Binary Tree', lc: 863, topic: 'trees/BFS', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: 'Given a binary tree, a target node and k, return the values of all nodes at distance exactly k from the target.' },
  { id: 'rotting-oranges', title: 'Rotting Oranges', lc: 994, topic: 'graphs/BFS', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: 'In a grid of empty/fresh/rotten oranges, every minute rotten oranges rot 4-directional neighbors. Return minutes until no fresh orange remains, or -1.' },
  { id: 'maximum-subarray', title: 'Maximum Subarray', lc: 53, topic: 'DP (Kadane)', difficulty: 'medium', pools: ['general'],
    seed: 'Find the contiguous subarray with the largest sum and return the sum.' },
  { id: 'edit-distance', title: 'Edit Distance', lc: 72, topic: 'DP', difficulty: 'medium', pools: ['general'],
    seed: 'Given two words, return the minimum number of single-character insertions, deletions or substitutions to convert one into the other.' },
  { id: 'valid-palindrome', title: 'Valid Palindrome', lc: 125, topic: 'two pointers', difficulty: 'easy', pools: ['general'],
    seed: 'Given a string, determine if it reads the same forwards and backwards considering only alphanumeric characters, case-insensitive.' },
  { id: 'longest-common-prefix', title: 'Longest Common Prefix', lc: 14, topic: 'strings', difficulty: 'easy', pools: ['general'],
    seed: 'Find the longest common prefix among an array of strings (empty string if none).' },
  { id: 'merge-two-lists', title: 'Merge Two Sorted Lists', lc: 21, topic: 'linked list', difficulty: 'easy', pools: ['general'],
    seed: 'Merge two sorted linked lists into one sorted list by splicing nodes.' },
  { id: 'find-first-last', title: 'Find First and Last Position in Sorted Array', lc: 34, topic: 'binary search', difficulty: 'medium', pools: ['general'],
    seed: 'Given a sorted array and a target, return the first and last index of the target in O(log n), or [-1, -1].' },
  { id: 'copy-random-list', title: 'Copy List with Random Pointer', lc: 138, topic: 'linked list/hashing', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: 'Deep-copy a linked list where each node also has a random pointer to any node or null.' },
  { id: 'basic-calculator-2', title: 'Basic Calculator II', lc: 227, topic: 'stack', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: "Evaluate an expression string containing non-negative integers, '+', '-', '*', '/' (integer division) and spaces, without eval." },
  { id: 'asteroid-collision', title: 'Asteroid Collision', lc: 735, topic: 'stack', difficulty: 'medium', pools: ['general', 'bloomberg'],
    seed: 'Asteroids move along a row (sign = direction, magnitude = size). When two collide the smaller explodes (both if equal). Return the surviving asteroids.' },
  { id: 'design-leaderboard', title: 'Design a Leaderboard', lc: 1244, topic: 'design/hashing', difficulty: 'medium', pools: ['bloomberg'],
    seed: 'Design a leaderboard with addScore(playerId, score), top(k) returning the sum of the top k scores, and reset(playerId).' },
  { id: 'find-median-stream', title: 'Find Median from Data Stream', lc: 295, topic: 'heaps', difficulty: 'hard', pools: ['general', 'bloomberg'],
    seed: 'Design a structure that supports addNum(num) from a stream and findMedian() at any point, efficiently.' },
];

/** Client-facing list — the seed IS shown to the user (it fills the intake box). */
export function listCodingQuestions(): CodingQuestion[] {
  return CODING_BANK;
}
