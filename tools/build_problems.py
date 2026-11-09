"""Build data/problems.json from reference solutions.

Expected outputs are computed by the reference solutions below, so every
test case is correct by construction. Reference code stays on the server
and is never sent to the browser.

    python tools/build_problems.py
"""

from __future__ import annotations

import json
import random
from collections import Counter, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rng = random.Random(20261109)


# ── reference solutions (stdin text → stdout text) ───────────────────────────

def ref_mess_tokens(inp):
    it = inp.split()
    n, t = int(it[0]), int(it[1])
    a = list(map(int, it[2:2 + n]))
    first = {}
    for j, v in enumerate(a):
        if t - v in first:
            return f"{first[t - v] + 1} {j + 1}"
        first.setdefault(v, j)
    return "-1"


def ref_brackets(inp):
    lines = inp.split("\n")
    t = int(lines[0])
    out = []
    pairs = {")": "(", "]": "[", "}": "{"}
    for s in lines[1:1 + t]:
        s = s.strip()
        st = []
        ok = True
        for ch in s:
            if ch in "([{":
                st.append(ch)
            elif ch in pairs:
                if not st or st.pop() != pairs[ch]:
                    ok = False
                    break
        out.append("YES" if ok and not st else "NO")
    return "\n".join(out)


def ref_attendance(inp):
    it = inp.split()
    n, k = int(it[0]), int(it[1])
    s = it[2] if len(it) > 2 else ""
    left = absent = best = 0
    for right, ch in enumerate(s[:n]):
        if ch == "A":
            absent += 1
        while absent > k:
            if s[left] == "A":
                absent -= 1
            left += 1
        best = max(best, right - left + 1)
    return str(best)


def ref_canteen(inp):
    it = list(map(int, inp.split()))
    n = it[0]
    iv = sorted((it[1 + 2 * i], it[2 + 2 * i]) for i in range(n))
    merged = []
    for s, e in iv:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return "\n".join([str(len(merged))] + [f"{s} {e}" for s, e in merged])


def ref_skill_tags(inp):
    it = inp.split()
    n, k = int(it[0]), int(it[1])
    c = Counter(it[2:2 + n])
    top = sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:k]
    return "\n".join(f"{tag} {cnt}" for tag, cnt in top)


def ref_exam_papers(inp):
    it = list(map(int, inp.split()))
    n, m = it[0], it[1]
    p = it[2:2 + n]
    lo, hi = max(p), sum(p)

    def ok(cap):
        used, cur = 1, 0
        for x in p:
            if cur + x > cap:
                used += 1
                cur = 0
            cur += x
        return used <= m

    while lo < hi:
        mid = (lo + hi) // 2
        if ok(mid):
            hi = mid
        else:
            lo = mid + 1
    return str(lo)


def ref_shuttle(inp):
    it = list(map(int, inp.split()))
    n, m = it[0], it[1]
    adj = [[] for _ in range(n + 1)]
    pos = 2
    for _ in range(m):
        u, v = it[pos], it[pos + 1]
        pos += 2
        adj[u].append(v)
        adj[v].append(u)
    s, d = it[pos], it[pos + 1]
    dist = [-1] * (n + 1)
    dist[s] = 0
    q = deque([s])
    while q:
        u = q.popleft()
        for v in adj[u]:
            if dist[v] < 0:
                dist[v] = dist[u] + 1
                q.append(v)
    return str(dist[d])


def ref_anagrams(inp):
    it = inp.split()
    n = int(it[0])
    c = Counter("".join(sorted(w)) for w in it[1:1 + n])
    return f"{len(c)} {max(c.values()) if c else 0}"


def ref_rain(inp):
    it = list(map(int, inp.split()))
    n = it[0]
    h = it[1:1 + n]
    l, r = 0, n - 1
    lm = rm = total = 0
    while l < r:
        if h[l] < h[r]:
            lm = max(lm, h[l])
            total += lm - h[l]
            l += 1
        else:
            rm = max(rm, h[r])
            total += rm - h[r]
            r -= 1
    return str(total)


def ref_coupons(inp):
    it = list(map(int, inp.split()))
    n, amount = it[0], it[1]
    coins = it[2:2 + n]
    inf = float("inf")
    dp = [0] + [inf] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return str(dp[amount] if dp[amount] != inf else -1)


