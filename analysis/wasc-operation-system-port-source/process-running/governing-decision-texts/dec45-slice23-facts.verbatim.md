# DEC-45 slice-23 facts

Source (byte-verbatim JSON also persisted): `context-migration/decomposed/dec45-slice23-facts.json`

Each entry below is the exact `raw` (or `body`) string from the source JSON, copied verbatim — no rewording, no augmentation.

---

{
 "id": "DEC45-F01",
 "slice": "2,3",
 "title": "New plans migration number is 0042",
 "claim": "plans app latest migration is 0041_planpredecessor_continuation_type_and_more, on disk AND in django_migrations (41 applied). They agree.",
 "evidence": "ls school-improvement-plans/plans/migrations/ + select name from django_migrations where app='plans' (reset dev DB)",
 "plan_directive": "Number the Slice-2 (and any Slice-3 plans-side) migration plans/0042+. Verify the number again at IMPL time against the live disk; do not assume.",
 "verified": "2026-05-31 vs current source + reset dev DB"
}

---

{
 "id": "DEC45-F02",
 "slice": "2,3",
 "title": "All target tables are empty; DeleteModel(MissionArea) is unblocked",
 "claim": "plans_plan=0, plans_planguidingclause=0, plans_planmissionarea=0. So RenameModel/RenameField/DeleteModel are data-free. The only inbound FK to school_missionarea is plans_planmissionarea.mission_area_id (0 rows); the 3 seeded school_missionarea rows are uncited.",
 "evidence": "count(*) on each table, reset dev DB; FK scan shows plans_planmissionarea is the sole referent of school_missionarea",
 "plan_directive": "Slice 3 must drop PlanMissionArea BEFORE MissionArea (cross-app FK), but no data migration is needed to clear rows. Re-confirm counts at IMPL time (a created Plan would change this).",
 "verified": "2026-05-31 vs reset dev DB"
}

---

{
 "id": "DEC45-F03",
 "slice": "2,3",
 "title": "socrates auto-grant is live for new tables",
 "claim": "pg_default_acl shows ALTER DEFAULT PRIVILEGES FOR ROLE postgres grants socrates a,r,w,d on future tables and r,w,U on future sequences in schema public. The app connects as socrates without a DATABASE_URL prefix.",
 "evidence": "select defaclrole::regrole, defaclobjtype, defaclacl from pg_default_acl (reset dev DB)",
 "plan_directive": "New Slice-2/3 tables (plans_planmvvclause, plans_planmvvstatement) are auto-reachable by the app ONLY if the migration runs via the postgres superuser DSN (the documented dev invocation). No manual GRANT migration for socrates is needed. After the migrate, verify with SET ROLE socrates; SELECT FROM the new tables.",
 "verified": "2026-05-31 vs reset dev DB"
}

---

{
 "id": "DEC45-F04",
 "slice": "2",
 "title": "PlanGuidingClause has NO UniqueConstraint — dedupe on mvv_clauses/statements is a design decision",
 "claim": "PlanGuidingClause.Meta has only verbose_name/_plural — no constraints (unlike the L2b through-models PlanLearnerOutcome/PlanMissionArea/etc which all carry UniqueConstraint(plan,target)). The stale frame implied the L2b pattern.",
 "evidence": "plans/models/plan.py:334-369 (no Meta.constraints)",
 "plan_directive": "A RenameModel of PlanGuidingClause->PlanMvvClause inherits NO (plan,target) dedupe. If PlanMvvClause and/or the new PlanMvvStatement should dedupe (plan,clause)/(plan,statement), that UniqueConstraint must be ADDED explicitly and is a settle-before-IMPL decision, not a given.",
 "verified": "2026-05-31 vs current source"
}

---

{
 "id": "DEC45-F05",
 "slice": "3",
 "title": "No plans_plan_mission_areas_targeted auto-join table exists",
 "claim": "Plan.mission_areas_targeted is realized solely through the explicit through-model table plans_planmissionarea; there is no Django auto-join table to drop.",
 "evidence": "plans/models/plan.py:191-197 (through='plans.PlanMissionArea'); table scan on reset dev DB",
 "plan_directive": "Slice 3 drops only plans_planmissionarea (the through table) + the M2M field + the boolean; do not look for / reference a separate auto-join table.",
 "verified": "2026-05-31 vs current source + reset dev DB"
}

---

