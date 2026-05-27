import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { authorAgentSpecTool } from "./author-agent-spec-tool.js";
import { callAgentTool } from "./call-agent-tool.js";
import { commitAttestedTool } from "./commit-attested-tool.js";
import { runRealChecksTool } from "./run-real-checks-tool.js";

const extension = (pi: ExtensionAPI) => {
	pi.registerTool(authorAgentSpecTool);
	pi.registerTool(callAgentTool);
	pi.registerTool(runRealChecksTool);
	pi.registerTool(commitAttestedTool);
};

export default extension;