def ref_busier(inp):
    it = list(map(int, inp.split()))
    n = it[0]
    a = it[1:1 + n]
    res = [0] * n
    st = []
    for i, v in enumerate(a):
        while st and a[st[-1]] < v:
            j = st.pop()
            res[j] = i - j
        st.append(i)
    return " ".join(map(str, res))


def ref_notice(inp):
    line = inp.split("\n")[0]
    return " ".join(reversed(line.split()))


def ref_rotated(inp):
    it = list(map(int, inp.split()))
    n = it[0]
    a = it[1:1 + n]
    q = it[1 + n]
    idx = {v: i for i, v in enumerate(a)}
    return "\n".join(str(idx.get(x, -1)) for x in it[2 + n:2 + n + q])


def ref_spiral(inp):
    it = list(map(int, inp.split()))
    r, c = it[0], it[1]
    g = [it[2 + i * c:2 + (i + 1) * c] for i in range(r)]
    out = []
    top, bot, left, right = 0, r - 1, 0, c - 1
    while top <= bot and left <= right:
        for j in range(left, right + 1):
            out.append(g[top][j])
        top += 1
        for i in range(top, bot + 1):
            out.append(g[i][right])
        right -= 1
        if top <= bot:
            for j in range(right, left - 1, -1):
                out.append(g[bot][j])
            bot -= 1
        if left <= right:
            for i in range(bot, top - 1, -1):
                out.append(g[i][left])
            left += 1
    return " ".join(map(str, out))


def ref_ranking(inp):
    lines = inp.strip().split("\n")
    n = int(lines[0])
    rows = []
    for line in lines[1:1 + n]:
        name, cgpa, back = line.split()
        rows.append((int(back), -float(cgpa), name))
    rows.sort()
    return "\n".join(r[2] for r in rows)


# ── test generators ──────────────────────────────────────────────────────────

def g_mess():
    tests = ["5 9\n2 7 11 15 1", "4 10\n5 5 5 5", "3 100\n1 2 3", "1 4\n4", "6 0\n-3 1 3 -1 0 0"]
    for size in (40, 2000, 20000):
        a = [rng.randint(-10**6, 10**6) for _ in range(size)]
        t = a[rng.randrange(size)] + a[rng.randrange(size)] if size < 20000 else 3 * 10**6
        tests.append(f"{size} {t}\n" + " ".join(map(str, a)))
    return tests


def g_brackets():
    cases = ["()", "([]{})", "(]", "((", "", "}{", "{[()()]}", "([)]", "[" * 500 + "]" * 500, "(" * 499 + ")" * 500]
    return [f"{len(cases)}\n" + "\n".join(cases), "3\n{}\n{[}]\n[[[]]]"]


def g_attendance():
    tests = ["10 1\nPPAPPPAPPP", "5 0\nAAAAA", "5 5\nAAAAA", "1 0\nP", "8 2\nAPAPAPAP"]
    for size, k in ((60, 3), (5000, 40), (50000, 500)):
        s = "".join(rng.choice("PPPPA") for _ in range(size))
        tests.append(f"{size} {k}\n{s}")
    return tests


def g_canteen():
    tests = ["4\n1 3\n2 6\n8 10\n15 18", "2\n1 4\n4 5", "1\n5 7", "3\n1 10\n2 3\n4 5", "3\n6 8\n1 2\n3 4"]
    for size in (50, 3000):
        iv = []
        for _ in range(size):
            s = rng.randint(0, size * 3)
            iv.append(f"{s} {s + rng.randint(0, 6)}")
        tests.append(f"{size}\n" + "\n".join(iv))
    return tests


WORDS = ["python", "java", "sql", "react", "docker", "git", "aws", "linux", "cpp", "flask", "django", "excel", "figma", "kotlin", "go"]


def g_skill_tags():
    tests = ["7 2\npython java python sql java python react", "3 3\nb a c", "4 1\ngo go c c", "1 1\nsql"]
    for size, k in ((100, 5), (20000, 10)):
        tags = [rng.choice(WORDS[: rng.randint(4, len(WORDS))]) for _ in range(size)]
        tests.append(f"{size} {k}\n" + " ".join(tags))
    return tests


