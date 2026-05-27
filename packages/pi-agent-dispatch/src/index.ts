import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { authorAgentSpecTool } from "./author-agent-spec-tool.js";
import { callAgentTool } from "./call-agent-tool.js";

const extension = (pi: ExtensionAPI) => {
	pi.registerTool(authorAgentSpecTool);
	pi.registerTool(callAgentTool);
};

export default extension;
