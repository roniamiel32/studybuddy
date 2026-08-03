# StudyBuddy — Software Design Document (SDD / PRD)

```
File:        docs/prd.md
Authors:     Roni Amiel & Eden Bitran
Description: Product requirements and software design document for
             StudyBuddy. Source of truth for product scope; the technical
             design in docs/technical-design.md implements it.
Version:     1.1
Date:        August 2026

Modifications:
    1.0 - 2026-08-03 - Original document, as authored
    1.1 - 2026-08-03 - Replaced "Smart Interaction" with "WhatsApp Handoff"
                       in section 3, and "smart messaging" with "WhatsApp
                       handoff" in section 5 Phase 4, to align with the
                       approved technical design (no in-app chat)
```

**Project Name:** StudyBuddy
**Authors:** Roni Amiel & Eden Bitran
**Date:** August 2026

---

## 1. Product Overview

StudyBuddy is a full-stack web application designed to optimize the academic
learning process through data-driven and AI-powered matchmaking between
students. Instead of relying on random searches within noisy WhatsApp groups
or social networks, the platform intelligently connects students who are
enrolled in the same courses, share compatible schedules, and have similar
learning preferences (e.g., quiet study environments vs. collaborative group
discussions).

## 2. Business Value & Core Need

The product addresses the prevalent academic and social issue of "learning
isolation" and the inefficiency of finding suitable study partners.

**Process Optimization (Productivity Tool):** By significantly reducing the
time and friction involved in finding a partner, the application enhances the
overall learning experience and academic output.

**Ecosystem Value:** It provides a focused, distraction-free environment
tailored specifically to the student ecosystem, fostering a more effective and
connected academic community.

## 3. Core Features

**Smart Onboarding:** A streamlined registration process where students
complete a learning preference questionnaire (study style, available hours,
academic institution) and sync their current courses.

**AI-Powered Matching Engine:** The core logic of the application. An
AI-driven engine cross-references academic data (courses), scheduling
constraints, and personal learning preferences to propose highly accurate and
personalized "matches."

**Course Dashboards:** Dedicated, isolated pages for each specific course
(e.g., Computational Models, Web Development). These dashboards display
potential study partners relevant only to that specific subject.

**WhatsApp Handoff:** A low-friction handoff into the messaging channel
students already use. Once a study-partner request is accepted, the system
generates an automated, personalized opening message (icebreaker) grounded in
the pair's shared course and learning preferences, and hands it off directly
into a new WhatsApp conversation between the two students via a `wa.me` deep
link — with the message text already typed. StudyBuddy deliberately does not
build an in-app chat: the platform's job is to remove the friction of the
first message, not to become another inbox students have to check. Contact
details are exchanged only after both students have consented by accepting the
request.

**Scalable Multi-Tenancy:** The system architecture is designed with logical
separation based on the `university_id`. While the initial rollout targets
Reichman University, this multi-tenant design allows for rapid, secure
deployment across various academic institutions without database conflicts.

## 4. Technical Architecture & Stack

The project utilizes a modern, serverless-friendly technology stack to ensure
performance, security, and scalability.

**Frontend:** Next.js (App Router), TypeScript, Tailwind CSS. Ensures a
responsive, type-safe, and aesthetically clean user interface.

**Backend & Database:** Supabase (PostgreSQL) for relational data management,
combined with Supabase Auth for secure user authentication and Row Level
Security (RLS).

**AI Integration:** OpenAI / Gemini API to analyze complex preference arrays
and generate intelligent matchmaking recommendations and automated interaction
prompts.

**Deployment:** Vercel for continuous integration, rapid deployment, and edge
-network performance.

## 5. Development Workflow (Phased Approach)

Development will follow an Agile/MVP (Minimum Viable Product) methodology to
ensure a stable core before introducing complex logic. The architecture allows
for dynamic pivoting if certain technical constraints arise.

**Phase 1 (Core MVP):** Database schema design, authentication setup, and
standard CRUD operations for user profiles, courses, and schedules.

**Phase 2 (Matching Logic):** Implementation of the basic matching algorithm
utilizing standard SQL/Supabase filtering to pair students based on
overlapping courses and times.

**Phase 3 (AI Enhancement):** Integration of the AI agent to refine matches
based on nuanced personality traits and learning styles, elevating the system
from a basic scheduler to a smart matchmaker.

**Phase 4 (Polish & Scale):** Implementation of the WhatsApp handoff feature,
UI/UX refinements, and final security testing.

---

## Related documents

- [Technical Design Document](technical-design.md) — schema, folder structure,
  backend surface, component tree, phased implementation plan, risk register.
