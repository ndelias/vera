# Round 4 (Reddit): designed, not run

Round 4 was designed and committed (`queries-r4.json`) to add
r/ProductManagement, r/UXDesign, r/userexperience and r/marketing.

It was dropped before any data was pulled. Reddit's Responsible Builder
Policy requires approval before any API access, and says: "Any research that
uses Reddit data collected outside of the RFR Program is in violation of
this policy." RFR is Reddit's research program, and it covers only
non-commercial purposes. This research feeds a commercial product, so it
doesn't qualify.

The collector was removed from the pipeline (it's still in git history,
in commit ad89276). The designers' and PMs' view comes instead from
behavioral data: GitLab's public issues and merge requests, where those
roles work in the open (study 02).
