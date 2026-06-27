# User Personas — Hirth Engines AI Knowledge Platform
> Sources: User interview (field engineer), hackathon challenge brief, project memory
> Status: Persona 1 = research-grounded | Persona 2 & 3 = partially [Annahme]-based (proto-personas)

---

## Persona 1 — Marcus K.
**Type: Primary | Research-grounded**

| Attribute | Detail |
|---|---|
| **Role** | Development Engineer / Workshop Mechanic |
| **Age** | 32–44 |
| **Location** | Southern Germany / Austria — workshop-based |
| **Education** | Mechatronics or mechanical engineering (Meister or Dipl.-Ing.) |
| **Income** | €40k–70k, employed full-time |
| **Context** | Industrial or motorsport workshop; field-mobile, rarely at a desk |
| **Devices** | Android smartphone (primary, workshop); company laptop (secondary, office) |
| **Tech fluency** | Competent but pragmatic — uses what works, abandons anything complex fast |

### A Day in His Life
Marcus arrives before 8am already thinking about the carburetor anomaly on the test bench. He grabs his phone and describes the symptom in a full sentence — he hates keyword searches, prefers explaining problems like he would to a colleague. If the first result gives him a useful overview, he digs deeper. If not, he calls Munich. By noon he usually has a fix — or a workaround. He never writes it down. The knowledge stays in his head.

### Goals & Motivations
- **Primary:** Resolve engine problems fast and with confidence
- **Secondary:** Confirm his diagnosis is on the right track before acting; avoid repeating the same research
- **Hidden motivator:** Not make expensive mistakes that reflect badly on him professionally

### Frustrations & Pain Points
| # | Frustration |
|---|---|
| 1 | Forum answers conflict — no signal for which source to trust |
| 2 | PDFs and manuals aren't searchable; reading them wastes time |
| 3 | Asking colleagues means admitting you don't know — social cost |

**Failure mode:** Spends 2 hours in forums and ends up more uncertain than before he started.

**Workarounds today:** Screenshots of useful posts; WhatsApp to senior engineer; personal mental archive.

### Relationship to Product
| | |
|---|---|
| **Discovery** | Colleague recommendation or official Hirth channel |
| **First 30 seconds** | Must return a useful result from a plain-language query. No result → gone |
| **Adoption barrier** | Login friction, license cost, or complex UI → immediate abandonment |
| **Success signal** | "Found the right answer in under 2 minutes and it held up" |

### Design Implications
1. **Because Marcus types in full sentences**, NLP input must support natural language — keyword-only search fails him
2. **Because he's in a workshop**, image upload must be front-and-center — camera icon, not buried in a menu
3. **Because he wants overview-first**, answer format must show brief summary with expand-on-demand — no wall of manual text
4. **Because cost and friction kill adoption**, the first use must require zero account creation
5. **Because he's mobile**, the entire core workflow must function on a 5" screen

### Quote
> *"I just need to know if my theory is right. Give me the probable causes and let me decide which one to dig into."*

---

## Persona 2 — Stefan R.
**Type: Secondary | Proto-persona [Annahme — interview not conducted; grounded in challenge brief + domain knowledge]**

| Attribute | Detail |
|---|---|
| **Role** | Amateur mechanic, classic kart / vintage 2-stroke restorer |
| **Age** | 42–56 |
| **Location** | Suburban Germany — home workshop |
| **Education** | Non-technical primary career (e.g., project manager, teacher); self-taught on engines |
| **Income** | Comfortable; disposable income allocated to hobby |
| **Context** | Evenings and weekends in the garage; primary job unrelated to engines |
| **Devices** | iPad (garage); desktop (evening research); smartphone (forum browsing) |
| **Tech fluency** | Comfortable with forums, YouTube, basic apps; frustrated by expert jargon |

### A Day in His Life
Stefan works in an office Monday to Friday. Evenings and weekends belong to the garage. He's hit a wall on jetting his vintage kart engine — an hour on two forums produced three conflicting answers and one patronizing comment from someone who assumed he didn't know what a needle jet was. He wants the right answer without having to prove his credibility first.

### Goals & Motivations
- **Primary:** Get his engine running correctly without hiring a professional
- **Secondary:** Build enough understanding to be less dependent on forums long-term
- **Hidden motivator:** Quiet expert status in his community — be the person who knows the thing others don't

### Frustrations & Pain Points
| # | Frustration |
|---|---|
| 1 | Forum answers assume either too much or too little prior knowledge |
| 2 | No way to know which advice is trustworthy before trying it |
| 3 | Information spread across five browser tabs, two forums, and a YouTube comment |

**Failure mode:** Follows bad advice, breaks something, wastes a full weekend.

**Workarounds today:** YouTube deep dives; direct messages to trusted forum members; trial and error.

### Relationship to Product
| | |
|---|---|
| **Discovery** | Forum link, YouTube comment, or Google search |
| **First 30 seconds** | Clear, calibrated answers that don't talk down to him — or treat him as an expert he's not yet |
| **Adoption barrier** | Content pitched too basic (patronizing) or too dense (inaccessible) — needs adaptive depth |
| **Success signal** | "One answer that explained the *why*, not just the *what*" |

