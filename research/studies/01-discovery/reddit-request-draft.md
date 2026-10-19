# Reddit Data API access request (draft)

Draft for Nahuel to review and send himself, through the "file a ticket"
link in the Developers section of Reddit's Responsible Builder Policy.
Bracketed parts are his to fill in.

---

**Subject:** Data API access request: non-commercial portfolio research on product-team workflows

Hi,

I'm a product engineer building a personal portfolio project, and I'd like
to request read-only Data API access for a small, non-commercial research
analysis. My use case can't be built as a Devvit app, because it's offline
analysis rather than something that runs on Reddit.

**What I want to learn**
Which problems product teams (product managers, designers, marketers) run
into most in their day-to-day work, like waiting on reviews, approvals and
handoffs. I'm comparing what people describe in different public communities.

**What I'd access**
- Four subreddits: r/ProductManagement, r/UXDesign, r/userexperience, r/marketing
- Posts from the last two years that match about 45 neutral search terms
  (for example "design handoff", "code review", "stakeholders"), plus up to
  30 top-level comments on each matching post
- Read-only, app-only OAuth (a "script" app). No posting, voting or
  messaging, and no user accounts accessed
- Within your rate limits. The client follows the x-ratelimit headers

**How I'd handle the data**
- I don't store usernames or any user identifiers, only the post or
  comment text, its date, score and permalink
- Stored locally on my machine, not shared, sold or published as a dataset
- No model training of any kind. A language model would only be used to
  label each post with a theme (for example "approval delays"), and the
  data isn't kept by or used to train that model
- No inferring sensitive characteristics, and no attempt to identify anyone
- I'd delete the data when the analysis is done, and I'll re-run the
  queries before publishing so removed or deleted content drops out
- What I'd publish: aggregate counts and charts (share of posts per theme),
  with links to the original threads. No bulk reposting of content

**About the project**
It's a public portfolio piece showing how I research a problem before
designing a solution. The research may shape an idea for a tool I'm
exploring. If that ever becomes a commercial product, I won't use Reddit
data for it without asking you for separate written approval.

**Details**
- Reddit username: [u/your_username]
- App name: blast-radius-research (not created yet; I'll create it once approved)
- Contact email: [your email]
- Expected volume: a few thousand posts and their top comments, collected
  once, then re-run once before publishing

Thanks for considering it. Happy to answer any questions or narrow the scope.

[Your name]
