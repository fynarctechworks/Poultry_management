# ELEVENLABS DESIGN SYSTEM MIGRATION DIRECTIVE

## Context Update (Mandatory)

A new `Design.md` has been created and is now the single source of truth for the entire application.

The design language is based on the ElevenLabs Design System.

Immediately update:

* CLAUDE.md
* Project Memory
* Development Standards
* UX Standards
* Component Standards
* Frontend Architecture Rules

so that all future development, modifications, feature additions, bug fixes, and UI work strictly follow the Design.md specifications.

No new UI may be created outside the Design.md rules.

---

# Mission

Perform a complete repository-wide UI/UX transformation.

Do not redesign randomly.

Do not partially update screens.

Do not create hybrid styles.

The goal is:

**Transform the entire application into a premium, production-grade ElevenLabs-inspired SaaS experience while preserving all business logic, workflows, APIs, database interactions, permissions, tenancy, and functionality.**

---

# Required Execution Mode

Use:

* Orchestrator Mode
* Parallel Agents
* Deep Analysis Mode

Spawn specialized agents:

### /uxdesigner

Responsible for:

* Design system compliance
* Layout consistency
* Visual hierarchy
* Spacing systems
* Typography systems
* Component audit
* Accessibility
* SaaS UX standards

### /frontend-architect

Responsible for:

* Component architecture
* Shared component extraction
* Reusable patterns
* Design token implementation
* Design system enforcement

### /design-system-auditor

Responsible for:

* Finding violations
* Token mismatches
* Legacy styles
* Inline styling
* Hardcoded colors
* Hardcoded spacing

### /ui-polish-agent

Responsible for:

* Micro interactions
* Empty states
* Loading states
* Hover states
* Focus states
* Animations
* Skeleton loaders

### /responsive-agent

Responsible for:

* Mobile
* Tablet
* Laptop
* Desktop
* Ultra-wide screens

### /qa-ui-agent

Responsible for:

* Pixel consistency
* Broken layouts
* Overflow issues
* Accessibility validation

---

# Design Philosophy

The application must feel like:

* ElevenLabs
* Linear
* Stripe Dashboard
* Vercel
* Notion

Combined into a single premium SaaS experience.

Characteristics:

* Clean
* Minimal
* Calm
* Professional
* Modern
* High trust
* High readability

Never:

* Loud
* Cluttered
* Over-designed
* Color-heavy
* Enterprise legacy style

---

# Repository-Wide Audit

Audit every:

* Page
* Modal
* Drawer
* Dialog
* Table
* Card
* Dashboard
* Sidebar
* Header
* Footer
* Form
* Wizard
* Settings screen
* Login screen
* Onboarding flow
* Empty state
* Error state
* Success state
* Loading state

No exceptions.

Generate a report showing:

## Current State

* Screens audited
* Components audited
* Design violations

## Fix Plan

* What must change
* Why it must change

## Implementation Status

* Completed
* In Progress
* Blocked

---

# Design System Enforcement

Everything must use Design.md.

Remove:

* Hardcoded colors
* Hardcoded spacing
* Hardcoded typography
* Random shadows
* Random border radii
* Duplicate components

Replace with:

* Design tokens
* Semantic tokens
* Shared components

---

# Typography

Apply ElevenLabs typography everywhere.

Verify:

* Headings
* Subheadings
* Labels
* Body text
* Tables
* Cards
* Navigation
* Forms

Typography must be:

* Consistent
* Predictable
* Readable

No mixed scales.

---

# Spacing

Apply a strict spacing scale.

Audit:

* Margins
* Padding
* Gaps
* Section spacing

Remove visual inconsistencies.

The application should feel balanced and breathable.

---

# Components

Audit and rebuild if necessary:

* Buttons
* Inputs
* Selects
* Dropdowns
* Tables
* Tabs
* Cards
* Tooltips
* Popovers
* Drawers
* Modals
* Toasts
* Badges
* Navigation Items

Every component must match Design.md.

---

# Dashboards

Audit every dashboard.

Ensure:

* Consistent card hierarchy
* Clean data visualization
* Proper whitespace
* Premium SaaS appearance

No dashboard should feel cluttered.

---

# Forms

Audit every form.

Verify:

* Labels
* Validation
* Error handling
* Success handling
* Keyboard navigation
* Accessibility

Make forms feel modern and effortless.

---

# Tables

Upgrade all tables.

Requirements:

* Sticky headers
* Responsive layouts
* Proper density
* Search states
* Empty states
* Loading states

Must feel similar to premium SaaS products.

---

# Authentication

Audit:

* Login
* Forgot Password
* Reset Password
* Invitation Flow
* Onboarding

Convert all auth screens to ElevenLabs layout patterns.

Requirements:

* Premium visual presentation
* Strong hierarchy
* Proper spacing
* Consistent branding

---

# SaaS Control Center

Audit all super-admin screens.

Verify:

* Tenant management
* Subscription management
* Billing management
* Analytics
* Monitoring
* Support tools

These screens should feel executive-grade.

---

# Tenant Application

Audit all tenant-facing screens.

Verify:

* Farm management
* Batch management
* Feed management
* Mortality management
* Inventory
* Finance
* Reports

All modules must share identical design language.

---

# Responsiveness

Validate every screen on:

* 320px
* 375px
* 768px
* 1024px
* 1440px
* 1920px

Fix:

* Overflow
* Wrapping issues
* Layout breaks
* Table responsiveness

---

# Accessibility

Ensure:

* Keyboard navigation
* Focus states
* ARIA compliance
* Color contrast
* Screen reader support

---

# Performance

While migrating:

* Remove unused UI code
* Remove duplicate components
* Remove dead styles
* Remove legacy CSS

Optimize:

* Bundle size
* Rendering
* Component reuse

---

# Final Deliverables

Provide:

## 1. Design Audit Report

Complete list of findings.

## 2. Migration Report

Files modified.

## 3. Component Inventory

Old vs New.

## 4. Design System Compliance Report

Percentage compliance.

## 5. Remaining Issues

Any unresolved items.

## 6. Final Verification

Confirm:

* Every screen audited
* Every component audited
* Every design token enforced
* Every page matches Design.md
* Entire application follows ElevenLabs Design System

Do not stop after fixing a few screens.

Continue until the full repository is compliant.
