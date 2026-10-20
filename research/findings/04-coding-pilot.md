# Coding pilot: can the codebook be applied consistently?

The 480 posts from open coding, coded blind by Claude Code helper agents
(Opus 5.5), 6 agents of 80 posts each per pass. Instructions committed in
`studies/01-discovery/coding/`. Bar set in the plan: 80% agreement, else fix
the codebook and recode.

## Pilot 1 (codebook v3): 79.4%, just under the bar

| | Agreement | Cohen's kappa |
|---|---|---|
| Agents vs open coding | 79.4% | 0.42 |

93 of 99 disagreements went one way: open coding counted posts that
*discuss* a problem (opinions, trends, research numbers), the agents only
counted *first-hand* problems. The codebook didn't say which. Fixed in v4:
relevance is 2 first-hand, 1 discussed, 0 not, plus the writer's role.

## Pilot 2 (codebook v4): passes

| Comparison | Agreement | Cohen's kappa |
|---|---|---|
| Pass A vs pass B, three levels | 96.5% | 0.93 |
| Pass A vs pass B, relevant or not | 97.3% | 0.94 |
| Pass A vs open coding (relevant = 1 or 2) | 88.3% | 0.73 |
| Pass B vs open coding | 86.9% | 0.70 |

- **Codes:** on the 150 posts both passes found relevant, the code sets
  overlap 92% on average, and 97% share at least one code.
- **Quotes:** every one of the 430 evidence quotes was found word for word
  in its post (checked by the loader, not taken on trust).
- **Relevance:** about 32% of posts are relevant (14% first-hand, 18%
  discussed). That's close to open coding's 31%.

## Limits of this check

All three readers are Claude: the open coding, pass A and pass B. High
agreement shows the codebook gives the same answers when applied again, and
that it matches the reading it was built from. It doesn't show a person
would agree. That needs Nahuel to hand-code a random 10% (48 posts) blind,
which is the validation the plan calls for.

`other` was used 17 times in pass A, the second most common code. The
next codebook version should look at those notes for a missing category.