### Design Implications
1. **Because Stefan's expertise is self-assessed and intermediate**, the system should offer adaptive answer depth (e.g., "explain more" / "less detail") rather than a fixed complexity level
2. **Because he has been burned by bad advice**, trust signals on answers (source, expert validation, correction status) are non-negotiable
3. **Because he learns visually**, annotated diagrams and exploded-view images are critical for comprehension — not optional
4. **Because he values community context**, showing "verified by 3 experts" carries more weight for him than an AI confidence score
5. **Because he discovers via Google/forums**, SEO-accessible public answers serve as acquisition channel

### Quote
> *"I've read six forum posts about this. Half say lean, half say rich. Someone just tell me which one is right and why."*

---

## Persona 3 — Birgit W.
**Type: Secondary — Expert Contributor | Proto-persona [Annahme on seniority level; "trainer" role grounded in interview]**

| Attribute | Detail |
|---|---|
| **Role** | Senior R&D Engineer or Technical Trainer, engine manufacturer / motorsport team |
| **Age** | 50–63 |
| **Location** | Germany — industrial R&D or production setting |
| **Education** | Engineering degree (Dipl.-Ing. or equivalent) [Annahme] |
| **Income** | Senior professional, €70k+ [Annahme] |
| **Context** | Office and lab; sometimes workshop; rarely field-mobile |
| **Devices** | Laptop/desktop primary; smartphone rarely; paper still used for notes |
| **Tech fluency** | High domain expertise; low app adoption — trusts what she already knows |

### A Day in Her Life
Birgit has worked with two-stroke engines for 25 years. She knows failure modes that exist nowhere in writing. When a junior engineer comes to her with a problem, she resolves it in five minutes — and that explanation disappears when she walks away. She's been asked to document it three times and never found the time. When her colleague pushed for a quick PowerPoint summary after a repair session, she sometimes did it — but no system has ever captured those files. Her knowledge is the most valuable asset the platform could have, and she is the least likely to contribute it unprompted.

### Goals & Motivations
- **Primary:** Solve problems for her team quickly and move on
- **Secondary:** Ensure institutional knowledge doesn't leave when she does
- **Hidden motivator:** Be formally recognized as the authority she actually is — attribution, not just internal reputation

### Frustrations & Pain Points
| # | Frustration |
|---|---|
| 1 | She explains the same problem repeatedly — knowledge doesn't stick in the org |
| 2 | Documentation processes are slower than the work itself |
| 3 | Junior engineers repeat mistakes she already solved and documented — just not formally |

**Failure mode:** Spends 30 minutes with the same junior engineer on the same problem she addressed six months ago — verbally, with no record.

**Workarounds today:** Quick PowerPoint slides after a repair; voice memos; email threads as informal logs.

### Relationship to Product
| | |
|---|---|
| **Discovery** | Institutional rollout (Hirth mandate or team adoption) — will not self-discover |
| **First 30 seconds** | Must show a contribution path that fits her existing workflow — voice recording, PDF upload, not a form |
| **Adoption barrier** | Any contribution flow that feels like extra work → disengages within one session |
| **Success signal** | "I uploaded my notes and they appeared as useful answers — and my name was on it" |

### Design Implications
1. **Because Birgit won't contribute proactively**, the platform must support passive capture: voice recording upload, PDF ingestion, auto-extraction from existing slide decks
2. **Because named attribution is her key incentive**, contributor bylines ("Birgit W., Senior Engineer") must be visible and prominent on every validated answer she contributes
3. **Because her time is high-value**, the correction flow must take <2 taps — "flag as wrong" inline, no review form
4. **Because she needs a feedback loop**, an expert dashboard showing "your contributions helped X engineers this month" closes the motivation gap and drives retention
5. **Because she's the data flywheel's fuel**, onboarding her is a business-critical path, not a feature — treat her adoption as a separate product problem from end-user adoption

### Quote
> *"I've explained this carburetor issue a dozen times. If there was a way to capture that once and stop repeating myself, I'd use it."*

---

## Persona Comparison Matrix

| Dimension | Marcus K. (Field Engineer) | Stefan R. (Hobbyist) | Birgit W. (Expert Trainer) |
|---|---|---|---|
| **Primary action** | Find answer fast | Understand and learn | Contribute and be recognized |
| **Input preference** | Full-sentence, image | Browse + natural language | Voice, PDF upload, slide deck |
| **Output preference** | Brief overview → detail | Explanation + visual | Validation confirmation + attribution |
| **Trust signal needed** | Source quality | Expert verification | Named attribution |
| **Device** | Smartphone (workshop) | iPad / desktop | Laptop / desktop |
| **Documentation motivation** | Very low | Medium | Low — needs system support |
| **Adoption trigger** | Colleague recommendation | Search / community link | Institutional mandate |
| **Churn trigger** | Cost, friction, slow results | Patronizing or inaccurate content | Contribution effort too high |
| **Data flywheel role** | Consumer → passive corrector | Consumer | Primary knowledge contributor |

---

*Generated: Hirth Engines Hackathon | Based on: 1 user interview + challenge brief + project context*
*[Annahme] = assumption not validated by primary research — should be tested*