{
 "id": "DEC45-F06",
 "slice": "4",
 "title": "DISC-36 target file (planner/_llm_fabrication_validator.py) existence UNCONFIRMED",
 "claim": "The agent sweep did not confirm planner/_llm_fabrication_validator.py exists; the frame/DISC-36 assert it enumerates 13 of 14 CatalogueUnion sub-fields. The file was not located.",
 "evidence": "ripgrep sweep across school/plans/ai/planner + prompt-workshop found no such file in prompt-workshop/dispatch/; planner/ existence not positively confirmed",
 "plan_directive": "Before planning Slice 4 (DISC-36 fix), positively locate the file (or its real path) and re-derive the 13-of-14 claim from current source. Do not plan the DISC-36 fix off the frame.",
 "verified": "2026-05-31 (negative result; needs a positive re-check for Slice 4)"
}

---

{
 "id": "DEC45-F07",
 "slice": "3",
 "title": "Slice 3 cannot be a thin model-delete — it must remove every MissionArea reference in-slice",
 "claim": "Deleting school.MissionArea immediately breaks references across many modules. Deferring their removal to Slice 4 leaves the tree red between slices. The frame's slice boundary leaks.",
 "evidence": "References that break on delete: ai/services/grounding.py:15,51,174 (imports + MissionArea.objects.filter); plans/services.py:126 (promotion gate); planner/specs.py:285,292,305,387,460,2843,2949,3025 (_A3_GATE_REQUIRED tuple at :2843); planner/forms.py:282,314,384-395; planner/formsets.py:9,69,162-165,503; planner/steps.py:70; planner/static/wizard/js/ai-assist.js:656,666; school/models/outcomes.py:3,37; school/admin/outcomes.py; school/translation.py:27,101-102; plans/admin/plan.py:43,94-100,236; plans/translation.py:63,68,104,150-151",
 "plan_directive": "Slice 3 scope = DeleteModel(MissionArea)+PlanMissionArea PLUS removal of all the above references (model/admin/translation/forms/formsets/steps/specs/grounding/JS) in the same slice, so the static gate stays green at the slice boundary. The prompt must enumerate the full file list, not a curated subset.",
 "verified": "2026-05-31 vs current source"
}

---

{
 "id": "DEC45-F08",
 "slice": "2,3",
 "title": "Hand-author RenameModel + RenameField (autodetector emits destructive drop/create)",
 "claim": "Non-interactive makemigrations emits a destructive DeleteModel/CreateModel + RemoveField/AddField when a model name and a dependent field name change together. Project convention hand-authors these.",
 "evidence": "school/migrations/0029 and 0032 docstrings (verbatim convention); DISC-37",
 "plan_directive": "Slice 2 hand-authors RenameModel(PlanGuidingClause->PlanMvvClause) + RenameField(Plan.guiding_clauses->mvv_clauses) in one file, mirroring school/0032. Even though tables are empty, the autodetector behavior + convention still require hand-authoring. Never 'run makemigrations and STOP'.",
 "verified": "2026-05-31 vs current source"
}

---

{
 "id": "DEC45-F09",
 "slice": "2",
 "title": "Permission codenames do not follow RenameModel; new grants required",
 "claim": "RenameModel renames the ContentType.model in place but does NOT rename auth Permission codenames (add_planguidingclause keeps its string). DISC-19 requires every new plans model to set school_admin's grant explicitly in its own migration.",
 "evidence": "school/0032 docstring ('RenameModel does not touch permission codenames'); school/0034 (codename-rename precedent); plans/0035 grants (actionstepresponsibility, planguidingclause); plans/0037 grants (planlearneroutcome, planmissionarea, ...)",
 "plan_directive": "Slice 2 must either rename the planguidingclause permission codenames -> planmvvclause (mirror school/0034) OR add a fresh DISC-19 school_admin grant migration for planmvvclause; and MUST add a new DISC-19 school_admin grant migration for the net-new PlanMvvStatement. Slice 3: the deleted PlanMissionArea grant from plans/0037 becomes moot (vanishes with DeleteModel).",
 "verified": "2026-05-31 vs current source"
}

---

