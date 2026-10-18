// Runtime direction only: the selected director preset remains unchanged.
export function progressionFocus(state) {
    return state.progression?.started ? `${state.progression.id}:stages:${state.progression.revision}` : '';
}
export function progressionPoolInstruction(direction) {
    return `【事件推进模式】\n起始事件：${direction.root.title}\n${direction.root.content}\n最近已生效事件：${direction.event.title}\n${direction.event.content}\n即将抽取第 ${direction.stageIndex + 1} / ${direction.cycles} 个后续事件，每个后续可用三个成功回复回合展开。所有候选必须与这条事件线相关，以当前正文实际发生的事情为准，不重复开端，不重置已解决的矛盾。候选可包含人物反应、障碍、机会、线索、余波或自然收尾，不必持续升级冲突。保留所选导演预设的风格与输出格式，不决定玩家行动或结局。${direction.stageIndex + 1 === direction.cycles ? '这是最后一个后续阶段，优先提供适合自然收尾的起因。' : ''}`;
}
export function progressionInjection(direction) {
    if (!direction) return '';
    return `[Ongoing event direction]\n起始事件：${direction.root.title}\n${direction.root.content}\n最近已生效事件：${direction.event.title}\n${direction.event.content}\n${direction.started ? '事件已经进入故事，依据当前正文延续其影响，不重复开端，不重置已解决的矛盾。' : '本轮自然引入已确认的事件，不提前宣告结果。'}\n${direction.remaining === 1 ? '这是事件推进的最后一回合，尝试自然收尾或留下合理余波，不强行决定结果。' : '顺着实际剧情推进，可平缓、转折或收尾，不要求不断升级。'}\n保留玩家自主权，不提插件、回合计数或后台指令。`;
}
export function progressionTurnEvent(direction) {
    return { ...direction.event, id: `${direction.id}:ongoing`, severity: 'ordinary',
        progressionContinuation: true, status: 'pending' };
}
