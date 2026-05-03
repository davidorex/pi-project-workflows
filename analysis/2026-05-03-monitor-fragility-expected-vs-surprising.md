**Expected (3 of 10):**

- **F-G — block-validation.ts pipeline doesn't observe monitor writes.** pi-project's snapshot/rollback pattern exists for workflow steps; monitor writes fire on agent_end / tool_call / etc., outside that lifecycle. The asymmetry is exactly the kind our recent surface-symmetry work has been naming — this is a sibling we hadn't pointed at yet.
- **F-J — `agent_end` handler iterates monitors sequentially without per-monitor try/catch.** Forward-compat hazard tied to whether `executeWriteAction` ever starts throwing. Only matters once F-006 root cause is addressed via canonical-surface migration — which our v0.23.0/v0.24.0 surface-symmetry work has been steadily moving toward.
- **F-F — upsert id-equality is string-only, monitor ids never collide with canonical `issue-NNN` ids.** Half-expected: this is conditional-on-our-work — v0.15.0 ID schema-pattern enforcement made the non-collision a property of our tightening. If the issues schema were ever relaxed, upsert would silently lose data.

**Surprising (7 of 10):** pure pre-existing defects in pi-behavior-monitors, independent of our substrate work. Issue-064 missed all of these.

- **F-A** — `generateFindingId` uses `Date.now()` with no tiebreaker; concurrent invocations within the same ms collide. Latent in the monitor's own id-generation since whenever it was written.
- **F-B** — bundled template emits `description` but issues schema sets `additionalProperties: false`. Even if the four missing required fields were added, the entry would still fail on `description`. Asymmetric mismatch issue-064's "schema drift" framing implies but doesn't enumerate.
- **F-C** — `process.cwd()` path resolution: a monitor firing inside a `pi -p` subprocess invoked from a subdirectory writes to a NEW `.project/issues.json` in that subdirectory rather than walking up to project root. Orphan issue files in arbitrary locations.
- **F-D** — `} catch {` with no error binding. Cannot differentiate ENOENT (intended fresh-file behavior) from SyntaxError (data-loss path).
- **F-E** — `executeWriteAction` returns `void`; failures hit `console.error` only. Callers at five sites have no signal of write failure.
- **F-H** — template substitution is whole-string replace; every field becomes a string post-substitution. Issues schema is all-string so this doesn't bite today, but it's a structural ceiling for any other target block with non-string fields.
- **F-I** — `learn_pattern` runs BEFORE the write. Partial-write hazard between two persistence surfaces: pattern file gets updated, issues write may silently fail (per F-E), and the system "knows it saw a new fragility" but has no record of it.

The surprising count is high because the agent went deep into pi-behavior-monitors logic that hasn't been touched this session at all. F-006 (issue-064) framed the bypass as one structural omission with five symptoms; the trace showed the function is one bug with substantially more compounding failure modes than originally enumerated.