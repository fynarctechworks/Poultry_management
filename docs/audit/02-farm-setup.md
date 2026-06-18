# Module 2 — Farm Setup (farms → sheds → batches) · Audit Report

**Audited:** 2026-06-18 · against real code + live Supabase project `jusxngbfdmzhlybohell`.
**Status:** ✅ Complete — 2 P1 fixed (frontend), proposed DB hardening shown for approval.

---

## Flow map

```mermaid
flowchart TD
  F[farms/new FarmForm] -->|insert (RLS: tenant_admin + owner=uid)| FA[(farms)]
  S[sheds/new ShedForm] -->|insert (RLS: owner/admin)| SH[(sheds)]
  B[batches/new BatchForm] -->|insert status=active| BT[(batches)]
  BT -->|trigger generate_batch_code| BC[(batch_code unique)]
  BT --> A[Active batch]
  A -->|TransferBatchForm| TR[transfer_batch RPC<br/>type+capacity+owner guards] --> A
  A -->|HarvestForm partial| RH[record_harvest RPC<br/>decrements birds + income txn]
  A -->|CloseBatchForm full| CB[close_batch RPC<br/>owner + count + date guards]
  CB --> H[(status=harvested)]
  H -.->|status=closed (no web path!)| LK[lock_traceability_on_close]
  H -->|prevent_closed_batch_mutation| IM[UPDATEs blocked]
```

## Backend touchpoints (verified against live DB)
- **Tables:** `farms`, `sheds`, `batches`, `batch_transfers`, `batch_harvests`.
- **RPCs:** `transfer_batch` (owner/admin + active + same-farm + active dest + type match +
  capacity check + immutable history — **solid**); `record_harvest` (partial; decrements
  `current_bird_count`, writes a `financial_transactions` income row — **solid**); `close_batch`
  (owner-only, `birds_sold ≤ current_bird_count`, date bounds — **solid**, *now wired in*).
- **Triggers:** `generate_batch_code` (BEFORE INSERT), `prevent_closed_batch_mutation`,
  `lock_traceability_on_close`.
- **RLS:** farms/sheds/batches all tenant + farm-scoped, role-aware (owner/admin write,
  worker shed-scoped read, vet read). **Verified correct.**
- **Constraints:** `batches.batch_code` UNIQUE; `sheds (farm_id, shed_name)` UNIQUE;
  status/poultry_type/capacity CHECKs all present.

---

## Issues found

| ID | Sev | Area | Finding |
|----|-----|------|---------|
| **B1** | **P1** | Frontend / data integrity | **`CloseBatchForm` did a raw `batches` UPDATE, bypassing the `close_batch` RPC.** Client zod only checked positivity, so: `birds_sold` could **exceed `current_bird_count`** (oversell), `harvest_date` could be **before placement or in the future**, and owner-only enforcement leaned on RLS alone. The validated `close_batch` RPC existed but was unused. |
| **B2** | **P1** | Frontend / data integrity | **`BatchForm` ignored shed capacity and type.** `opening_bird_count` had no ceiling (place 50k birds in a 1k shed), and `poultry_type` was a free selector that could diverge from the shed's type — both directly contradict the strict `transfer_batch` guards. |
| B3 | P2 | DB / freemium | No DB-level quantity caps. Free-plan limits (1 farm / 3 sheds / 2 workers / 10 buyers) are **UI-only** (`UpgradeGate`); a direct PostgREST insert bypasses them (RLS still tenant-scopes). DB gates only *paid features* via `is_tenant_paid()`. |
| B4 | P2 | DB / data integrity | No DB-level placement capacity guard. Even after the B2 client fix, a direct insert can exceed shed capacity — `transfer_batch` enforces it but placement does not. |
| B5 | P2 | Lifecycle | **`status='closed'` is unreachable from the web UI** (only `'harvested'` is ever set; `'closed'` appears solely as a filter option). So `lock_traceability_on_close` never fires on web → traceability records are never frozen. → **Cross-module to Traceability (M10).** |
| B6 | P2 | Lifecycle | `prevent_closed_batch_mutation` blocks UPDATEs on harvested/closed batches but **not DELETEs**. `DeleteButton` can delete a harvested batch; FK `ON DELETE CASCADE` then wipes its daily_logs, vaccinations, health, transfers, harvests. → **Cross-module to Transactions/Traceability.** |
| B7 | P2 | Concurrency | `generate_batch_code` uses `COUNT(*)+1` per (farm, placement_date); two concurrent same-day inserts can collide on the UNIQUE `batch_code`. Negligible at current scale; note for scale-out. |