def g_exam_papers():
    tests = ["4 2\n12 34 67 90", "3 3\n10 20 30", "5 1\n1 2 3 4 5", "1 1\n100", "6 4\n5 5 5 5 5 5"]
    for size, m in ((200, 7), (20000, 37)):
        p = [rng.randint(1, 10**4) for _ in range(size)]
        tests.append(f"{size} {m}\n" + " ".join(map(str, p)))
    return tests


def g_shuttle():
    tests = ["5 5\n1 2\n2 3\n3 4\n4 5\n1 3\n1 5", "3 1\n1 2\n1 3", "2 1\n1 2\n2 2", "4 4\n1 2\n2 3\n3 1\n3 4\n1 4"]
    for n, m in ((60, 90), (5000, 12000)):
        edges = [f"{rng.randint(1, n)} {rng.randint(1, n)}" for _ in range(m)]
        tests.append(f"{n} {m}\n" + "\n".join(edges) + f"\n1 {n}")
    return tests


def g_anagrams():
    tests = ["6\nlisten silent enlist google gogole cat", "3\na b c", "4\nabc bca cab abc", "1\nz"]
    for size in (200, 15000):
        base = ["".join(rng.choice("abcde") for _ in range(rng.randint(2, 5))) for _ in range(size // 6 + 1)]
        words = []
        for _ in range(size):
            w = list(rng.choice(base))
            rng.shuffle(w)
            words.append("".join(w))
        tests.append(f"{size}\n" + " ".join(words))
    return tests


def g_rain():
    tests = ["12\n0 1 0 2 1 0 1 3 2 1 2 1", "6\n4 2 0 3 2 5", "1\n5", "3\n1 2 3", "5\n5 0 0 0 5", "2\n3 3"]
    for size in (300, 50000):
        tests.append(f"{size}\n" + " ".join(str(rng.randint(0, 10**4)) for _ in range(size)))
    return tests


def g_coupons():
    tests = ["3 11\n1 2 5", "1 3\n2", "1 0\n1", "4 63\n1 5 10 25", "2 7\n2 4", "3 6249\n186 419 83"]
    for amount in (900, 5000):
        coins = sorted(set(rng.randint(3, 200) for _ in range(6)))
        tests.append(f"{len(coins)} {amount}\n" + " ".join(map(str, coins)))
    return tests


def g_busier():
    tests = ["8\n73 74 75 71 69 72 76 73", "4\n30 40 50 60", "3\n90 60 30", "1\n10", "5\n5 5 5 5 6"]
    for size in (300, 50000):
        tests.append(f"{size}\n" + " ".join(str(rng.randint(10, 400)) for _ in range(size)))
    return tests


def g_notice():
    return ["Placement drive moved to Friday", "   hello   world  ", "single", "a b c d e f g",
            " ".join(rng.choice(["drive", "lab", "exam", "fest", "notice", "hall", "TPO"]) for _ in range(800))]


def g_rotated():
    tests = ["7\n4 5 6 7 0 1 2\n3\n0 3 4", "1\n1\n2\n1 0", "5\n1 2 3 4 5\n2\n5 6"]
    for size, q in ((500, 200), (20000, 20000)):
        a = sorted(rng.sample(range(-10**6, 10**6), size))
        k = rng.randrange(size)
        a = a[k:] + a[:k]
        qs = [rng.choice(a) if rng.random() < 0.7 else rng.randint(-10**6, 10**6) for _ in range(q)]
        tests.append(f"{size}\n" + " ".join(map(str, a)) + f"\n{q}\n" + " ".join(map(str, qs)))
    return tests


def g_spiral():
    tests = ["3 3\n1 2 3\n4 5 6\n7 8 9", "3 4\n1 2 3 4\n5 6 7 8\n9 10 11 12", "1 4\n1 2 3 4", "4 1\n1\n2\n3\n4", "1 1\n7"]
    for r, c in ((7, 9), (120, 80)):
        rows = [" ".join(str(rng.randint(0, 999)) for _ in range(c)) for _ in range(r)]
        tests.append(f"{r} {c}\n" + "\n".join(rows))
    return tests


NAMES = ["aditya", "fathima", "rahul", "sneha", "arjun", "meera", "nikhil", "anjali", "joel", "divya", "farhan", "keerthana", "vishnu", "aparna"]


def g_ranking():
    tests = ["4\nmeera 8.7 0\narjun 9.1 1\nsneha 8.7 0\nrahul 7.5 0", "2\nzoe 9.0 0\namy 9.0 0", "1\nsolo 6.2 3"]
    for size in (40, 3000):
        rows = [f"{rng.choice(NAMES)}{i} {rng.randint(55, 99) / 10:.1f} {rng.choice([0, 0, 0, 1, 2])}" for i in range(size)]
        tests.append(f"{size}\n" + "\n".join(rows))
    return tests


PROBLEMS = [
    {
        "id": "mess-tokens", "title": "Mess Token Pair", "difficulty": "easy", "topics": ["arrays", "hashing"],
        "statement": "The hostel mess sells meal tokens of different values. Given the values of n tokens in the order they were bought and a target amount T, find two different tokens whose values add up to exactly T.\n\nPrint their 1-based positions i and j (i < j). If several pairs work, print the pair with the smallest j; among those, the smallest i. If no pair exists, print -1.",
        "input_format": "Line 1: n and T.\nLine 2: n integers, the token values.",
        "output_format": "Two integers i j, or -1.",
        "constraints": "1 ≤ n ≤ 2·10^4, |value| ≤ 10^6, |T| ≤ 4·10^6",
        "expected": "O(n) time with a hash map", "ref": ref_mess_tokens, "gen": g_mess,
        "samples": [("5 9\n2 7 11 15 1", "Tokens 2 and 7 add up to 9."), ("3 100\n1 2 3", "No pair adds up to 100.")],
    },
    {
        "id": "lab-brackets", "title": "Balanced Lab Record", "difficulty": "easy", "topics": ["stack", "strings"],
        "statement": "Your lab record's code listings were typed by a tired junior. For each line of brackets, decide whether it is balanced: every opening bracket ( [ { is closed by the same type in the correct order.",
        "input_format": "Line 1: t, the number of lines.\nNext t lines: a string of the characters ()[]{} (possibly empty).",
        "output_format": "For each line print YES or NO.",
        "constraints": "1 ≤ t ≤ 20, length ≤ 10^4",
        "expected": "O(n) with a stack", "ref": ref_brackets, "gen": g_brackets,
        "samples": [("3\n()\n([)]\n{[]}", "The second line closes ( before [ is closed.")],
    },
    {
        "id": "attendance-streak", "title": "Attendance Streak", "difficulty": "medium", "topics": ["sliding window", "strings"],
        "statement": "Your attendance for n working days is a string of P (present) and A (absent). The department will condone at most k absences with a medical certificate.\n\nFind the length of the longest run of consecutive days that contains at most k absences.",
        "input_format": "Line 1: n and k.\nLine 2: the attendance string of length n.",
        "output_format": "One integer: the longest length.",
        "constraints": "1 ≤ n ≤ 5·10^4, 0 ≤ k ≤ n",
        "expected": "O(n) sliding window", "ref": ref_attendance, "gen": g_attendance,
        "samples": [("10 1\nPPAPPPAPPP", "Days 4–10 contain one absence: length 7."), ("5 0\nAAAAA", "No day can be counted.")],
    },
    {
        "id": "canteen-bookings", "title": "Merge Canteen Bookings", "difficulty": "medium", "topics": ["sorting", "intervals"],
        "statement": "Clubs book the canteen hall for time slots [start, end]. Two bookings that overlap or touch (one starts at or before the other ends) are merged into one block.\n\nPrint the merged blocks in order of start time.",
        "input_format": "Line 1: n.\nNext n lines: start end.",
        "output_format": "Line 1: number of merged blocks.\nThen one line per block: start end.",
        "constraints": "1 ≤ n ≤ 10^4, 0 ≤ start ≤ end ≤ 10^5",
        "expected": "O(n log n) sort then sweep", "ref": ref_canteen, "gen": g_canteen,
        "samples": [("4\n1 3\n2 6\n8 10\n15 18", "[1,3] and [2,6] overlap into [1,6].")],
    },
    {
        "id": "skill-tags", "title": "Top Skills on the Notice Board", "difficulty": "medium", "topics": ["hashing", "sorting"],
        "statement": "The placement cell collected the skill tags from every job posting this season. Print the k most frequent tags with their counts. Break ties by the tag in alphabetical order.",
        "input_format": "Line 1: n and k.\nLine 2: n lowercase tags separated by spaces.",
        "output_format": "Up to k lines: tag count.",
        "constraints": "1 ≤ n ≤ 2·10^4, 1 ≤ k ≤ 50",
        "expected": "O(n + u log u) with a counter", "ref": ref_skill_tags, "gen": g_skill_tags,
        "samples": [("7 2\npython java python sql java python react", "python appears 3 times, java 2.")],
    },
    {
        "id": "exam-papers", "title": "Exam Paper Evaluation", "difficulty": "hard", "topics": ["binary search", "greedy"],
        "statement": "n answer-script bundles must be evaluated in the given order. Each of m evaluators takes a contiguous run of bundles (at least one each). Bundle i has p_i pages.\n\nSplit the bundles so the largest number of pages any single evaluator reads is as small as possible, and print that number.",
        "input_format": "Line 1: n and m.\nLine 2: n integers p_i.",
        "output_format": "One integer.",
        "constraints": "1 ≤ m ≤ n ≤ 2·10^4, 1 ≤ p_i ≤ 10^4",
        "expected": "O(n log(sum)) binary search on the answer", "ref": ref_exam_papers, "gen": g_exam_papers,
        "samples": [("4 2\n12 34 67 90", "Split as [12, 34, 67] and [90]: max is 113.")],
    },
    {
        "id": "campus-shuttle", "title": "Campus Shuttle", "difficulty": "medium", "topics": ["graphs", "BFS"],
        "statement": "The campus has n shuttle stops joined by m two-way roads. Find the minimum number of roads to travel from stop s to stop d, or -1 if d cannot be reached.",
        "input_format": "Line 1: n and m.\nNext m lines: u v (a road).\nLast line: s d.",
        "output_format": "One integer.",
        "constraints": "1 ≤ n ≤ 5000, 0 ≤ m ≤ 1.2·10^4",
        "expected": "O(n + m) breadth-first search", "ref": ref_shuttle, "gen": g_shuttle,
        "samples": [("5 5\n1 2\n2 3\n3 4\n4 5\n1 3\n1 5", "1 → 3 → 4 → 5 uses three roads.")],
    },
    {
        "id": "club-anagrams", "title": "Anagram Club Names", "difficulty": "easy", "topics": ["hashing", "strings"],
        "statement": "Students proposed n names for new clubs. Names that are anagrams of each other count as the same idea. Print how many distinct ideas there are and the size of the largest group.",
        "input_format": "Line 1: n.\nLine 2: n lowercase words.",
        "output_format": "Two integers: groups and largest group size.",
        "constraints": "1 ≤ n ≤ 1.5·10^4, word length ≤ 20",
        "expected": "O(n · L log L) by sorting letters", "ref": ref_anagrams, "gen": g_anagrams,
        "samples": [("6\nlisten silent enlist google gogole cat", "Groups: {listen, silent, enlist}, {google, gogole}, {cat}.")],
    },
    {
        "id": "quad-rain", "title": "Rain on the Quad", "difficulty": "hard", "topics": ["two pointers", "arrays"],
        "statement": "The quad's paving stones have uneven heights h_1 … h_n, each one unit wide. After heavy rain, how many units of water are trapped between the stones?",
        "input_format": "Line 1: n.\nLine 2: n heights.",
        "output_format": "One integer: trapped water.",
        "constraints": "1 ≤ n ≤ 5·10^4, 0 ≤ h_i ≤ 10^4",
        "expected": "O(n) two pointers, O(1) space", "ref": ref_rain, "gen": g_rain,
        "samples": [("12\n0 1 0 2 1 0 1 3 2 1 2 1", "Six units are trapped.")],
    },
    {
        "id": "fest-coupons", "title": "Fest Coupons", "difficulty": "medium", "topics": ["dynamic programming"],
        "statement": "The fest committee pays sponsors in coupons of n denominations (unlimited of each). Find the fewest coupons that add up to exactly A, or -1 if A cannot be made.",
        "input_format": "Line 1: n and A.\nLine 2: n denominations.",
        "output_format": "One integer.",
        "constraints": "1 ≤ n ≤ 12, 0 ≤ A ≤ 10^4, 1 ≤ coin ≤ 10^4",
        "expected": "O(n · A) dynamic programming", "ref": ref_coupons, "gen": g_coupons,
        "samples": [("3 11\n1 2 5", "5 + 5 + 1 uses three coupons."), ("1 3\n2", "3 cannot be made from 2s.")],
    },
    {
        "id": "busier-day", "title": "Next Busier Day", "difficulty": "medium", "topics": ["stack", "arrays"],
        "statement": "The library logs its footfall for n days. For each day, print how many days you must wait until a strictly busier day, or 0 if none comes.",
        "input_format": "Line 1: n.\nLine 2: n footfall counts.",
        "output_format": "n integers on one line.",
        "constraints": "1 ≤ n ≤ 5·10^4",
        "expected": "O(n) monotonic stack", "ref": ref_busier, "gen": g_busier,
        "samples": [("8\n73 74 75 71 69 72 76 73", "Day 4 (71) waits two days for 72.")],
    },
    {
        "id": "reverse-notice", "title": "Reverse the Notice", "difficulty": "easy", "topics": ["strings"],
        "statement": "A notice board printer reversed the word order of every notice. Restore one notice: print its words in reverse order, separated by single spaces, with no leading or trailing spaces.",
        "input_format": "One line of text (words separated by one or more spaces).",
        "output_format": "The words in reverse order.",
        "constraints": "Line length ≤ 10^4",
        "expected": "O(n)", "ref": ref_notice, "gen": g_notice,
        "samples": [("Placement drive moved to Friday", "")],
    },
    {
        "id": "rotated-roll", "title": "Rotated Roll List", "difficulty": "medium", "topics": ["binary search", "hashing"],
        "statement": "A roll list of n distinct numbers was sorted and then rotated at an unknown point. Answer q queries: for each number x, print its 0-based position in the list, or -1 if it is absent.",
        "input_format": "Line 1: n.\nLine 2: the list.\nLine 3: q.\nLine 4: q queries.",
        "output_format": "q lines, one answer each.",
        "constraints": "1 ≤ n, q ≤ 2·10^4",
        "expected": "O(log n) per query (or O(1) with a map)", "ref": ref_rotated, "gen": g_rotated,
        "samples": [("7\n4 5 6 7 0 1 2\n3\n0 3 4", "0 is at index 4; 3 is absent; 4 is at index 0.")],
    },
    {
        "id": "spiral-hall", "title": "Exam Hall Spiral", "difficulty": "easy", "topics": ["matrix", "simulation"],
        "statement": "An invigilator walks the exam hall's r × c seating grid in a clockwise spiral starting at the top-left seat. Print the roll numbers in the order the seats are visited.",
        "input_format": "Line 1: r and c.\nNext r lines: c integers each.",
        "output_format": "r·c integers on one line.",
        "constraints": "1 ≤ r, c ≤ 120",
        "expected": "O(r · c)", "ref": ref_spiral, "gen": g_spiral,
        "samples": [("3 3\n1 2 3\n4 5 6\n7 8 9", "")],
    },
    {
        "id": "placement-ranking", "title": "Placement Ranking", "difficulty": "easy", "topics": ["sorting"],
        "statement": "The placement cell ranks students for a drive: fewer active backlogs first; then higher CGPA; then name in alphabetical order. Print the names in rank order.",
        "input_format": "Line 1: n.\nNext n lines: name cgpa backlogs.",
        "output_format": "n names, one per line.",
        "constraints": "1 ≤ n ≤ 3000, names are lowercase without spaces",
        "expected": "O(n log n) with a custom comparator", "ref": ref_ranking, "gen": g_ranking,
        "samples": [("4\nmeera 8.7 0\narjun 9.1 1\nsneha 8.7 0\nrahul 7.5 0", "arjun has a backlog, so he ranks last.")],
    },
]


def build():
    out = []
    for p in PROBLEMS:
        samples = [{"input": i, "output": p["ref"](i), "explain": e} for i, e in p["samples"]]
        tests = [{"input": t, "output": p["ref"](t)} for t in p["gen"]()]
        out.append({
            "id": p["id"], "title": p["title"], "difficulty": p["difficulty"], "topics": p["topics"],
            "statement": p["statement"], "input_format": p["input_format"], "output_format": p["output_format"],
            "constraints": p["constraints"], "expected": p["expected"], "samples": samples, "tests": tests,
        })
    path = ROOT / "data" / "problems.json"
    path.write_text(json.dumps({"problems": out}, ensure_ascii=False), encoding="utf-8")
    size = path.stat().st_size
    print(f"wrote {len(out)} problems, {sum(len(p['tests']) for p in out)} tests, {size / 1024:.0f} KB -> {path}")


if __name__ == "__main__":
    build()