{
 "id": "DEC45-F10",
 "slice": "3",
 "title": "school/0011_seed_mission_areas must be neutralized",
 "claim": "school/0011_seed_mission_areas seeds 3 MissionArea rows on every fresh build via apps.get_model('school','MissionArea'). After the model is deleted in code, 0011 still runs against the historical model state (so it does not crash) but seeds rows that the Slice-3 DeleteModel then drops — wasteful and confusing.",
 "evidence": "school/migrations/0011_seed_mission_areas.py (whole file); historical-model semantics of RunPython",
 "plan_directive": "The Slice-3 migration set must neutralize/supersede 0011 (e.g. the data is moot once DeleteModel runs in the same forward path). Address it explicitly in the plan rather than leaving a seed-then-drop in the lineage.",
 "verified": "2026-05-31 vs current source"
}

---

{
 "id": "DEC45-F11",
 "slice": "3,4",
 "title": "ai/migrations/0014 prompt-template body references mission_areas_targeted — needs an ai/00NN migration, not a source edit",
 "claim": "The propose-domain-alignment PromptTemplate body (seeded in ai/0014) contains mission_areas_targeted. Per DEC-41 the prompt corpus lives in the PromptTemplate.template column; changes land via a guarded ai/00NN migration (the ai/0016 pattern), not by editing historical migration source.",
 "evidence": "ai/migrations/0014_seed_propose_domain_alignment_template.py:15; DEC-41 section 3",
 "plan_directive": "Removing mission_areas from the prompt corpus is a new ai/00NN PromptTemplate-evolution migration (guarded byte-match per ai/0016), sequenced with the MissionArea removal. Do not edit ai/0014.",
 "verified": "2026-05-31 vs current source"
}

---

{
 "id": "DEC45-F12",
 "slice": "3",
 "title": "Wizard JS + make test-js gate must stay green when removing mission_areas",
 "claim": "planner/static/wizard/js/ai-assist.js carries a mission_areas_targeted -> mission_area field mapping; the make test-js gate (node --check + jsdom suite) is part of the per-phase gate (DEC-31).",
 "evidence": "planner/static/wizard/js/ai-assist.js:656,666",
 "plan_directive": "Slice 3 must update ai-assist.js (and any wizard JS referencing mission_areas) and keep make test-js green. Run make test-js in the Slice-3 gate, not just pytest.",
 "verified": "2026-05-31 vs current source"
}

---

{
 "id": "DEC45-F13",
 "slice": "3",
 "title": "The mission-area promotion contract is enforced in TWO places — keep consistent",
 "claim": "Removal of the mission-area requirement touches both the runtime gate and the A3 spec. The settled DEC-45 default is to REMOVE (not replace) the mission-area gate, matching the ungated guiding_clauses analog.",
 "evidence": "plans/services.py:126 (if not (plan.mission_areas_targeted_all or plan.mission_areas_targeted.exists()): failures.append(...)); planner/specs.py:2843 (_A3_GATE_REQUIRED entry ('mission_areas','mission_areas_targeted',MissionArea))",
 "plan_directive": "Slice 3 deletes the services.py:126 predicate block (+ comment :120-123) AND the specs.py:2843 _A3_GATE_REQUIRED tuple entry (+ drop the MissionArea import there). Both must change together or the promotion contract is inconsistent.",
 "verified": "2026-05-31 vs current source"
}

---

{
 "id": "DEC45-F14",
 "slice": "2,3",
 "title": "Test fallout: ~8 modules reference the removed identifiers; rename the per-model test",
 "claim": "Multiple test modules reference guiding_clauses/PlanGuidingClause and mission_areas_targeted/MissionArea/PlanMissionArea and will fail until rewritten.",
 "evidence": "guiding_clauses: planner/tests/test_dec32_l2a_capture.py, plans/tests/test_planguidingclause.py, plans/tests/test_dec32_l2a_admin_and_grants.py, plans/tests/test_alignment_through_models.py, plans/tests/conftest.py. mission_areas: ai/tests/test_grounding.py, planner/tests/conftest.py, planner/tests/test_a3_domain_alignment.py, planner/tests/test_l2b_alignment_formsets.py, plans/tests/test_alignment_through_models.py, plans/tests/test_plan.py, plans/tests/test_dec32_l2b_admin_and_grants.py, plans/tests/test_services_advance_plan_status.py; school/tests/test_missionarea.py + test_seed_mission_areas.py (delete)",
 "plan_directive": "Slice 2 renames plans/tests/test_planguidingclause.py -> test_planmvvclause.py and updates symbols. Slice 3 removes/rewrites the mission-area test references and deletes school/tests/test_missionarea.py + test_seed_mission_areas.py. pytest will not pass until done; include the full module list in the IMPL prompt.",
 "verified": "2026-05-31 vs current source"
}

---
