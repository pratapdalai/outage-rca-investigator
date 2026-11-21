# How the correlation score works

Every candidate change gets a score from 0 to 100, the sum of five factors:

| Factor | Max | How it is measured |
|---|---|---|
| Timing | 30 | Halves for every 6 hours between the change and the outage. A change 1 hour before scores ~27; 12 hours before scores 7.5. |
| Same network elements | 30 | Weighted overlap of entities found in both tickets: network element IDs such as OLT-BBSR-07 (1.0), firmware/software versions such as v4.2.1 (0.7), components (0.6), sites/exchanges (0.5), labels (0.3). Overlap of 2.0 or more scores the full 30. |
| Other outages | 20 | Other outage tickets on the same elements, versions or sites detected after the change: 1 - e^(-n/3). Three other outages score ~13. |
| Similar wording | 10 | TF-IDF cosine similarity between the outage text and the change text. |
| Change risk | 10 | Emergency change, high/medium risk rating, implementation warnings or failures, no rollback plan, firmware/config/software change. |

**Coincidence guard**: if a change shares no entities, has no similar wording and no other outages followed it, its score is capped at 30. Timing alone never produces a confident answer.

**Exclusions**: changes implemented more than 15 minutes after the outage started, or before the lookback window, are excluded with a reason.

**Confidence**: HIGH >= 70, MEDIUM >= 45, LOW < 45.
**Verdict**: PROBABLE_CAUSE when the top suspect is HIGH and at least 15 points ahead of the next.

**Times**: change time comes from an "Implemented:" line in the description (falls back to resolution date, then created date). Outage time comes from a "Detected:" line (falls back to created date).
