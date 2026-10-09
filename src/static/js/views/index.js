import kanban from './kanban.js';
import heatmap from './heatmap.js';
import inbox from './inbox.js';
import router from './router.js';
import guardrails from './guardrails.js';

export const VIEWS = { kanban, heatmap, inbox, router, guardrails };
export { answerViz } from './answer.js';
export * as common from './common.js';
