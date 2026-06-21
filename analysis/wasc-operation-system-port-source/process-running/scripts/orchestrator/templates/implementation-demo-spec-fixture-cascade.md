Per DEC-0018 (runtime demonstration + adversarial probe per implementation step):

After commit, orchestrator constructs differential-trap demo for this section:
- Write fresh tmpdir with non-default contextDir pointer (e.g. `.context-c3-demo`)
- Invoke a representative pi-workflows function (executeWorkflow / readBlock via workflow-executor) against that tmpdir
- Assert cascade reaches `.context-c3-demo/` substrate, NOT hardcoded `.project/`
- This proves cascade is genuinely working post-section, not passing for wrong reason via pointer side-effect