## Fixes applied this pass (frontend, in-scope)

### B1 — Route batch closure through `close_batch` RPC ✅
`batches/[id]/CloseBatchForm.tsx`: replaced the raw `update({status:'harvested', …})` with
`supabase.rpc('close_batch', { p_batch_id, p_harvest_date, p_birds_sold, p_sale_weight_kg,
p_sale_price_per_kg })`. Server now enforces owner-only, `birds_sold ≤ current_bird_count`,
and `placement_date ≤ harvest_date ≤ today`.

### B2 — Capacity + type integrity at placement ✅
`batches/new/BatchForm.tsx`: batch now **inherits `poultry_type` from the selected shed**
(type shown read-only, derived via `watch('shed_id')`; insert uses `shed.poultry_type`);
added a capacity guard (`opening_bird_count ≤ shed.capacity`) with a `max=` on the input and
a clear error. Mirrors the `transfer_batch` rules.

**Verification:** `tsc --noEmit -p tsconfig.json` → exit 0, 0 errors (both files).

## Proposed (NOT applied — DB hardening, awaiting approval)

Defense-in-depth so the caps/capacity hold even against direct API inserts. Uses the verified
signature `is_tenant_paid(p_tenant_id uuid)`.

```sql
-- B3: free-plan quantity caps (paid = unlimited) -----------------------------
create or replace function public.enforce_farm_cap() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_tenant_paid(NEW.tenant_id) then return NEW; end if;
  if (select count(*) from public.farms where tenant_id = NEW.tenant_id) >= 1 then
    raise exception 'Free plan allows 1 farm — upgrade to add more'
      using errcode = 'check_violation';
  end if;
  return NEW;
end$$;
create trigger trg_enforce_farm_cap before insert on public.farms
  for each row execute function public.enforce_farm_cap();

create or replace function public.enforce_shed_cap() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_tenant_paid(NEW.tenant_id) then return NEW; end if;
  if (select count(*) from public.sheds where tenant_id = NEW.tenant_id) >= 3 then
    raise exception 'Free plan allows 3 sheds — upgrade to add more'
      using errcode = 'check_violation';
  end if;
  return NEW;
end$$;
create trigger trg_enforce_shed_cap before insert on public.sheds
  for each row execute function public.enforce_shed_cap();

-- B4: placement capacity guard (mirror transfer_batch) -----------------------
create or replace function public.enforce_batch_placement_capacity() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cap int; v_occ int;
begin
  select capacity into v_cap from public.sheds where id = NEW.shed_id;
  select coalesce(sum(current_bird_count),0) into v_occ
    from public.batches where shed_id = NEW.shed_id and status = 'active';
  if v_occ + NEW.opening_bird_count > v_cap then
    raise exception 'shed capacity exceeded: % existing + % incoming > % capacity',
      v_occ, NEW.opening_bird_count, v_cap using errcode = 'check_violation';
  end if;
  return NEW;
end$$;
create trigger trg_enforce_batch_placement_capacity before insert on public.batches
  for each row execute function public.enforce_batch_placement_capacity();
```

Also recommended (separate, see cross-module): a `BEFORE DELETE` guard on `batches` to refuse
deletion of `harvested`/`closed` batches (B6), and a product decision on whether the web close
flow should advance `harvested → closed` to actually trigger the traceability lock (B5).

## Enterprise SaaS gap notes (Phase 5)
- ✅ Strong: atomic RPCs with authz + validation; immutable transfer/harvest history; full RLS.
- ➖ Thin: no DB-enforced plan limits (B3); placement capacity only client-side (B2/B4); no
  audit/restore for hard-deleted batches (B6); lifecycle never reaches `closed` (B5).

## Completion gate
✅ Flow mapped · ✅ Frontend audited + 2 P1 fixed & typecheck-clean · ✅ Backend RPCs/triggers
read from live DB · ✅ RLS + constraints verified · ✅ Security reviewed · ✅ Documented; DB
hardening proposed (not applied) per operating mode.
